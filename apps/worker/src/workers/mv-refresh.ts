import { createDb, sql } from '@impacto/db';
import { Worker } from 'bullmq';
import { recordRunEnd, recordRunStart } from '../lib/record-run.js';
import { logger } from '../logger.js';
import { redisConnection } from '../queues.js';

/**
 * Refresh de materialized views (propuesta 135.1 ronda 11).
 *
 * Job repeatable cada 5 min llama `refresh_mv_tenant_stats()`. La función
 * usa REFRESH CONCURRENTLY internamente — no bloquea reads.
 *
 * Cuando agreguemos más MVs (ej. mv_booking_kpis_monthly), simplemente
 * loopeamos por nombre.
 */

const adminDb = createDb(process.env.DATABASE_URL ?? 'postgres://localhost:5433/impacto');

const VIEWS_TO_REFRESH = ['refresh_mv_tenant_stats'];

/**
 * Counter de fallos consecutivos por MV (propuesta 144.5 ronda 12). Si 3+
 * fallan en fila, insertamos un announcement urgent para que staff vea el
 * problema en /admin sin tener que buscar en logs.
 */
const consecutiveFailures: Record<string, number> = {};
const FAILURE_THRESHOLD = 3;

async function maybeAlertOnRepeatedFailure(fn: string, errMsg: string) {
  const fails = consecutiveFailures[fn] ?? 0;
  if (fails < FAILURE_THRESHOLD) return;
  // Throttle: solo emitimos un announcement por hora (idempotency).
  try {
    const recent = await adminDb.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM system_announcements
      WHERE severity = 'critical'
        AND message LIKE ${`MV refresh failing: ${fn}%`}
        AND created_at > now() - interval '1 hour'
    `);
    if (recent[0] && recent[0].count > 0) return;
    await adminDb.execute(sql`
      INSERT INTO system_announcements
        (severity, message, target_role, starts_at, expires_at)
      VALUES (
        'critical',
        ${`MV refresh failing: ${fn} — ${fails} consecutive failures. ${errMsg.slice(0, 200)}`},
        'admin',
        now(),
        now() + interval '4 hours'
      )
    `);
    logger.error({ fn, fails }, 'mv refresh: alerted staff via announcement');
  } catch (err) {
    logger.warn({ err }, 'failed to insert mv-failure announcement');
  }
}

/**
 * Skip refresh si no hubo writes desde el último refresh (propuesta 144.3
 * ronda 12). Lee `pg_stat_user_tables` para ver `n_tup_ins/upd/del` de las
 * tablas que el MV depende. Si todos 0 desde la última vez que vimos, skip.
 *
 * Mantenemos el último snapshot en memory del worker process. Si el worker
 * reinicia, primer run igual refresha.
 */
const lastSeenWrites: Record<string, number> = {};

async function shouldSkipRefresh(): Promise<boolean> {
  try {
    const rows = await adminDb.execute<{ relname: string; total_writes: bigint }>(sql`
      SELECT relname,
             (n_tup_ins + n_tup_upd + n_tup_del)::bigint AS total_writes
      FROM pg_stat_user_tables
      WHERE relname IN ('bookings', 'properties', 'units', 'members', 'organizations', 'tenant_settings')
    `);
    let hasNew = false;
    for (const r of rows) {
      const current = Number(r.total_writes);
      const previous = lastSeenWrites[r.relname];
      if (previous === undefined || current > previous) {
        hasNew = true;
      }
      lastSeenWrites[r.relname] = current;
    }
    // First run (lastSeenWrites empty) → no skip — primer refresh siempre corre.
    return !hasNew && Object.keys(lastSeenWrites).length === rows.length;
  } catch {
    return false; // si la query falla, mejor refresh
  }
}

export const mvRefreshWorker = new Worker(
  'mv-refresh',
  async (job) => {
    logger.info({ jobId: job.id }, '🔄 mv refresh starting');
    // job.data puede traer parentRunId si fue triggered por staff (propuesta 230.3).
    const data = (job.data as { parentRunId?: string; triggeredBy?: string }) ?? {};
    const runId = await recordRunStart('mv-refresh', job.id, {
      parentRunId: data.parentRunId,
      triggeredBy: data.triggeredBy,
    });
    const startedAt = Date.now();

    if (await shouldSkipRefresh()) {
      logger.info({ jobId: job.id }, '⏭  mv refresh skipped — no writes since last run');
      await recordRunEnd(runId, 'skipped', {
        durationMs: Date.now() - startedAt,
        result: { reason: 'no_writes' },
      });
      return { skipped: true };
    }

    const results: Record<string, { ms: number; ok: boolean; err?: string }> = {};

    for (const fn of VIEWS_TO_REFRESH) {
      const start = Date.now();
      try {
        // Validamos el nombre de función: solo alfanum + underscore.
        if (!/^[a-z_]+$/.test(fn)) {
          throw new Error(`invalid mv function name: ${fn}`);
        }
        await adminDb.execute(sql.raw(`SELECT ${fn}()`));
        results[fn] = { ms: Date.now() - start, ok: true };
        consecutiveFailures[fn] = 0; // reset on success
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        results[fn] = { ms: Date.now() - start, ok: false, err: msg };
        consecutiveFailures[fn] = (consecutiveFailures[fn] ?? 0) + 1;
        logger.warn(
          { fn, err: msg, consecutiveFails: consecutiveFailures[fn] },
          'mv refresh failed',
        );
        await maybeAlertOnRepeatedFailure(fn, msg);
      }
    }

    const anyFailed = Object.values(results).some((r) => !r.ok);
    await recordRunEnd(runId, anyFailed ? 'failure' : 'success', {
      durationMs: Date.now() - startedAt,
      result: results,
      error: anyFailed
        ? Object.entries(results)
            .filter(([, r]) => !r.ok)
            .map(([fn, r]) => `${fn}: ${r.err}`)
            .join('; ')
        : undefined,
    });

    logger.info({ jobId: job.id, results }, '✓ mv refresh done');
    return results;
  },
  {
    connection: redisConnection,
    concurrency: 1, // serializado — un solo refresh a la vez
  },
);

mvRefreshWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'mv refresh job failed');
});

import { createDb, sql } from '@impacto/db';
import { Worker } from 'bullmq';
import { recordRunEnd, recordRunStart } from '../lib/record-run.js';
import { logger } from '../logger.js';
import { redisConnection } from '../queues.js';

/**
 * Worker de retention para audit.events (propuesta 141.4 ronda 12).
 *
 * Llama a `purge_old_audit_events()` (creada en migration 0012) que recorre
 * cada tenant y borra eventos más viejos que el `audit_retention_days`
 * configurado en `tenant_settings`. Función batched — segura contra writes
 * concurrentes.
 *
 * Schedule: diario a las 03:00 UTC (off-peak para LATAM).
 */

const adminDb = createDb(process.env.DATABASE_URL ?? 'postgres://localhost:5433/impacto');

export const auditPurgeWorker = new Worker(
  'audit-purge',
  async (job) => {
    logger.info({ jobId: job.id }, '🗑  audit purge starting');
    const start = Date.now();
    const data = (job.data as { parentRunId?: string; triggeredBy?: string }) ?? {};
    const runId = await recordRunStart('audit-purge', job.id, {
      parentRunId: data.parentRunId,
      triggeredBy: data.triggeredBy,
    });

    try {
      const rows = await adminDb.execute<{
        organization_id: string;
        deleted_count: number;
      }>(sql`SELECT * FROM purge_old_audit_events(5000)`);

      const totalDeleted = rows.reduce((sum, r) => sum + Number(r.deleted_count), 0);
      const tenantsAffected = new Set(rows.map((r) => r.organization_id)).size;

      // Auto-delete announcements expirados hace > 30 días (propuesta
      // 143.6 ronda 12). Piggyback en el mismo cron daily — barato.
      let announcementsDeleted = 0;
      try {
        const annDel = await adminDb.execute<{ id: string }>(sql`
          DELETE FROM system_announcements
          WHERE expires_at IS NOT NULL
            AND expires_at < now() - interval '30 days'
          RETURNING id
        `);
        announcementsDeleted = annDel.length;
      } catch {
        /* tabla puede no existir */
      }

      const ms = Date.now() - start;

      // Piggyback: borrar worker_runs > 30 días.
      try {
        await adminDb.execute(sql`
          DELETE FROM worker_runs WHERE started_at < now() - interval '30 days'
        `);
      } catch {
        /* tabla puede no existir */
      }

      // Piggyback: detectar runs zombies (status='running' por > 1h sin
      // ended_at) y marcarlos como failure. Propuesta 200.2 ronda 18.
      let zombiesKilled = 0;
      try {
        const zombies = await adminDb.execute<{ id: string }>(sql`
          UPDATE worker_runs
          SET status = 'failure',
              ended_at = now(),
              error_message = COALESCE(error_message, 'zombie: run > 1h sin completar')
          WHERE status = 'running'
            AND started_at < now() - interval '1 hour'
          RETURNING id
        `);
        zombiesKilled = zombies.length;
        if (zombiesKilled > 0) {
          logger.warn({ zombiesKilled }, 'audit-purge: zombie worker runs killed');
        }
      } catch {
        /* tabla puede no existir */
      }

      logger.info(
        { jobId: job.id, totalDeleted, tenantsAffected, announcementsDeleted, ms },
        '✓ audit purge done',
      );
      const result = {
        totalDeleted,
        tenantsAffected,
        announcementsDeleted,
        zombiesKilled,
        ms,
      };
      await recordRunEnd(runId, 'success', { durationMs: ms, result });
      return result;
    } catch (err) {
      const ms = Date.now() - start;
      logger.error({ jobId: job.id, err, ms }, 'audit purge failed');
      await recordRunEnd(runId, 'failure', {
        durationMs: ms,
        error: err instanceof Error ? err.message : 'unknown',
      });
      throw err;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1, // serializado — un solo purge a la vez
  },
);

auditPurgeWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'audit purge job failed');
});

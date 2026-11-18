import { createDb, sql } from '@impacto/db';
import { logger } from '../logger.js';

/**
 * Helper para que los workers registren cada run en `worker_runs`
 * (propuestas 163.5 + 182.4 ronda 12-14).
 *
 * Diseño: best-effort — si la tabla no existe o la query falla, log warn y
 * seguimos. NUNCA bloquea el worker job real.
 *
 * Uso:
 *   const runId = await recordRunStart('mv-refresh', job.id);
 *   try {
 *     const result = await doWork();
 *     await recordRunEnd(runId, 'success', { result });
 *   } catch (err) {
 *     await recordRunEnd(runId, 'failure', { error: err.message });
 *     throw err;
 *   }
 */

const adminDb = createDb(process.env.DATABASE_URL ?? 'postgres://localhost:5433/impacto');

export async function recordRunStart(
  workerName: string,
  jobId: string | undefined,
  meta?: { parentRunId?: string | null; triggeredBy?: string | null },
): Promise<string | null> {
  try {
    // Si la migration 0021 no corrió, las columnas parent_run_id / triggered_by
    // no existen. Detect on-the-fly y fallback.
    try {
      const rows = await adminDb.execute<{ id: string }>(sql`
        INSERT INTO worker_runs (worker_name, job_id, parent_run_id, triggered_by)
        VALUES (
          ${workerName}, ${jobId ?? null},
          ${meta?.parentRunId ?? null}::uuid,
          ${meta?.triggeredBy ?? null}
        )
        RETURNING id
      `);
      return rows[0]?.id ?? null;
    } catch {
      const rows = await adminDb.execute<{ id: string }>(sql`
        INSERT INTO worker_runs (worker_name, job_id)
        VALUES (${workerName}, ${jobId ?? null})
        RETURNING id
      `);
      return rows[0]?.id ?? null;
    }
  } catch (err) {
    logger.warn({ err, workerName }, 'recordRunStart failed');
    return null;
  }
}

export async function recordRunEnd(
  runId: string | null,
  status: 'success' | 'failure' | 'skipped',
  data: { result?: unknown; error?: string; durationMs?: number } = {},
): Promise<void> {
  if (!runId) return;
  try {
    await adminDb.execute(sql`
      UPDATE worker_runs
      SET ended_at = now(),
          status = ${status},
          duration_ms = ${data.durationMs ?? null},
          result = ${data.result ? JSON.stringify(data.result) : null}::jsonb,
          error_message = ${data.error ?? null}
      WHERE id = ${runId}
    `);
  } catch (err) {
    logger.warn({ err, runId }, 'recordRunEnd failed');
  }
}

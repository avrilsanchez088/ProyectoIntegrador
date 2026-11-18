import { createDb, sql } from '@impacto/db';
import { Worker } from 'bullmq';
import { recordRunEnd, recordRunStart } from '../lib/record-run.js';
import { logger } from '../logger.js';
import { redisConnection } from '../queues.js';

/**
 * Worker GDPR (propuesta 187.1 ronda 17). Procesa solicitudes pendientes
 * de tipo 'delete' anonimizando bookings/messages que tengan el email del
 * solicitante. NO borra rows — preserva estadísticas reemplazando PII con
 * un hash determinístico.
 *
 * Idempotente: si el row ya está anonimizado (email empieza con `redacted-`),
 * skip.
 *
 * Trigger: el job se encola desde el endpoint admin PATCH cuando staff marca
 * status='processing'. El worker procesa, marca 'completed' al terminar.
 *
 * Para 'export', similar pero genera bundle. V1 simplificada: solo lo
 * registra como completed con un mensaje. Bundle real → 193.x cuando haya R2.
 */

const adminDb = createDb(process.env.DATABASE_URL ?? 'postgres://localhost:5433/impacto');

interface GdprJobData {
  requestId: string;
}

async function anonymizeEmail(email: string): Promise<string> {
  // Hash determinístico por email para que múltiples bookings del mismo
  // huésped queden agrupados aunque anonimizados.
  const enc = new TextEncoder().encode(email.toLowerCase().trim());
  const hash = await crypto.subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(hash))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `redacted-${hex}@anon.local`;
}

export const gdprProcessWorker = new Worker(
  'gdpr-process',
  async (job) => {
    const { requestId } = job.data as GdprJobData;
    const runId = await recordRunStart('gdpr-process', job.id);
    const start = Date.now();

    logger.info({ jobId: job.id, requestId }, '🛡  gdpr process starting');

    // 1. Fetch the request
    const requests = await adminDb.execute<{
      organization_id: string;
      email: string;
      action: 'export' | 'delete';
      status: string;
    }>(sql`
      SELECT organization_id, email, action, status
      FROM data_subject_requests
      WHERE id = ${requestId}
      LIMIT 1
    `);
    const req = requests[0];
    if (!req) {
      await recordRunEnd(runId, 'failure', {
        durationMs: Date.now() - start,
        error: 'request_not_found',
      });
      throw new Error(`gdpr request ${requestId} not found`);
    }

    if (req.status === 'completed') {
      logger.info({ requestId }, 'gdpr request already completed, skipping');
      await recordRunEnd(runId, 'skipped', {
        durationMs: Date.now() - start,
        result: { reason: 'already_completed' },
      });
      return { skipped: true };
    }

    let result: Record<string, unknown> = {};

    if (req.action === 'delete') {
      const anonEmail = await anonymizeEmail(req.email);
      // 1. Bookings — guest_email/phone/name (propuesta 187.1 ronda 17)
      const bookingsUpdated = await adminDb.execute<{ id: string }>(sql`
        UPDATE bookings
        SET guest_email = ${anonEmail},
            guest_phone = NULL,
            guest_name = 'Huésped anonimizado',
            updated_at = now()
        WHERE organization_id = ${req.organization_id}
          AND lower(guest_email) = lower(${req.email})
          AND guest_email NOT LIKE 'redacted-%@anon.local'
        RETURNING id
      `);

      // 2. Notifications — el body suele contener PII (propuesta 199.3 ronda 18).
      // Solo borramos rows cuyo `data->>'email'` matchea — preservamos counts
      // pero quitamos el contenido específico.
      let notificationsAnonymized = 0;
      try {
        const notifUpdated = await adminDb.execute<{ id: string }>(sql`
          UPDATE in_app_notifications
          SET body = '[contenido anonimizado por GDPR request]',
              data = COALESCE(data, '{}'::jsonb) - 'email' - 'phone' - 'guest_name'
          WHERE organization_id = ${req.organization_id}
            AND (data->>'email' IS NOT NULL AND lower(data->>'email') = lower(${req.email}))
          RETURNING id
        `);
        notificationsAnonymized = notifUpdated.length;
      } catch {
        /* tabla puede no tener data jsonb shape esperada */
      }

      // 3. Audit events — old_row/new_row pueden tener emails (propuesta 199.3).
      // Reemplazamos por el hash en jsonb directamente.
      let auditAnonymized = 0;
      try {
        const auditUpdated = await adminDb.execute<{ id: string }>(sql`
          UPDATE audit.events
          SET old_row = CASE
                WHEN old_row IS NOT NULL AND lower(old_row->>'guest_email') = lower(${req.email})
                  THEN jsonb_set(jsonb_set(jsonb_set(
                    old_row, '{guest_email}', to_jsonb(${anonEmail}::text)),
                    '{guest_phone}', 'null'::jsonb),
                    '{guest_name}', '"[REDACTED]"'::jsonb)
                ELSE old_row
              END,
              new_row = CASE
                WHEN new_row IS NOT NULL AND lower(new_row->>'guest_email') = lower(${req.email})
                  THEN jsonb_set(jsonb_set(jsonb_set(
                    new_row, '{guest_email}', to_jsonb(${anonEmail}::text)),
                    '{guest_phone}', 'null'::jsonb),
                    '{guest_name}', '"[REDACTED]"'::jsonb)
                ELSE new_row
              END
          WHERE organization_id = ${req.organization_id}
            AND (
              lower(old_row->>'guest_email') = lower(${req.email})
              OR lower(new_row->>'guest_email') = lower(${req.email})
            )
          RETURNING id
        `);
        auditAnonymized = auditUpdated.length;
      } catch {
        /* schema audit puede no estar accesible o ya redactado */
      }

      result = {
        action: 'delete',
        bookingsAnonymized: bookingsUpdated.length,
        notificationsAnonymized,
        auditAnonymized,
      };
    } else {
      // Para 'export', V1 solo cuenta cuántos rows hay matching. Bundle a R2
      // queda para cuando tengamos infra (193.3). Marcamos completed igual.
      const counts = await adminDb.execute<{ c: number }>(sql`
        SELECT COUNT(*)::int AS c FROM bookings
        WHERE organization_id = ${req.organization_id}
          AND lower(guest_email) = lower(${req.email})
      `);
      result.bookingsFound = counts[0]?.c ?? 0;
      result.action = 'export';
      result.note = 'V1: count only. Bundle to R2 pending infra.';
    }

    // 2. Mark request as completed
    await adminDb.execute(sql`
      UPDATE data_subject_requests
      SET status = 'completed',
          processed_at = now(),
          notes = COALESCE(notes, '') || E'\n[auto] ' || ${JSON.stringify(result)}
      WHERE id = ${requestId}
    `);

    // 3. Audit log de la operación misma (propuesta 210.3 ronda 19). Quién
    //    procesó qué + result counts. table_name='gdpr_action' es virtual —
    //    distinguible en /audit como evento staff-side.
    try {
      await adminDb.execute(sql`
        INSERT INTO audit.events
          (organization_id, table_name, op, row_id, user_id, new_row, ts)
        VALUES (
          ${req.organization_id},
          'gdpr_action',
          'U',
          ${requestId},
          NULL,
          ${JSON.stringify({ action: req.action, result })}::jsonb,
          now()
        )
      `);
    } catch (err) {
      logger.warn({ err, requestId }, 'gdpr audit log insert failed');
    }

    const ms = Date.now() - start;
    logger.info({ jobId: job.id, requestId, result, ms }, '✓ gdpr process done');
    await recordRunEnd(runId, 'success', { durationMs: ms, result });
    return result;
  },
  {
    connection: redisConnection,
    concurrency: 1,
  },
);

gdprProcessWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'gdpr process failed');
});

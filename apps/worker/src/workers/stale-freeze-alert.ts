import { createDb, sql } from '@impacto/db';
import { Worker } from 'bullmq';
import { logger } from '../logger.js';
import { redisConnection } from '../queues.js';

/**
 * Worker que alerta a staff cuando un tenant lleva > 7 días congelado
 * (propuesta 152.2 ronda 13).
 *
 * Comportamiento:
 *  - Detecta tenants con `frozen=true` y `frozen_at < now() - 7 days`
 *  - Para cada uno, inserta un `system_announcement` con `target_role='staff'`
 *    para que el panel /admin lo muestre.
 *  - Si `STAFF_SLACK_WEBHOOK_URL` está configurado, también postea a Slack.
 *  - Idempotente — usa un index lookup para no duplicar el alert si el job
 *    corre 2× el mismo día (criterio: ya hay announcement con `data->>'org_id'`
 *    matching y created_at de las últimas 23h).
 */

const adminDb = createDb(process.env.DATABASE_URL ?? 'postgres://localhost:5433/impacto');

// Drizzle `execute<T>` exige `T extends Record<string, unknown>`. Como las
// keys son las columnas devueltas por el SELECT, declaramos un index
// signature para satisfacer la constraint estructural.
interface StaleTenant extends Record<string, unknown> {
  id: string;
  name: string;
  frozen_at: Date;
  frozen_reason: string | null;
}

async function postSlack(tenant: StaleTenant) {
  const webhook = process.env.STAFF_SLACK_WEBHOOK_URL;
  if (!webhook) return;
  const days = Math.floor((Date.now() - tenant.frozen_at.getTime()) / (24 * 3600 * 1000));
  const text =
    `:snowflake: *Workspace congelado hace ${days} días* — \`${tenant.name}\` ` +
    `(\`${tenant.id}\`)\n>${tenant.frozen_reason ?? '_sin motivo registrado_'}`;
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logger.warn({ tenant: tenant.id, status: res.status }, 'slack webhook returned non-ok');
    }
  } catch (err) {
    logger.warn({ err, tenant: tenant.id }, 'slack webhook failed');
  }
}

export const staleFreezeAlertWorker = new Worker(
  'stale-freeze-alert',
  async (job) => {
    logger.info({ jobId: job.id }, '🔍 stale-freeze scan starting');

    const stale = await adminDb.execute<StaleTenant>(sql`
      SELECT o.id, o.name, ts.frozen_at, ts.frozen_reason
      FROM tenant_settings ts
      JOIN organizations o ON o.id = ts.id
      WHERE ts.frozen = true
        AND ts.frozen_at < now() - interval '7 days'
    `);

    let alerted = 0;
    for (const tenant of stale) {
      // Idempotencia: skipear si ya hay announcement reciente de este tenant.
      try {
        const existing = await adminDb.execute<{ count: number }>(sql`
          SELECT COUNT(*)::int AS count
          FROM system_announcements
          WHERE created_at > now() - interval '23 hours'
            AND target_org_id = ${tenant.id}
            AND severity = 'urgent'
        `);
        if (existing[0] && existing[0].count > 0) {
          logger.info({ tenant: tenant.id }, 'stale-freeze: already alerted in last 23h');
          continue;
        }
      } catch {
        /* tabla puede no existir */
      }

      const days = Math.floor(
        (Date.now() - new Date(tenant.frozen_at).getTime()) / (24 * 3600 * 1000),
      );
      const message = `Tenant "${tenant.name}" lleva ${days} días congelado. Considerar outreach.`;
      try {
        await adminDb.execute(sql`
          INSERT INTO system_announcements
            (severity, message, starts_at, target_role, target_org_id, created_by)
          VALUES ('urgent', ${message}, now(), 'admin', ${tenant.id}, NULL)
        `);
      } catch (err) {
        logger.warn({ err, tenant: tenant.id }, 'announcement insert failed');
      }

      await postSlack(tenant);
      alerted++;
    }

    logger.info({ jobId: job.id, scanned: stale.length, alerted }, '✓ stale-freeze done');
    return { scanned: stale.length, alerted };
  },
  {
    connection: redisConnection,
    concurrency: 1,
  },
);

staleFreezeAlertWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'stale-freeze job failed');
});

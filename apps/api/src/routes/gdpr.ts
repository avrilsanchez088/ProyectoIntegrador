import { createDb, sql } from '@impacto/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '../env.js';
import { logger } from '../logger.js';

/**
 * GDPR / data subject requests (propuestas 158.1 + 158.2 ronda 13).
 *
 * Endpoints:
 *  - POST /gdpr/requests     → public, registra solicitud (rate-limited
 *    fuerte vía middleware global). Anti-abuse: 1 request por (email, org)
 *    por 24h.
 *  - GET  /api/admin/gdpr/requests → staff lista pending/processing
 *  - PATCH /api/admin/gdpr/requests/:id → staff actualiza status + notes
 *
 * Diseño: el endpoint público solo registra. Procesamiento manual por
 * staff. Cuando esto crezca, encolaremos workers (export → R2, delete →
 * soft-anonymize en bookings/messages).
 */

const adminDb = createDb(env.DATABASE_URL);

export const gdprPublicRouter = new Hono();

const requestSchema = z.object({
  organizationId: z.string().min(1).max(64),
  email: z.string().email().max(255),
  action: z.enum(['export', 'delete']),
  notes: z.string().max(1000).optional(),
});

gdprPublicRouter.post('/requests', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }

  // Anti-abuse: solo 1 request por (email, org, action) por 24h.
  try {
    const recent = await adminDb.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM data_subject_requests
      WHERE organization_id = ${parsed.data.organizationId}
        AND lower(email) = lower(${parsed.data.email})
        AND action = ${parsed.data.action}
        AND created_at > now() - interval '24 hours'
    `);
    if (recent[0] && recent[0].count > 0) {
      return c.json(
        {
          error: 'duplicate_request',
          message:
            'Ya tenemos una solicitud pendiente con tus datos. Si no recibís respuesta en 7 días, escribinos a soporte.',
        },
        409,
      );
    }
  } catch {
    // Tabla puede no existir todavía.
  }

  // El IP se captura best-effort. El header `x-forwarded-for` viene del
  // reverse proxy en prod; fallback a c.env (Hono node-server lo expone).
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  try {
    const inserted = await adminDb.execute<{ id: string }>(sql`
      INSERT INTO data_subject_requests
        (organization_id, email, action, request_ip, notes)
      VALUES (
        ${parsed.data.organizationId},
        ${parsed.data.email},
        ${parsed.data.action},
        ${ip}::inet,
        ${parsed.data.notes ?? null}
      )
      RETURNING id
    `);
    logger.info({ id: inserted[0]?.id, action: parsed.data.action }, 'gdpr request registered');

    // Notif urgent a staff (propuesta 219.3 ronda 20 + 229.3 ronda 21).
    // Best-effort. El campo `data.gdpr_request_id` permite auto-cerrar
    // el announcement cuando staff procese la request.
    try {
      const subject =
        parsed.data.action === 'delete'
          ? 'Solicitud de eliminación de datos (GDPR)'
          : 'Solicitud de export de datos (GDPR)';
      await adminDb.execute(sql`
        INSERT INTO system_announcements
          (severity, message, target_role, target_org_id, starts_at, expires_at, data, created_by)
        VALUES (
          'urgent',
          ${`${subject} · ${parsed.data.email} · org ${parsed.data.organizationId}`},
          'admin',
          NULL,
          now(),
          now() + interval '7 days',
          ${JSON.stringify({ gdpr_request_id: inserted[0]?.id ?? null })}::jsonb,
          NULL
        )
      `);
    } catch (err) {
      logger.warn({ err }, 'failed to insert staff announcement for gdpr request');
    }

    // Slack webhook (propuesta 229.1 ronda 21). Best-effort, no bloquea.
    const webhook = process.env.STAFF_SLACK_WEBHOOK_URL;
    if (webhook) {
      const text =
        `:shield: *GDPR ${parsed.data.action}* — \`${parsed.data.email}\` ` +
        `· org \`${parsed.data.organizationId}\` ` +
        `· request \`${inserted[0]?.id ?? 'unknown'}\``;
      fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(5000),
      }).catch((err) => {
        logger.warn({ err }, 'gdpr slack webhook failed');
      });
    }
    return c.json(
      {
        data: {
          id: inserted[0]?.id,
          message:
            parsed.data.action === 'export'
              ? 'Recibimos tu solicitud. Te enviaremos un link al email en hasta 7 días.'
              : 'Recibimos tu solicitud. Tus datos serán anonimizados en hasta 7 días.',
        },
      },
      201,
    );
  } catch (err) {
    // SQLSTATE 23503 = foreign_key_violation. El organizationId no
    // existe en la base — error del usuario, no del servidor.
    // biome-ignore lint/suspicious/noExplicitAny: postgres-js error con campo code dinámico
    const code = (err as any)?.code;
    if (code === '23503') {
      return c.json(
        {
          error: 'invalid_organization',
          message: 'El ID del alojamiento no existe. Verificá el link que recibiste.',
        },
        400,
      );
    }
    logger.error({ err }, 'gdpr request insert failed');
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

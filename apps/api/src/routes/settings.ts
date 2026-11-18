import { eq, schema, sql } from '@impacto/db';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  type AppEnv,
  getActiveOrgId,
  requireAuth,
  requireOrganization,
} from '../middleware/auth.js';
import { getTenantDb, rlsContext } from '../middleware/tenant.js';

/**
 * Tenant settings API. 1:1 con la organization activa.
 *
 * Implementa G8.10: la página /dashboard/settings antes era 100% placeholder.
 * Ahora puede leer y escribir country/timezone/currency reales.
 */
export const settingsRouter = new Hono<AppEnv>();

settingsRouter.use('*', requireAuth);
settingsRouter.use('*', requireOrganization);
settingsRouter.use('*', rlsContext);

const updateSettingsSchema = z.object({
  country: z.string().length(2).optional(),
  timezone: z.string().min(2).max(64).optional(),
  currency: z.enum(['USD', 'UYU', 'ARS']).optional(),
  settings: z.record(z.unknown()).optional(),
  // Compliance (propuesta 151.1 ronda 13). Range matchea el CHECK del SQL
  // (migration 0012). 30 días = mínimo razonable, 3650 = 10 años.
  auditRetentionDays: z.number().int().min(30).max(3650).optional(),
});

settingsRouter.get('/', async (c) => {
  const db = getTenantDb(c);
  const orgId = getActiveOrgId(c);

  // Si no existe la fila aún, devolver defaults sin crearla — el dueño la
  // materializa al primer save.
  const rows = await db
    .select()
    .from(schema.tenantSettings)
    .where(eq(schema.tenantSettings.id, orgId))
    .limit(1);

  if (!rows[0]) {
    return c.json({
      data: {
        id: orgId,
        country: 'UY',
        timezone: 'America/Montevideo',
        currency: 'USD',
        plan: null,
        frozen: false,
        frozenReason: null,
        frozenAllowOps: [] as string[],
        auditRetentionDays: 365,
        settings: {},
        createdAt: null,
        updatedAt: null,
        materialized: false,
      },
    });
  }
  return c.json({ data: { ...rows[0], materialized: true } });
});

/**
 * GET /api/settings/export — bundle JSON con todos los datos del workspace
 * (propuesta 165.1 ronda 14). Útil para portabilidad / GDPR self-service.
 *
 * V1: download directo en JSON. Para datasets grandes, V2 → encolar worker
 * + email signed link a R2.
 *
 * Solo el owner puede ejecutar.
 */
settingsRouter.get('/export', async (c) => {
  // 'member' no es una key declarada en AppEnv.Variables, lo accedemos via cast.
  // biome-ignore lint/suspicious/noExplicitAny: middleware externo (Better Auth) puede setear member
  const member = (c as any).get('member') as { role: string } | undefined;
  if (member && member.role !== 'owner') {
    return c.json({ error: 'forbidden', message: 'Solo el owner puede exportar.' }, 403);
  }
  // PII redaction (propuesta 193.4 ronda 17). Si `?redact=1`, sustituye
  // emails/teléfonos/nombres de huéspedes con marcadores anónimos manteniendo
  // las relaciones (mismo email → mismo marcador).
  const redact = c.req.query('redact') === '1';
  const orgId = getActiveOrgId(c);
  const db = getTenantDb(c);

  // Pull todos los datos del tenant (RLS-scoped automáticamente).
  const [settings, properties, units, seasons, rates, bookings, notifications, auditEvents] =
    await Promise.all([
      db.select().from(schema.tenantSettings).where(eq(schema.tenantSettings.id, orgId)),
      db.execute(sql`SELECT * FROM properties WHERE deleted_at IS NULL`),
      db.execute(sql`SELECT * FROM units WHERE deleted_at IS NULL`),
      db.execute(sql`SELECT * FROM seasons`),
      db.execute(sql`SELECT * FROM rates`),
      db.execute(sql`
      SELECT id, code, status, check_in, check_out, total_cents, currency,
             guests_count, pets_count, created_at, updated_at
      FROM bookings
      ORDER BY created_at DESC
      LIMIT 5000
    `),
      db.execute(sql`SELECT * FROM in_app_notifications ORDER BY created_at DESC LIMIT 1000`),
      db
        .execute(sql`
      SELECT id, table_name, op, row_id, ts FROM audit.events
      WHERE organization_id = ${orgId}
      ORDER BY ts DESC
      LIMIT 5000
    `)
        .catch(() => []),
    ]);

  // Redacción opcional de PII. Mantenemos consistency: mismo email → mismo
  // marcador para preservar relaciones entre bookings repetidos.
  const emailMap = new Map<string, string>();
  const redactEmail = (email: string | null): string | null => {
    if (!email) return null;
    const existing = emailMap.get(email);
    if (existing) return existing;
    const redacted = `guest-${emailMap.size + 1}@redacted.local`;
    emailMap.set(email, redacted);
    return redacted;
  };
  const redactBookings = (rows: unknown) => {
    if (!Array.isArray(rows) || !redact) return rows;
    return rows.map((r) => {
      const obj = r as Record<string, unknown>;
      return {
        ...obj,
        guest_email: redactEmail((obj.guest_email as string | null) ?? null),
        guest_phone: obj.guest_phone ? '***' : null,
        guest_name: obj.guest_name ? '[REDACTED]' : null,
      };
    });
  };

  const bundle = {
    exportedAt: new Date().toISOString(),
    redacted: redact,
    workspace: {
      id: orgId,
      settings: settings[0] ?? null,
    },
    properties,
    units,
    seasons,
    rates,
    bookings: redactBookings(bookings),
    notifications,
    audit: auditEvents,
    metadata: {
      counts: {
        properties: Array.isArray(properties) ? properties.length : 0,
        units: Array.isArray(units) ? units.length : 0,
        bookings: Array.isArray(bookings) ? bookings.length : 0,
        notifications: Array.isArray(notifications) ? notifications.length : 0,
        audit: Array.isArray(auditEvents) ? auditEvents.length : 0,
      },
      uniqueGuests: redact ? emailMap.size : undefined,
    },
  };

  const filename = `impacto-workspace${redact ? '-redacted' : ''}-${orgId}-${new Date().toISOString().slice(0, 10)}.json`;
  return c.body(JSON.stringify(bundle, null, 2), 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
});

settingsRouter.patch('/', async (c) => {
  const orgId = getActiveOrgId(c);
  const body = await c.req.json();
  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }

  const db = getTenantDb(c);

  // Upsert: crea la fila la primera vez que el dueño guarda algo.
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) updates[k] = v;
  }

  const [upserted] = await db
    .insert(schema.tenantSettings)
    .values({
      id: orgId,
      country: parsed.data.country ?? 'UY',
      timezone: parsed.data.timezone ?? 'America/Montevideo',
      currency: parsed.data.currency ?? 'USD',
      settings: parsed.data.settings ?? {},
    })
    .onConflictDoUpdate({ target: schema.tenantSettings.id, set: updates })
    .returning();

  return c.json({ data: upserted });
});

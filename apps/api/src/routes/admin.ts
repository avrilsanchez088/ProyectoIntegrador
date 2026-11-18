import { schema, sql } from '@impacto/db';
import { createDb } from '@impacto/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { type AppEnv, requireAuth } from '../middleware/auth.js';

/**
 * Admin endpoints — solo accesibles para staff de Impacto.
 *
 * Identificación: el email del user pertenece a `STAFF_EMAILS` (env var,
 * lista separada por comas). Default vacío = bloqueado.
 *
 * Propuestas 89.1 + 100.1 + 114.1 (rondas 5/7/8).
 */

const adminDb = createDb(env.DATABASE_URL);

export const adminRouter = new Hono<AppEnv>();

adminRouter.use('*', requireAuth);
adminRouter.use('*', async (c, next) => {
  const user = c.get('user');
  const allowed = (process.env.STAFF_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!user.email || !allowed.includes(user.email.toLowerCase())) {
    return c.json({ error: 'forbidden', message: 'Solo staff de Impacto.' }, 403);
  }
  await next();
});

/**
 * GET /api/admin/tenants — lista global de workspaces con stats básicas.
 * Usa la materialized view `mv_tenant_stats` cuando existe (propuesta 135.2
 * ronda 11). Fallback a subqueries si la MV todavía no se creó.
 */
adminRouter.get('/tenants', async (c) => {
  // Filtro opcional `q` (propuesta 154.4 ronda 13). Búsqueda case-insensitive
  // sobre name + slug. Usamos ILIKE simple — `pg_trgm` ya está habilitado
  // pero sin índice GIN agregado todavía.
  const q = c.req.query('q')?.trim() ?? '';
  const queryLike = q ? `%${q}%` : null;

  // Try MV first (mucho más rápido — un single SELECT vs 5 subqueries).
  try {
    const rows = await adminDb.execute<{
      organization_id: string;
      name: string;
      slug: string | null;
      created_at: Date;
      plan: string | null;
      frozen: boolean;
      members_count: number;
      properties_count: number;
      units_count: number;
      bookings_total: number;
      bookings_active: number;
      last_booking_at: Date | null;
    }>(
      queryLike
        ? sql`
          SELECT * FROM mv_tenant_stats
          WHERE name ILIKE ${queryLike} OR slug ILIKE ${queryLike}
          ORDER BY created_at DESC
          LIMIT 200
        `
        : sql`
          SELECT * FROM mv_tenant_stats
          ORDER BY created_at DESC
          LIMIT 200
        `,
    );
    // Mapear shape al formato que el frontend espera (campo `id` en lugar
    // de `organization_id` para compat con la versión anterior).
    return c.json({
      data: rows.map((r) => ({
        id: r.organization_id,
        name: r.name,
        slug: r.slug,
        created_at: r.created_at,
        plan: r.plan,
        frozen: r.frozen,
        members_count: r.members_count,
        properties_count: r.properties_count,
        units_count: r.units_count,
        bookings_total: r.bookings_total,
        bookings_active: r.bookings_active,
        last_booking_at: r.last_booking_at,
      })),
    });
  } catch {
    // Fallback: MV no existe (migration 0009 no corrió). Subqueries directas.
  }

  const rows = await adminDb.execute<{
    id: string;
    name: string;
    slug: string | null;
    created_at: Date;
    plan: string | null;
    members_count: number;
    properties_count: number;
    units_count: number;
    bookings_total: number;
    bookings_active: number;
    last_booking_at: Date | null;
  }>(sql`
    SELECT
      o.id,
      o.name,
      o.slug,
      o.created_at,
      ts.plan,
      (SELECT COUNT(*) FROM members m WHERE m.organization_id = o.id)::int AS members_count,
      (SELECT COUNT(*) FROM properties p WHERE p.organization_id = o.id AND p.deleted_at IS NULL)::int AS properties_count,
      (SELECT COUNT(*) FROM units u WHERE u.organization_id = o.id AND u.deleted_at IS NULL)::int AS units_count,
      (SELECT COUNT(*) FROM bookings b WHERE b.organization_id = o.id)::int AS bookings_total,
      (SELECT COUNT(*) FROM bookings b WHERE b.organization_id = o.id AND b.status NOT IN ('cancelled', 'no_show'))::int AS bookings_active,
      (SELECT MAX(created_at) FROM bookings b WHERE b.organization_id = o.id) AS last_booking_at
    FROM organizations o
    LEFT JOIN tenant_settings ts ON ts.id = o.id
    ${queryLike ? sql`WHERE o.name ILIKE ${queryLike} OR o.slug ILIKE ${queryLike}` : sql``}
    ORDER BY o.created_at DESC
    LIMIT 200
  `);

  return c.json({ data: rows });
});

/**
 * PATCH /api/admin/tenants/:id/freeze-allow-ops — actualiza la whitelist de
 * op-keys permitidas durante freeze (propuesta 191.1 ronda 17).
 */
const allowOpsSchema = z.object({
  allowOps: z.array(z.string().regex(/^[a-z]+\.[a-z]+$/)).max(20),
});

adminRouter.patch('/tenants/:id/freeze-allow-ops', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = allowOpsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  const updated = await adminDb.execute<{ id: string; frozen_allow_ops: string[] }>(sql`
    INSERT INTO tenant_settings (id, frozen_allow_ops)
    VALUES (${id}, ${parsed.data.allowOps}::text[])
    ON CONFLICT (id) DO UPDATE
      SET frozen_allow_ops = EXCLUDED.frozen_allow_ops,
          updated_at = now()
    RETURNING id, frozen_allow_ops
  `);
  return c.json({ data: updated[0] });
});

/**
 * GET /api/admin/tenants/:id/freeze-history — timeline de toggles freeze
 * (propuesta 142.7 ronda 12).
 */
adminRouter.get('/tenants/:id/freeze-history', async (c) => {
  const id = c.req.param('id');
  try {
    const rows = await adminDb.execute<{
      id: string;
      frozen: boolean;
      reason: string | null;
      by_user_id: string | null;
      by_email: string | null;
      ts: Date;
    }>(sql`
      SELECT l.id, l.frozen, l.reason, l.by_user_id, l.ts, u.email AS by_email
      FROM tenant_freeze_log l
      LEFT JOIN users u ON u.id = l.by_user_id
      WHERE l.organization_id = ${id}
      ORDER BY l.ts DESC
      LIMIT 100
    `);
    return c.json({ data: rows });
  } catch {
    // Migration 0013 puede no haber corrido todavía.
    return c.json({ data: [] });
  }
});

/**
 * GET /api/admin/tenants/:id — detail de un tenant específico.
 * Propuesta 118.1 ronda 10.
 */
adminRouter.get('/tenants/:id', async (c) => {
  const id = c.req.param('id');
  const [tenant, members, recentBookings, recentAudit] = await Promise.all([
    adminDb.execute<{
      id: string;
      name: string;
      slug: string | null;
      created_at: Date;
      country: string | null;
      timezone: string | null;
      currency: string | null;
      plan: string | null;
      frozen: boolean;
      frozen_reason: string | null;
      frozen_at: Date | null;
      frozen_allow_ops: string[] | null;
    }>(sql`
      SELECT o.id, o.name, o.slug, o.created_at,
             ts.country, ts.timezone, ts.currency, ts.plan,
             COALESCE(ts.frozen, false) AS frozen,
             ts.frozen_reason, ts.frozen_at,
             COALESCE(ts.frozen_allow_ops, ARRAY[]::text[]) AS frozen_allow_ops
      FROM organizations o
      LEFT JOIN tenant_settings ts ON ts.id = o.id
      WHERE o.id = ${id}
      LIMIT 1
    `),
    adminDb.execute<{
      user_id: string;
      role: string;
      email: string | null;
      name: string | null;
    }>(sql`
      SELECT m.user_id, m.role, u.email, u.name
      FROM members m
      LEFT JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ${id}
      ORDER BY m.role DESC
    `),
    adminDb.execute(sql`
      SELECT id, code, status, check_in, check_out, total_cents, currency, created_at
      FROM bookings
      WHERE organization_id = ${id}
      ORDER BY created_at DESC
      LIMIT 20
    `),
    adminDb.execute(sql`
      SELECT id, table_name, op, row_id, ts
      FROM audit.events
      WHERE organization_id = ${id}
      ORDER BY ts DESC
      LIMIT 20
    `),
  ]);

  if (!tenant[0]) {
    return c.json({ error: 'not_found' }, 404);
  }

  return c.json({
    data: {
      tenant: tenant[0],
      members,
      recentBookings,
      recentAudit,
    },
  });
});

/**
 * POST /api/admin/tenants/:id/freeze
 * Body: { frozen: boolean, reason?: string }
 * Propuesta 118.3 ronda 10.
 */
const freezeSchema = z.object({
  frozen: z.boolean(),
  reason: z.string().max(500).optional(),
});

adminRouter.post('/tenants/:id/freeze', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = freezeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }

  const updated = await adminDb.execute<{ id: string; frozen: boolean }>(sql`
    INSERT INTO tenant_settings (id, frozen, frozen_reason, frozen_at)
    VALUES (${id}, ${parsed.data.frozen}, ${parsed.data.reason ?? null},
            ${parsed.data.frozen ? new Date() : null})
    ON CONFLICT (id) DO UPDATE
      SET frozen = EXCLUDED.frozen,
          frozen_reason = EXCLUDED.frozen_reason,
          frozen_at = EXCLUDED.frozen_at,
          updated_at = now()
    RETURNING id, frozen
  `);

  // Append-only history (propuesta 142.7 ronda 12). Best-effort — si la
  // tabla no existe (migration 0013 no corrió todavía), no bloqueamos.
  try {
    await adminDb.execute(sql`
      INSERT INTO tenant_freeze_log (organization_id, frozen, reason, by_user_id)
      VALUES (${id}, ${parsed.data.frozen}, ${parsed.data.reason ?? null}, ${c.get('user').id})
    `);
  } catch {
    /* migration pendiente — admin action ya tuvo éxito */
  }

  // Notif a todos los members del workspace afectado (propuesta 131.1).
  // Best-effort — si falla no bloqueamos el toggle.
  try {
    const title = parsed.data.frozen ? 'Workspace congelado' : 'Workspace descongelado';
    const body = parsed.data.frozen
      ? (parsed.data.reason ?? 'Las mutaciones quedaron temporalmente bloqueadas.')
      : 'Las operaciones volvieron a estar disponibles.';
    const severity = parsed.data.frozen ? 'urgent' : 'info';
    await adminDb.execute(sql`
      INSERT INTO in_app_notifications
        (organization_id, user_id, category, severity, title, body, action_url, data)
      VALUES (
        ${id}, NULL, 'system', ${severity}, ${title}, ${body}, '/dashboard',
        ${JSON.stringify({ action: parsed.data.frozen ? 'freeze' : 'unfreeze' })}::jsonb
      )
    `);
  } catch {
    /* swallow — admin action ya tuvo éxito */
  }

  return c.json({ data: updated[0] });
});

// ─── System announcements (propuesta 132.1 ronda 11) ─────────────
const announcementSchema = z.object({
  severity: z.enum(['info', 'warning', 'urgent', 'critical']).default('info'),
  message: z.string().min(2).max(500),
  href: z.string().url().nullable().optional(),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

adminRouter.get('/announcements', async (c) => {
  // ETag conditional GET (propuesta 179.5 ronda 15) — el client envía
  // If-None-Match con el ETag previo. Si no cambió, 304 sin body.
  const meta = await adminDb.execute<{ max_updated: Date | null; cnt: number }>(sql`
    SELECT
      GREATEST(MAX(created_at), MAX(starts_at), COALESCE(MAX(expires_at), 'epoch'::timestamptz)) AS max_updated,
      COUNT(*)::int AS cnt
    FROM system_announcements
  `);
  const etag = `"${meta[0]?.max_updated?.getTime() ?? 0}-${meta[0]?.cnt ?? 0}"`;
  c.header('ETag', etag);
  if (c.req.header('If-None-Match') === etag) {
    return c.body(null, 304);
  }
  const rows = await adminDb.execute(sql`
    SELECT * FROM system_announcements
    ORDER BY created_at DESC
    LIMIT 100
  `);
  return c.json({ data: rows });
});

/**
 * GET /api/admin/announcements/:id — fetch para clone (propuesta 173.2 ronda 15).
 */
adminRouter.get('/announcements/:id', async (c) => {
  const id = c.req.param('id');
  const rows = await adminDb.execute(sql`
    SELECT * FROM system_announcements WHERE id = ${id} LIMIT 1
  `);
  if (rows.length === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: rows[0] });
});

/**
 * POST /api/admin/announcements/cleanup — bulk delete expirados
 * (propuesta 173.1 ronda 15). Devuelve count de borrados.
 */
adminRouter.post('/announcements/cleanup', async (c) => {
  const result = await adminDb.execute<{ id: string }>(sql`
    DELETE FROM system_announcements
    WHERE expires_at IS NOT NULL AND expires_at < now()
    RETURNING id
  `);
  return c.json({ data: { deletedCount: result.length } });
});

adminRouter.post('/announcements', async (c) => {
  const body = await c.req.json();
  const parsed = announcementSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  const user = c.get('user');
  const created = await adminDb.execute(sql`
    INSERT INTO system_announcements
      (severity, message, href, starts_at, expires_at, created_by)
    VALUES (
      ${parsed.data.severity},
      ${parsed.data.message},
      ${parsed.data.href ?? null},
      ${parsed.data.startsAt ?? new Date().toISOString()}::timestamptz,
      ${parsed.data.expiresAt ?? null},
      ${user.id}
    )
    RETURNING id, severity, message, expires_at, created_at
  `);
  return c.json({ data: created[0] }, 201);
});

/**
 * PATCH /api/admin/announcements/:id — edita un anuncio existente
 * (propuesta 162.1 ronda 14). Útil para corregir typos o extender expiry.
 */
const announcementUpdateSchema = z
  .object({
    severity: z.enum(['info', 'warning', 'urgent', 'critical']).optional(),
    message: z.string().min(2).max(500).optional(),
    href: z.string().url().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'al menos un campo a actualizar',
  });

adminRouter.patch('/announcements/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = announcementUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }

  // Update vía COALESCE — los campos undefined preservan el valor actual.
  const updated = await adminDb.execute(sql`
    UPDATE system_announcements
    SET severity = COALESCE(${parsed.data.severity ?? null}, severity),
        message  = COALESCE(${parsed.data.message ?? null}, message),
        href     = ${parsed.data.href === undefined ? sql`href` : parsed.data.href},
        expires_at = ${parsed.data.expiresAt === undefined ? sql`expires_at` : parsed.data.expiresAt}::timestamptz
    WHERE id = ${id}
    RETURNING id, severity, message, href, starts_at, expires_at
  `);
  if (updated.length === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: updated[0] });
});

adminRouter.delete('/announcements/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await adminDb.execute<{ id: string }>(sql`
    DELETE FROM system_announcements WHERE id = ${id}
    RETURNING id
  `);
  if (deleted.length === 0 || !deleted[0]) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: { id: deleted[0].id, deleted: true } });
});

/**
 * GET /api/admin/tenants.csv — export de tenants a CSV (propuesta 154.6
 * ronda 14). Acepta el mismo `q` que /tenants. Útil para análisis externos.
 */
adminRouter.get('/tenants.csv', async (c) => {
  const q = c.req.query('q')?.trim() ?? '';
  const queryLike = q ? `%${q}%` : null;
  const rows = await adminDb.execute<{
    id: string;
    name: string;
    slug: string | null;
    plan: string | null;
    members_count: number;
    properties_count: number;
    units_count: number;
    bookings_total: number;
    bookings_active: number;
    last_booking_at: Date | null;
    frozen: boolean;
    created_at: Date;
  }>(
    queryLike
      ? sql`
        SELECT * FROM mv_tenant_stats
        WHERE name ILIKE ${queryLike} OR slug ILIKE ${queryLike}
        ORDER BY created_at DESC
      `
      : sql`SELECT * FROM mv_tenant_stats ORDER BY created_at DESC`,
  );
  const csvEscape = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    'id',
    'name',
    'slug',
    'plan',
    'members',
    'properties',
    'units',
    'bookings_total',
    'bookings_active',
    'last_booking_at',
    'frozen',
    'created_at',
  ].join(',');
  const lines = rows.map((r) =>
    [
      csvEscape(r.id),
      csvEscape(r.name),
      csvEscape(r.slug),
      csvEscape(r.plan),
      csvEscape(r.members_count),
      csvEscape(r.properties_count),
      csvEscape(r.units_count),
      csvEscape(r.bookings_total),
      csvEscape(r.bookings_active),
      csvEscape(r.last_booking_at ? new Date(r.last_booking_at).toISOString() : ''),
      csvEscape(r.frozen ? 'yes' : 'no'),
      csvEscape(new Date(r.created_at).toISOString()),
    ].join(','),
  );
  const csv = `﻿${header}\r\n${lines.join('\r\n')}`;
  const filename = `tenants-${new Date().toISOString().slice(0, 10)}.csv`;
  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
});

/**
 * GET /api/admin/trials-expiring.csv — export trials próximos a expirar
 * (propuesta 162.4 ronda 14).
 */
adminRouter.get('/trials-expiring.csv', async (c) => {
  const days = Math.min(Math.max(Number(c.req.query('days') ?? 14), 1), 90);
  const rows = await adminDb.execute<{
    id: string;
    name: string;
    slug: string | null;
    plan: string | null;
    trial_ends_at: Date;
    owner_email: string | null;
  }>(sql`
    SELECT o.id, o.name, o.slug, ts.plan, ts.trial_ends_at,
           (SELECT u.email FROM members m
            JOIN users u ON u.id = m.user_id
            WHERE m.organization_id = o.id AND m.role = 'owner'
            ORDER BY m.created_at ASC LIMIT 1) AS owner_email
    FROM organizations o
    JOIN tenant_settings ts ON ts.id = o.id
    WHERE ts.trial_ends_at IS NOT NULL
      AND ts.trial_ends_at > now()
      AND ts.trial_ends_at < now() + (${days}::int || ' days')::interval
    ORDER BY ts.trial_ends_at ASC
  `);
  const csvEscape = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['id', 'name', 'slug', 'plan', 'trial_ends_at', 'owner_email'].join(',');
  const lines = rows.map((r) =>
    [
      csvEscape(r.id),
      csvEscape(r.name),
      csvEscape(r.slug),
      csvEscape(r.plan),
      csvEscape(new Date(r.trial_ends_at).toISOString()),
      csvEscape(r.owner_email),
    ].join(','),
  );
  const csv = `﻿${header}\r\n${lines.join('\r\n')}`;
  const filename = `trials-${new Date().toISOString().slice(0, 10)}.csv`;
  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
});

/**
 * Status incidents CRUD (propuesta 204.1 ronda 18). Staff crea/edita los
 * incidents que aparecen en /status público.
 */
// Tags válidos para affected_components (propuesta 227.4 ronda 21). Lista
// open — agregar nuevos en `packages/shared/src/incident-components.ts`.
const AFFECTED_COMPONENT_KEYS = [
  'whatsapp',
  'bookings',
  'calendar',
  'dashboard',
  'webhooks',
  'payments',
  'email',
  'ical',
  'ai-bot',
  'database',
] as const;

const incidentCreateSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  severity: z.enum(['minor', 'major', 'critical']).default('minor'),
  status: z
    .enum(['investigating', 'identified', 'monitoring', 'resolved'])
    .default('investigating'),
  affectedComponents: z.array(z.enum(AFFECTED_COMPONENT_KEYS)).max(10).default([]),
});

const incidentUpdateSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  severity: z.enum(['minor', 'major', 'critical']).optional(),
  status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']).optional(),
  postmortem: z.string().max(8000).nullable().optional(),
  affectedComponents: z.array(z.enum(AFFECTED_COMPONENT_KEYS)).max(10).optional(),
});

const incidentUpdatePostSchema = z.object({
  status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']),
  message: z.string().min(2).max(2000),
});

adminRouter.get('/incidents', async (c) => {
  try {
    const rows = await adminDb.execute(sql`
      SELECT * FROM status_incidents
      ORDER BY started_at DESC
      LIMIT 100
    `);
    return c.json({ data: rows });
  } catch {
    return c.json({ data: [] });
  }
});

adminRouter.post('/incidents', async (c) => {
  const body = await c.req.json();
  const parsed = incidentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  try {
    const created = await adminDb.execute(sql`
      INSERT INTO status_incidents
        (title, description, severity, status, affected_components, created_by)
      VALUES (
        ${parsed.data.title},
        ${parsed.data.description ?? null},
        ${parsed.data.severity},
        ${parsed.data.status},
        ${parsed.data.affectedComponents}::text[],
        ${c.get('user').id}
      )
      RETURNING *
    `);
    return c.json({ data: created[0] }, 201);
  } catch {
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

adminRouter.patch('/incidents/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = incidentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  try {
    const updated = await adminDb.execute(sql`
      UPDATE status_incidents
      SET title       = COALESCE(${parsed.data.title ?? null}, title),
          description = ${
            parsed.data.description === undefined ? sql`description` : parsed.data.description
          },
          severity    = COALESCE(${parsed.data.severity ?? null}, severity),
          status      = COALESCE(${parsed.data.status ?? null}, status),
          postmortem  = ${
            parsed.data.postmortem === undefined ? sql`postmortem` : parsed.data.postmortem
          },
          affected_components = ${
            parsed.data.affectedComponents === undefined
              ? sql`affected_components`
              : sql`${parsed.data.affectedComponents}::text[]`
          },
          resolved_at = CASE
            WHEN ${parsed.data.status ?? null} = 'resolved' AND resolved_at IS NULL THEN now()
            WHEN ${parsed.data.status ?? null} IN ('investigating', 'identified', 'monitoring') THEN NULL
            ELSE resolved_at
          END,
          updated_at  = now()
      WHERE id = ${id}
      RETURNING *
    `);
    if (updated.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.json({ data: updated[0] });
  } catch {
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

/**
 * Incident updates timeline (propuesta 218.1 ronda 20). Append-only —
 * cada update tiene su own row con status snapshot + message.
 */
adminRouter.get('/incidents/:id/updates', async (c) => {
  const id = c.req.param('id');
  try {
    const rows = await adminDb.execute(sql`
      SELECT id, status, message, created_at FROM incident_updates
      WHERE incident_id = ${id}
      ORDER BY created_at DESC
      LIMIT 100
    `);
    return c.json({ data: rows });
  } catch {
    return c.json({ data: [] });
  }
});

adminRouter.post('/incidents/:id/updates', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = incidentUpdatePostSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  try {
    // Doble write: insert en updates + sync del status del incident parent.
    const inserted = await adminDb.execute(sql`
      INSERT INTO incident_updates (incident_id, status, message, created_by)
      VALUES (${id}, ${parsed.data.status}, ${parsed.data.message}, ${c.get('user').id})
      RETURNING *
    `);
    await adminDb.execute(sql`
      UPDATE status_incidents
      SET status = ${parsed.data.status},
          resolved_at = CASE
            WHEN ${parsed.data.status} = 'resolved' AND resolved_at IS NULL THEN now()
            WHEN ${parsed.data.status} != 'resolved' THEN NULL
            ELSE resolved_at
          END,
          updated_at = now()
      WHERE id = ${id}
    `);
    return c.json({ data: inserted[0] }, 201);
  } catch {
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

/**
 * PATCH /api/admin/incidents/:id/updates/:updId — edit message
 * (propuesta 227.1 ronda 21). Útil para corregir typos. Mantenemos
 * status inmutable — para cambiar status el flow es agregar un update nuevo.
 */
const updateMessageEditSchema = z.object({
  message: z.string().min(2).max(2000),
});

adminRouter.patch('/incidents/:id/updates/:updId', async (c) => {
  const updId = c.req.param('updId');
  const body = await c.req.json();
  const parsed = updateMessageEditSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  try {
    const updated = await adminDb.execute<{ id: string }>(sql`
      UPDATE incident_updates
      SET message = ${parsed.data.message}
      WHERE id = ${updId}
      RETURNING *
    `);
    if (updated.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.json({ data: updated[0] });
  } catch {
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

adminRouter.delete('/incidents/:id/updates/:updId', async (c) => {
  const updId = c.req.param('updId');
  try {
    const deleted = await adminDb.execute<{ id: string }>(sql`
      DELETE FROM incident_updates WHERE id = ${updId} RETURNING id
    `);
    if (deleted.length === 0 || !deleted[0]) return c.json({ error: 'not_found' }, 404);
    return c.json({ data: { id: deleted[0].id, deleted: true } });
  } catch {
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

adminRouter.delete('/incidents/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const deleted = await adminDb.execute<{ id: string }>(sql`
      DELETE FROM status_incidents WHERE id = ${id} RETURNING id
    `);
    if (deleted.length === 0 || !deleted[0]) return c.json({ error: 'not_found' }, 404);
    return c.json({ data: { id: deleted[0].id, deleted: true } });
  } catch {
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

/**
 * POST /api/admin/worker-runs/:id/rerun — encola un job nuevo en la queue
 * correspondiente al worker_name del run original (propuesta 220.1 ronda 19).
 *
 * No re-corre el job exacto — solo dispara una nueva ejecución del mismo
 * worker. El payload viene del schedule original o se usa un default
 * vacío.
 */
adminRouter.post('/worker-runs/:id/rerun', async (c) => {
  const id = c.req.param('id');
  try {
    const rows = await adminDb.execute<{ worker_name: string }>(sql`
      SELECT worker_name FROM worker_runs WHERE id = ${id} LIMIT 1
    `);
    const workerName = rows[0]?.worker_name;
    if (!workerName) return c.json({ error: 'not_found' }, 404);

    // Whitelist de workers re-runnable. Algunos jobs requieren payload
    // específico que no podemos reconstruir desde un run histórico.
    const RERUNNABLE = new Set(['mv-refresh', 'audit-purge', 'stale-freeze-alert']);
    if (!RERUNNABLE.has(workerName)) {
      return c.json(
        {
          error: 'not_rerunnable',
          message: `El worker '${workerName}' requiere payload que no podemos reconstruir.`,
        },
        400,
      );
    }

    const { Queue } = await import('bullmq');
    const IORedis = (await import('ioredis')).default;
    const conn = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6380', {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    const queue = new Queue(workerName, { connection: conn });
    const job = await queue.add('manual-rerun', {
      triggeredBy: c.get('user').id,
      parentRunId: id, // propuesta 230.3 ronda 21
    });
    await queue.close();
    conn.disconnect();
    return c.json({ data: { workerName, jobId: job.id, parentRunId: id } }, 201);
  } catch (err) {
    logger.warn({ err, id }, 'worker rerun failed');
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

/**
 * GET /api/admin/worker-runs/:id/lineage — devuelve parent + children del
 * run, para mostrar el árbol de re-triggers (propuesta 239.1 ronda 22).
 */
adminRouter.get('/worker-runs/:id/lineage', async (c) => {
  const id = c.req.param('id');
  try {
    const rows = await adminDb.execute<{
      id: string;
      worker_name: string;
      status: string;
      started_at: Date;
      parent_run_id: string | null;
      triggered_by: string | null;
      role: 'self' | 'parent' | 'child';
    }>(sql`
      WITH base AS (
        SELECT id, worker_name, status, started_at, parent_run_id, triggered_by
        FROM worker_runs WHERE id = ${id}
      )
      SELECT b.*, 'self'::text AS role FROM base b
      UNION ALL
      SELECT p.id, p.worker_name, p.status, p.started_at,
             p.parent_run_id, p.triggered_by, 'parent'::text
      FROM worker_runs p
      WHERE p.id = (SELECT parent_run_id FROM base)
      UNION ALL
      SELECT c.id, c.worker_name, c.status, c.started_at,
             c.parent_run_id, c.triggered_by, 'child'::text
      FROM worker_runs c
      WHERE c.parent_run_id = ${id}
      ORDER BY started_at ASC
    `);
    return c.json({ data: rows });
  } catch {
    return c.json({ data: [] });
  }
});

/**
 * Worker runs — recientes runs de los workers BullMQ (propuestas 163.5 +
 * 182.4). Default 50, agrupado por worker_name.
 */
adminRouter.get('/worker-runs', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  const workerName = c.req.query('worker');
  const where = workerName ? sql`WHERE worker_name = ${workerName}` : sql``;
  try {
    const rows = await adminDb.execute(sql`
      SELECT id, worker_name, job_id, started_at, ended_at, status,
             duration_ms, result, error_message
      FROM worker_runs
      ${where}
      ORDER BY started_at DESC
      LIMIT ${limit}
    `);
    return c.json({ data: rows });
  } catch {
    return c.json({ data: [] });
  }
});

/**
 * GDPR data subject requests — listing/update para staff (propuestas 158.1 +
 * 158.2 ronda 13).
 */
adminRouter.get('/gdpr/requests', async (c) => {
  const status = c.req.query('status');
  const validStatus = ['pending', 'processing', 'completed', 'rejected'] as const;
  const where = (validStatus as readonly string[]).includes(status ?? '')
    ? sql`WHERE status = ${status}`
    : sql``;
  try {
    const rows = await adminDb.execute(sql`
      SELECT r.id, r.organization_id, r.email, r.action, r.status,
             r.request_ip::text AS request_ip, r.notes, r.created_at,
             r.processed_at, r.processed_by, o.name AS organization_name
      FROM data_subject_requests r
      LEFT JOIN organizations o ON o.id = r.organization_id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT 200
    `);
    return c.json({ data: rows });
  } catch {
    return c.json({ data: [] });
  }
});

const gdprUpdateSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'rejected']),
  notes: z.string().max(2000).nullable().optional(),
});

adminRouter.patch('/gdpr/requests/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = gdprUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  const userId = c.get('user').id;
  try {
    const updated = await adminDb.execute<{ id: string; status: string }>(sql`
      UPDATE data_subject_requests
      SET status = ${parsed.data.status},
          notes = ${parsed.data.notes ?? null},
          processed_at = CASE
            WHEN ${parsed.data.status} IN ('completed', 'rejected') THEN now()
            ELSE processed_at
          END,
          processed_by = CASE
            WHEN ${parsed.data.status} IN ('completed', 'rejected') THEN ${userId}
            ELSE processed_by
          END
      WHERE id = ${id}
      RETURNING id, status, processed_at
    `);
    if (updated.length === 0) return c.json({ error: 'not_found' }, 404);

    // Si el staff marca 'processing', encolamos el worker (propuesta 187.1
    // ronda 17). Best-effort — Redis puede estar abajo en dev.
    if (parsed.data.status === 'processing') {
      try {
        const { Queue } = await import('bullmq');
        const IORedis = (await import('ioredis')).default;
        const conn = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6380', {
          maxRetriesPerRequest: null,
          lazyConnect: true,
        });
        const queue = new Queue('gdpr-process', { connection: conn });
        await queue.add('process', { requestId: id });
        await queue.close();
        conn.disconnect();
      } catch (err) {
        logger.warn({ err, id }, 'gdpr-process enqueue failed (staff debe procesar manualmente)');
      }
    }

    // Auto-close announcement asociado cuando la request queda completed/rejected
    // (propuesta 229.3 ronda 21). Borramos vs setear expires_at — la
    // info ya no es accionable.
    if (parsed.data.status === 'completed' || parsed.data.status === 'rejected') {
      try {
        await adminDb.execute(sql`
          DELETE FROM system_announcements
          WHERE data->>'gdpr_request_id' = ${id}
        `);
      } catch {
        /* tabla puede no tener data column todavía */
      }
    }

    return c.json({ data: updated[0] });
  } catch {
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

/**
 * Workspace tagging (propuesta 166.1 ronda 14). Staff agrega tags coloreables
 * a tenants para clasificación interna (enterprise / vip / risk / etc).
 *
 * Schema CHECK constraint limita color a un set predefinido.
 */
const tagSchema = z.object({
  tag: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-zA-Z0-9 _-]+$/, 'caracteres inválidos'),
  color: z.enum(['gray', 'red', 'amber', 'green', 'blue', 'violet']).default('gray'),
});

adminRouter.get('/tenants/:id/tags', async (c) => {
  const id = c.req.param('id');
  try {
    const rows = await adminDb.execute<{
      id: string;
      tag: string;
      color: string;
      created_at: Date;
    }>(sql`
      SELECT id, tag, color, created_at FROM tenant_tags
      WHERE organization_id = ${id}
      ORDER BY created_at ASC
    `);
    return c.json({ data: rows });
  } catch {
    return c.json({ data: [] });
  }
});

adminRouter.post('/tenants/:id/tags', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = tagSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  try {
    const inserted = await adminDb.execute<{ id: string; tag: string; color: string }>(sql`
      INSERT INTO tenant_tags (organization_id, tag, color, created_by)
      VALUES (${id}, ${parsed.data.tag}, ${parsed.data.color}, ${c.get('user').id})
      ON CONFLICT (organization_id, tag) DO UPDATE
        SET color = EXCLUDED.color
      RETURNING id, tag, color
    `);
    return c.json({ data: inserted[0] }, 201);
  } catch {
    return c.json({ error: 'tag_table_missing' }, 503);
  }
});

adminRouter.delete('/tenants/:id/tags/:tagId', async (c) => {
  const tagId = c.req.param('tagId');
  try {
    const deleted = await adminDb.execute<{ id: string }>(sql`
      DELETE FROM tenant_tags WHERE id = ${tagId} RETURNING id
    `);
    if (deleted.length === 0 || !deleted[0]) return c.json({ error: 'not_found' }, 404);
    return c.json({ data: { id: deleted[0].id, deleted: true } });
  } catch {
    return c.json({ error: 'tag_table_missing' }, 503);
  }
});

/**
 * GET /api/admin/tenants/frozen — solo workspaces actualmente congelados
 * (propuesta 162.6 ronda 14). Ordenados por frozen_at DESC.
 */
adminRouter.get('/tenants/frozen', async (c) => {
  const rows = await adminDb.execute<{
    id: string;
    name: string;
    slug: string | null;
    frozen_at: Date;
    frozen_reason: string | null;
    plan: string | null;
  }>(sql`
    SELECT o.id, o.name, o.slug, ts.frozen_at, ts.frozen_reason, ts.plan
    FROM organizations o
    JOIN tenant_settings ts ON ts.id = o.id
    WHERE ts.frozen = true
    ORDER BY ts.frozen_at DESC NULLS LAST
    LIMIT 200
  `);
  return c.json({ data: rows });
});

/**
 * GET /api/admin/trials-expiring — tenants con trial expirando en próximos N
 * días (propuesta 154.7 ronda 13). Default 14d.
 */
adminRouter.get('/trials-expiring', async (c) => {
  const days = Math.min(Math.max(Number(c.req.query('days') ?? 14), 1), 90);
  const rows = await adminDb.execute<{
    id: string;
    name: string;
    slug: string | null;
    plan: string | null;
    trial_ends_at: Date | null;
    days_left: number;
  }>(sql`
    SELECT
      o.id, o.name, o.slug,
      ts.plan, ts.trial_ends_at,
      EXTRACT(EPOCH FROM (ts.trial_ends_at - now()))::int / 86400 AS days_left
    FROM organizations o
    JOIN tenant_settings ts ON ts.id = o.id
    WHERE ts.trial_ends_at IS NOT NULL
      AND ts.trial_ends_at > now()
      AND ts.trial_ends_at < now() + (${days}::int || ' days')::interval
    ORDER BY ts.trial_ends_at ASC
    LIMIT 200
  `);
  return c.json({ data: rows });
});

/**
 * GET /api/admin/slow-queries — top N queries por mean_exec_time
 * (propuesta 153.2 ronda 13).
 *
 * Lee `pg_stat_statements`. Requiere la extensión habilitada (CLAUDE.md
 * §1.3 ya la lista en las extensiones del Postgres dev).
 */
adminRouter.get('/slow-queries', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  try {
    const rows = await adminDb.execute<{
      query: string;
      calls: number;
      total_exec_time: number;
      mean_exec_time: number;
      rows: number;
    }>(sql`
      SELECT
        regexp_replace(query, '\\s+', ' ', 'g') AS query,
        calls::int,
        round(total_exec_time::numeric, 1)::float8 AS total_exec_time,
        round(mean_exec_time::numeric, 2)::float8  AS mean_exec_time,
        rows::int
      FROM pg_stat_statements
      WHERE query NOT ILIKE '%pg_stat_statements%'
        AND query NOT ILIKE '%pg_catalog%'
      ORDER BY mean_exec_time DESC
      LIMIT ${limit}
    `);
    return c.json({ data: rows });
  } catch (err) {
    return c.json(
      {
        error: 'pg_stat_statements_unavailable',
        message:
          err instanceof Error
            ? err.message
            : 'Extensión pg_stat_statements no disponible. Verificá la config de Postgres.',
        data: [],
      },
      503,
    );
  }
});

/**
 * GET /api/admin/stats — agregados globales del producto.
 */
adminRouter.get('/stats', async (c) => {
  const stats = await adminDb.execute<{
    tenants_total: number;
    tenants_active: number;
    bookings_total: number;
    bookings_30d: number;
    properties_total: number;
    users_total: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM organizations)::int AS tenants_total,
      (SELECT COUNT(DISTINCT b.organization_id)
        FROM bookings b
        WHERE b.created_at > now() - interval '30 days')::int AS tenants_active,
      (SELECT COUNT(*) FROM bookings)::int AS bookings_total,
      (SELECT COUNT(*) FROM bookings WHERE created_at > now() - interval '30 days')::int AS bookings_30d,
      (SELECT COUNT(*) FROM properties WHERE deleted_at IS NULL)::int AS properties_total,
      (SELECT COUNT(*) FROM users)::int AS users_total
  `);

  return c.json({ data: stats[0] });
});

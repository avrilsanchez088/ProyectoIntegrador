import { schema, sql } from '@impacto/db';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import {
  type AppEnv,
  getActiveOrgId,
  requireAuth,
  requireOrganization,
} from '../middleware/auth.js';
import { rlsContext } from '../middleware/tenant.js';

/**
 * Audit log endpoint (propuesta 96.1 ronda 8 / M16).
 *
 * Lee `audit.events` filtrado por organization_id. Solo owners ven esta
 * información — admin/agent no.
 *
 * El permiso de SELECT sobre `audit.events` está revocado al rol app
 * (migration 0006). Para devolver data acá, usamos el cliente superuser
 * (DATABASE_URL) y filtramos manualmente por orgId.
 *
 * Endpoints:
 *   GET /api/audit/events?table=&from=&to=&limit=&offset=
 */

import { createDb } from '@impacto/db';
import { env } from '../env.js';

const adminDb = createDb(env.DATABASE_URL);

export const auditRouter = new Hono<AppEnv>();

auditRouter.use('*', requireAuth);
auditRouter.use('*', requireOrganization);
auditRouter.use('*', rlsContext);

/**
 * Middleware: solo owner del workspace ve audit. Better Auth `organization`
 * plugin guarda el rol en `members.role`. Lo leemos para gate-keepear.
 */
async function requireOwner(c: Context<AppEnv>, next: () => Promise<void>) {
  const orgId = getActiveOrgId(c);
  const userId = c.get('user').id;
  // Lookup member.role via superuser (members no tiene RLS por ser de
  // Better Auth — pero tenant_id_org filter manual igual).
  const rows = await adminDb.execute<{ role: string }>(sql`
    SELECT role FROM members WHERE organization_id = ${orgId} AND user_id = ${userId} LIMIT 1
  `);
  const role = rows[0]?.role;
  if (role !== 'owner') {
    return c.json({ error: 'forbidden', message: 'Solo el owner puede ver audit log.' }, 403);
  }
  await next();
}

const queryParamsSchema = z.object({
  table: z.string().max(64).optional(),
  user_id: z.string().max(64).optional(),
  op: z.enum(['I', 'U', 'D']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

auditRouter.get('/events', requireOwner, async (c) => {
  const parsed = queryParamsSchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  const { table, user_id: userIdFilter, op, from, to, limit, offset } = parsed.data;
  const orgId = getActiveOrgId(c);

  // Construimos manualmente la WHERE — queries van por superuser, así que
  // tenemos que ser explícitos con el orgId.
  const conditions: string[] = [`organization_id = '${orgId.replace(/'/g, "''")}'`];
  if (table && /^[a-z_]+$/.test(table)) {
    conditions.push(`table_name = '${table}'`);
  }
  if (userIdFilter && /^[a-zA-Z0-9_-]+$/.test(userIdFilter)) {
    conditions.push(`user_id = '${userIdFilter}'`);
  }
  if (op) conditions.push(`op = '${op}'`);
  if (from) conditions.push(`ts >= '${from}'`);
  if (to) conditions.push(`ts <= '${to}'`);
  const whereClause = conditions.join(' AND ');

  const [rows, [{ count: total }]] = await Promise.all([
    adminDb.execute<{
      id: string;
      organization_id: string;
      user_id: string | null;
      table_name: string;
      op: string;
      row_id: string | null;
      old_row: unknown;
      new_row: unknown;
      ts: Date;
    }>(
      sql.raw(`
      SELECT id, organization_id, user_id, table_name, op, row_id, old_row, new_row, ts
      FROM audit.events
      WHERE ${whereClause}
      ORDER BY ts DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    ),
    adminDb.execute<{ count: number }>(
      sql.raw(`
      SELECT COUNT(*)::int AS count FROM audit.events WHERE ${whereClause}
    `),
    ) as unknown as [{ count: number }],
  ]);

  return c.json({
    data: rows,
    pagination: { total, limit, offset },
  });
});

/**
 * POST /api/audit/retention/purge-now — gatilla un purge inmediato del
 * tenant activo (propuesta 174.3 ronda 15). Usa la función SQL definida
 * en migration 0014 (con advisory lock).
 *
 * Owner-only — los purges son destructivos. Devuelve el count borrado.
 */
auditRouter.post('/retention/purge-now', requireOwner, async (c) => {
  const orgId = getActiveOrgId(c);
  // La función purge_old_audit_events itera todos los tenants. Para limitar
  // al activo, hacemos el delete inline acá con el retention del tenant.
  const settings = await adminDb.execute<{ days: number }>(sql`
    SELECT COALESCE(audit_retention_days, 365) AS days
    FROM tenant_settings
    WHERE id = ${orgId}
    LIMIT 1
  `);
  const days = settings[0]?.days ?? 365;
  const deleted = await adminDb.execute<{ id: string }>(sql`
    DELETE FROM audit.events
    WHERE organization_id = ${orgId}
      AND ts < now() - (${days}::int || ' days')::interval
    RETURNING id
  `);
  return c.json({ data: { deletedCount: deleted.length, days } });
});

/**
 * GET /api/audit/row/:table/:id — historial completo de cambios sobre una
 * fila específica (propuesta 186.3 ronda 17). Útil para responder "qué le
 * pasó a este booking?" o "quién cambió este precio?".
 *
 * Owner-only. Tabla validada con regex (solo lowercase + underscore).
 */
auditRouter.get('/row/:table/:id', requireOwner, async (c) => {
  const orgId = getActiveOrgId(c);
  const tableName = c.req.param('table');
  const rowId = c.req.param('id');

  if (!tableName || !/^[a-z_]+$/.test(tableName)) {
    return c.json({ error: 'invalid_table_name' }, 400);
  }
  // row_id puede ser uuid o cualquier string; validamos shape razonable.
  if (!rowId || !/^[a-zA-Z0-9_-]{1,64}$/.test(rowId)) {
    return c.json({ error: 'invalid_row_id' }, 400);
  }

  const events = await adminDb.execute<{
    id: string;
    user_id: string | null;
    table_name: string;
    op: 'I' | 'U' | 'D';
    row_id: string | null;
    old_row: unknown;
    new_row: unknown;
    ts: Date;
  }>(sql`
    SELECT id, user_id, table_name, op, row_id, old_row, new_row, ts
    FROM audit.events
    WHERE organization_id = ${orgId}
      AND table_name = ${tableName}
      AND row_id = ${rowId}
    ORDER BY ts ASC
    LIMIT 200
  `);
  return c.json({ data: events });
});

/**
 * GET /api/audit/retention/preview?days=N — cuántos eventos se borrarían si
 * cambiamos el retention a N días (propuesta 163.1 ronda 14). Owner-only.
 *
 * Útil para que la UI compliance muestre el impacto antes de guardar.
 */
auditRouter.get('/retention/preview', requireOwner, async (c) => {
  const orgId = getActiveOrgId(c);
  const daysParam = Number(c.req.query('days'));
  if (!Number.isFinite(daysParam) || daysParam < 30 || daysParam > 3650) {
    return c.json(
      {
        error: 'invalid_days',
        message: 'days debe ser un entero entre 30 y 3650',
      },
      400,
    );
  }
  const rows = await adminDb.execute<{
    deleted_count: number;
    kept_count: number;
    oldest_ts: Date | null;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE ts < now() - (${daysParam}::int || ' days')::interval)::int AS deleted_count,
      COUNT(*) FILTER (WHERE ts >= now() - (${daysParam}::int || ' days')::interval)::int AS kept_count,
      MIN(ts) FILTER (WHERE ts < now() - (${daysParam}::int || ' days')::interval) AS oldest_ts
    FROM audit.events
    WHERE organization_id = ${orgId}
  `);
  const row = rows[0];
  return c.json({
    data: {
      days: daysParam,
      deleteCount: row?.deleted_count ?? 0,
      keepCount: row?.kept_count ?? 0,
      oldestTs: row?.oldest_ts ?? null,
    },
  });
});

/**
 * GET /api/audit/events.csv?... mismos params que /events.
 * Devuelve un CSV con headers para download. Owner-only.
 *
 * Propuesta 117.3 ronda 9.
 */
auditRouter.get('/events.csv', requireOwner, async (c) => {
  const parsed = queryParamsSchema.safeParse({
    ...c.req.query(),
    limit: c.req.query('limit') ?? '500',
  });
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  const orgId = getActiveOrgId(c);
  const { table, user_id: userIdFilter, op, from, to, limit } = parsed.data;
  const conditions: string[] = [`organization_id = '${orgId.replace(/'/g, "''")}'`];
  if (table && /^[a-z_]+$/.test(table)) conditions.push(`table_name = '${table}'`);
  if (userIdFilter && /^[a-zA-Z0-9_-]+$/.test(userIdFilter)) {
    conditions.push(`user_id = '${userIdFilter}'`);
  }
  if (op) conditions.push(`op = '${op}'`);
  if (from) conditions.push(`ts >= '${from}'`);
  if (to) conditions.push(`ts <= '${to}'`);

  const rows = await adminDb.execute<{
    id: string;
    user_id: string | null;
    table_name: string;
    op: string;
    row_id: string | null;
    ts: Date;
  }>(
    sql.raw(`
    SELECT id, user_id, table_name, op, row_id, ts
    FROM audit.events
    WHERE ${conditions.join(' AND ')}
    ORDER BY ts DESC
    LIMIT ${limit}
  `),
  );

  // CSV escape: si el value tiene `,` `"` o newline, wrap en `"` + duplica `"` interno.
  const csvEscape = (v: string | null | undefined) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['id', 'ts', 'op', 'table', 'row_id', 'user_id'].join(',');
  const lines = rows.map((r) =>
    [
      csvEscape(r.id),
      csvEscape(new Date(r.ts).toISOString()),
      csvEscape(r.op),
      csvEscape(r.table_name),
      csvEscape(r.row_id),
      csvEscape(r.user_id),
    ].join(','),
  );
  // BOM para Excel en UTF-8.
  const csv = `﻿${header}\r\n${lines.join('\r\n')}`;
  const filename = `audit-${new Date().toISOString().slice(0, 10)}.csv`;

  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
});

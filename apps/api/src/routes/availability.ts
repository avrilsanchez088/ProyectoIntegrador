import { and, eq, schema, sql } from '@impacto/db';
import { availabilityQuerySchema, createAvailabilityBlockSchema } from '@impacto/shared';
import { Hono } from 'hono';
import {
  type AppEnv,
  getActiveOrgId,
  requireAuth,
  requireOrganization,
} from '../middleware/auth.js';
import { getTenantDb, rlsContext } from '../middleware/tenant.js';

export const availabilityRouter = new Hono<AppEnv>();

availabilityRouter.use('*', requireAuth);
availabilityRouter.use('*', requireOrganization);
availabilityRouter.use('*', rlsContext);

/**
 * GET /api/availability/bulk?unitIds=a,b,c&from=ISO&to=ISO
 * Devuelve los rangos ocupados de TODAS las units especificadas en una sola
 * query. Resuelve §59.1 de la propuesta ronda 5: el calendar mensual hacía
 * N requests (1 por unit) → ahora 1 request.
 *
 * Shape: { data: { [unitId]: { bookings: [...], blocks: [...] } } }
 */
availabilityRouter.get('/bulk', async (c) => {
  const unitIdsRaw = c.req.query('unitIds');
  const from = c.req.query('from');
  const to = c.req.query('to');

  if (!unitIdsRaw || !from || !to) {
    return c.json({ error: 'missing_params', required: ['unitIds', 'from', 'to'] }, 400);
  }
  const unitIds = unitIdsRaw.split(',').filter((s) => /^[a-z0-9-]+$/i.test(s));
  if (unitIds.length === 0 || unitIds.length > 100) {
    return c.json({ error: 'invalid_unit_ids', message: '1..100 unitIds permitidos' }, 400);
  }

  const db = getTenantDb(c);

  // ETag basado en MAX(updated_at) de bookings + blocks de las units
  // pedidas. Si el cliente tiene cached la misma versión, devolvemos 304.
  // Resuelve propuesta 68.1 ronda 6.
  const stampRows = await db.execute<{ stamp: string | null }>(sql`
    SELECT GREATEST(
      COALESCE((
        SELECT MAX(updated_at) FROM bookings
        WHERE unit_id = ANY(${unitIds}::uuid[])
      ), 'epoch'::timestamptz),
      COALESCE((
        SELECT MAX(updated_at) FROM availability_blocks
        WHERE unit_id = ANY(${unitIds}::uuid[])
      ), 'epoch'::timestamptz)
    )::text AS stamp
  `);
  const stamp = stampRows[0]?.stamp ?? 'epoch';
  // Hash corto: incluye stamp + el set de units + ventana — si cualquier
  // dimensión cambia, el ETag cambia.
  const etag = `"${stamp}:${unitIds.length}:${from}:${to}"`;
  const ifNoneMatch = c.req.header('if-none-match');
  c.header('ETag', etag);
  c.header('Cache-Control', 'private, max-age=15');
  if (ifNoneMatch === etag) {
    return c.body(null, 304);
  }

  const [bookings, blocks] = await Promise.all([
    db.execute<{
      id: string;
      unit_id: string;
      start: Date;
      end: Date;
      status: string;
      kind: string;
    }>(sql`
      SELECT id, unit_id, check_in AS start, check_out AS end, status, 'booking' AS kind
      FROM bookings
      WHERE unit_id = ANY(${unitIds}::uuid[])
        AND status NOT IN ('cancelled', 'no_show')
        AND tstzrange(check_in, check_out, '[)') && tstzrange(${from}::timestamptz, ${to}::timestamptz, '[)')
      ORDER BY check_in ASC
    `),
    db.execute<{
      id: string;
      unit_id: string;
      start: Date;
      end: Date;
      reason: string;
      kind: string;
    }>(sql`
      SELECT id, unit_id, starts_at AS start, ends_at AS end, reason, 'block' AS kind
      FROM availability_blocks
      WHERE unit_id = ANY(${unitIds}::uuid[])
        AND tstzrange(starts_at, ends_at, '[)') && tstzrange(${from}::timestamptz, ${to}::timestamptz, '[)')
      ORDER BY starts_at ASC
    `),
  ]);

  // Agrupar por unitId.
  const data: Record<string, { bookings: unknown[]; blocks: unknown[] }> = {};
  for (const id of unitIds) data[id] = { bookings: [], blocks: [] };
  for (const b of bookings) data[b.unit_id]?.bookings.push(b);
  for (const b of blocks) data[b.unit_id]?.blocks.push(b);

  return c.json({ data });
});

/**
 * GET /api/availability?unitId=xxx&from=ISO&to=ISO
 * Devuelve los rangos ocupados (bookings activos + blocks) en la ventana.
 * El frontend pinta los gaps como disponibles.
 */
availabilityRouter.get('/', async (c) => {
  const parsed = availabilityQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  const { unitId, from, to } = parsed.data;
  const db = getTenantDb(c);

  const bookings = await db.execute(sql`
    SELECT id, check_in AS start, check_out AS end, status, 'booking' AS kind
    FROM bookings
    WHERE unit_id = ${unitId}
      AND status NOT IN ('cancelled', 'no_show')
      AND tstzrange(check_in, check_out, '[)') && tstzrange(${from}::timestamptz, ${to}::timestamptz, '[)')
    ORDER BY check_in ASC
  `);

  const blocks = await db.execute(sql`
    SELECT id, starts_at AS start, ends_at AS end, reason, 'block' AS kind
    FROM availability_blocks
    WHERE unit_id = ${unitId}
      AND tstzrange(starts_at, ends_at, '[)') && tstzrange(${from}::timestamptz, ${to}::timestamptz, '[)')
    ORDER BY starts_at ASC
  `);

  return c.json({ data: { bookings, blocks } });
});

// ─── availability_blocks CRUD ───────────────────────
availabilityRouter.post('/blocks', async (c) => {
  const body = await c.req.json();
  const parsed = createAvailabilityBlockSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }

  const orgId = getActiveOrgId(c);
  const db = getTenantDb(c);

  const overlap = await db.execute(sql`
    SELECT 1 FROM bookings
    WHERE unit_id = ${parsed.data.unitId}
      AND status NOT IN ('cancelled', 'no_show')
      AND tstzrange(check_in, check_out, '[)') && tstzrange(${parsed.data.startsAt}::timestamptz, ${parsed.data.endsAt}::timestamptz, '[)')
    LIMIT 1
  `);
  if (overlap.length > 0) {
    return c.json({ error: 'overlap_with_booking' }, 409);
  }

  const [created] = await db
    .insert(schema.availabilityBlocks)
    .values({
      organizationId: orgId,
      unitId: parsed.data.unitId,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: new Date(parsed.data.endsAt),
      reason: parsed.data.reason,
      notes: parsed.data.notes,
    })
    .returning();
  return c.json({ data: created }, 201);
});

availabilityRouter.delete('/blocks/:id', async (c) => {
  const id = c.req.param('id');
  const db = getTenantDb(c);
  const [deleted] = await db
    .delete(schema.availabilityBlocks)
    .where(eq(schema.availabilityBlocks.id, id))
    .returning({ id: schema.availabilityBlocks.id });
  if (!deleted) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: { id: deleted.id, deleted: true } });
});

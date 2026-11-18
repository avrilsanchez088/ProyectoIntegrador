import { and, eq, isNull, schema, sql } from '@impacto/db';
import { createUnitSchema, updateUnitSchema } from '@impacto/shared';
import { Hono } from 'hono';
import { handle304, tableEtag } from '../lib/etag.js';
import { channexAdapter } from '../lib/sync-adapters/channex.js';
import { logger } from '../logger.js';
import {
  type AppEnv,
  getActiveOrgId,
  requireAuth,
  requireOrganization,
} from '../middleware/auth.js';
import { enforceLimit } from '../middleware/plan-limits.js';
import { getTenantDb, rlsContext } from '../middleware/tenant.js';

export const unitsRouter = new Hono<AppEnv>();

unitsRouter.use('*', requireAuth);
unitsRouter.use('*', requireOrganization);
unitsRouter.use('*', rlsContext);
unitsRouter.use('/', enforceLimit('units'));

unitsRouter.get('/', async (c) => {
  const propertyId = c.req.query('propertyId');
  const db = getTenantDb(c);
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 100) || 100, 1), 200);
  const offset = Math.max(Number(c.req.query('offset') ?? 0) || 0, 0);

  const safePropertyId = propertyId && /^[0-9a-f-]{36}$/i.test(propertyId) ? propertyId : null;
  const whereClause = safePropertyId
    ? `deleted_at IS NULL AND property_id = '${safePropertyId}'`
    : 'deleted_at IS NULL';
  const etag = await tableEtag(db, 'units', whereClause);
  if (handle304(c, etag)) return c.body(null, 304);

  const where = propertyId
    ? and(isNull(schema.units.deletedAt), eq(schema.units.propertyId, propertyId))
    : isNull(schema.units.deletedAt);

  const units = await db.select().from(schema.units).where(where).limit(limit).offset(offset);
  return c.json({ data: units, pagination: { limit, offset } });
});

unitsRouter.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createUnitSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);

  const orgId = getActiveOrgId(c);
  const db = getTenantDb(c);

  const petsAllowedMap = { no: 0, yes: 1, consult: 2 } as const;

  const [created] = await db
    .insert(schema.units)
    .values({
      organizationId: orgId,
      propertyId: parsed.data.propertyId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      maxGuests: parsed.data.maxGuests,
      bedrooms: parsed.data.bedrooms,
      bathrooms: parsed.data.bathrooms,
      unitType: parsed.data.unitType,
      description: parsed.data.description,
      amenities: parsed.data.amenities,
      petsAllowed: petsAllowedMap[parsed.data.petsAllowed],
    })
    .returning();

  if (created) {
    (async () => {
      const { createDb, setTenantContext } = await import('@impacto/db');
      const rootDb = createDb(process.env.DATABASE_URL ?? '');
      try {
        // 1. Buscar el channex_property_id para la property de esta unidad.
        const propertyMapping = await rootDb.execute<{ channex_property_id: string }>(sql`
          SELECT channex_property_id FROM channex_property_mappings
          WHERE property_id = ${created.propertyId}
          LIMIT 1
        `);

        if (propertyMapping.length === 0) {
          logger.warn(
            { propertyId: created.propertyId },
            '⚠️ [channex] property mapping no encontrado, saltando',
          );
          return;
        }

        const channexPropertyId = propertyMapping[0]?.channex_property_id ?? '';

        // 2. Crear room_type en Channex.
        const { channexRoomTypeId } = await channexAdapter.createRoomType({
          channexPropertyId,
          name: created.name,
          capacity: created.maxGuests,
        });

        // 3. Crear rate_plan en Channex.
        const { channexRatePlanId } = await channexAdapter.createRatePlan({
          channexPropertyId,
          channexRoomTypeId,
          title: 'Tarifa Estándar',
          currency: 'USD',
          capacity: created.maxGuests,
        });

        // 4. Guardar mapeo unit → channex.
        await rootDb.transaction(async (tx) => {
          await setTenantContext(tx, orgId);
          await tx.execute(sql`
            INSERT INTO channex_unit_mappings
              (organization_id, unit_id, channex_property_id, channex_room_type_id, channex_rate_plan_id)
            VALUES
              (${orgId}, ${created.id}, ${channexPropertyId}, ${channexRoomTypeId}, ${channexRatePlanId})
            ON CONFLICT (unit_id, channex_property_id) DO UPDATE
              SET channex_room_type_id = EXCLUDED.channex_room_type_id,
                  channex_rate_plan_id = EXCLUDED.channex_rate_plan_id,
                  updated_at = now()
          `);
        });

        // 5. Inicializar disponibilidad en 1 para los próximos 365 días.
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const initValues = [];
        for (let i = 0; i < 365; i++) {
          const date = new Date(today);
          date.setUTCDate(date.getUTCDate() + i);
          initValues.push({
            property_id: channexPropertyId,
            room_type_id: channexRoomTypeId,
            date: date.toISOString().slice(0, 10),
            availability: 1,
          });
        }
        await channexAdapter.pushAvailability(initValues);
        logger.info({ unitId: created.id }, '✅ [channex] disponibilidad inicial seteada');

        logger.info(
          { unitId: created.id, channexRoomTypeId, channexRatePlanId },
          '✅ [channex] unit mapeada',
        );
      } catch (err) {
        logger.error({ err, unitId: created.id }, '❌ [channex] unit setup failed');
      }
    })();
  }

  return c.json({ data: created }, 201);
});

unitsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getTenantDb(c);
  const rows = await db.select().from(schema.units).where(eq(schema.units.id, id));
  if (!rows[0]) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: rows[0] });
});

unitsRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateUnitSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);

  const db = getTenantDb(c);
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (k === 'petsAllowed' && v !== undefined) {
      updates.petsAllowed = ({ no: 0, yes: 1, consult: 2 } as const)[v as 'no' | 'yes' | 'consult'];
    } else if (v !== undefined) {
      updates[k] = v;
    }
  }

  const [updated] = await db
    .update(schema.units)
    .set(updates)
    .where(eq(schema.units.id, id))
    .returning();
  if (!updated) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: updated });
});

unitsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getTenantDb(c);
  const [deleted] = await db
    .update(schema.units)
    .set({ deletedAt: new Date() })
    .where(and(eq(schema.units.id, id), isNull(schema.units.deletedAt)))
    .returning({ id: schema.units.id });
  if (!deleted) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: { id: deleted.id, deleted: true } });
});

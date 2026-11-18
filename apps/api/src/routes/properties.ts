import { and, eq, isNull, schema, sql } from '@impacto/db';
import { createPropertySchema, updatePropertySchema } from '@impacto/shared';
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

export const propertiesRouter = new Hono<AppEnv>();

propertiesRouter.use('*', requireAuth);
propertiesRouter.use('*', requireOrganization);
propertiesRouter.use('*', rlsContext);
propertiesRouter.use('/', enforceLimit('properties'));

propertiesRouter.get('/', async (c) => {
  const db = getTenantDb(c);
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 100) || 100, 1), 200);
  const offset = Math.max(Number(c.req.query('offset') ?? 0) || 0, 0);

  const etag = await tableEtag(db, 'properties', 'deleted_at IS NULL');
  if (handle304(c, etag)) return c.body(null, 304);

  const properties = await db
    .select()
    .from(schema.properties)
    .where(isNull(schema.properties.deletedAt))
    .limit(limit)
    .offset(offset);
  return c.json({ data: properties, pagination: { limit, offset } });
});

propertiesRouter.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createPropertySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }

  const orgId = getActiveOrgId(c);
  const db = getTenantDb(c);

  const [created] = await db
    .insert(schema.properties)
    .values({ ...parsed.data, organizationId: orgId })
    .returning();

  // Crear group (si no existe) y property en Channex en segundo plano.
  if (created) {
    (async () => {
      const { createDb, setTenantContext } = await import('@impacto/db');
      const rootDb = createDb(process.env.DATABASE_URL ?? '');
      try {
        // 1. Buscar o crear el group de Channex para este workspace.
        const existingGroup = await rootDb.execute<{ channex_group_id: string }>(sql`
          SELECT channex_group_id FROM channex_group_mappings
          WHERE organization_id = ${orgId}
          LIMIT 1
        `);

        let channexGroupId: string;
        if (existingGroup.length > 0) {
          channexGroupId = existingGroup[0]?.channex_group_id ?? '';
          logger.info({ orgId, channexGroupId }, '✅ [channex] group ya existe');
        } else {
          const orgRow = await rootDb.execute<{ name: string }>(sql`
  SELECT name FROM organizations WHERE id = ${orgId} LIMIT 1
`);
          const orgName = orgRow[0]?.name ?? `workspace-${orgId}`;
          const { channexGroupId: newGroupId } = await channexAdapter.createGroup({
            name: orgName,
          });
          channexGroupId = newGroupId;
          await rootDb.execute(sql`
            INSERT INTO channex_group_mappings (organization_id, channex_group_id)
            VALUES (${orgId}, ${channexGroupId})
            ON CONFLICT (organization_id) DO NOTHING
          `);
          logger.info({ orgId, channexGroupId }, '✅ [channex] group creado');
        }

        // 2. Crear la property en Channex asignada al group.
        const { channexPropertyId } = await channexAdapter.createProperty({
          name: created.name,
          city: created.city ?? 'Montevideo',
          country: created.country ?? 'UY',
          currency: 'USD',
          timezone: 'America/Montevideo',
          email: `property-${created.id}@impacto.app`,
          groupId: channexGroupId,
        });

        // 3. Asignar la property al group del workspace.
        await channexAdapter.assignPropertyToGroup({
          channexGroupId,
          channexPropertyId,
        });

        // 3. Guardar el mapeo property → channex con contexto de tenant.
        await rootDb.transaction(async (tx) => {
          await setTenantContext(tx, orgId);
          await tx.execute(sql`
            INSERT INTO channex_property_mappings
              (organization_id, property_id, channex_property_id)
            VALUES
              (${orgId}, ${created.id}, ${channexPropertyId})
            ON CONFLICT (property_id) DO UPDATE
              SET channex_property_id = EXCLUDED.channex_property_id,
                  updated_at = now()
          `);
        });

        logger.info(
          { propertyId: created.id, channexPropertyId, channexGroupId },
          '✅ [channex] property + group mapeados',
        );
      } catch (err) {
        logger.error({ err, propertyId: created.id }, '❌ [channex] setup background failed');
      }
    })();
  }

  return c.json({ data: created }, 201);
});

propertiesRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getTenantDb(c);
  const rows = await db.select().from(schema.properties).where(eq(schema.properties.id, id));
  const property = rows[0];
  if (!property) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: property });
});

propertiesRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updatePropertySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  const db = getTenantDb(c);
  const [updated] = await db
    .update(schema.properties)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.properties.id, id))
    .returning();
  if (!updated) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: updated });
});

propertiesRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getTenantDb(c);
  const [deleted] = await db
    .update(schema.properties)
    .set({ deletedAt: new Date() })
    .where(and(eq(schema.properties.id, id), isNull(schema.properties.deletedAt)))
    .returning({ id: schema.properties.id });
  if (!deleted) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: { id: deleted.id, deleted: true } });
});

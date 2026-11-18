import { eq, schema, sql } from '@impacto/db';
import { createRateSchema, updateRateSchema } from '@impacto/shared';
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
import { getTenantDb, rlsContext } from '../middleware/tenant.js';

export const ratesRouter = new Hono<AppEnv>();

ratesRouter.use('*', requireAuth);
ratesRouter.use('*', requireOrganization);
ratesRouter.use('*', rlsContext);

// GET /api/rates?unitId=xxx&seasonId=yyy
ratesRouter.get('/', async (c) => {
  const unitId = c.req.query('unitId');
  const seasonId = c.req.query('seasonId');
  const db = getTenantDb(c);

  // ETag scoped a la combinación de filtros.
  const filters: string[] = [];
  if (unitId && /^[0-9a-f-]{36}$/i.test(unitId)) filters.push(`unit_id = '${unitId}'`);
  if (seasonId && /^[0-9a-f-]{36}$/i.test(seasonId)) filters.push(`season_id = '${seasonId}'`);
  const where = filters.length > 0 ? filters.join(' AND ') : 'TRUE';
  const etag = await tableEtag(db, 'rates', where);
  if (handle304(c, etag)) return c.body(null, 304);

  let query = db.select().from(schema.rates).$dynamic();
  if (unitId) query = query.where(eq(schema.rates.unitId, unitId));
  if (seasonId) query = query.where(eq(schema.rates.seasonId, seasonId));

  const rates = await query;
  return c.json({ data: rates });
});

ratesRouter.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createRateSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);

  const orgId = getActiveOrgId(c);
  const db = getTenantDb(c);

  const [created] = await db
    .insert(schema.rates)
    .values({ ...parsed.data, organizationId: orgId })
    .returning();

  // Sincronizar precios con Channex en background.
  if (created) {
    (async () => {
      try {
        const { createDb } = await import('@impacto/db');
        const rootDb = createDb(process.env.DATABASE_URL ?? '');
        // Buscar la temporada para obtener fechas.
        const seasons = (await rootDb.execute(sql`
          SELECT start_date, end_date FROM seasons
          WHERE id = ${created.seasonId}
          LIMIT 1
        `)) as unknown as { start_date: string; end_date: string }[];

        if (!seasons[0]) {
          logger.warn({ seasonId: created.seasonId }, '⚠️ [channex] season no encontrada');
          return;
        }

        const { start_date, end_date } = seasons[0];

        // Buscar el rate_plan_id de Channex para esta unidad.
        const unitMapping = (await rootDb.execute(sql`
          SELECT channex_property_id, channex_rate_plan_id
          FROM channex_unit_mappings
          WHERE unit_id = ${created.unitId}
          LIMIT 1
        `)) as unknown as { channex_property_id: string; channex_rate_plan_id: string }[];

        if (!unitMapping[0]) {
          logger.warn({ unitId: created.unitId }, '⚠️ [channex] unit mapping no encontrado');
          return;
        }

        const { channex_property_id, channex_rate_plan_id } = unitMapping[0];
        const priceUsd = (created.pricePerNightCents / 100).toFixed(2);

        // Generar array de fechas entre start_date y end_date.
        const values = [];
        const current = new Date(start_date);
        const end = new Date(end_date);
        while (current <= end) {
          values.push({
            property_id: channex_property_id,
            rate_plan_id: channex_rate_plan_id,
            date: current.toISOString().slice(0, 10),
            rate: priceUsd,
            stop_sell: false,
          });
          current.setUTCDate(current.getUTCDate() + 1);
        }

        await channexAdapter.pushRestrictions(values);
        logger.info(
          { unitId: created.unitId, dates: values.length, priceUsd },
          '✅ [channex] precios sincronizados',
        );
      } catch (err) {
        logger.error({ err, rateId: created.id }, '❌ [channex] sync precios failed');
      }
    })();
  }

  return c.json({ data: created }, 201);
});

ratesRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateRateSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);

  const db = getTenantDb(c);
  const [updated] = await db
    .update(schema.rates)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.rates.id, id))
    .returning();
  if (!updated) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: updated });
});

ratesRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getTenantDb(c);
  const [deleted] = await db
    .delete(schema.rates)
    .where(eq(schema.rates.id, id))
    .returning({ id: schema.rates.id });
  if (!deleted) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: { id: deleted.id, deleted: true } });
});

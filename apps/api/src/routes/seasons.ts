import { and, eq, ne, schema } from '@impacto/db';
import { createSeasonSchema, seasonsOverlap, updateSeasonSchema } from '@impacto/shared';
import { Hono } from 'hono';
import { handle304, tableEtag } from '../lib/etag.js';
import {
  type AppEnv,
  type TenantDb,
  getActiveOrgId,
  requireAuth,
  requireOrganization,
} from '../middleware/auth.js';
import { getTenantDb, rlsContext } from '../middleware/tenant.js';

export const seasonsRouter = new Hono<AppEnv>();

seasonsRouter.use('*', requireAuth);
seasonsRouter.use('*', requireOrganization);
seasonsRouter.use('*', rlsContext);

// GET /api/seasons?propertyId=xxx
seasonsRouter.get('/', async (c) => {
  const propertyId = c.req.query('propertyId');
  const db = getTenantDb(c);

  const safePropId = propertyId && /^[0-9a-f-]{36}$/i.test(propertyId) ? propertyId : null;
  const where = safePropId ? `property_id = '${safePropId}'` : 'TRUE';
  const etag = await tableEtag(db, 'seasons', where);
  if (handle304(c, etag)) return c.body(null, 304);

  const query = db.select().from(schema.seasons);
  const seasons = propertyId
    ? await query.where(eq(schema.seasons.propertyId, propertyId))
    : await query;
  return c.json({ data: seasons });
});

/**
 * Devuelve la lista de seasons existentes que solapan con el rango propuesto
 * dentro de la misma property. Excluye `excludeId` (útil en PATCH para
 * permitir editar la misma season sin auto-conflicto). Resuelve G3.5.
 */
async function findOverlappingSeasons(
  db: TenantDb,
  params: { propertyId: string; startDate: string; endDate: string; excludeId?: string },
) {
  const candidates = await db
    .select({
      id: schema.seasons.id,
      name: schema.seasons.name,
      startDate: schema.seasons.startDate,
      endDate: schema.seasons.endDate,
    })
    .from(schema.seasons)
    .where(
      params.excludeId
        ? and(
            eq(schema.seasons.propertyId, params.propertyId),
            ne(schema.seasons.id, params.excludeId),
          )
        : eq(schema.seasons.propertyId, params.propertyId),
    );
  return candidates.filter((c) =>
    seasonsOverlap(c, { startDate: params.startDate, endDate: params.endDate }),
  );
}

seasonsRouter.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createSeasonSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);

  const orgId = getActiveOrgId(c);
  const db = getTenantDb(c);

  const overlaps = await findOverlappingSeasons(db, {
    propertyId: parsed.data.propertyId,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
  });
  if (overlaps.length > 0) {
    return c.json(
      {
        error: 'season_overlap',
        message: 'El rango se superpone con otra temporada existente.',
        conflicting: overlaps,
      },
      409,
    );
  }

  const [created] = await db
    .insert(schema.seasons)
    .values({ ...parsed.data, organizationId: orgId })
    .returning();
  return c.json({ data: created }, 201);
});

seasonsRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateSeasonSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);

  const db = getTenantDb(c);

  // Si el caller manda fechas + propertyId, validamos no-overlap excluyéndose
  // a sí mismo. Si no manda alguno de los tres, nos saltamos el check (PATCH
  // parcial: por ejemplo solo está editando el `name`).
  if (parsed.data.propertyId && parsed.data.startDate && parsed.data.endDate) {
    const overlaps = await findOverlappingSeasons(db, {
      propertyId: parsed.data.propertyId,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      excludeId: id,
    });
    if (overlaps.length > 0) {
      return c.json(
        {
          error: 'season_overlap',
          message: 'El rango actualizado se superpone con otra temporada.',
          conflicting: overlaps,
        },
        409,
      );
    }
  }

  const [updated] = await db
    .update(schema.seasons)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.seasons.id, id))
    .returning();
  if (!updated) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: updated });
});

seasonsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getTenantDb(c);
  const [deleted] = await db
    .delete(schema.seasons)
    .where(eq(schema.seasons.id, id))
    .returning({ id: schema.seasons.id });
  if (!deleted) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: { id: deleted.id, deleted: true } });
});

import { eq, schema } from '@impacto/db';
import { generateIcalToken } from '@impacto/ical';
import {
  createExternalCalendarSchema,
  createIcalExportTokenSchema,
  updateExternalCalendarSchema,
} from '@impacto/shared';
import { Hono } from 'hono';
import { handle304, tableEtag } from '../lib/etag.js';
import { scheduleIcalPoll, syncIcalNow, unscheduleIcalPoll } from '../lib/queues.js';
import { logger } from '../logger.js';
import {
  type AppEnv,
  getActiveOrgId,
  requireAuth,
  requireOrganization,
} from '../middleware/auth.js';
import { getTenantDb, rlsContext } from '../middleware/tenant.js';

export const calendarsRouter = new Hono<AppEnv>();

calendarsRouter.use('*', requireAuth);
calendarsRouter.use('*', requireOrganization);
calendarsRouter.use('*', rlsContext);

// ─── external_calendars ─────────────────────────────
calendarsRouter.get('/external', async (c) => {
  const unitId = c.req.query('unitId');
  const db = getTenantDb(c);

  const safeUnitId = unitId && /^[0-9a-f-]{36}$/i.test(unitId) ? unitId : null;
  const where = safeUnitId ? `unit_id = '${safeUnitId}'` : 'TRUE';
  const etag = await tableEtag(db, 'external_calendars', where);
  if (handle304(c, etag)) return c.body(null, 304);

  const query = db.select().from(schema.externalCalendars);
  const rows = unitId
    ? await query.where(eq(schema.externalCalendars.unitId, unitId))
    : await query;
  return c.json({ data: rows });
});

calendarsRouter.post('/external', async (c) => {
  const body = await c.req.json();
  const parsed = createExternalCalendarSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  const orgId = getActiveOrgId(c);
  const db = getTenantDb(c);
  const [created] = await db
    .insert(schema.externalCalendars)
    .values({
      organizationId: orgId,
      unitId: parsed.data.unitId,
      provider: parsed.data.provider,
      name: parsed.data.name,
      icalUrl: parsed.data.icalUrl,
      pollIntervalMinutes: parsed.data.pollIntervalMinutes,
      enabled: parsed.data.enabled ? 1 : 0,
    })
    .returning();

  if (created && parsed.data.enabled) {
    scheduleIcalPoll(created.id, parsed.data.pollIntervalMinutes).catch((err) =>
      logger.warn({ err, calId: created.id }, 'failed to schedule ical poll'),
    );
  }
  return c.json({ data: created }, 201);
});

calendarsRouter.patch('/external/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateExternalCalendarSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  const db = getTenantDb(c);
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    if (k === 'enabled') updates.enabled = v ? 1 : 0;
    else updates[k] = v;
  }
  const [updated] = await db
    .update(schema.externalCalendars)
    .set(updates)
    .where(eq(schema.externalCalendars.id, id))
    .returning();
  if (!updated) return c.json({ error: 'not_found' }, 404);

  // Reprogramar polling según el nuevo estado.
  if (updated.enabled === 1) {
    scheduleIcalPoll(updated.id, updated.pollIntervalMinutes).catch((err) =>
      logger.warn({ err, calId: updated.id }, 'failed to reschedule ical poll'),
    );
  } else {
    unscheduleIcalPoll(updated.id).catch((err) =>
      logger.warn({ err, calId: updated.id }, 'failed to unschedule ical poll'),
    );
  }
  return c.json({ data: updated });
});

calendarsRouter.delete('/external/:id', async (c) => {
  const id = c.req.param('id');
  const db = getTenantDb(c);
  const [deleted] = await db
    .delete(schema.externalCalendars)
    .where(eq(schema.externalCalendars.id, id))
    .returning({ id: schema.externalCalendars.id });
  if (!deleted) return c.json({ error: 'not_found' }, 404);

  unscheduleIcalPoll(deleted.id).catch((err) =>
    logger.warn({ err, calId: deleted.id }, 'failed to unschedule ical poll'),
  );
  return c.json({ data: { id: deleted.id, deleted: true } });
});

/**
 * POST /api/calendars/external/:id/sync — encola un poll one-shot.
 * Útil para "Sincronizar ahora" desde la UI.
 */
calendarsRouter.post('/external/:id/sync', async (c) => {
  const id = c.req.param('id');
  const db = getTenantDb(c);
  const rows = await db
    .select({ id: schema.externalCalendars.id })
    .from(schema.externalCalendars)
    .where(eq(schema.externalCalendars.id, id));
  if (!rows[0]) return c.json({ error: 'not_found' }, 404);

  const jobId = await syncIcalNow(id);
  return c.json({ data: { id, jobId, queued: true } });
});

// ─── ical export tokens ─────────────────────────────
/**
 * Crea un token público para que un canal externo lea el feed iCal de una unit.
 * El token se entrega 1 vez al crearlo — no exponemos el campo `token` en lista.
 */
calendarsRouter.post('/tokens', async (c) => {
  const body = await c.req.json();
  const parsed = createIcalExportTokenSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  const orgId = getActiveOrgId(c);
  const db = getTenantDb(c);

  const token = await generateIcalToken();
  const [created] = await db
    .insert(schema.icalExportTokens)
    .values({
      organizationId: orgId,
      unitId: parsed.data.unitId,
      token,
      label: parsed.data.label,
    })
    .returning();
  return c.json({ data: created }, 201);
});

calendarsRouter.get('/tokens', async (c) => {
  const unitId = c.req.query('unitId');
  const db = getTenantDb(c);
  const query = db.select().from(schema.icalExportTokens);
  const rows = unitId ? await query.where(eq(schema.icalExportTokens.unitId, unitId)) : await query;
  return c.json({ data: rows });
});

calendarsRouter.delete('/tokens/:id', async (c) => {
  const id = c.req.param('id');
  const db = getTenantDb(c);
  const [revoked] = await db
    .update(schema.icalExportTokens)
    .set({ revokedAt: new Date() })
    .where(eq(schema.icalExportTokens.id, id))
    .returning({ id: schema.icalExportTokens.id });
  if (!revoked) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: { id: revoked.id, revoked: true } });
});

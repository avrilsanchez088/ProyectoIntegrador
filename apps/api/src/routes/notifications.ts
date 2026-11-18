import { and, desc, eq, inArray, isNull, schema, sql } from '@impacto/db';
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
 * Centro de notificaciones in-app (§2.10 del audit).
 *
 * Endpoints:
 *  - GET  /api/notifications          → últimas 50, con `unread_count`
 *  - GET  /api/notifications/count    → solo el contador no leídas (badge)
 *  - POST /api/notifications/:id/read → marca leída
 *  - POST /api/notifications/read-all → marca todas leídas
 *  - DELETE /api/notifications/:id    → borra
 */
export const notificationsRouter = new Hono<AppEnv>();

notificationsRouter.use('*', requireAuth);
notificationsRouter.use('*', requireOrganization);
notificationsRouter.use('*', rlsContext);

const filterQuerySchema = z.object({
  onlyUnread: z.enum(['1', 'true']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

notificationsRouter.get('/', async (c) => {
  const parsed = filterQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  const { onlyUnread, limit, offset } = parsed.data;
  const userId = c.get('user').id;
  const db = getTenantDb(c);

  const userFilter = sql`(${schema.inAppNotifications.userId} = ${userId} OR ${schema.inAppNotifications.userId} IS NULL)`;
  const where = onlyUnread ? and(userFilter, isNull(schema.inAppNotifications.readAt)) : userFilter;

  const [rows, [unreadCount]] = await Promise.all([
    db
      .select()
      .from(schema.inAppNotifications)
      .where(where)
      .orderBy(desc(schema.inAppNotifications.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.inAppNotifications)
      .where(and(userFilter, isNull(schema.inAppNotifications.readAt))),
  ]);

  return c.json({ data: rows, unreadCount: unreadCount?.c ?? 0 });
});

notificationsRouter.get('/count', async (c) => {
  const userId = c.get('user').id;
  const db = getTenantDb(c);
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.inAppNotifications)
    .where(
      and(
        sql`(${schema.inAppNotifications.userId} = ${userId} OR ${schema.inAppNotifications.userId} IS NULL)`,
        isNull(schema.inAppNotifications.readAt),
      ),
    );
  return c.json({ data: { unread: row?.c ?? 0 } });
});

notificationsRouter.post('/:id/read', async (c) => {
  const id = c.req.param('id');
  const db = getTenantDb(c);
  const [updated] = await db
    .update(schema.inAppNotifications)
    .set({ readAt: new Date() })
    .where(eq(schema.inAppNotifications.id, id))
    .returning({ id: schema.inAppNotifications.id });
  if (!updated) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: { id: updated.id, read: true } });
});

notificationsRouter.post('/read-all', async (c) => {
  const userId = c.get('user').id;
  const db = getTenantDb(c);
  await db
    .update(schema.inAppNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        sql`(${schema.inAppNotifications.userId} = ${userId} OR ${schema.inAppNotifications.userId} IS NULL)`,
        isNull(schema.inAppNotifications.readAt),
      ),
    );
  return c.json({ data: { read: true } });
});

notificationsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getTenantDb(c);
  const [deleted] = await db
    .delete(schema.inAppNotifications)
    .where(eq(schema.inAppNotifications.id, id))
    .returning({ id: schema.inAppNotifications.id });
  if (!deleted) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: { id: deleted.id, deleted: true } });
});

/**
 * POST /api/notifications/bulk
 * Body: { ids: string[], action: 'read' | 'unread' | 'delete' }
 *
 * Reduce N round-trips a 1 cuando el user marca/borra varias a la vez
 * (propuesta 79.1 ronda 7).
 */
const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(['read', 'unread', 'delete']),
});

notificationsRouter.post('/bulk', async (c) => {
  const body = await c.req.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  const { ids, action } = parsed.data;
  const db = getTenantDb(c);

  if (action === 'delete') {
    const deleted = await db
      .delete(schema.inAppNotifications)
      .where(inArray(schema.inAppNotifications.id, ids))
      .returning({ id: schema.inAppNotifications.id });
    return c.json({ data: { affected: deleted.length, action } });
  }

  const updated = await db
    .update(schema.inAppNotifications)
    .set({ readAt: action === 'read' ? new Date() : null })
    .where(inArray(schema.inAppNotifications.id, ids))
    .returning({ id: schema.inAppNotifications.id });
  return c.json({ data: { affected: updated.length, action } });
});

/**
 * Helper para que otros módulos creen notificaciones (uso server-side, no
 * expuesto vía HTTP).
 */
export async function createNotification(
  // biome-ignore lint/suspicious/noExplicitAny: helper firmado por consumidores diversos
  db: any,
  params: {
    organizationId: string;
    userId?: string | null;
    category: string;
    severity?: 'info' | 'success' | 'warning' | 'urgent';
    title: string;
    body?: string;
    actionUrl?: string;
    data?: Record<string, unknown>;
  },
) {
  return db
    .insert(schema.inAppNotifications)
    .values({
      organizationId: params.organizationId,
      userId: params.userId ?? null,
      category: params.category,
      severity: params.severity ?? 'info',
      title: params.title,
      body: params.body,
      actionUrl: params.actionUrl,
      data: params.data ?? {},
    })
    .returning();
}

// Helper TypeScript para que otros módulos no importen schema.* directamente.
export const notificationCategories = [
  'wa_message',
  'booking',
  'ical_sync_failed',
  'payment',
  'mention',
  'system',
] as const;
export type NotificationCategory = (typeof notificationCategories)[number];

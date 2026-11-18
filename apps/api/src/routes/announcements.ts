import { createDb, sql } from '@impacto/db';
import { Hono } from 'hono';
import { env } from '../env.js';
import { type AppEnv, requireAuth } from '../middleware/auth.js';

/**
 * Endpoints user-facing de announcements (propuestas 143.4 + 143.5 ronda 12).
 *
 * Requieren auth — usamos la sesión de Better Auth para identificar al user
 * sin trust en headers spoofables.
 *
 * Endpoints:
 *  - POST /api/announcements/:id/view      → marca impresión (idempotente)
 *  - POST /api/announcements/:id/click     → marca clicked_at
 *  - POST /api/announcements/:id/dismiss   → dismiss permanente
 *  - GET  /api/announcements/dismissed     → lista de IDs dismissed para
 *    el user activo (el front lo usa para no re-mostrar localmente)
 */

const adminDb = createDb(env.DATABASE_URL);

export const announcementsRouter = new Hono<AppEnv>();

announcementsRouter.use('*', requireAuth);

announcementsRouter.post('/:id/view', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  try {
    await adminDb.execute(sql`
      INSERT INTO announcement_views (announcement_id, user_id)
      VALUES (${id}::uuid, ${user.id})
      ON CONFLICT (announcement_id, user_id) DO NOTHING
    `);
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: true, skipped: 'table_missing' });
  }
});

announcementsRouter.post('/:id/click', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  try {
    await adminDb.execute(sql`
      INSERT INTO announcement_views (announcement_id, user_id, clicked_at)
      VALUES (${id}::uuid, ${user.id}, now())
      ON CONFLICT (announcement_id, user_id)
        DO UPDATE SET clicked_at = COALESCE(announcement_views.clicked_at, now())
    `);
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: true, skipped: 'table_missing' });
  }
});

announcementsRouter.post('/:id/dismiss', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  try {
    await adminDb.execute(sql`
      INSERT INTO announcement_dismissals (user_id, announcement_id)
      VALUES (${user.id}, ${id}::uuid)
      ON CONFLICT (user_id, announcement_id) DO NOTHING
    `);
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: true, skipped: 'table_missing' });
  }
});

announcementsRouter.get('/dismissed', async (c) => {
  const user = c.get('user');
  try {
    const rows = await adminDb.execute<{ announcement_id: string }>(sql`
      SELECT announcement_id FROM announcement_dismissals
      WHERE user_id = ${user.id}
    `);
    return c.json({ data: rows.map((r) => r.announcement_id) });
  } catch {
    return c.json({ data: [] });
  }
});

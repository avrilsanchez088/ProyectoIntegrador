import { schema, sql } from '@impacto/db';
import { Hono } from 'hono';
import {
  type AppEnv,
  getActiveOrgId,
  requireAuth,
  requireOrganization,
} from '../middleware/auth.js';
import { getTenantDb, rlsContext } from '../middleware/tenant.js';

/**
 * Team / membership endpoints (propuesta 136.2 ronda 11).
 *
 * Better Auth ya expone listMembers via SDK, pero no incluye `last_active_at`.
 * Acá agregamos un read-only endpoint que cruza `members` con `sessions.updated_at`
 * (max por user) para que la UI de equipo muestre quién está activo.
 */
export const teamRouter = new Hono<AppEnv>();

teamRouter.use('*', requireAuth);
teamRouter.use('*', requireOrganization);
teamRouter.use('*', rlsContext);

teamRouter.get('/activity', async (c) => {
  const orgId = getActiveOrgId(c);
  const db = getTenantDb(c);

  // Agregamos sessions por user_id (max updated_at) y joineamos con members.
  // Note: `sessions` y `members` son tablas de Better Auth — no tienen RLS
  // a nivel app porque los gestiona el plugin, así que la query usa el
  // tenant-scoped db igual (RLS no afecta tablas sin policy).
  const rows = await db.execute<{
    user_id: string;
    last_active_at: Date | null;
    sessions_count: number;
  }>(sql`
    SELECT
      m.user_id,
      MAX(s.updated_at) AS last_active_at,
      COUNT(s.id)::int  AS sessions_count
    FROM ${schema.members} m
    LEFT JOIN ${schema.sessions} s ON s.user_id = m.user_id
    WHERE m.organization_id = ${orgId}
    GROUP BY m.user_id
  `);

  return c.json({ data: rows });
});

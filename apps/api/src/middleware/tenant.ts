import { createDb, schema, setTenantContext, setUserContext } from '@impacto/db';
import { type Context, Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { env } from '../env.js';
import { logger } from '../logger.js';
import type { AppEnv, TenantDb } from './auth.js';

/**
 * Cliente DB de la app (rol no-superuser, RLS aplica).
 * Lo creamos una vez y lo reusamos en todos los requests.
 */
const appDb = createDb(env.APP_DATABASE_URL ?? env.DATABASE_URL);

/**
 * Middleware que envuelve cada request en una transaction de DB con el
 * tenant context seteado. Cualquier query que se haga via `getTenantDb()`
 * dentro del handler queda automáticamente filtrada por RLS.
 *
 * USO en el server.ts:
 *   app.use(contextStorage());
 *   app.use(requireAuth);
 *   app.use(requireOrganization);
 *   app.use(rlsContext);     // <-- después de auth + org
 *
 * USO en el handler:
 *   const db = getTenantDb();   // <-- ya tiene el RLS context
 *   const properties = await db.select().from(schema.properties);
 */
export async function rlsContext(c: Context<AppEnv>, next: () => Promise<void>) {
  const session = c.get('session');
  const orgId = session.activeOrganizationId;

  if (!orgId) {
    // requireOrganization debería haber rechazado antes, pero safeguard.
    return c.json({ error: 'no_active_organization' }, 400);
  }

  // Iniciamos una transaction y dejamos que el handler corra dentro.
  return appDb.transaction(async (tx) => {
    await setTenantContext(tx, orgId);
    // Setear app.user_id para que los triggers de audit (migration 0006)
    // sepan quién hizo el cambio. Best-effort — si user no está, queda NULL.
    const user = c.get('user');
    if (user?.id) {
      try {
        await setUserContext(tx, user.id);
      } catch {
        /* userId malformado — ignorar, el audit lo grabará como NULL */
      }
    }
    c.set('db', tx);
    await next();
  });
}

/**
 * Helper para acceder al DB con RLS context aplicado desde el handler.
 * Solo válido dentro de un request que pasó por `rlsContext`.
 */
export function getTenantDb(c: Context<AppEnv>): TenantDb {
  const db = c.get('db');
  if (!db) {
    throw new Error('getTenantDb() called outside rlsContext middleware');
  }
  return db;
}

// Re-export
export { schema };

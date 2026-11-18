import type { Database } from '@impacto/db';
import type { Context, Next } from 'hono';
import { auth } from '../auth.js';

/**
 * Tipo del DB scoped por request. Puede ser un client base (`Database`) o
 * una transaction de drizzle (no expone `$client` pero soporta queries).
 * Lo unimos para que `c.set('db', tx)` typecheck.
 */
export type TenantDb = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Hono middleware: valida la sesión y la inyecta en `c.var`.
 * Si no hay sesión, devuelve 401.
 *
 * Uso:
 *   app.use('/api/private/*', requireAuth);
 *
 * Después dentro del handler:
 *   const session = c.get('session');
 *   const user = c.get('user');
 *   const db = c.get('db');  // si pasó por rlsContext middleware
 */

/**
 * Sesión base de Better Auth + el campo `activeOrganizationId` que el plugin
 * `organization` agrega vía adapter pero no incluye en los tipos inferidos.
 * Centralizamos el cast acá para evitar `as any` repartidos en handlers.
 */
type BaseSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>['session'];
export type SessionWithOrg = BaseSession & { activeOrganizationId: string | null };

export type AppEnv = {
  Variables: {
    session: SessionWithOrg;
    user: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>['user'];
    /** Set por `rlsContext` middleware. DB transaction con tenant context. */
    db?: TenantDb;
  };
};

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!result?.session) {
    return c.json({ error: 'unauthenticated' }, 401);
  }

  c.set('session', result.session as SessionWithOrg);
  c.set('user', result.user);

  await next();
}

/**
 * Middleware adicional: requiere que la sesión tenga un workspace activo.
 * Devuelve 400 si no hay activeOrganizationId.
 */
export async function requireOrganization(c: Context<AppEnv>, next: Next) {
  const session = c.get('session');
  if (!session.activeOrganizationId) {
    return c.json(
      { error: 'no_active_organization', message: 'Set an active workspace first' },
      400,
    );
  }

  await next();
}

/**
 * Helper tipado para handlers que ya pasaron por `requireOrganization`.
 * Garantiza no-null en el tipo.
 */
export function getActiveOrgId(c: Context<AppEnv>): string {
  const session = c.get('session');
  if (!session.activeOrganizationId) {
    throw new Error('getActiveOrgId called without requireOrganization middleware');
  }
  return session.activeOrganizationId;
}

import { schema } from '@impacto/db';
import type { Context, Next } from 'hono';
import { logger } from '../logger.js';
import type { AppEnv } from './auth.js';
import { getTenantDb } from './tenant.js';

/**
 * Middleware que rechaza mutations cuando el workspace está frozen.
 * Reads (GET/HEAD) pasan — el user puede seguir viendo data, pero no editar.
 *
 * Propuesta 118.3 ronda 10 + whitelist 142.3 ronda 12.
 *
 * El factory acepta una `opKey` opcional. Si el tenant tiene esa key en
 * `frozen_allow_ops`, pasa aún con frozen=true. Útil para check-in/check-out
 * que son service-side (el huésped ya está ahí, no podemos rechazar).
 */
export function blockIfFrozenFor(opKey: string | null = null) {
  return async (c: Context<AppEnv>, next: Next) => {
    const method = c.req.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next();
    }

    try {
      const db = getTenantDb(c);
      const rows = await db
        .select({
          frozen: schema.tenantSettings.frozen,
          reason: schema.tenantSettings.frozenReason,
          allowOps: schema.tenantSettings.frozenAllowOps,
        })
        .from(schema.tenantSettings)
        .limit(1);
      const row = rows[0];
      if (row?.frozen) {
        // Whitelist check.
        if (opKey && Array.isArray(row.allowOps) && row.allowOps.includes(opKey)) {
          logger.info({ opKey }, 'frozen tenant: op allow-listed, passing through');
          return next();
        }
        return c.json(
          {
            error: 'workspace_frozen',
            message: row.reason ?? 'Este workspace está temporalmente congelado. Contactá soporte.',
          },
          402,
        );
      }
    } catch (err) {
      logger.warn({ err }, 'frozen check failed — allowing request through');
    }
    await next();
  };
}

/**
 * Default: bloquea todo. Mantiene la API previa para compat.
 */
export const blockIfFrozen = blockIfFrozenFor(null);

import { schema, sql } from '@impacto/db';
import type { Context, Next } from 'hono';
import { logger } from '../logger.js';
import type { AppEnv } from './auth.js';
import { getTenantDb } from './tenant.js';

/**
 * Soft limits por plan (propuesta 157.2 ronda 13).
 *
 * Hasta que tengamos una tabla `plans` real (157.1), hardcodeamos un mapa
 * básico. Cuando 157.1 baje, esto se reemplaza por un lookup. Mantener la
 * misma key estructura para minimizar cambios.
 *
 * Uso desde un router:
 *   propertiesRouter.post('/', enforceLimit('properties'), handler);
 *
 * Devuelve 402 con `error: 'plan_limit_exceeded'` si el tenant excede.
 * Devuelve 200 si OK o si el plan no tiene límite.
 */

type LimitKey = 'properties' | 'units' | 'members';

const PLAN_LIMITS: Record<string, Partial<Record<LimitKey, number>>> = {
  free: { properties: 1, units: 3, members: 2 },
  starter: { properties: 3, units: 10, members: 5 },
  // Sin entrada = sin límite (paid/enterprise/null trial).
};

const COUNT_QUERIES: Record<LimitKey, (orgId: string) => Promise<number>> = {
  properties: async () => 0, // overridden via getTenantDb
  units: async () => 0,
  members: async () => 0,
};

async function getCount(c: Context<AppEnv>, key: LimitKey): Promise<number> {
  const db = getTenantDb(c);
  switch (key) {
    case 'properties': {
      const rows = await db.execute<{ c: number }>(sql`
        SELECT COUNT(*)::int AS c FROM ${schema.properties}
        WHERE deleted_at IS NULL
      `);
      return rows[0]?.c ?? 0;
    }
    case 'units': {
      const rows = await db.execute<{ c: number }>(sql`
        SELECT COUNT(*)::int AS c FROM ${schema.units}
        WHERE deleted_at IS NULL
      `);
      return rows[0]?.c ?? 0;
    }
    case 'members': {
      const orgId = c.get('session').activeOrganizationId;
      const rows = await db.execute<{ c: number }>(sql`
        SELECT COUNT(*)::int AS c FROM ${schema.members}
        WHERE organization_id = ${orgId}
      `);
      return rows[0]?.c ?? 0;
    }
  }
}

/**
 * Factory de middleware. Acepta key del recurso a validar.
 * Si POST excede el límite del plan → 402. PATCH/DELETE/GET pasan siempre.
 */
export function enforceLimit(key: LimitKey) {
  return async (c: Context<AppEnv>, next: Next) => {
    if (c.req.method !== 'POST') {
      return next();
    }
    try {
      const db = getTenantDb(c);
      const orgId = c.get('session').activeOrganizationId;
      const settings = await db
        .select({ plan: schema.tenantSettings.plan })
        .from(schema.tenantSettings)
        .where(sql`${schema.tenantSettings.id} = ${orgId}`)
        .limit(1);
      const plan = settings[0]?.plan ?? null;
      const limit = plan ? PLAN_LIMITS[plan]?.[key] : undefined;
      if (limit === undefined) {
        return next(); // sin límite definido = sin enforcement
      }
      const count = await getCount(c, key);
      if (count >= limit) {
        return c.json(
          {
            error: 'plan_limit_exceeded',
            message: `Tu plan "${plan}" permite máximo ${limit} ${key}. Actualizá para crear más.`,
            limit,
            current: count,
            resource: key,
          },
          402,
        );
      }
    } catch (err) {
      logger.warn({ err, key }, 'plan-limits check failed — allowing request through');
    }
    return next();
  };
}

// Re-export para tests.
export const __test = { PLAN_LIMITS, COUNT_QUERIES };

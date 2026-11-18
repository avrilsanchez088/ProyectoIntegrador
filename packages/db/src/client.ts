import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

/**
 * Singleton Postgres clients indexed por URL. Permite tener varios clients
 * (uno con rol superuser para migrations, otro con rol app para runtime con RLS)
 * sin conflicto.
 */
const _clients = new Map<string, ReturnType<typeof postgres>>();

interface PostgresClientOptions {
  /** Pool size. Default 20. Worker debe usar menos (5) para no saturar. */
  max?: number;
  /** statement_timeout en ms. Default 30s. §7.7 del audit. */
  statementTimeoutMs?: number;
  /** idle_in_transaction_session_timeout en ms. Default 60s. */
  idleInTxnTimeoutMs?: number;
}

export function getPostgresClient(databaseUrl: string, opts: PostgresClientOptions = {}) {
  const cached = _clients.get(databaseUrl);
  if (cached) return cached;
  const client = postgres(databaseUrl, {
    max: opts.max ?? 20,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {}, // silence pg notices en dev
    // Settings de seguridad y resiliencia: queries colgadas matan el pool.
    // §7.7 del audit. Se aplican a cada conexión en el pool al abrirla.
    connection: {
      // `postgres@3.4` tipa estos campos como `number` (ms), no `string`.
      statement_timeout: opts.statementTimeoutMs ?? 30_000,
      idle_in_transaction_session_timeout: opts.idleInTxnTimeoutMs ?? 60_000,
      application_name: 'impacto',
    },
  });
  _clients.set(databaseUrl, client);
  return client;
}

export function createDb(databaseUrl: string, opts: PostgresClientOptions = {}) {
  const client = getPostgresClient(databaseUrl, opts);
  return drizzle(client, { schema, casing: 'snake_case' });
}

export type Database = ReturnType<typeof createDb>;

/**
 * Tipo estructural mínimo que cumplen tanto el Drizzle DB como una transaction.
 * Ambos tienen `.execute()` que acepta un `sql` query y devuelve una promise.
 */
export interface ExecutableDb {
  // biome-ignore lint/suspicious/noExplicitAny: structural duck-typing — drizzle's exact return varies
  execute(query: unknown): Promise<any>;
}

/**
 * Sets the per-transaction tenant context for Postgres RLS policies.
 *
 * IMPORTANTE: `SET LOCAL` solo aplica dentro de una transaction. El uso correcto es:
 *
 *   await db.transaction(async (tx) => {
 *     await setTenantContext(tx, tenantId);
 *     // queries de la transacción acá ven solo data del tenant
 *   });
 *
 * Recomendado: wrap requests en una transaction y usar SET LOCAL.
 *
 * @param db Drizzle DB o transaction
 * @param tenantId organization.id (text type — ID generado por Better Auth)
 */
export async function setTenantContext(db: ExecutableDb, tenantId: string): Promise<void> {
  // Validamos que tenantId sea seguro (alphanumeric + dashes/underscores) para
  // evitar SQL injection, ya que SET no soporta parámetros tradicionales.
  if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
    throw new Error(`Invalid tenantId format: ${tenantId}`);
  }
  await db.execute(sql.raw(`SET LOCAL app.tenant_id = '${tenantId}'`));
}

/**
 * Setea `app.user_id` para que los triggers de audit (migration 0006) lo
 * persistan en `audit.events.user_id`. Llamar después de `setTenantContext`
 * en el mismo transaction.
 *
 * Propuesta 96.2 ronda 8.
 */
export async function setUserContext(db: ExecutableDb, userId: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
    throw new Error(`Invalid userId format: ${userId}`);
  }
  await db.execute(sql.raw(`SET LOCAL app.user_id = '${userId}'`));
}

export { schema };

/**
 * Quick connectivity check usado por el endpoint de readiness.
 * Lanza si no puede ejecutar `SELECT 1` contra Postgres.
 */
export async function pingDatabase(databaseUrl: string): Promise<void> {
  const db = createDb(databaseUrl);
  await db.execute(sql`SELECT 1`);
}

import { resolve } from 'node:path';
/**
 * Aplica todas las migrations pendientes contra la DB.
 * Uso: `pnpm db:migrate`
 *
 * Llamado por el container al boot en producción y manualmente en dev tras
 * `pnpm db:generate`.
 */
import { config as loadEnv } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Cargar .env desde la raíz del monorepo (../../.env relativo a packages/db).
loadEnv({ path: resolve(import.meta.dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

console.info('🔄 Running migrations...');

const sql = postgres(databaseUrl, { max: 1 });
const db = drizzle(sql);

await migrate(db, { migrationsFolder: './migrations' });

await sql.end();

console.info('✅ Migrations applied');

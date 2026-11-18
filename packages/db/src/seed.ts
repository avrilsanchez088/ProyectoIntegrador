/**
 * Seed para desarrollo. Idempotente.
 *
 * NOTA: Las `organizations` (workspaces) se crean cuando un usuario hace signup
 * y completa el onboarding (organization.create() en el frontend). Acá solo
 * sembramos datos que no dependen de un usuario.
 *
 * Para tener data de prueba real (workspace + members), usar el flujo del UI
 * o crear un script separado que primero crea un user con Better Auth.
 *
 * Uso: `pnpm db:seed`
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

// Cargar .env desde la raíz del monorepo (consistente con migrate.ts).
// Sin esto, correr `pnpm db:seed` sin haber exportado DATABASE_URL falla.
loadEnv({ path: resolve(import.meta.dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

console.info('🌱 Seeding database...');

// Por ahora no hay datos seed que insertar — todo viene del flujo UI.
// Cuando agreguemos catálogos (ej: tipos de unidad pre-definidos, países UY/AR
// con sus reglas, plantillas de FAQs hospitality LATAM) los cargamos acá.

console.info('  - Sin datos seed por ahora (M0/M1: todo via UI signup)');
console.info('✅ Seed complete');
process.exit(0);

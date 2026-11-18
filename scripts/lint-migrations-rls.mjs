#!/usr/bin/env node
/**
 * Migration RLS coverage linter (propuesta 169.1 ronda 14).
 *
 * Itera packages/db/migrations/*.sql y para cada `CREATE TABLE` que tenga
 * una columna `organization_id`, verifica que en el mismo archivo (o en
 * algún archivo de migrations/ posterior) exista al menos un
 * `CREATE POLICY ... ON <table>` o que la tabla esté listada en el allowlist
 * `RLS_EXEMPT` debajo (ej: tablas globales sin tenant scope, gestionadas
 * por Better Auth, etc).
 *
 * Uso:
 *   node scripts/lint-migrations-rls.mjs
 *
 * Falla con exit 1 si encuentra una tabla sin RLS y sin exempt.
 *
 * Limitaciones:
 *  - Heurística regex, no parser SQL real. Falsos positivos posibles.
 *  - No chequea que la policy esté en TODAS las operaciones (SELECT/INSERT/
 *    UPDATE/DELETE). Un test integración (rls.test.ts) cubre eso.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'packages', 'db', 'migrations');

// Tablas que NO requieren RLS:
//  - Better Auth core (users, sessions, accounts, verifications)
//  - Better Auth org plugin (organizations, members, invitations)
//  - Globales sin tenant (exchange_rates, system_announcements, audit.events)
//  - Esquema audit (gestionado por superuser)
//  - Tablas de logging interno
const RLS_EXEMPT = new Set([
  'users',
  'sessions',
  'accounts',
  'verifications',
  'organizations',
  'members',
  'invitations',
  'exchange_rates',
  'system_announcements',
  'tenant_freeze_log',
  'tenant_tags', // staff-only, no expone al tenant
  'data_subject_requests', // staff-only, GDPR tracking
  'audit.events',
  'events', // dentro del schema audit
]);

const TABLE_RE =
  /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)\s*\(/gi;
const POLICY_RE = /CREATE\s+POLICY\s+\w+\s+ON\s+([a-z_][a-z0-9_.]*)/gi;
const ORG_ID_RE = /\borganization_id\b/i;

function collectTablesWithOrgId(allFiles) {
  const tables = new Map();
  for (const { name, content } of allFiles) {
    const sections = content.split(/CREATE\s+TABLE/gi);
    // sections[0] is everything before any CREATE TABLE; rest each starts post-keyword.
    for (let i = 1; i < sections.length; i++) {
      const seg = `CREATE TABLE${sections[i]}`;
      // Capture table name from the "(... )" block start.
      const nameMatch = seg.match(
        /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)\s*\(/i,
      );
      if (!nameMatch) continue;
      const tableName = nameMatch[1];
      // Capture body until matching close paren — heurística: hasta la
      // primera línea con ");" al inicio.
      const bodyEnd = seg.search(/\n\s*\)\s*;/);
      const body = bodyEnd >= 0 ? seg.slice(0, bodyEnd) : seg;
      if (ORG_ID_RE.test(body)) {
        tables.set(tableName, { definedIn: name });
      }
    }
  }
  return tables;
}

function collectPolicies(allFiles) {
  const policies = new Set();
  for (const { content } of allFiles) {
    let m = POLICY_RE.exec(content);
    while (m) {
      policies.add(m[1]);
      m = POLICY_RE.exec(content);
    }
    POLICY_RE.lastIndex = 0;
  }
  return policies;
}

function main() {
  let files;
  try {
    files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch (err) {
    console.error(`No se pudo leer ${MIGRATIONS_DIR}: ${err.message}`);
    process.exit(1);
  }

  const allFiles = files.map((name) => ({
    name,
    content: readFileSync(join(MIGRATIONS_DIR, name), 'utf8'),
  }));

  const tables = collectTablesWithOrgId(allFiles);
  const policies = collectPolicies(allFiles);

  const missing = [];
  for (const [tableName, meta] of tables) {
    if (RLS_EXEMPT.has(tableName)) continue;
    // Bare-name match — la policy se loguea con el nombre tal como viene.
    if (!policies.has(tableName)) {
      missing.push({ tableName, definedIn: meta.definedIn });
    }
  }

  if (missing.length === 0) {
    process.exit(0);
  }

  console.error('✗ Tablas con organization_id pero sin CREATE POLICY:');
  for (const m of missing) {
    console.error(`  - ${m.tableName} (definida en ${m.definedIn})`);
  }
  console.error(
    '\nFix: agregá pgPolicy() en el schema TS, o si la tabla no debe tener RLS, ' +
      'agregala al RLS_EXEMPT set en scripts/lint-migrations-rls.mjs.',
  );
  process.exit(1);
}

main();

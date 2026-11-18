#!/usr/bin/env node
/**
 * Migration policy clause linter (propuesta 206.2 ronda 18).
 *
 * Para cada `CREATE POLICY ... ON <table>` con USING/WITH CHECK clause,
 * verifica que la expresión menciona `current_setting('app.tenant_id')` o
 * `organization_id`. Sin eso, la policy no protege RLS — sólo se evalúa
 * `true` o algo no-tenant-scoped y la data se filtra entre tenants.
 *
 * Excepciones legítimas (tablas que tienen policies sin tenant filter):
 *   - tablas globales con allowlist (announcements para staff, etc.) →
 *     listar en `EXEMPT_POLICIES`.
 *   - rol-based checks (no implementados todavía) → vendrían como un
 *     comentario `-- policy-no-tenant-check: <reason>`.
 *
 * Falla con exit 1 si encuentra policy sin tenant check.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'packages', 'db', 'migrations');

const TENANT_REFS = ['current_setting', "'app.tenant_id'", 'organization_id'];

// Policy names que sabemos que NO necesitan tenant_id check (auto-aceptadas
// si la tabla está en RLS_EXEMPT del otro linter — pero por seguridad las
// listamos acá explícitamente).
const EXEMPT_POLICIES = new Set([]);

function extractPolicies(content) {
  // Match `CREATE POLICY <name> ON <table> ... ;` block (greedy until `);` or `;`).
  const re = /CREATE\s+POLICY\s+(\w+)\s+ON\s+([a-z_][a-z0-9_.]*)([\s\S]*?);/gi;
  const out = [];
  let m = re.exec(content);
  while (m) {
    const [, name, table, body] = m;
    if (name && table && body) {
      out.push({ name, table, body });
    }
    m = re.exec(content);
  }
  return out;
}

function tenantReferenced(policyBody) {
  const lower = policyBody.toLowerCase();
  return TENANT_REFS.some((r) => lower.includes(r.toLowerCase()));
}

/**
 * Detecta `USING (true)` literal (sin tenant scoping). Estos pasan por la
 * verificación de tenantReferenced si la policy también tiene WITH CHECK
 * con tenant_id, pero queremos warn explícito: `USING(true)` significa
 * que SELECTs no se filtran — siempre devuelve todo. Errores severos.
 *
 * Propuesta 216.1 ronda 19.
 */
function hasTrueLiteralUsing(policyBody) {
  // Normalizar whitespace y matchear `USING(true)` o `USING ( true )` etc.
  // Permite también `USING (TRUE)`. No matchea cuando hay otra clause
  // adicional, ej. `USING (true AND organization_id = ...)`.
  const re = /\busing\s*\(\s*true\s*\)\s*(?:with\s+check|$|,|;|\))/i;
  return re.test(policyBody);
}

/**
 * Detecta policies FOR INSERT|UPDATE sin WITH CHECK (propuesta 223.1 ronda 20).
 *
 * Una policy `FOR INSERT USING (...)` sin WITH CHECK no protege el insert
 * — porque postgres no aplica USING al insertar. Resultado: el insert
 * pasa sin validación y la row queda visible/invisible según USING
 * (que no aplica al check del INSERT).
 *
 * Para INSERT/UPDATE policies, WITH CHECK es necesario.
 */
function missingWithCheckForMutation(policyBody) {
  const lower = policyBody.toLowerCase();
  // ¿Aplica a INSERT o UPDATE? FOR ALL también cuenta.
  const isMutationPolicy = /\bfor\s+(insert|update|all)\b/.test(lower);
  if (!isMutationPolicy) return false;
  return !/\bwith\s+check\b/.test(lower);
}

/**
 * Detecta policies `FOR ALL` que NO tienen ambos USING + WITH CHECK
 * (propuesta 232.1 ronda 21). FOR ALL aplica a select+insert+update+delete,
 * y postgres requiere ambos clauses para protección completa:
 *   - USING: filtra SELECT y rows existentes en UPDATE/DELETE
 *   - WITH CHECK: valida rows new en INSERT/UPDATE
 *
 * Sin uno de los dos, el comportamiento es asymétrico (a veces inseguro).
 */
function forAllMissingBothClauses(policyBody) {
  const lower = policyBody.toLowerCase();
  if (!/\bfor\s+all\b/.test(lower)) return false;
  const hasUsing = /\busing\s*\(/.test(lower);
  const hasWithCheck = /\bwith\s+check\b/.test(lower);
  return !(hasUsing && hasWithCheck);
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

  const failures = [];
  const trueLiteralWarns = [];
  const missingWithCheck = [];
  const forAllIncomplete = [];
  let totalPolicies = 0;

  for (const fname of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, fname), 'utf8');
    const policies = extractPolicies(content);
    for (const p of policies) {
      totalPolicies++;
      if (EXEMPT_POLICIES.has(p.name)) continue;
      if (!tenantReferenced(p.body)) {
        failures.push({ name: p.name, table: p.table, file: fname });
      }
      if (hasTrueLiteralUsing(p.body)) {
        trueLiteralWarns.push({ name: p.name, table: p.table, file: fname });
      }
      if (missingWithCheckForMutation(p.body)) {
        missingWithCheck.push({ name: p.name, table: p.table, file: fname });
      }
      if (forAllMissingBothClauses(p.body)) {
        forAllIncomplete.push({ name: p.name, table: p.table, file: fname });
      }
    }
  }

  if (
    failures.length === 0 &&
    trueLiteralWarns.length === 0 &&
    missingWithCheck.length === 0 &&
    forAllIncomplete.length === 0
  ) {
    process.exit(0);
  }

  if (failures.length > 0) {
    console.error('✗ Policies sin tenant_id check:');
    for (const f of failures) {
      console.error(`  - ${f.name} ON ${f.table}  (en ${f.file})`);
    }
    console.error(
      "\nFix: agregá `current_setting('app.tenant_id', true)` o `organization_id = ...` " +
        'al USING/WITH CHECK clause, o agregá la policy a EXEMPT_POLICIES si sabés que no aplica.',
    );
  }
  if (trueLiteralWarns.length > 0) {
    console.error('\n✗ Policies con `USING (true)` literal (no filtra nada):');
    for (const f of trueLiteralWarns) {
      console.error(`  - ${f.name} ON ${f.table}  (en ${f.file})`);
    }
    console.error(
      '\nFix: `USING (true)` significa que SELECT devuelve todas las rows. ' +
        "Reemplazá por `USING (organization_id = current_setting('app.tenant_id', true))`.",
    );
  }
  if (missingWithCheck.length > 0) {
    console.error('\n✗ Policies FOR INSERT/UPDATE/ALL sin WITH CHECK (el insert no se valida):');
    for (const f of missingWithCheck) {
      console.error(`  - ${f.name} ON ${f.table}  (en ${f.file})`);
    }
    console.error(
      "\nFix: agregá `WITH CHECK (organization_id = current_setting('app.tenant_id', true))`. " +
        'Sin esto, los INSERT pasan sin validación de tenant.',
    );
  }
  if (forAllIncomplete.length > 0) {
    console.error('\n✗ Policies FOR ALL sin USING + WITH CHECK ambos (cobertura incompleta):');
    for (const f of forAllIncomplete) {
      console.error(`  - ${f.name} ON ${f.table}  (en ${f.file})`);
    }
    console.error(
      '\nFix: FOR ALL aplica a select+insert+update+delete. Necesita ambos clauses ' +
        'para protección simétrica. Si solo querés SELECT, usá FOR SELECT explícito.',
    );
  }
  process.exit(1);
}

main();

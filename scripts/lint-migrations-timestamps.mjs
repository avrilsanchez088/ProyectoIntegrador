#!/usr/bin/env node
/**
 * Migration timestamp consistency linter (propuesta 169.2 ronda 14).
 *
 * Valida que en `packages/db/migrations/meta/_journal.json`:
 *   1. Los `idx` son consecutivos (0, 1, 2, ..., N-1).
 *   2. Los `when` (timestamps ms) son estrictamente crecientes.
 *   3. Cada `tag` corresponde a un archivo `.sql` real en migrations/.
 *   4. Cada archivo `.sql` está listado en el journal.
 *
 * Falla con exit 1 si encuentra una inconsistencia.
 *
 * Uso:
 *   node scripts/lint-migrations-timestamps.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'packages', 'db', 'migrations');
const JOURNAL_PATH = join(MIGRATIONS_DIR, 'meta', '_journal.json');

if (!existsSync(JOURNAL_PATH)) {
  console.error(`✗ No existe ${JOURNAL_PATH}`);
  process.exit(1);
}

let journal;
try {
  journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8'));
} catch (err) {
  console.error(`✗ JSON inválido en ${JOURNAL_PATH}: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(journal.entries)) {
  console.error('✗ journal.entries no es un array');
  process.exit(1);
}

const errors = [];
const entries = journal.entries;

// 1. idx consecutivos
for (let i = 0; i < entries.length; i++) {
  if (entries[i].idx !== i) {
    errors.push(`idx no consecutivo: entrada ${i} tiene idx=${entries[i].idx} (esperado ${i})`);
  }
}

// 2. when estrictamente crecientes
for (let i = 1; i < entries.length; i++) {
  if (entries[i].when <= entries[i - 1].when) {
    errors.push(
      `when no creciente: entrada ${entries[i].tag} (when=${entries[i].when}) <= ` +
        `entrada anterior ${entries[i - 1].tag} (when=${entries[i - 1].when})`,
    );
  }
}

// 3+4. cross-check con files.
const journalTags = new Set(entries.map((e) => e.tag));
const sqlFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => f.replace(/\.sql$/, ''));
const sqlSet = new Set(sqlFiles);

for (const e of entries) {
  if (!sqlSet.has(e.tag)) {
    errors.push(`tag "${e.tag}" en journal pero no existe ${e.tag}.sql`);
  }
}
for (const f of sqlFiles) {
  if (!journalTags.has(f)) {
    errors.push(`archivo ${f}.sql sin entrada en journal`);
  }
}

if (errors.length === 0) {
  process.exit(0);
}

console.error('✗ Migration journal con problemas:');
for (const e of errors) console.error(`  - ${e}`);
process.exit(1);

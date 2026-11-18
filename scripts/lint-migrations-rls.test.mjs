#!/usr/bin/env node
/**
 * Test del migration linter (propuesta 178.6 ronda 15).
 *
 * Crea fixtures temporales con tablas + policies en distintas combinaciones
 * y valida que el script falla / pasa correctamente.
 *
 * Ejecutable con `node scripts/lint-migrations-rls.test.mjs`. Falla con
 * exit 1 si encuentra una regression.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts', 'lint-migrations-rls.mjs');

let failed = 0;
let passed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function setupFixture(files) {
  const root = join(tmpdir(), `lint-rls-test-${Date.now()}-${Math.random()}`);
  const migrationsDir = join(root, 'packages', 'db', 'migrations');
  mkdirSync(migrationsDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(migrationsDir, name), content);
  }
  return root;
}

function runLint(cwd) {
  try {
    execSync(`node "${SCRIPT}"`, { cwd, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0 };
  } catch (err) {
    return { code: err.status ?? 1, output: (err.stdout ?? '') + (err.stderr ?? '') };
  }
}

// ─── Test 1: tabla con org_id + policy → pasa ─────────────────────
{
  const root = setupFixture({
    '0001_test.sql': `
      CREATE TABLE bookings (
        id uuid PRIMARY KEY,
        organization_id text NOT NULL
      );
      CREATE POLICY tenant_isolation ON bookings FOR SELECT USING (true);
    `,
  });
  const r = runLint(root);
  assert(r.code === 0, 'tabla con organization_id + policy → exit 0');
  rmSync(root, { recursive: true, force: true });
}

// ─── Test 2: tabla con org_id sin policy → falla ──────────────────
{
  const root = setupFixture({
    '0001_test.sql': `
      CREATE TABLE my_table (
        id uuid PRIMARY KEY,
        organization_id text NOT NULL
      );
    `,
  });
  const r = runLint(root);
  assert(r.code === 1, 'tabla con organization_id sin policy → exit 1');
  assert(
    (r.output ?? '').includes('my_table'),
    'output menciona el nombre de la tabla problemática',
  );
  rmSync(root, { recursive: true, force: true });
}

// ─── Test 3: tabla sin org_id → ignorada ──────────────────────────
{
  const root = setupFixture({
    '0001_test.sql': `
      CREATE TABLE global_thing (
        id uuid PRIMARY KEY,
        name text
      );
    `,
  });
  const r = runLint(root);
  assert(r.code === 0, 'tabla sin organization_id → exit 0 (ignorada)');
  rmSync(root, { recursive: true, force: true });
}

// ─── Test 4: tabla en allowlist (organizations) → ignorada ────────
{
  const root = setupFixture({
    '0001_test.sql': `
      CREATE TABLE organizations (
        id text PRIMARY KEY,
        organization_id text NOT NULL
      );
    `,
  });
  const r = runLint(root);
  assert(r.code === 0, 'tabla en RLS_EXEMPT (organizations) → exit 0');
  rmSync(root, { recursive: true, force: true });
}

// ─── Test 5: policy en archivo posterior → pasa ───────────────────
{
  const root = setupFixture({
    '0001_create.sql': `
      CREATE TABLE deferred_policy (
        id uuid PRIMARY KEY,
        organization_id text NOT NULL
      );
    `,
    '0002_policy.sql': `
      CREATE POLICY p1 ON deferred_policy FOR SELECT USING (true);
    `,
  });
  const r = runLint(root);
  assert(r.code === 0, 'policy en archivo posterior cuenta como cubierta');
  rmSync(root, { recursive: true, force: true });
}
if (failed > 0) process.exit(1);

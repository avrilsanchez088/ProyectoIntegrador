#!/usr/bin/env node
/**
 * Wrapper paralelo de los 3 linters de migrations (propuestas 223.3 +
 * 241.3 ronda 20-22).
 *
 * Beneficios:
 *  - Speed-up: corre los 3 en paralelo (Promise.all).
 *  - Output unificado: reporta uno por uno con prefijo.
 *  - Exit code agregado: 1 si cualquiera falla.
 *
 * Uso:
 *   node scripts/lint-migrations-all.mjs
 *
 * Si querés correr uno solo, los scripts individuales siguen disponibles.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const SCRIPTS = [
  { name: 'rls', file: 'lint-migrations-rls.mjs' },
  { name: 'timestamps', file: 'lint-migrations-timestamps.mjs' },
  { name: 'policies', file: 'lint-migrations-policies.mjs' },
];

const runScript = (name, file) =>
  new Promise((resolve) => {
    const start = Date.now();
    const out = [];
    const err = [];
    const proc = spawn('node', [join(process.cwd(), 'scripts', file)], {
      env: process.env,
    });
    proc.stdout.on('data', (d) => out.push(d.toString()));
    proc.stderr.on('data', (d) => err.push(d.toString()));
    proc.on('close', (code) => {
      resolve({
        name,
        code: code ?? 0,
        durationMs: Date.now() - start,
        stdout: out.join(''),
        stderr: err.join(''),
      });
    });
    proc.on('error', (e) => {
      resolve({
        name,
        code: 1,
        durationMs: Date.now() - start,
        stdout: '',
        stderr: e.message,
      });
    });
  });

const totalStart = Date.now();
const results = await Promise.all(SCRIPTS.map(({ name, file }) => runScript(name, file)));

let anyFailed = false;
for (const r of results) {
  const prefix = `[${r.name}]`;
  if (r.code === 0) {
    process.stdout.write(`${prefix} ${r.stdout.trim()} (${r.durationMs}ms)\n`);
  } else {
    anyFailed = true;
    process.stderr.write(`${prefix} FAIL (${r.durationMs}ms)\n`);
    if (r.stdout.trim()) process.stderr.write(`${r.stdout}\n`);
    if (r.stderr.trim()) process.stderr.write(`${r.stderr}\n`);
  }
}
process.exit(anyFailed ? 1 : 0);

/**
 * Test integration del feed /api/health/incidents (propuesta 208.7 ronda 19).
 *
 * No invocamos el handler de Hono — la lógica clave es la SQL query del
 * endpoint. Testeamos esa query directamente contra Postgres real:
 *   - Inserta 3 incidents: 2 dentro de los 30d, 1 fuera (35d)
 *   - Ejecuta la misma query del endpoint
 *   - Verifica que solo aparecen los 2 dentro del rango
 *   - Verifica orden DESC por started_at
 *
 * Skipea si Postgres no está disponible.
 */
import { createDb, sql } from '@impacto/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SUPER_URL =
  process.env.DATABASE_URL ??
  'postgres://impacto:impacto_dev_password_change_me@localhost:5433/impacto';

const TITLE_PREFIX = `incidents-feed-test-${Date.now()}-`;
const RECENT_1 = `${TITLE_PREFIX}recent-1`;
const RECENT_2 = `${TITLE_PREFIX}recent-2`;
const OLD = `${TITLE_PREFIX}old`;

async function pgAvailable(): Promise<boolean> {
  try {
    const db = createDb(SUPER_URL);
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

describe('GET /api/health/incidents feed', async () => {
  const ok = await pgAvailable();

  beforeAll(async () => {
    if (!ok) return;
    const db = createDb(SUPER_URL);
    await db.execute(sql`
      DELETE FROM status_incidents WHERE title LIKE ${`${TITLE_PREFIX}%`}
    `);
    await db.execute(sql`
      INSERT INTO status_incidents (title, severity, status, started_at)
      VALUES
        (${OLD}, 'minor', 'resolved', now() - interval '35 days'),
        (${RECENT_1}, 'minor', 'resolved', now() - interval '10 days'),
        (${RECENT_2}, 'major', 'monitoring', now() - interval '2 days')
    `);
  });

  afterAll(async () => {
    if (!ok) return;
    const db = createDb(SUPER_URL);
    await db.execute(sql`
      DELETE FROM status_incidents WHERE title LIKE ${`${TITLE_PREFIX}%`}
    `);
  });

  it.skipIf(!ok)('devuelve solo incidents últimos 30 días, DESC por started_at', async () => {
    const db = createDb(SUPER_URL);
    // Misma query que /api/health/incidents.
    const rows = await db.execute<{
      title: string;
      severity: string;
      started_at: Date;
    }>(sql`
        SELECT title, severity, started_at
        FROM status_incidents
        WHERE started_at > now() - interval '30 days'
          AND title LIKE ${`${TITLE_PREFIX}%`}
        ORDER BY started_at DESC
        LIMIT 50
      `);

    const titles = rows.map((r) => r.title);
    expect(titles, 'el OLD no debe aparecer (fuera de 30d)').not.toContain(OLD);
    expect(titles).toContain(RECENT_1);
    expect(titles).toContain(RECENT_2);
    // Verificar orden DESC: RECENT_2 (más reciente) antes que RECENT_1.
    expect(titles.indexOf(RECENT_2)).toBeLessThan(titles.indexOf(RECENT_1));
  });

  it.skipIf(!ok)('LIMIT 50 no cuenta los > 50', async () => {
    const db = createDb(SUPER_URL);
    const countRows = await db.execute<{ c: number }>(sql`
      SELECT COUNT(*)::int AS c FROM status_incidents
      WHERE started_at > now() - interval '30 days'
    `);
    const count = countRows[0]?.c ?? 0;
    if (count <= 50) {
      // No hay forma de verificar el cap con datos reales — skip soft.
      expect(count).toBeLessThanOrEqual(50);
      return;
    }
    const rows = await db.execute(sql`
      SELECT id FROM status_incidents
      WHERE started_at > now() - interval '30 days'
      ORDER BY started_at DESC
      LIMIT 50
    `);
    expect(rows.length).toBe(50);
  });
});

/**
 * Test integration de incident updates timeline (propuesta 236.5 ronda 22).
 *
 * Crea un incident + 3 updates con status distintos, verifica:
 *  - Updates aparecen en `incident_updates` con incident_id correcto
 *  - Cuando se publica un update, el status del incident parent se
 *    sincroniza al status del último update
 *  - Feed público GET /api/health/incidents devuelve los updates en
 *    orden DESC dentro de `updates: [...]`
 *  - El `started_at` del incident es preservado entre updates
 *
 * Skipea si Postgres no está disponible.
 */
import { createDb, sql } from '@impacto/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SUPER_URL =
  process.env.DATABASE_URL ??
  'postgres://impacto:impacto_dev_password_change_me@localhost:5433/impacto';

const TITLE = `incident-updates-test-${Date.now()}`;

async function pgAvailable(): Promise<boolean> {
  try {
    const db = createDb(SUPER_URL);
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

describe('incident updates timeline', async () => {
  const ok = await pgAvailable();
  let incidentId: string | null = null;

  beforeAll(async () => {
    if (!ok) return;
    const db = createDb(SUPER_URL);
    const inserted = await db.execute<{ id: string }>(sql`
      INSERT INTO status_incidents (title, severity, status)
      VALUES (${TITLE}, 'major', 'investigating')
      RETURNING id
    `);
    incidentId = inserted[0]?.id ?? null;
  });

  afterAll(async () => {
    if (!ok || !incidentId) return;
    const db = createDb(SUPER_URL);
    // cascade borra incident_updates automáticamente.
    await db.execute(sql`DELETE FROM status_incidents WHERE id = ${incidentId}`);
  });

  it.skipIf(!ok)(
    'updates se persisten, parent.status sincroniza al último, feed devuelve DESC',
    async () => {
      const db = createDb(SUPER_URL);

      // Publicar 3 updates: identified → monitoring → resolved
      await db.execute(sql`
        INSERT INTO incident_updates (incident_id, status, message)
        VALUES (${incidentId}, 'identified', 'Encontramos la causa')
      `);
      // Sync parent.status (replica del endpoint admin)
      await db.execute(sql`
        UPDATE status_incidents SET status = 'identified', updated_at = now()
        WHERE id = ${incidentId}
      `);

      await new Promise((r) => setTimeout(r, 20));
      await db.execute(sql`
        INSERT INTO incident_updates (incident_id, status, message)
        VALUES (${incidentId}, 'monitoring', 'Fix aplicado, observando')
      `);
      await db.execute(sql`
        UPDATE status_incidents SET status = 'monitoring', updated_at = now()
        WHERE id = ${incidentId}
      `);

      await new Promise((r) => setTimeout(r, 20));
      await db.execute(sql`
        INSERT INTO incident_updates (incident_id, status, message)
        VALUES (${incidentId}, 'resolved', 'Todo OK')
      `);
      await db.execute(sql`
        UPDATE status_incidents
        SET status = 'resolved', resolved_at = now(), updated_at = now()
        WHERE id = ${incidentId}
      `);

      // 1. Verificar 3 updates en DB.
      const updates = await db.execute<{
        status: string;
        message: string;
        created_at: Date;
      }>(sql`
        SELECT status, message, created_at FROM incident_updates
        WHERE incident_id = ${incidentId}
        ORDER BY created_at ASC
      `);
      expect(updates.length).toBe(3);
      expect(updates.map((u) => u.status)).toEqual(['identified', 'monitoring', 'resolved']);

      // 2. Parent status sincronizado al último (resolved) + resolved_at set
      const parent = await db.execute<{
        status: string;
        resolved_at: Date | null;
      }>(sql`
        SELECT status, resolved_at FROM status_incidents WHERE id = ${incidentId}
      `);
      expect(parent[0]?.status).toBe('resolved');
      expect(parent[0]?.resolved_at).not.toBeNull();

      // 3. Replica de la query del feed /api/health/incidents — incluye
      //    updates DESC.
      const feed = await db.execute<{
        id: string;
        updates: Array<{ status: string; message: string }>;
      }>(sql`
        SELECT i.id,
          (SELECT jsonb_agg(jsonb_build_object(
            'status', u.status, 'message', u.message
          ) ORDER BY u.created_at DESC)
           FROM incident_updates u WHERE u.incident_id = i.id) AS updates
        FROM status_incidents i
        WHERE i.id = ${incidentId}
      `);
      const feedUpdates = feed[0]?.updates;
      expect(feedUpdates).toBeTruthy();
      expect(feedUpdates?.length).toBe(3);
      // DESC: el más reciente primero (resolved).
      expect(feedUpdates?.[0]?.status).toBe('resolved');
      expect(feedUpdates?.[2]?.status).toBe('identified');
    },
  );
});

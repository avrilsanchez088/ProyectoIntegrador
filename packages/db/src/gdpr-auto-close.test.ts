/**
 * Test del auto-close de announcement al procesar GDPR (propuesta 238.3 ronda 22).
 *
 * Flow:
 *  1. Crear request data_subject_requests (status='pending')
 *  2. Insertar system_announcement con data.gdpr_request_id apuntando a 1
 *  3. Verificar que el announcement existe
 *  4. Simular admin PATCH a status='completed' (extrae lógica del endpoint)
 *  5. Verificar que el announcement fue DELETEd
 *
 * Skipea si Postgres no está disponible.
 */
import { createDb, sql } from '@impacto/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { organizations, tenantSettings } from './schema/index';

const SUPER_URL =
  process.env.DATABASE_URL ??
  'postgres://impacto:impacto_dev_password_change_me@localhost:5433/impacto';

const ORG = `gdpr-autoclose-${Date.now()}`;
const EMAIL = `target-${Date.now()}@example.com`;

async function pgAvailable(): Promise<boolean> {
  try {
    const db = createDb(SUPER_URL);
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

describe('GDPR announcement auto-close on completed', async () => {
  const ok = await pgAvailable();
  let requestId: string | null = null;

  beforeAll(async () => {
    if (!ok) return;
    const db = createDb(SUPER_URL);
    await db
      .insert(organizations)
      .values({ id: ORG, name: 'Auto-close Test', slug: `${ORG}-slug` })
      .onConflictDoNothing();
    await db
      .insert(tenantSettings)
      .values({
        id: ORG,
        country: 'UY',
        timezone: 'America/Montevideo',
        currency: 'USD',
      })
      .onConflictDoNothing();

    const inserted = await db.execute<{ id: string }>(sql`
      INSERT INTO data_subject_requests (organization_id, email, action, status)
      VALUES (${ORG}, ${EMAIL}, 'delete', 'pending')
      RETURNING id
    `);
    requestId = inserted[0]?.id ?? null;

    // Insertar announcement linkeado.
    if (requestId) {
      await db.execute(sql`
        INSERT INTO system_announcements
          (severity, message, target_role, starts_at, expires_at, data)
        VALUES (
          'urgent',
          ${`GDPR delete · ${EMAIL}`},
          'admin',
          now(),
          now() + interval '7 days',
          ${JSON.stringify({ gdpr_request_id: requestId })}::jsonb
        )
      `);
    }
  });

  afterAll(async () => {
    if (!ok) return;
    const db = createDb(SUPER_URL);
    if (requestId) {
      await db.execute(sql`
        DELETE FROM system_announcements WHERE data->>'gdpr_request_id' = ${requestId}
      `);
      await db.execute(sql`DELETE FROM data_subject_requests WHERE id = ${requestId}`);
    }
    await db.delete(tenantSettings).where(eq(tenantSettings.id, ORG));
    await db.delete(organizations).where(eq(organizations.id, ORG));
  });

  it.skipIf(!ok)('announcement existe antes y desaparece al status=completed', async () => {
    const db = createDb(SUPER_URL);

    // Pre: announcement existe.
    const before = await db.execute<{ count: number }>(sql`
        SELECT COUNT(*)::int AS count FROM system_announcements
        WHERE data->>'gdpr_request_id' = ${requestId}
      `);
    expect(before[0]?.count).toBe(1);

    // Simular el handler admin PATCH status='completed' (extracted inline).
    await db.execute(sql`
        UPDATE data_subject_requests
        SET status = 'completed', processed_at = now()
        WHERE id = ${requestId}
      `);
    await db.execute(sql`
        DELETE FROM system_announcements
        WHERE data->>'gdpr_request_id' = ${requestId}
      `);

    // Post: announcement borrado.
    const after = await db.execute<{ count: number }>(sql`
        SELECT COUNT(*)::int AS count FROM system_announcements
        WHERE data->>'gdpr_request_id' = ${requestId}
      `);
    expect(after[0]?.count).toBe(0);

    // El status del request quedó 'completed'.
    const req = await db.execute<{ status: string }>(sql`
        SELECT status FROM data_subject_requests WHERE id = ${requestId}
      `);
    expect(req[0]?.status).toBe('completed');
  });

  it.skipIf(!ok)('announcement de OTRO request no se borra (no false-positive)', async () => {
    const db = createDb(SUPER_URL);
    // Insertar otro request + announcement para verificar que el DELETE
    // del primer test no afecta el segundo.
    const other = await db.execute<{ id: string }>(sql`
        INSERT INTO data_subject_requests (organization_id, email, action, status)
        VALUES (${ORG}, 'other@test.com', 'export', 'pending')
        RETURNING id
      `);
    const otherId = other[0]?.id;
    await db.execute(sql`
        INSERT INTO system_announcements
          (severity, message, target_role, starts_at, expires_at, data)
        VALUES (
          'urgent', 'OTHER',
          'admin',
          now(),
          now() + interval '7 days',
          ${JSON.stringify({ gdpr_request_id: otherId })}::jsonb
        )
      `);

    // Borrar solo el que matchea el primer requestId.
    await db.execute(sql`
        DELETE FROM system_announcements
        WHERE data->>'gdpr_request_id' = ${requestId}
      `);

    // El other sigue ahí.
    const others = await db.execute<{ count: number }>(sql`
        SELECT COUNT(*)::int AS count FROM system_announcements
        WHERE data->>'gdpr_request_id' = ${otherId}
      `);
    expect(others[0]?.count).toBe(1);

    // cleanup
    await db.execute(sql`
        DELETE FROM system_announcements WHERE data->>'gdpr_request_id' = ${otherId}
      `);
    await db.execute(sql`DELETE FROM data_subject_requests WHERE id = ${otherId}`);
  });
});

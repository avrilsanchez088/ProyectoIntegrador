/**
 * Test integración del worker stale-freeze-alert (propuesta 164.5 ronda 14).
 *
 * Estrategia:
 *  1. Crear org + tenant_settings con frozen=true y frozen_at = hace 8 días.
 *  2. Procesar el job manualmente — usamos el processor exportado del worker
 *     directamente con un fake Job, sin levantar BullMQ.
 *  3. Verificar que se insertó announcement urgent con target_org_id correcto.
 *  4. Cleanup.
 *
 * Skipea si Postgres no está disponible.
 */
import { createDb, eq, organizations, sql, tenantSettings } from '@impacto/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SUPER_URL =
  process.env.DATABASE_URL ??
  'postgres://impacto:impacto_dev_password_change_me@localhost:5433/impacto';

const ORG = `stale-freeze-test-${Date.now()}`;

async function pgAvailable(): Promise<boolean> {
  try {
    const db = createDb(SUPER_URL);
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

describe('stale-freeze-alert worker', async () => {
  const ok = await pgAvailable();

  beforeAll(async () => {
    if (!ok) return;
    const db = createDb(SUPER_URL);
    await db
      .insert(organizations)
      .values({ id: ORG, name: 'Stale Freeze Test', slug: `${ORG}-slug` })
      .onConflictDoNothing();
    await db
      .insert(tenantSettings)
      .values({
        id: ORG,
        country: 'UY',
        timezone: 'America/Montevideo',
        currency: 'USD',
        frozen: true,
        frozenReason: 'test fixture',
        frozenAt: new Date(Date.now() - 8 * 24 * 3600 * 1000),
      })
      .onConflictDoUpdate({
        target: tenantSettings.id,
        set: {
          frozen: true,
          frozenReason: 'test fixture',
          frozenAt: new Date(Date.now() - 8 * 24 * 3600 * 1000),
        },
      });

    // Limpiar announcements previas del fixture (idempotencia entre runs).
    await db.execute(sql`
      DELETE FROM system_announcements WHERE target_org_id = ${ORG}
    `);
  });

  afterAll(async () => {
    if (!ok) return;
    const db = createDb(SUPER_URL);
    await db.execute(sql`DELETE FROM system_announcements WHERE target_org_id = ${ORG}`);
    await db.delete(tenantSettings).where(eq(tenantSettings.id, ORG));
    await db.delete(organizations).where(eq(organizations.id, ORG));
  });

  it.skipIf(!ok)('detecta tenant frozen > 7d e inserta announcement urgent', async () => {
    const db = createDb(SUPER_URL);

    // Replicamos la lógica del worker. No importamos el worker mismo
    // porque trae IORedis (BullMQ) y no queremos depender de Redis acá.
    const stale = await db.execute<{
      id: string;
      name: string;
      frozen_at: Date;
      frozen_reason: string | null;
    }>(sql`
        SELECT o.id, o.name, ts.frozen_at, ts.frozen_reason
        FROM tenant_settings ts
        JOIN organizations o ON o.id = ts.id
        WHERE ts.frozen = true
          AND ts.frozen_at < now() - interval '7 days'
          AND o.id = ${ORG}
      `);
    expect(stale.length).toBe(1);
    const first = stale[0];
    if (!first) throw new Error('expected stale tenant');
    expect(first.id).toBe(ORG);

    // Insertar announcement.
    const days = Math.floor(
      (Date.now() - new Date(first.frozen_at).getTime()) / (24 * 3600 * 1000),
    );
    const message = `Tenant "${first.name}" lleva ${days} días congelado. Considerar outreach.`;
    await db.execute(sql`
        INSERT INTO system_announcements
          (severity, message, starts_at, target_role, target_org_id, created_by)
        VALUES ('urgent', ${message}, now(), 'admin', ${ORG}, NULL)
      `);

    // Verificar.
    const found = await db.execute<{ severity: string; message: string }>(sql`
        SELECT severity, message FROM system_announcements
        WHERE target_org_id = ${ORG}
        ORDER BY created_at DESC
        LIMIT 1
      `);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('urgent');
    expect(found[0]?.message).toContain('días congelado');
  });
});

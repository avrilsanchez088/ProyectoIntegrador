/**
 * Test integración del purge de audit.events (propuesta 155.5 ronda 13).
 *
 * Estrategia:
 *  1. Crear org de test + tenant_settings con audit_retention_days=30.
 *  2. Insertar 5 audit.events: 3 viejos (60 días atrás) + 2 nuevos (1 día atrás).
 *  3. Llamar `purge_old_audit_events(100)`.
 *  4. Verificar que solo quedan los 2 nuevos.
 *  5. Cleanup.
 *
 * Skipea si no hay Postgres disponible.
 */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { organizations, tenantSettings } from './schema/index';

const SUPER_URL =
  process.env.DATABASE_URL ??
  'postgres://impacto:impacto_dev_password_change_me@localhost:5433/impacto';

const ORG = `audit-purge-test-${Date.now()}`;

async function pgAvailable(): Promise<boolean> {
  try {
    const db = createDb(SUPER_URL);
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

describe('audit retention purge', async () => {
  const ok = await pgAvailable();

  beforeAll(async () => {
    if (!ok) return;
    const db = createDb(SUPER_URL);
    await db
      .insert(organizations)
      .values({ id: ORG, name: 'Audit Purge Test', slug: `${ORG}-slug` })
      .onConflictDoNothing();
    await db
      .insert(tenantSettings)
      .values({
        id: ORG,
        country: 'UY',
        timezone: 'America/Montevideo',
        currency: 'USD',
        auditRetentionDays: 30,
      })
      .onConflictDoUpdate({
        target: tenantSettings.id,
        set: { auditRetentionDays: 30 },
      });

    // Insertar 5 audit events: 3 viejos + 2 nuevos. Bypaseamos el trigger
    // y escribimos directo. La tabla audit.events tiene RLS — verificamos
    // si la policy lo permite con SET ROLE postgres (superuser).
    await db.execute(sql`
      INSERT INTO audit.events (organization_id, table_name, op, row_id, ts)
      VALUES
        (${ORG}, 'test', 'I', 'old1', now() - interval '60 days'),
        (${ORG}, 'test', 'I', 'old2', now() - interval '60 days'),
        (${ORG}, 'test', 'I', 'old3', now() - interval '50 days'),
        (${ORG}, 'test', 'I', 'new1', now() - interval '1 day'),
        (${ORG}, 'test', 'I', 'new2', now() - interval '5 days')
    `);
  });

  afterAll(async () => {
    if (!ok) return;
    const db = createDb(SUPER_URL);
    await db.execute(sql`DELETE FROM audit.events WHERE organization_id = ${ORG}`);
    await db.delete(tenantSettings).where(eq(tenantSettings.id, ORG));
    await db.delete(organizations).where(eq(organizations.id, ORG));
  });

  it.skipIf(!ok)(
    'borra eventos más viejos que audit_retention_days y conserva los nuevos',
    async () => {
      const db = createDb(SUPER_URL);

      // Pre: 5 eventos manuales (table_name='test'). El trigger sobre
      // tenant_settings emite audit events extra cuando hacemos el
      // upsert en beforeAll — los excluimos del count filtrando por
      // table_name.
      const before = await db.execute<{ count: number }>(sql`
        SELECT COUNT(*)::int AS count FROM audit.events
        WHERE organization_id = ${ORG} AND table_name = 'test'
      `);
      expect(before[0]?.count).toBe(5);

      // Run purge.
      await db.execute(sql`SELECT * FROM purge_old_audit_events(100)`);

      // Post: solo los 2 nuevos quedan dentro de los eventos 'test'.
      const after = await db.execute<{ row_id: string; count: number }>(sql`
        SELECT row_id, COUNT(*)::int AS count FROM audit.events
        WHERE organization_id = ${ORG} AND table_name = 'test'
        GROUP BY row_id
        ORDER BY row_id
      `);
      const ids = after.map((r) => r.row_id).sort();
      expect(ids).toEqual(['new1', 'new2']);
    },
  );
});

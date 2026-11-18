/**
 * Tests de aislamiento RLS cross-tenant (G4.5 / §4.5 del audit).
 *
 * Verifica que las políticas pgPolicy() en properties/units/photos/bookings/
 * etc bloquean efectivamente que un tenant vea data de otro.
 *
 * Requiere:
 *  - Postgres corriendo (`docker compose up postgres`)
 *  - Migrations aplicadas
 *  - Rol `impacto_app` creado por `infra/postgres-init/03-app-role.sql`
 *
 * Estrategia:
 *  1. Conectarse con el rol superuser (DATABASE_URL) para crear 2 organizations
 *     y bypasear RLS al insertar fixtures.
 *  2. Reconectarse con el rol app (APP_DATABASE_URL) — RLS aplica.
 *  3. Setear `app.tenant_id = orgA` y leer properties → debe ver solo las de A.
 *  4. Setear `app.tenant_id = orgB` y leer → debe ver solo las de B.
 *  5. Cleanup.
 */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, setTenantContext } from './client';
import { organizations, properties, tenantSettings } from './schema/index';

const SUPER_URL =
  process.env.DATABASE_URL ??
  'postgres://impacto:impacto_dev_password_change_me@localhost:5433/impacto';
const APP_URL =
  process.env.APP_DATABASE_URL ??
  'postgres://impacto_app:impacto_dev_app_password@localhost:5433/impacto';

const ORG_A = `rls-test-A-${Date.now()}`;
const ORG_B = `rls-test-B-${Date.now()}`;

// El rol app puede no existir si el init script aún no corrió; en ese caso
// skipeamos los tests para no bloquear el CI inicial.
async function appRoleAvailable(): Promise<boolean> {
  try {
    const db = createDb(APP_URL);
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

describe('RLS cross-tenant isolation', async () => {
  const hasAppRole = await appRoleAvailable();

  beforeAll(async () => {
    if (!hasAppRole) return;
    const superDb = createDb(SUPER_URL);

    // Crear orgs (sin RLS — superuser)
    await superDb
      .insert(organizations)
      .values([
        { id: ORG_A, name: 'Org A', slug: `${ORG_A}-slug`, createdAt: new Date() },
        { id: ORG_B, name: 'Org B', slug: `${ORG_B}-slug`, createdAt: new Date() },
      ])
      .onConflictDoNothing();

    await superDb
      .insert(tenantSettings)
      .values([
        { id: ORG_A, country: 'UY', timezone: 'America/Montevideo', currency: 'USD' },
        { id: ORG_B, country: 'AR', timezone: 'America/Argentina/Buenos_Aires', currency: 'USD' },
      ])
      .onConflictDoNothing();

    // Insertar property en cada org bypaseando RLS (el rol superuser no la
    // respeta porque las tablas tienen FORCE ROW LEVEL SECURITY, así que
    // tenemos que setear el contexto también aún siendo superuser).
    await superDb.transaction(async (tx) => {
      await setTenantContext(tx, ORG_A);
      await tx.insert(properties).values({
        organizationId: ORG_A,
        name: 'Property of A',
        slug: 'prop-a',
        propertyType: 'cabanas',
      });
    });

    await superDb.transaction(async (tx) => {
      await setTenantContext(tx, ORG_B);
      await tx.insert(properties).values({
        organizationId: ORG_B,
        name: 'Property of B',
        slug: 'prop-b',
        propertyType: 'cabanas',
      });
    });
  });

  afterAll(async () => {
    if (!hasAppRole) return;
    const superDb = createDb(SUPER_URL);
    await superDb.delete(properties).where(eq(properties.organizationId, ORG_A));
    await superDb.delete(properties).where(eq(properties.organizationId, ORG_B));
    await superDb.delete(tenantSettings).where(eq(tenantSettings.id, ORG_A));
    await superDb.delete(tenantSettings).where(eq(tenantSettings.id, ORG_B));
    await superDb.delete(organizations).where(eq(organizations.id, ORG_A));
    await superDb.delete(organizations).where(eq(organizations.id, ORG_B));
  });

  it.skipIf(!hasAppRole)('A solo ve sus properties', async () => {
    const appDb = createDb(APP_URL);
    await appDb.transaction(async (tx) => {
      await setTenantContext(tx, ORG_A);
      const rows = await tx.select().from(properties);
      const names = rows.map((r) => r.name);
      expect(names).toContain('Property of A');
      expect(names).not.toContain('Property of B');
    });
  });

  it.skipIf(!hasAppRole)('B solo ve sus properties', async () => {
    const appDb = createDb(APP_URL);
    await appDb.transaction(async (tx) => {
      await setTenantContext(tx, ORG_B);
      const rows = await tx.select().from(properties);
      const names = rows.map((r) => r.name);
      expect(names).toContain('Property of B');
      expect(names).not.toContain('Property of A');
    });
  });

  it.skipIf(!hasAppRole)('Sin app.tenant_id seteado, no se ve nada', async () => {
    const appDb = createDb(APP_URL);
    await appDb.transaction(async (tx) => {
      // No setteamos contexto. RLS evalúa current_setting('app.tenant_id', true)
      // como NULL → ninguna fila pasa la policy.
      const rows = await tx.select().from(properties);
      const aOrB = rows.filter((r) => r.organizationId === ORG_A || r.organizationId === ORG_B);
      expect(aOrB).toHaveLength(0);
    });
  });

  it.skipIf(!hasAppRole)('A no puede insertar como B (withCheck policy)', async () => {
    const appDb = createDb(APP_URL);
    await expect(
      appDb.transaction(async (tx) => {
        await setTenantContext(tx, ORG_A);
        // Intentamos insertar con organizationId = B mientras tenant_id = A.
        // La policy de INSERT con `withCheck` debe rechazarlo.
        await tx.insert(properties).values({
          organizationId: ORG_B,
          name: 'Forged property',
          slug: 'forged',
          propertyType: 'cabanas',
        });
      }),
    ).rejects.toThrow();
  });

  it.skipIf(!hasAppRole)('A no puede UPDATE properties de B (using policy)', async () => {
    const appDb = createDb(APP_URL);
    // Encontrar el id de la property de B desde superuser.
    const superDb = createDb(SUPER_URL);
    const bRows = await superDb.transaction(async (tx) => {
      await setTenantContext(tx, ORG_B);
      return tx.select().from(properties).where(eq(properties.organizationId, ORG_B));
    });
    const bId = bRows[0]?.id;
    expect(bId).toBeDefined();
    if (!bId) return;

    // Bajo el contexto A, intentar actualizar la property de B.
    // La policy USING debe filtrar la fila → 0 rows updated, no throw.
    const result = await appDb.transaction(async (tx) => {
      await setTenantContext(tx, ORG_A);
      const updated = await tx
        .update(properties)
        .set({ name: 'HACKED' })
        .where(eq(properties.id, bId))
        .returning({ id: properties.id });
      return updated;
    });
    expect(result).toHaveLength(0);

    // Verificar que el nombre original sigue intacto bajo contexto B.
    const stillOriginal = await superDb.transaction(async (tx) => {
      await setTenantContext(tx, ORG_B);
      const rows = await tx.select().from(properties).where(eq(properties.id, bId));
      return rows[0]?.name;
    });
    expect(stillOriginal).toBe('Property of B');
  });

  it.skipIf(!hasAppRole)('A no puede DELETE properties de B', async () => {
    const appDb = createDb(APP_URL);
    const superDb = createDb(SUPER_URL);
    const bRows = await superDb.transaction(async (tx) => {
      await setTenantContext(tx, ORG_B);
      return tx.select().from(properties).where(eq(properties.organizationId, ORG_B));
    });
    const bId = bRows[0]?.id;
    expect(bId).toBeDefined();
    if (!bId) return;

    const result = await appDb.transaction(async (tx) => {
      await setTenantContext(tx, ORG_A);
      const deleted = await tx
        .delete(properties)
        .where(eq(properties.id, bId))
        .returning({ id: properties.id });
      return deleted;
    });
    expect(result).toHaveLength(0);

    // Property B debe seguir existiendo.
    const stillExists = await superDb.transaction(async (tx) => {
      await setTenantContext(tx, ORG_B);
      const rows = await tx.select().from(properties).where(eq(properties.id, bId));
      return rows.length;
    });
    expect(stillExists).toBe(1);
  });

  it.skipIf(!hasAppRole)('tenant_settings respeta RLS', async () => {
    const appDb = createDb(APP_URL);
    await appDb.transaction(async (tx) => {
      await setTenantContext(tx, ORG_A);
      const rows = await tx.select().from(tenantSettings);
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(ORG_A);
      expect(ids).not.toContain(ORG_B);
    });
  });

  it.skipIf(!hasAppRole)(
    'app role no puede bypasear con SET ROLE / SET tenant_id stale',
    async () => {
      const appDb = createDb(APP_URL);
      // Si setTenantContext con A en una tx, y dentro intentamos seleccionar
      // properties después de un `RESET app.tenant_id`, no debe ver nada.
      await appDb.transaction(async (tx) => {
        await setTenantContext(tx, ORG_A);
        await tx.execute(sql`RESET app.tenant_id`);
        const rows = await tx.select().from(properties);
        const aOrB = rows.filter((r) => r.organizationId === ORG_A || r.organizationId === ORG_B);
        expect(aOrB).toHaveLength(0);
      });
    },
  );
});

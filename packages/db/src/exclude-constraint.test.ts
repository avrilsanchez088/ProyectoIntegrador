/**
 * Test del EXCLUDE constraint anti-double-booking (G4.8 / §4.2 del audit).
 *
 * El schema `bookings` declara:
 *   EXCLUDE USING gist (unit_id =, tstzrange(check_in, check_out, '[)') &&)
 *   WHERE (status NOT IN ('cancelled', 'no_show'))
 *
 * Este test verifica que:
 *  1. Dos bookings ACTIVAS solapadas sobre la misma unit fallan con SQLSTATE 23P01.
 *  2. La booking original NO se pierde (sigue activa).
 *  3. Si una de las dos está cancelada, no aplica el constraint.
 *
 * Estrategia: bypass RLS con superuser; cleanup completo al final.
 *
 * Skipea si Postgres no está disponible.
 */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { bookings, organizations, properties, tenantSettings, units } from './schema/index';

const SUPER_URL =
  process.env.DATABASE_URL ??
  'postgres://impacto:impacto_dev_password_change_me@localhost:5433/impacto';

const ORG = `excl-test-${Date.now()}`;
const PROP_ID = `00000000-0000-0000-0000-${Date.now().toString().padStart(12, '0')}`.slice(0, 36);

async function pgAvailable(): Promise<boolean> {
  try {
    const db = createDb(SUPER_URL);
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

describe('EXCLUDE constraint anti-double-booking', async () => {
  const ok = await pgAvailable();
  let unitId = '';

  beforeAll(async () => {
    if (!ok) return;
    const db = createDb(SUPER_URL);
    await db
      .insert(organizations)
      .values({ id: ORG, name: 'Exclude Test', slug: `excl-${Date.now()}` })
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

    const [prop] = await db
      .insert(properties)
      .values({
        organizationId: ORG,
        name: 'Excl Property',
        slug: `excl-prop-${Date.now()}`,
        propertyType: 'cabin',
        country: 'UY',
      })
      .returning({ id: properties.id });
    if (!prop) throw new Error('property insert failed');
    const [unit] = await db
      .insert(units)
      .values({
        organizationId: ORG,
        propertyId: prop.id,
        name: 'Excl Unit',
        slug: `excl-unit-${Date.now()}`,
        unitType: 'cabin',
        maxGuests: 2,
      })
      .returning({ id: units.id });
    if (!unit) throw new Error('unit insert failed');
    unitId = unit.id;
  });

  afterAll(async () => {
    if (!ok) return;
    const db = createDb(SUPER_URL);
    // Cascada: bookings → units → properties → tenant_settings → organizations.
    await db.delete(bookings).where(eq(bookings.organizationId, ORG));
    await db.delete(units).where(eq(units.organizationId, ORG));
    await db.delete(properties).where(eq(properties.organizationId, ORG));
    await db.delete(tenantSettings).where(eq(tenantSettings.id, ORG));
    await db.delete(organizations).where(eq(organizations.id, ORG));
  });

  it.skipIf(!ok)(
    'rechaza el segundo insert cuando dos bookings activas solapan en la misma unit',
    async () => {
      const db = createDb(SUPER_URL);
      const checkIn1 = new Date('2027-03-01T15:00:00Z');
      const checkOut1 = new Date('2027-03-05T11:00:00Z');
      const checkIn2 = new Date('2027-03-03T15:00:00Z'); // dentro del rango anterior
      const checkOut2 = new Date('2027-03-08T11:00:00Z');

      await db.insert(bookings).values({
        organizationId: ORG,
        unitId,
        code: `EX-${Date.now()}-1`,
        source: 'direct',
        status: 'confirmed',
        checkIn: checkIn1,
        checkOut: checkOut1,
        guestsCount: 2,
        totalCents: 50000,
        currency: 'USD',
      });

      let caught: Error | null = null;
      try {
        await db.insert(bookings).values({
          organizationId: ORG,
          unitId,
          code: `EX-${Date.now()}-2`,
          source: 'direct',
          status: 'confirmed',
          checkIn: checkIn2,
          checkOut: checkOut2,
          guestsCount: 2,
          totalCents: 60000,
          currency: 'USD',
        });
      } catch (err) {
        caught = err as Error;
      }

      expect(caught).not.toBeNull();
      // SQLSTATE 23P01 = exclusion_violation. Postgres lo expone como `.code`
      // en el driver postgres-js.
      // biome-ignore lint/suspicious/noExplicitAny: postgres-js error con campo code dinámico
      expect((caught as any)?.code).toBe('23P01');

      // La primera reserva sigue existiendo.
      const remaining = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(eq(bookings.organizationId, ORG));
      expect(remaining.length).toBe(1);
    },
  );

  it.skipIf(!ok)('permite solapar cuando la primera booking está cancelled', async () => {
    const db = createDb(SUPER_URL);
    await db.delete(bookings).where(eq(bookings.organizationId, ORG));

    const checkIn = new Date('2027-04-01T15:00:00Z');
    const checkOut = new Date('2027-04-05T11:00:00Z');

    await db.insert(bookings).values({
      organizationId: ORG,
      unitId,
      code: `EX-${Date.now()}-CXL`,
      source: 'direct',
      status: 'cancelled',
      checkIn,
      checkOut,
      guestsCount: 2,
      totalCents: 50000,
      currency: 'USD',
    });

    // Solapamiento exacto, pero la primera está cancelled — debe pasar.
    await db.insert(bookings).values({
      organizationId: ORG,
      unitId,
      code: `EX-${Date.now()}-NEW`,
      source: 'direct',
      status: 'confirmed',
      checkIn,
      checkOut,
      guestsCount: 2,
      totalCents: 60000,
      currency: 'USD',
    });

    const rows = await db
      .select({ id: bookings.id, status: bookings.status })
      .from(bookings)
      .where(eq(bookings.organizationId, ORG));
    expect(rows.length).toBe(2);
  });

  it.skipIf(!ok)('permite reservas consecutivas (checkout = checkin del próximo)', async () => {
    const db = createDb(SUPER_URL);
    await db.delete(bookings).where(eq(bookings.organizationId, ORG));

    // `tstzrange(check_in, check_out, '[)')` deja el endpoint superior
    // exclusivo — un checkout a las 11 NO choca con un checkin a las 14
    // del mismo día, ni siquiera con un checkin a las 11.
    await db.insert(bookings).values({
      organizationId: ORG,
      unitId,
      code: `EX-${Date.now()}-A`,
      source: 'direct',
      status: 'confirmed',
      checkIn: new Date('2027-05-01T15:00:00Z'),
      checkOut: new Date('2027-05-05T11:00:00Z'),
      guestsCount: 2,
      totalCents: 50000,
      currency: 'USD',
    });
    await db.insert(bookings).values({
      organizationId: ORG,
      unitId,
      code: `EX-${Date.now()}-B`,
      source: 'direct',
      status: 'confirmed',
      checkIn: new Date('2027-05-05T11:00:00Z'),
      checkOut: new Date('2027-05-08T11:00:00Z'),
      guestsCount: 2,
      totalCents: 50000,
      currency: 'USD',
    });

    const rows = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.organizationId, ORG));
    expect(rows.length).toBe(2);
  });
});

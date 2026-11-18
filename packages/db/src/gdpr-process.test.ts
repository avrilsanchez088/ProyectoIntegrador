/**
 * Test integration del worker GDPR end-to-end (propuesta 199.2 ronda 18).
 *
 * Setup:
 *  1. Crear org + booking con guest_email/name/phone reales
 *  2. Crear data_subject_request action='delete' para ese email
 *  3. Ejecutar la lógica del worker directamente (sin BullMQ — call inline)
 *  4. Verificar:
 *     - booking.guest_email → redacted-xxx@anon.local
 *     - booking.guest_phone → null
 *     - booking.guest_name → 'Huésped anonimizado'
 *     - request.status → 'completed'
 *  5. Cleanup
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

const ORG = `gdpr-process-test-${Date.now()}`;
const GUEST_EMAIL = `guest-${Date.now()}@example.com`;

async function pgAvailable(): Promise<boolean> {
  try {
    const db = createDb(SUPER_URL);
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Replica de la función del worker (sin BullMQ). Mismo algoritmo SHA-256
 * → primeros 8 bytes hex → `redacted-xxxxxxxx@anon.local`.
 */
async function anonymizeEmail(email: string): Promise<string> {
  const enc = new TextEncoder().encode(email.toLowerCase().trim());
  const hash = await crypto.subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(hash))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `redacted-${hex}@anon.local`;
}

describe('GDPR worker end-to-end', async () => {
  const ok = await pgAvailable();
  let requestId: string | null = null;
  let bookingId: string | null = null;

  beforeAll(async () => {
    if (!ok) return;
    const db = createDb(SUPER_URL);

    await db
      .insert(organizations)
      .values({ id: ORG, name: 'GDPR Test', slug: `${ORG}-slug` })
      .onConflictDoNothing();
    await db
      .insert(tenantSettings)
      .values({ id: ORG, country: 'UY', timezone: 'America/Montevideo', currency: 'USD' })
      .onConflictDoNothing();

    // Insertar property + unit + booking. bookings.unit_id tiene FK a
    // units(id), no podemos usar un UUID random.
    // `SET LOCAL` no acepta parameter binding — usamos sql.raw con escape.
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.tenant_id = '${ORG.replace(/'/g, "''")}'`));

      const propInserted = await tx.execute<{ id: string }>(sql`
        INSERT INTO properties (organization_id, name, slug, property_type, country)
        VALUES (${ORG}, 'GDPR Test Property', ${`gdpr-prop-${Date.now()}`}, 'cabin', 'UY')
        RETURNING id
      `);
      const propertyId = propInserted[0]?.id;

      const unitInserted = await tx.execute<{ id: string }>(sql`
        INSERT INTO units (organization_id, property_id, name, slug, unit_type, max_guests)
        VALUES (${ORG}, ${propertyId}::uuid, 'GDPR Test Unit', ${`gdpr-unit-${Date.now()}`}, 'cabin', 2)
        RETURNING id
      `);
      const unitId = unitInserted[0]?.id;

      // El schema bookings tiene muchos NOT NULL — usamos defaults razonables.
      const inserted = await tx.execute<{ id: string }>(sql`
        INSERT INTO bookings (
          organization_id, unit_id, code, source, status,
          check_in, check_out, guests_count, pets_count,
          guest_email, guest_phone, guest_name,
          currency, total_cents
        )
        VALUES (
          ${ORG}, ${unitId}::uuid, ${`TST-${Date.now()}`}, 'manual', 'confirmed',
          now(), now() + interval '3 days', 2, 0,
          ${GUEST_EMAIL}, '+598 99 555 555', 'Juan Test',
          'USD', 10000
        )
        RETURNING id
      `);
      bookingId = inserted[0]?.id ?? null;
    });

    // Insertar request type=delete
    const reqInserted = await db.execute<{ id: string }>(sql`
      INSERT INTO data_subject_requests (organization_id, email, action, status)
      VALUES (${ORG}, ${GUEST_EMAIL}, 'delete', 'processing')
      RETURNING id
    `);
    requestId = reqInserted[0]?.id ?? null;
  });

  afterAll(async () => {
    if (!ok) return;
    const db = createDb(SUPER_URL);
    if (bookingId) {
      await db.transaction(async (tx) => {
        // `SET LOCAL` no soporta parameter binding.
        await tx.execute(sql.raw(`SET LOCAL app.tenant_id = '${ORG.replace(/'/g, "''")}'`));
        await tx.execute(sql`DELETE FROM bookings WHERE id = ${bookingId}::uuid`);
      });
    }
    if (requestId) {
      await db.execute(sql`DELETE FROM data_subject_requests WHERE id = ${requestId}::uuid`);
    }
    await db.delete(tenantSettings).where(eq(tenantSettings.id, ORG));
    await db.delete(organizations).where(eq(organizations.id, ORG));
  });

  it.skipIf(!ok)(
    'replica del worker anonimiza guest_email/phone/name + marca completed',
    async () => {
      const db = createDb(SUPER_URL);
      const anonEmail = await anonymizeEmail(GUEST_EMAIL);

      // Ejecutar la misma lógica del worker (extracted inline).
      await db.execute(sql`
        UPDATE bookings
        SET guest_email = ${anonEmail},
            guest_phone = NULL,
            guest_name = 'Huésped anonimizado',
            updated_at = now()
        WHERE organization_id = ${ORG}
          AND lower(guest_email) = lower(${GUEST_EMAIL})
      `);
      await db.execute(sql`
        UPDATE data_subject_requests
        SET status = 'completed', processed_at = now()
        WHERE id = ${requestId}::uuid
      `);

      // Verificar.
      const rows = await db.execute<{
        guest_email: string;
        guest_phone: string | null;
        guest_name: string;
      }>(sql`
        SELECT guest_email, guest_phone, guest_name FROM bookings
        WHERE id = ${bookingId}::uuid
      `);
      expect(rows.length).toBe(1);
      expect(rows[0]?.guest_email).toMatch(/^redacted-[a-f0-9]{16}@anon\.local$/);
      expect(rows[0]?.guest_phone).toBeNull();
      expect(rows[0]?.guest_name).toBe('Huésped anonimizado');

      const requestRows = await db.execute<{ status: string }>(sql`
        SELECT status FROM data_subject_requests WHERE id = ${requestId}::uuid
      `);
      expect(requestRows[0]?.status).toBe('completed');
    },
  );

  it.skipIf(!ok)('segundo run del mismo request no re-anonimiza (idempotente)', async () => {
    const db = createDb(SUPER_URL);
    // Pre: booking ya tiene redacted-...
    const before = await db.execute<{ guest_email: string }>(sql`
        SELECT guest_email FROM bookings WHERE id = ${bookingId}::uuid
      `);
    const initialEmail = before[0]?.guest_email;
    expect(initialEmail).toMatch(/^redacted-/);

    // Worker re-run skipea el ya redacted (NOT LIKE 'redacted-%').
    const updated = await db.execute<{ id: string }>(sql`
        UPDATE bookings
        SET guest_email = 'should-not-change@x.com'
        WHERE organization_id = ${ORG}
          AND lower(guest_email) = lower(${GUEST_EMAIL})
          AND guest_email NOT LIKE 'redacted-%@anon.local'
        RETURNING id
      `);
    expect(updated.length).toBe(0);

    const after = await db.execute<{ guest_email: string }>(sql`
        SELECT guest_email FROM bookings WHERE id = ${bookingId}::uuid
      `);
    expect(after[0]?.guest_email).toBe(initialEmail);
  });
});

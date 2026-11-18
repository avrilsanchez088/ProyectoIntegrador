/**
 * Test cascade redaction de notifications + audit (propuesta 210.5 ronda 19).
 *
 * Setup:
 *  1. Org + tenant_settings
 *  2. Insertar in_app_notifications con data.email matching el target
 *  3. Insertar audit.events con old_row/new_row teniendo guest_email
 *  4. Ejecutar las UPDATE queries del worker GDPR (extracted inline)
 *  5. Verificar:
 *     - notifications.body reemplazado por '[contenido anonimizado por GDPR request]'
 *     - notifications.data quita email/phone/guest_name
 *     - audit.events.old_row|new_row.guest_email reemplazado por hash
 */
import { createDb, sql } from '@impacto/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { organizations, tenantSettings } from './schema/index';

const SUPER_URL =
  process.env.DATABASE_URL ??
  'postgres://impacto:impacto_dev_password_change_me@localhost:5433/impacto';

const ORG = `gdpr-cascade-test-${Date.now()}`;
const TARGET_EMAIL = `target-${Date.now()}@example.com`;
const ANON_EMAIL = 'redacted-deadbeef@anon.local';

async function pgAvailable(): Promise<boolean> {
  try {
    const db = createDb(SUPER_URL);
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

describe('GDPR cascade: notifications + audit', async () => {
  const ok = await pgAvailable();

  beforeAll(async () => {
    if (!ok) return;
    const db = createDb(SUPER_URL);
    await db
      .insert(organizations)
      .values({ id: ORG, name: 'GDPR Cascade Test', slug: `${ORG}-slug` })
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

    // 1. Insertar in_app_notifications con email en data.
    await db.execute(sql`
      INSERT INTO in_app_notifications
        (organization_id, user_id, category, severity, title, body, data)
      VALUES (
        ${ORG}, NULL, 'system', 'info',
        'Booking confirmed',
        ${`Reserva confirmada para ${TARGET_EMAIL}`},
        ${JSON.stringify({ email: TARGET_EMAIL, phone: '+598 99 555 555', guest_name: 'Juan' })}::jsonb
      )
    `);

    // 2. Insertar audit.events con old_row/new_row conteniendo guest_email.
    await db.execute(sql`
      INSERT INTO audit.events
        (organization_id, table_name, op, row_id, old_row, new_row, ts)
      VALUES (
        ${ORG}, 'bookings', 'U', 'fake-booking-1',
        ${JSON.stringify({ guest_email: TARGET_EMAIL, guest_phone: '+598 99 1', guest_name: 'Juan' })}::jsonb,
        ${JSON.stringify({ guest_email: TARGET_EMAIL, guest_phone: '+598 99 2', guest_name: 'Juan' })}::jsonb,
        now()
      )
    `);
  });

  afterAll(async () => {
    if (!ok) return;
    const db = createDb(SUPER_URL);
    await db.execute(sql`DELETE FROM in_app_notifications WHERE organization_id = ${ORG}`);
    await db.execute(sql`DELETE FROM audit.events WHERE organization_id = ${ORG}`);
    await db.delete(tenantSettings).where(eq(tenantSettings.id, ORG));
    await db.delete(organizations).where(eq(organizations.id, ORG));
  });

  it.skipIf(!ok)(
    'cascade anonimiza in_app_notifications y audit.events para el email target',
    async () => {
      const db = createDb(SUPER_URL);

      // Aplicamos las queries del worker (extracted inline).
      await db.execute(sql`
        UPDATE in_app_notifications
        SET body = '[contenido anonimizado por GDPR request]',
            data = COALESCE(data, '{}'::jsonb) - 'email' - 'phone' - 'guest_name'
        WHERE organization_id = ${ORG}
          AND (data->>'email' IS NOT NULL AND lower(data->>'email') = lower(${TARGET_EMAIL}))
      `);

      await db.execute(sql`
        UPDATE audit.events
        SET old_row = CASE
              WHEN old_row IS NOT NULL AND lower(old_row->>'guest_email') = lower(${TARGET_EMAIL})
                THEN jsonb_set(jsonb_set(jsonb_set(
                  old_row, '{guest_email}', to_jsonb(${ANON_EMAIL}::text)),
                  '{guest_phone}', 'null'::jsonb),
                  '{guest_name}', '"[REDACTED]"'::jsonb)
              ELSE old_row
            END,
            new_row = CASE
              WHEN new_row IS NOT NULL AND lower(new_row->>'guest_email') = lower(${TARGET_EMAIL})
                THEN jsonb_set(jsonb_set(jsonb_set(
                  new_row, '{guest_email}', to_jsonb(${ANON_EMAIL}::text)),
                  '{guest_phone}', 'null'::jsonb),
                  '{guest_name}', '"[REDACTED]"'::jsonb)
              ELSE new_row
            END
        WHERE organization_id = ${ORG}
          AND (
            lower(old_row->>'guest_email') = lower(${TARGET_EMAIL})
            OR lower(new_row->>'guest_email') = lower(${TARGET_EMAIL})
          )
      `);

      // Verificar notifications.
      const notifs = await db.execute<{ body: string; data: Record<string, unknown> }>(sql`
        SELECT body, data FROM in_app_notifications WHERE organization_id = ${ORG}
      `);
      expect(notifs.length).toBe(1);
      expect(notifs[0]?.body).toBe('[contenido anonimizado por GDPR request]');
      expect(notifs[0]?.data?.email).toBeUndefined();
      expect(notifs[0]?.data?.phone).toBeUndefined();
      expect(notifs[0]?.data?.guest_name).toBeUndefined();

      // Verificar audit.events. Filtramos por table_name='bookings' porque
      // los triggers automaticos sobre tenant_settings emiten events extras
      // (al hacer el upsert en beforeAll).
      const audits = await db.execute<{
        old_row: { guest_email: string; guest_phone: unknown; guest_name: string } | null;
        new_row: { guest_email: string; guest_phone: unknown; guest_name: string } | null;
      }>(sql`
        SELECT old_row, new_row FROM audit.events
        WHERE organization_id = ${ORG} AND table_name = 'bookings'
      `);
      expect(audits.length).toBe(1);
      expect(audits[0]?.old_row?.guest_email).toBe(ANON_EMAIL);
      expect(audits[0]?.new_row?.guest_email).toBe(ANON_EMAIL);
      expect(audits[0]?.old_row?.guest_phone).toBeNull();
      expect(audits[0]?.new_row?.guest_name).toBe('[REDACTED]');
    },
  );
});

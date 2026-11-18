import { expect, test } from './fixtures/auth';

/**
 * Test E2E del export con PII redaction (propuesta 203.5 ronda 18).
 *
 * Flow:
 *  1. Crear booking con guest_email/name/phone reales
 *  2. GET /api/settings/export sin redact → emails reales presentes
 *  3. GET /api/settings/export?redact=1 → emails reemplazados por
 *     `guest-N@redacted.local`, phone `***`, name `[REDACTED]`
 *  4. Verificar que `redacted: true` y `uniqueGuests` aparecen en metadata
 */

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3101';

test.describe('export con redact=1', () => {
  test('redact reemplaza guest_email/phone/name y preserva structure', async ({
    workspace,
    page,
  }) => {
    // Setup: property + unit + booking con PII real.
    const stamp = Date.now();
    const guestEmail = `real-guest-${stamp}@example.com`;
    const guestName = `Cliente Real ${stamp}`;
    const guestPhone = '+598 99 777 888';

    const propResp = await page.request.post(`${API_URL}/api/properties`, {
      data: {
        name: 'Export Test',
        slug: `exp-${stamp}`,
        propertyType: 'cabanas',
        country: 'UY',
      },
    });
    const property = (await propResp.json()).data;
    const unitResp = await page.request.post(`${API_URL}/api/units`, {
      data: {
        propertyId: property.id,
        name: 'Cabaña Exp',
        slug: 'cabana-exp',
        maxGuests: 2,
        petsAllowed: 'no',
      },
    });
    const unit = (await unitResp.json()).data;

    await page.request.post(`${API_URL}/api/bookings`, {
      data: {
        unitId: unit.id,
        code: `EXP-${stamp}`,
        source: 'manual',
        status: 'confirmed',
        checkIn: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        checkOut: new Date(Date.now() + 35 * 24 * 3600 * 1000).toISOString(),
        guestsCount: 2,
        guestName,
        guestEmail,
        guestPhone,
        currency: 'USD',
        totalCents: 50000,
      },
    });

    // ── Export sin redact: emails reales presentes ─────────────────
    const fullResp = await page.request.get(`${API_URL}/api/settings/export`);
    expect(fullResp.ok()).toBe(true);
    const full = await fullResp.json();
    expect(full.redacted).toBe(false);
    const fullBookings = full.bookings as Array<{
      guest_email: string;
      guest_phone: string | null;
      guest_name: string | null;
    }>;
    const ours = fullBookings.find((b) => b.guest_email === guestEmail);
    expect(ours, 'el booking creado debe aparecer con PII real').toBeDefined();
    expect(ours?.guest_phone).toBe(guestPhone);
    expect(ours?.guest_name).toBe(guestName);

    // ── Export con redact: PII reemplazada ─────────────────────────
    const redactedResp = await page.request.get(`${API_URL}/api/settings/export?redact=1`);
    expect(redactedResp.ok()).toBe(true);
    const redacted = await redactedResp.json();
    expect(redacted.redacted).toBe(true);

    const redactedBookings = redacted.bookings as Array<{
      guest_email: string;
      guest_phone: string | null;
      guest_name: string | null;
    }>;
    // El email real NO debe aparecer en ningún booking.
    const hasRealEmail = redactedBookings.some((b) => b.guest_email === guestEmail);
    expect(hasRealEmail, 'emails reales NO deben aparecer con redact=1').toBe(false);

    // Al menos uno debe tener la shape redacted-X@redacted.local.
    const redactedExample = redactedBookings.find((b) => b.guest_email?.startsWith('guest-'));
    expect(redactedExample).toBeDefined();
    expect(redactedExample?.guest_email).toMatch(/^guest-\d+@redacted\.local$/);
    expect(redactedExample?.guest_phone).toBe('***');
    expect(redactedExample?.guest_name).toBe('[REDACTED]');

    // Metadata uniqueGuests presente.
    expect(typeof redacted.metadata?.uniqueGuests).toBe('number');
  });
});

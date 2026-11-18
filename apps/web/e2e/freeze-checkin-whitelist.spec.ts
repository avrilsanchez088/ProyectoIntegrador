import { expect, test } from './fixtures/auth';

/**
 * Test E2E del flow whitelist: workspace frozen pero check-in permitido
 * porque está en `frozen_allow_ops` (propuesta 209.4 ronda 19).
 *
 * Flow:
 *  1. Crear property + unit + booking confirmed
 *  2. Como staff, congelar el workspace + agregar 'booking.checkin' a
 *     allow_ops
 *  3. Como user, POST /api/bookings/:id/checkin → debe pasar (200)
 *  4. POST /api/bookings/:id/checkout sin whitelist → debe 402
 *
 * Skipea si user no es staff (no podemos congelar).
 */

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3101';

test.describe('freeze + whitelist permite check-in', () => {
  test('checkin pasa cuando está en allow_ops, checkout sin whitelist 402', async ({
    workspace,
    page,
  }) => {
    const probe = await page.request.get(`${API_URL}/api/admin/stats`);
    if (probe.status() === 403) {
      test.skip(true, 'requires STAFF_EMAILS to include the test user');
    }

    // Setup: property + unit + booking
    const stamp = Date.now();
    const propResp = await page.request.post(`${API_URL}/api/properties`, {
      data: {
        name: 'Whitelist Test',
        slug: `wl-${stamp}`,
        propertyType: 'cabanas',
        country: 'UY',
      },
    });
    const property = (await propResp.json()).data;
    const unitResp = await page.request.post(`${API_URL}/api/units`, {
      data: {
        propertyId: property.id,
        name: 'Cabaña WL',
        slug: 'cabana-wl',
        maxGuests: 2,
        petsAllowed: 'no',
      },
    });
    const unit = (await unitResp.json()).data;
    const bookingResp = await page.request.post(`${API_URL}/api/bookings`, {
      data: {
        unitId: unit.id,
        code: `WL-${stamp}`,
        source: 'manual',
        status: 'confirmed',
        checkIn: new Date(Date.now() + 1 * 24 * 3600 * 1000).toISOString(),
        checkOut: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
        guestsCount: 2,
        currency: 'USD',
        totalCents: 40000,
      },
    });
    const booking = (await bookingResp.json()).data;

    // Congelar el workspace + setear whitelist con SOLO 'booking.checkin'
    const freezeRes = await page.request.post(
      `${API_URL}/api/admin/tenants/${workspace.orgId}/freeze`,
      { data: { frozen: true, reason: 'whitelist test' } },
    );
    expect(freezeRes.ok()).toBe(true);

    const allowRes = await page.request.patch(
      `${API_URL}/api/admin/tenants/${workspace.orgId}/freeze-allow-ops`,
      { data: { allowOps: ['booking.checkin'] } },
    );
    expect(allowRes.ok()).toBe(true);

    // checkin debe pasar (200) porque está en allow_ops.
    const checkinRes = await page.request.post(`${API_URL}/api/bookings/${booking.id}/checkin`);
    expect(checkinRes.status(), 'checkin debe pasar con whitelist activa').toBe(200);

    // checkout NO está en allow_ops — debe 402.
    const checkoutRes = await page.request.post(`${API_URL}/api/bookings/${booking.id}/checkout`);
    expect(checkoutRes.status(), 'checkout sin whitelist debe ser bloqueado con 402').toBe(402);

    // Cleanup: descongelar workspace para no afectar otros tests.
    await page.request.post(`${API_URL}/api/admin/tenants/${workspace.orgId}/freeze`, {
      data: { frozen: false },
    });
  });
});

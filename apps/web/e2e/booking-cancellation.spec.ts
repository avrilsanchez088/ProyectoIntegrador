import { expect, test } from './fixtures/auth';

/**
 * Cancellation flow + state machine transitions (propuesta 73.1 ronda 6).
 */

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3101';

test.describe('booking cancellation', () => {
  test('cancelar libera el slot — siguiente reserva en mismas fechas funciona', async ({
    workspace,
    page,
  }) => {
    const propResp = await page.request.post(`${API_URL}/api/properties`, {
      data: {
        name: 'Cancel Test',
        slug: `cancel-${Date.now()}`,
        propertyType: 'cabanas',
        country: 'UY',
      },
    });
    const property = (await propResp.json()).data;
    const unitResp = await page.request.post(`${API_URL}/api/units`, {
      data: {
        propertyId: property.id,
        name: 'Cabaña Cancel',
        slug: 'cabana-cancel',
        maxGuests: 2,
        petsAllowed: 'no',
      },
    });
    const unit = (await unitResp.json()).data;

    const checkIn = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const checkOut = new Date(Date.now() + 95 * 24 * 60 * 60 * 1000);

    // 1. Crear booking via API.
    const code = `CXL-${Date.now()}`;
    const bookingResp = await page.request.post(`${API_URL}/api/bookings`, {
      data: {
        unitId: unit.id,
        code,
        source: 'manual',
        status: 'confirmed',
        checkIn: checkIn.toISOString(),
        checkOut: checkOut.toISOString(),
        guestsCount: 2,
        petsCount: 0,
        currency: 'USD',
        totalCents: 30000,
      },
    });
    expect(bookingResp.ok()).toBe(true);
    const booking = (await bookingResp.json()).data;

    // 2. Cancelar via DELETE.
    const delResp = await page.request.delete(`${API_URL}/api/bookings/${booking.id}`);
    expect(delResp.ok()).toBe(true);

    // 3. Crear otra booking en mismas fechas — debería funcionar (slot libre).
    const code2 = `CXL2-${Date.now()}`;
    const booking2Resp = await page.request.post(`${API_URL}/api/bookings`, {
      data: {
        unitId: unit.id,
        code: code2,
        source: 'manual',
        status: 'confirmed',
        checkIn: checkIn.toISOString(),
        checkOut: checkOut.toISOString(),
        guestsCount: 2,
        petsCount: 0,
        currency: 'USD',
        totalCents: 30000,
      },
    });
    expect(booking2Resp.ok()).toBe(true);
  });
});

test.describe('state transitions', () => {
  test('confirmed → checked_in via PATCH', async ({ workspace, page }) => {
    const propResp = await page.request.post(`${API_URL}/api/properties`, {
      data: { name: 'Stm Test', slug: `stm-${Date.now()}`, propertyType: 'cabanas', country: 'UY' },
    });
    const property = (await propResp.json()).data;
    const unitResp = await page.request.post(`${API_URL}/api/units`, {
      data: {
        propertyId: property.id,
        name: 'Unit Stm',
        slug: 'unit-stm',
        maxGuests: 2,
        petsAllowed: 'no',
      },
    });
    const unit = (await unitResp.json()).data;

    const checkIn = new Date();
    const checkOut = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const bookingResp = await page.request.post(`${API_URL}/api/bookings`, {
      data: {
        unitId: unit.id,
        code: `STM-${Date.now()}`,
        source: 'manual',
        status: 'confirmed',
        checkIn: checkIn.toISOString(),
        checkOut: checkOut.toISOString(),
        guestsCount: 2,
        currency: 'USD',
        totalCents: 20000,
      },
    });
    const booking = (await bookingResp.json()).data;

    // PATCH a checked_in.
    const patchResp = await page.request.patch(`${API_URL}/api/bookings/${booking.id}`, {
      data: { status: 'checked_in' },
    });
    expect(patchResp.ok()).toBe(true);
    expect((await patchResp.json()).data.status).toBe('checked_in');

    // PATCH a checked_out.
    const patchResp2 = await page.request.patch(`${API_URL}/api/bookings/${booking.id}`, {
      data: { status: 'checked_out' },
    });
    expect(patchResp2.ok()).toBe(true);
    expect((await patchResp2.json()).data.status).toBe('checked_out');
  });
});

import { expect, test } from './fixtures/auth';

/**
 * Duplicar booking — propuesta 124.1 ronda 11.
 *
 * El botón "Duplicar" en /bookings/[id] linkea a /bookings/new con guestName,
 * guestEmail, guestPhone, guestsCount, petsCount en querystring. Verifica que
 * los inputs queden pre-rellenados.
 */

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3101';

test.describe('booking duplicate', () => {
  test('botón Duplicar pre-rellena el form de nueva reserva con datos del huésped', async ({
    workspace,
    page,
  }) => {
    // Setup: property + unit.
    const propResp = await page.request.post(`${API_URL}/api/properties`, {
      data: {
        name: 'Dup Test',
        slug: `dup-${Date.now()}`,
        propertyType: 'cabanas',
        country: 'UY',
      },
    });
    const property = (await propResp.json()).data;

    const unitResp = await page.request.post(`${API_URL}/api/units`, {
      data: {
        propertyId: property.id,
        name: 'Cabaña Dup',
        slug: 'cabana-dup',
        maxGuests: 4,
        petsAllowed: 'no',
      },
    });
    const unit = (await unitResp.json()).data;

    // Crear booking original con guest data completo.
    const checkIn = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
    const checkOut = new Date(Date.now() + 125 * 24 * 60 * 60 * 1000);
    const guestName = `Cliente Recurrente ${Date.now()}`;
    const guestEmail = `recurrente${Date.now()}@example.com`;
    const guestPhone = '+598 99 111 222';

    const bookingResp = await page.request.post(`${API_URL}/api/bookings`, {
      data: {
        unitId: unit.id,
        code: `DUP-${Date.now()}`,
        source: 'manual',
        status: 'confirmed',
        checkIn: checkIn.toISOString(),
        checkOut: checkOut.toISOString(),
        guestName,
        guestEmail,
        guestPhone,
        guestsCount: 3,
        petsCount: 1,
        currency: 'USD',
        totalCents: 45000,
      },
    });
    expect(bookingResp.ok()).toBe(true);
    const booking = (await bookingResp.json()).data;

    // Ir al detalle, click Duplicar.
    await page.goto(`/dashboard/bookings/${booking.id}`);
    await expect(page.getByRole('link', { name: /Duplicar/i })).toBeVisible({ timeout: 8_000 });
    await page.getByRole('link', { name: /Duplicar/i }).click();

    // El form de nueva reserva debe aparecer con los datos pre-rellenados.
    await expect(page).toHaveURL(/\/dashboard\/bookings\/new\?/);
    await expect(page.locator('input[name="guestName"]')).toHaveValue(guestName);
    await expect(page.locator('input[name="guestEmail"]')).toHaveValue(guestEmail);
    await expect(page.locator('input[name="guestPhone"]')).toHaveValue(guestPhone);
    await expect(page.locator('select[name="unitId"]')).toHaveValue(unit.id);
    // Pets count también debe propagarse (propuesta 147.7 ronda 12).
    const petsInput = page.locator('input[name="petsCount"]');
    if (await petsInput.count()) {
      await expect(petsInput).toHaveValue('1');
    }
    // Guests count también.
    const guestsInput = page.locator('input[name="guestsCount"]');
    if (await guestsInput.count()) {
      await expect(guestsInput).toHaveValue('3');
    }
  });
});

import { expect, test } from './fixtures/auth';

/**
 * Happy path: signup → workspace → property → unit → season → rate →
 * crear booking → ver detalle.
 *
 * Skipea si el API no está disponible (CI sin docker). En local + CI con
 * services postgres + redis levantados (e2e.yml workflow), corre completo.
 */

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3101';

test.describe('booking flow', () => {
  test('crear booking end-to-end con seed mínimo via API', async ({ workspace, page }) => {
    // 1. Crear property via API.
    const propResp = await page.request.post(`${API_URL}/api/properties`, {
      data: {
        name: 'E2E Test Property',
        slug: `e2e-prop-${Date.now()}`,
        propertyType: 'cabanas',
        country: 'UY',
      },
    });
    expect(propResp.ok()).toBe(true);
    const property = (await propResp.json()).data;

    // 2. Crear unit.
    const unitResp = await page.request.post(`${API_URL}/api/units`, {
      data: {
        propertyId: property.id,
        name: 'Cabaña Test',
        slug: 'cabana-test',
        maxGuests: 4,
        petsAllowed: 'no',
      },
    });
    expect(unitResp.ok()).toBe(true);
    const unit = (await unitResp.json()).data;

    // 3. Crear season.
    const today = new Date();
    const yearFromNow = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
    const seasonResp = await page.request.post(`${API_URL}/api/seasons`, {
      data: {
        propertyId: property.id,
        name: 'Test Season',
        seasonType: 'medium',
        startDate: today.toISOString().slice(0, 10),
        endDate: yearFromNow.toISOString().slice(0, 10),
      },
    });
    expect(seasonResp.ok()).toBe(true);
    const season = (await seasonResp.json()).data;

    // 4. Crear rate.
    const rateResp = await page.request.post(`${API_URL}/api/rates`, {
      data: {
        unitId: unit.id,
        seasonId: season.id,
        pricePerNightCents: 10000, // USD 100
        baseGuests: 2,
      },
    });
    expect(rateResp.ok()).toBe(true);

    // 5. Crear booking via UI.
    await page.goto('/dashboard/bookings/new');
    await expect(page.getByRole('heading', { name: /Nueva reserva/i })).toBeVisible();

    // Seleccionar la unit.
    await page.locator('select[name="unitId"]').selectOption(unit.id);

    // Fechas (próximos 5 días).
    const checkIn = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const checkOut = new Date(today.getTime() + 33 * 24 * 60 * 60 * 1000);
    await page.locator('input[name="checkInDate"]').fill(checkIn.toISOString().slice(0, 10));
    await page.locator('input[name="checkOutDate"]').fill(checkOut.toISOString().slice(0, 10));

    // Datos guest.
    await page.locator('input[name="guestName"]').fill('Juan E2E');
    await page.locator('input[name="guestPhone"]').fill('+598 99 555 555');

    // Submit.
    await page.getByRole('button', { name: /Crear reserva/i }).click();

    // Espera el redirect al listing.
    await expect(page).toHaveURL(/\/dashboard\/bookings$/, { timeout: 10_000 });
    // El listing tiene la booking con el guest name.
    await expect(page.getByText('Juan E2E').first()).toBeVisible({ timeout: 5_000 });
  });

  test('overlap dialog aparece cuando hay conflicto', async ({ workspace, page }) => {
    // Crear property + unit + season + rate (mismo helper inline).
    const propResp = await page.request.post(`${API_URL}/api/properties`, {
      data: {
        name: 'Overlap Test',
        slug: `overlap-${Date.now()}`,
        propertyType: 'cabanas',
        country: 'UY',
      },
    });
    const property = (await propResp.json()).data;
    const unitResp = await page.request.post(`${API_URL}/api/units`, {
      data: {
        propertyId: property.id,
        name: 'Unit Overlap',
        slug: 'unit-overlap',
        maxGuests: 2,
        petsAllowed: 'no',
      },
    });
    const unit = (await unitResp.json()).data;

    // Crear booking 1 directo via API (skip pricing — caller envía totalCents).
    const checkIn1 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const checkOut1 = new Date(Date.now() + 65 * 24 * 60 * 60 * 1000);
    const code1 = `OV-${Date.now()}`;
    await page.request.post(`${API_URL}/api/bookings`, {
      data: {
        unitId: unit.id,
        code: code1,
        source: 'manual',
        status: 'confirmed',
        checkIn: checkIn1.toISOString(),
        checkOut: checkOut1.toISOString(),
        guestsCount: 2,
        petsCount: 0,
        currency: 'USD',
        totalCents: 50000,
      },
    });

    // Intentar crear booking 2 en el mismo rango via UI.
    await page.goto('/dashboard/bookings/new');
    await page.locator('select[name="unitId"]').selectOption(unit.id);
    await page.locator('input[name="checkInDate"]').fill(checkIn1.toISOString().slice(0, 10));
    await page.locator('input[name="checkOutDate"]').fill(checkOut1.toISOString().slice(0, 10));
    await page.getByRole('button', { name: /Crear reserva/i }).click();

    // El OverlapDialog debe aparecer.
    await expect(page.getByText(/Conflicto de disponibilidad/i)).toBeVisible({ timeout: 8_000 });
  });
});

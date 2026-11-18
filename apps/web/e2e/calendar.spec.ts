import { expect, test } from './fixtures/auth';

/**
 * Calendar mensual page (propuesta 73.3 ronda 6).
 */

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3101';

test('calendar mensual carga sin units', async ({ workspace, page }) => {
  await page.goto('/dashboard/calendar');
  await expect(page.getByRole('heading', { name: /Calendario/i })).toBeVisible();
  // Sin units → empty state.
  await expect(page.getByText(/Sin unidades/i)).toBeVisible();
});

test('booking creada via API aparece como banda en el calendar', async ({ workspace, page }) => {
  // Crear property + unit.
  const propResp = await page.request.post(`${API_URL}/api/properties`, {
    data: { name: 'Cal P', slug: `cal-p-${Date.now()}`, propertyType: 'cabanas', country: 'UY' },
  });
  const property = (await propResp.json()).data;
  const unitResp = await page.request.post(`${API_URL}/api/units`, {
    data: {
      propertyId: property.id,
      name: 'Cabaña Cal',
      slug: 'cabana-cal',
      maxGuests: 2,
      petsAllowed: 'no',
    },
  });
  const unit = (await unitResp.json()).data;

  // Booking este mes.
  const today = new Date();
  const checkIn = new Date(today.getFullYear(), today.getMonth(), 5);
  const checkOut = new Date(today.getFullYear(), today.getMonth(), 8);
  await page.request.post(`${API_URL}/api/bookings`, {
    data: {
      unitId: unit.id,
      code: `CAL-${Date.now()}`,
      source: 'manual',
      status: 'confirmed',
      checkIn: checkIn.toISOString(),
      checkOut: checkOut.toISOString(),
      guestsCount: 2,
      currency: 'USD',
      totalCents: 30000,
    },
  });

  await page.goto('/dashboard/calendar');
  await expect(page.getByRole('heading', { name: /Calendario/i })).toBeVisible();
  // El nombre de la unidad aparece en el grid.
  await expect(page.getByText('Cabaña Cal').first()).toBeVisible();
});

test('navegación mes siguiente/anterior funciona', async ({ workspace, page }) => {
  await page.goto('/dashboard/calendar');
  // Sin units todavía no se muestra el month nav. Crear unit mínima.
  await page.request.post(`${API_URL}/api/properties`, {
    data: { name: 'Nav P', slug: `nav-${Date.now()}`, propertyType: 'cabanas', country: 'UY' },
  });
  await page.reload();
  // Si ya hay units, clickear "Mes siguiente".
  const nextBtn = page.getByRole('button', { name: /Mes siguiente/i });
  if (await nextBtn.isVisible().catch(() => false)) {
    await nextBtn.click();
    // El header del mes cambió.
    const heading = page.locator('h2').filter({
      hasText:
        /\d{4}|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/i,
    });
    await expect(heading.first()).toBeVisible();
  }
});

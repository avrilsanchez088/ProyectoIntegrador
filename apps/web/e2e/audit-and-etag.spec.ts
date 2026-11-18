import { expect, test } from './fixtures/auth';

/**
 * Tests para audit log + ETag round-trip (propuesta 113.1, 113.2 ronda 9).
 */

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3101';

test.describe('audit log endpoint', () => {
  test('owner ve audit page', async ({ workspace, page }) => {
    await page.goto('/dashboard/audit');
    // El page renderea el heading. La query puede devolver 0 eventos si no hay data — OK.
    await expect(page.getByRole('heading', { name: /Audit log/i })).toBeVisible();
  });

  test('owner consulta GET /api/audit/events', async ({ workspace, page }) => {
    const res = await page.request.get(`${API_URL}/api/audit/events?limit=5`);
    // Owner puede leer.
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('audit captura cambios después de crear booking', async ({ workspace, page }) => {
    // Crear property + unit + booking via API.
    const propResp = await page.request.post(`${API_URL}/api/properties`, {
      data: {
        name: 'Audit Test',
        slug: `audit-${Date.now()}`,
        propertyType: 'cabanas',
        country: 'UY',
      },
    });
    const property = (await propResp.json()).data;
    const unitResp = await page.request.post(`${API_URL}/api/units`, {
      data: {
        propertyId: property.id,
        name: 'Audit Unit',
        slug: 'audit-unit',
        maxGuests: 2,
        petsAllowed: 'no',
      },
    });
    const unit = (await unitResp.json()).data;

    const bookingResp = await page.request.post(`${API_URL}/api/bookings`, {
      data: {
        unitId: unit.id,
        code: `AUDIT-${Date.now()}`,
        source: 'manual',
        status: 'confirmed',
        checkIn: new Date(Date.now() + 30 * 86400_000).toISOString(),
        checkOut: new Date(Date.now() + 33 * 86400_000).toISOString(),
        guestsCount: 2,
        currency: 'USD',
        totalCents: 30000,
      },
    });
    const booking = (await bookingResp.json()).data;

    // Esperar un poco a que el trigger se materialice.
    await page.waitForTimeout(500);

    // Consultar audit filtrado por table=bookings.
    const auditRes = await page.request.get(`${API_URL}/api/audit/events?table=bookings&limit=20`);
    expect(auditRes.ok()).toBe(true);
    const events = (await auditRes.json()).data;

    // Hay al menos un evento de INSERT correspondiente al booking.
    const matching = events.find(
      (e: { row_id: string; op: string }) => e.row_id === booking.id && e.op === 'I',
    );
    expect(matching).toBeDefined();
  });
});

test.describe('ETag round-trip', () => {
  test('GET con If-None-Match devuelve 304', async ({ workspace, page }) => {
    // Primer GET — recibe ETag.
    const first = await page.request.get(`${API_URL}/api/properties`);
    expect(first.ok()).toBe(true);
    const etag = first.headers().etag;
    expect(etag).toBeTruthy();

    // Segundo GET con If-None-Match — debería ser 304.
    const second = await page.request.get(`${API_URL}/api/properties`, {
      headers: { 'If-None-Match': etag },
    });
    expect(second.status()).toBe(304);
  });

  test('POST invalida el ETag — siguiente GET devuelve 200 nuevo', async ({ workspace, page }) => {
    // Primer GET.
    const first = await page.request.get(`${API_URL}/api/properties`);
    const etag1 = first.headers().etag;

    // POST nuevo → invalida.
    await page.request.post(`${API_URL}/api/properties`, {
      data: {
        name: 'ETag Test',
        slug: `etag-${Date.now()}`,
        propertyType: 'cabanas',
        country: 'UY',
      },
    });

    // GET con el ETag viejo → ahora 200 con nuevo data + nuevo ETag.
    const second = await page.request.get(`${API_URL}/api/properties`, {
      headers: { 'If-None-Match': etag1 },
    });
    expect(second.status()).toBe(200);
    const etag2 = second.headers().etag;
    expect(etag2).toBeTruthy();
    expect(etag2).not.toBe(etag1);
  });
});

import { expect, test } from './fixtures/auth';

/**
 * Test RLS de audit.events (propuesta 147.2 ronda 12).
 *
 * Verifica que un tenant B no puede leer eventos del tenant A. Más allá del
 * filtro WHERE en el endpoint /api/audit/events, queremos confirmar que
 * la policy RLS impuesta por el tenant context efectivamente bloquea reads
 * cross-tenant.
 *
 * Estrategia:
 *  1. Crear user A + workspace A, generar 1 booking (audit event).
 *  2. Crear user B + workspace B (logout/login implícito por contexto fresh).
 *  3. Como user B, llamar /api/audit/events.
 *  4. Verificar que NO aparece el row_id del booking del tenant A.
 *
 * Por simplicidad usamos browser contexts separados — cada uno con su sesión.
 */

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3101';

test.describe('audit RLS isolation', () => {
  test('tenant B no ve eventos del tenant A', async ({ browser }) => {
    // ── Tenant A ───────────────────────────────────────────────────
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    const stampA = Date.now();
    const emailA = `rls-a-${stampA}@test.local`;
    await pageA.request.post(`${API_URL}/api/auth/sign-up/email`, {
      data: { email: emailA, password: 'TestPass!123', name: 'A' },
    });
    const orgRespA = await pageA.request.post(`${API_URL}/api/auth/organization/create`, {
      data: { name: `RLS A ${stampA}`, slug: `rls-a-${stampA}` },
    });
    const orgA = (await orgRespA.json()) as { id?: string; data?: { id: string } };
    const orgIdA = orgA.id ?? orgA.data?.id;
    await pageA.request.post(`${API_URL}/api/auth/organization/set-active`, {
      data: { organizationId: orgIdA },
    });

    // Crear property + unit + booking en tenant A.
    const propA = (
      await (
        await pageA.request.post(`${API_URL}/api/properties`, {
          data: {
            name: 'A prop',
            slug: `rls-prop-a-${stampA}`,
            propertyType: 'cabanas',
            country: 'UY',
          },
        })
      ).json()
    ).data;
    const unitA = (
      await (
        await pageA.request.post(`${API_URL}/api/units`, {
          data: {
            propertyId: propA.id,
            name: 'A unit',
            slug: 'a-unit',
            maxGuests: 2,
            petsAllowed: 'no',
          },
        })
      ).json()
    ).data;
    const bookingA = (
      await (
        await pageA.request.post(`${API_URL}/api/bookings`, {
          data: {
            unitId: unitA.id,
            code: `RLS-A-${stampA}`,
            source: 'manual',
            status: 'confirmed',
            checkIn: new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString(),
            checkOut: new Date(Date.now() + 65 * 24 * 3600 * 1000).toISOString(),
            guestsCount: 2,
            currency: 'USD',
            totalCents: 50000,
          },
        })
      ).json()
    ).data;

    // Verificar que en A sí aparece.
    const eventsA = await (await pageA.request.get(`${API_URL}/api/audit/events?limit=50`)).json();
    const sawInA = eventsA.data.some((e: { row_id: string | null }) => e.row_id === bookingA.id);
    expect(sawInA, 'tenant A debería ver su propio booking en audit').toBe(true);

    // ── Tenant B ───────────────────────────────────────────────────
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    const stampB = Date.now() + 1;
    const emailB = `rls-b-${stampB}@test.local`;
    await pageB.request.post(`${API_URL}/api/auth/sign-up/email`, {
      data: { email: emailB, password: 'TestPass!123', name: 'B' },
    });
    const orgRespB = await pageB.request.post(`${API_URL}/api/auth/organization/create`, {
      data: { name: `RLS B ${stampB}`, slug: `rls-b-${stampB}` },
    });
    const orgB = (await orgRespB.json()) as { id?: string; data?: { id: string } };
    const orgIdB = orgB.id ?? orgB.data?.id;
    await pageB.request.post(`${API_URL}/api/auth/organization/set-active`, {
      data: { organizationId: orgIdB },
    });

    // GET /api/audit/events desde tenant B — debería NO contener bookingA.id.
    const eventsB = await (await pageB.request.get(`${API_URL}/api/audit/events?limit=200`)).json();
    const leaked = eventsB.data.some((e: { row_id: string | null }) => e.row_id === bookingA.id);
    expect(leaked, 'tenant B NO debería ver eventos del tenant A').toBe(false);

    await ctxA.close();
    await ctxB.close();
  });
});

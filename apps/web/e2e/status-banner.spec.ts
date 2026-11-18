import { expect, test } from './fixtures/auth';

/**
 * Test E2E que verifica que un announcement creado vía /api/admin/announcements
 * aparece en el StatusBanner del dashboard (propuesta 155.1 ronda 13).
 *
 * Skipea si el user no es staff (STAFF_EMAILS env). El POST devuelve 403
 * en ese caso y no podemos crear el announcement.
 */

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3101';

test.describe('StatusBanner muestra announcement', () => {
  test('warning recién creado aparece y se puede dismiss', async ({ workspace, page }) => {
    const stamp = Date.now();
    const message = `e2e-banner-${stamp}`;

    const created = await page.request.post(`${API_URL}/api/admin/announcements`, {
      data: { severity: 'warning', message },
    });
    if (created.status() === 403) {
      test.skip(true, 'requires STAFF_EMAILS to include the test user');
    }
    expect(created.ok()).toBe(true);

    // Limpiar localStorage para asegurar que no esté pre-dismissed.
    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem('impacto.dismissedAnnouncements');
      } catch {}
    });

    await page.goto('/dashboard');
    // El banner aparece como elemento role=status conteniendo el mensaje.
    await expect(page.getByRole('status').filter({ hasText: message })).toBeVisible({
      timeout: 8_000,
    });

    // Dismiss y verificar que desaparece.
    await page
      .getByRole('status')
      .filter({ hasText: message })
      .getByRole('button', { name: /Cerrar aviso/i })
      .click();
    await expect(page.getByRole('status').filter({ hasText: message })).not.toBeVisible();
  });
});

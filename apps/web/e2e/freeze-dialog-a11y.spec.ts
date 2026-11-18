import { expect, test } from './fixtures/auth';

/**
 * Test de accessibility del freeze dialog (propuesta 178.4 ronda 15).
 *
 * Verifica:
 *  - role="dialog" + aria-modal="true" + aria-labelledby
 *  - Escape cierra el dialog
 *  - Click fuera (overlay) cierra el dialog
 *  - El título tiene id que matchea aria-labelledby
 *
 * Skipea si el user no es staff. Para análisis a11y profundo (axe-core)
 * pendiente — esto cubre el contrato básico del dialog.
 */

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3101';

test.describe('freeze dialog accessibility', () => {
  test('dialog tiene aria-modal + escape cierra', async ({ workspace, page }) => {
    const probe = await page.request.get(`${API_URL}/api/admin/stats`);
    if (probe.status() === 403) {
      test.skip(true, 'requires STAFF_EMAILS');
    }

    await page.goto(`/admin/tenants/${workspace.orgId}`);
    await page.getByRole('button', { name: /^Congelar$/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    // El aria-labelledby debe apuntar a un id existente.
    const labelledBy = await dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    if (labelledBy) {
      await expect(page.locator(`#${labelledBy}`)).toBeVisible();
    }

    // Escape cierra.
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('click en overlay cierra el dialog', async ({ workspace, page }) => {
    const probe = await page.request.get(`${API_URL}/api/admin/stats`);
    if (probe.status() === 403) {
      test.skip(true, 'requires STAFF_EMAILS');
    }

    await page.goto(`/admin/tenants/${workspace.orgId}`);
    await page.getByRole('button', { name: /^Congelar$/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Click en overlay (afuera de la card).
    const box = await dialog.boundingBox();
    if (box) {
      await page.mouse.click(box.x - 10, box.y - 10);
    }
    await expect(dialog).not.toBeVisible();
  });
});

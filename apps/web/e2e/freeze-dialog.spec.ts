import { expect, test } from './fixtures/auth';

/**
 * Test E2E del dialog de freeze con motivos templated (propuesta 167.1 ronda 14).
 *
 * Flow:
 *  1. workspace fixture crea user + org
 *  2. va a /admin/tenants/<orgId>
 *  3. click "Congelar" → abre dialog
 *  4. click template "Factura impaga" → textarea pre-rellenado con
 *     `unpaid_invoice:`
 *  5. click "Congelar workspace" → tenant queda frozen con esa razón
 *
 * Skipea si el user no es staff (STAFF_EMAILS env). El backend devuelve 403
 * en /api/admin/* en ese caso.
 */

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3101';

test.describe('admin freeze dialog templated', () => {
  test('motivo template pre-rellena textarea + freeze persiste', async ({ workspace, page }) => {
    // Probe staff access antes del UI flow.
    const probe = await page.request.get(`${API_URL}/api/admin/stats`);
    if (probe.status() === 403) {
      test.skip(true, 'requires STAFF_EMAILS to include the test user');
    }

    await page.goto(`/admin/tenants/${workspace.orgId}`);
    await expect(page.getByRole('heading', { name: workspace.orgName })).toBeVisible({
      timeout: 8_000,
    });

    // Click "Congelar".
    await page.getByRole('button', { name: /^Congelar$/i }).click();

    // Dialog visible.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Click template "Factura impaga".
    await dialog.getByRole('button', { name: /Factura impaga/i }).click();
    const textarea = dialog.getByLabel(/Motivo \(visible al dueño/i);
    await expect(textarea).toHaveValue(/^unpaid_invoice:/);

    // Confirmar.
    await dialog.getByRole('button', { name: /Congelar workspace/i }).click();

    // Espera que el banner "Workspace congelado" aparezca.
    await expect(page.getByText(/Workspace congelado/i)).toBeVisible({
      timeout: 8_000,
    });

    // Verificar que el reason persistió vía API.
    const detail = await page.request.get(`${API_URL}/api/admin/tenants/${workspace.orgId}`);
    const body = await detail.json();
    expect(body.data.tenant.frozen).toBe(true);
    expect(String(body.data.tenant.frozen_reason ?? '')).toMatch(/^unpaid_invoice:/);
  });
});

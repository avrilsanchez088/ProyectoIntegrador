import { expect, test } from './fixtures/auth';

/**
 * Flujo crítico: signup → workspace → dashboard → crear primera property.
 * Usa los fixtures de auth.ts (nuevos en ronda 5).
 */

test('user con sesión accede al dashboard sin redirect', async ({ authedPage }) => {
  await authedPage.goto('/dashboard');
  // No debe redirigir a /sign-in.
  await expect(authedPage).not.toHaveURL(/sign-in/);
  // Si tiene sesión pero sin workspace, debe ofrecer crearlo.
  await expect(authedPage.getByText(/workspace/i)).toBeVisible();
});

test('workspace seeded muestra empty state de properties', async ({ workspace, page }) => {
  await page.goto('/dashboard/properties');
  // Sin properties aún.
  await expect(page.getByText(/Tu primera propiedad/i)).toBeVisible();
  // El botón existe.
  await expect(page.getByRole('link', { name: /Crear propiedad/i }).first()).toBeVisible();
});

test('command palette abre con Ctrl+K', async ({ workspace, page }) => {
  await page.goto('/dashboard');
  await page.keyboard.press('Control+K');
  await expect(page.getByPlaceholder(/Buscar páginas/i)).toBeVisible();
});

test('settings page muestra apariencia + workspace', async ({ workspace, page }) => {
  await page.goto('/dashboard/settings');
  await expect(page.getByRole('heading', { name: /Configuración/i })).toBeVisible();
  await expect(page.getByText(/Apariencia/i)).toBeVisible();
  await expect(page.getByText(/Workspace/i).first()).toBeVisible();
});

import { expect, test } from '@playwright/test';

/**
 * Smoke E2E mínimo (G4.1).
 *
 * Verifica que el dev server responda, la landing renderice y el middleware
 * de auth proteja /dashboard. Tests más profundos (signup → workspace →
 * property) van en archivos separados conforme se vayan agregando.
 */

test.describe('public pages', () => {
  test('landing renderiza el header de Impacto', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Impacto/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('sign-in es accesible sin sesión', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: /Iniciar sesión/i })).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test('forgot-password tiene fallback informativo (M13 pendiente)', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: /Recuperar contraseña/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Volver al inicio de sesión/i })).toBeVisible();
  });
});

test.describe('protected routes', () => {
  test('/dashboard sin sesión redirige a /sign-in', async ({ page }) => {
    const response = await page.goto('/dashboard');
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/sign-in/);
    expect(page.url()).toContain('redirect=%2Fdashboard');
  });

  test('/dashboard/team sin sesión redirige a /sign-in', async ({ page }) => {
    await page.goto('/dashboard/team');
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe('a11y básica', () => {
  test('skip-to-content link aparece al focus', async ({ page }) => {
    await page.goto('/');
    // El link existe pero está sr-only por default; al hacer focus se hace visible.
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: /Saltar al contenido/i });
    await expect(skipLink).toBeFocused();
  });
});

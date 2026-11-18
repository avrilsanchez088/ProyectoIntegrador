import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config para apps/web (G4.1 / §4.1 del audit).
 *
 * Tests viven en `e2e/` (separado de los unit tests Vitest que matchean
 * `src/__/_.test.ts`). Por defecto corre contra http://localhost:3100 —
 * el target del dev server. Requiere `pnpm dev` corriendo en otra terminal,
 * o setear el flag `webServer.command` para que Playwright lo levante.
 *
 * Para correr:
 *   cd apps/web
 *   pnpm exec playwright install chromium  # primera vez
 *   pnpm test:e2e
 *
 * En CI: el `webServer` se activa automáticamente si `process.env.CI=1`.
 */
const PORT = 3100;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Auto-start del dev server solo en CI. En local asumir que el dev ya está
  // corriendo (el user invoca `pnpm dev` en otra ventana).
  webServer: process.env.CI
    ? {
        command: 'pnpm dev',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
});

import { type Page, test as base } from '@playwright/test';

/**
 * Fixtures Playwright para auth + workspace seeding (G14.1 / Ronda 3 propuesta
 * 14.1 + §4.1 follow-up).
 *
 * Uso:
 *   import { test, expect } from './fixtures/auth';
 *
 *   test('user con sesión ve dashboard', async ({ authedPage }) => {
 *     await authedPage.goto('/dashboard');
 *     await expect(authedPage).toHaveURL(/dashboard/);
 *   });
 *
 *   test('workspace seeded tiene 1 property', async ({ workspace }) => {
 *     // workspace.orgId, workspace.email, workspace.password disponibles
 *   });
 *
 * Estos fixtures usan el API real (no mocks) — requieren la stack levantada
 * (`docker compose up postgres redis` + `pnpm dev`). En CI el workflow
 * `e2e.yml` ya las levanta.
 */

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3101';

interface TestUser {
  email: string;
  password: string;
  name: string;
}

interface SeededWorkspace {
  orgId: string;
  orgName: string;
  user: TestUser;
}

/** Crea un user único por test (email random) via Better Auth API. */
async function createTestUser(page: Page): Promise<TestUser> {
  const stamp = Date.now() + Math.floor(Math.random() * 1_000_000);
  const user: TestUser = {
    email: `pw-${stamp}@test.local`,
    password: 'TestPassword!123',
    name: `Test ${stamp}`,
  };

  // Llamamos al API directamente (no via UI) para evitar dependencia visual.
  const res = await page.request.post(`${API_URL}/api/auth/sign-up/email`, {
    data: {
      email: user.email,
      password: user.password,
      name: user.name,
    },
  });
  if (!res.ok()) {
    throw new Error(`sign-up failed: ${res.status()} ${await res.text()}`);
  }
  return user;
}

/**
 * Crea workspace para el user vía API. Asume que la sesión ya está válida
 * (sign-up auto-loguea y devuelve cookie).
 */
async function createTestWorkspace(page: Page, user: TestUser): Promise<SeededWorkspace> {
  const orgName = `Test Workspace ${Date.now()}`;
  const slug = `test-ws-${Date.now()}`;

  // Better Auth org plugin endpoint.
  const res = await page.request.post(`${API_URL}/api/auth/organization/create`, {
    data: { name: orgName, slug },
  });
  if (!res.ok()) {
    throw new Error(`create org failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id?: string; data?: { id: string } };
  const orgId = body.id ?? body.data?.id;
  if (!orgId) throw new Error('No orgId returned');

  // Setear como activeOrganization para que /api/* respete RLS.
  await page.request.post(`${API_URL}/api/auth/organization/set-active`, {
    data: { organizationId: orgId },
  });

  return { orgId, orgName, user };
}

interface Fixtures {
  /** User registrado pero sin workspace activo. */
  testUser: TestUser;
  /** Page autenticada (cookie de sesión presente). */
  authedPage: Page;
  /** Workspace seedeado con user logueado y org activa. */
  workspace: SeededWorkspace;
}

export const test = base.extend<Fixtures>({
  testUser: async ({ page }, use) => {
    const user = await createTestUser(page);
    await use(user);
  },

  authedPage: async ({ page }, use) => {
    await createTestUser(page);
    await use(page);
  },

  workspace: async ({ page }, use) => {
    const user = await createTestUser(page);
    const ws = await createTestWorkspace(page, user);
    await use(ws);
  },
});

export { expect } from '@playwright/test';

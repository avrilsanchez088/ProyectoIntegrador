import { type Page, test as base } from '@playwright/test';

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3101';
const WEB_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3100';

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

async function createTestUser(page: Page): Promise<TestUser> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const user: TestUser = {
    email: `pw-${stamp}@test.local`,
    password: 'TestPassword!123',
    name: `Test ${stamp}`,
  };

  const res = await page.request.post(`${API_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_ORIGIN },
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

async function createTestWorkspace(page: Page, user: TestUser): Promise<SeededWorkspace> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const orgName = `Test Workspace ${stamp}`;
  const slug = `test-ws-${stamp}`;

  const headers = { Origin: WEB_ORIGIN };

  const res = await page.request.post(`${API_URL}/api/auth/organization/create`, {
    headers,
    data: { name: orgName, slug },
  });

  if (!res.ok()) {
    throw new Error(`create org failed: ${res.status()} ${await res.text()}`);
  }

  const body = (await res.json()) as {
    id?: string;
    data?: { id?: string };
  };
  const orgId = body.id ?? body.data?.id;

  if (!orgId) {
    throw new Error('No orgId returned when creating workspace');
  }

  const activeRes = await page.request.post(`${API_URL}/api/auth/organization/set-active`, {
    headers,
    data: { organizationId: orgId },
  });

  if (!activeRes.ok()) {
    throw new Error(
      `set active organization failed: ${activeRes.status()} ${await activeRes.text()}`,
    );
  }

  return { orgId, orgName, user };
}

interface Fixtures {
  testUser: TestUser;
  authedPage: Page;
  workspace: SeededWorkspace;
}

export const test = base.extend<Fixtures>({
  testUser: async ({ page }, use) => {
    await use(await createTestUser(page));
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

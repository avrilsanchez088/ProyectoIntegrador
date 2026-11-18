import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from './auth.js';
import { enforceLimit } from './plan-limits.js';

/**
 * Unit tests para enforceLimit (propuesta 167.4 ronda 14).
 *
 * Mockeamos `getTenantDb` retornando un fake con shape mínimo. Verificamos
 * que el middleware:
 *  - permite GET / PATCH / DELETE siempre
 *  - permite POST si plan = null (sin enforce)
 *  - permite POST si plan tiene la key pero count < limit
 *  - bloquea con 402 si count >= limit
 *  - permite si la query DB falla (degraded-open)
 */

interface Scenario {
  plan: string | null;
  count: number;
}

function makeApp(scenario: Scenario | Error) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              if (scenario instanceof Error) throw scenario;
              return [{ plan: scenario.plan }];
            },
          }),
        }),
      }),
      execute: async () => {
        if (scenario instanceof Error) throw scenario;
        return [{ c: scenario.count }];
      },
    };
    c.set('db', fakeDb as never);
    c.set('session', {
      activeOrganizationId: 'org-1',
      userId: 'user-1',
    } as never);
    await next();
  });
  app.use('*', enforceLimit('properties'));
  app.get('/probe', (c) => c.json({ ok: true }));
  app.post('/probe', (c) => c.json({ ok: true }));
  app.patch('/probe', (c) => c.json({ ok: true }));
  app.delete('/probe', (c) => c.json({ ok: true }));
  return app;
}

describe('enforceLimit middleware', () => {
  it('GET nunca bloquea', async () => {
    const app = makeApp({ plan: 'free', count: 100 });
    const res = await app.request('/probe', { method: 'GET' });
    expect(res.status).toBe(200);
  });

  it('PATCH nunca bloquea', async () => {
    const app = makeApp({ plan: 'free', count: 100 });
    const res = await app.request('/probe', { method: 'PATCH' });
    expect(res.status).toBe(200);
  });

  it('DELETE nunca bloquea', async () => {
    const app = makeApp({ plan: 'free', count: 100 });
    const res = await app.request('/probe', { method: 'DELETE' });
    expect(res.status).toBe(200);
  });

  it('POST con plan=null pasa (sin enforcement)', async () => {
    const app = makeApp({ plan: null, count: 100 });
    const res = await app.request('/probe', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('POST con plan=free + count < limit pasa', async () => {
    const app = makeApp({ plan: 'free', count: 0 });
    const res = await app.request('/probe', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('POST con plan=free + count = limit devuelve 402', async () => {
    // free tiene properties=1
    const app = makeApp({ plan: 'free', count: 1 });
    const res = await app.request('/probe', { method: 'POST' });
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string; resource: string };
    expect(body.error).toBe('plan_limit_exceeded');
    expect(body.resource).toBe('properties');
  });

  it('POST con plan=starter + count = 3 (límite) devuelve 402', async () => {
    // starter tiene properties=3
    const app = makeApp({ plan: 'starter', count: 3 });
    const res = await app.request('/probe', { method: 'POST' });
    expect(res.status).toBe(402);
  });

  it('POST con plan custom (no en mapa) pasa siempre', async () => {
    const app = makeApp({ plan: 'enterprise-custom', count: 9999 });
    const res = await app.request('/probe', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('si DB falla, deja pasar (degraded-open)', async () => {
    const app = makeApp(new Error('connection refused'));
    const res = await app.request('/probe', { method: 'POST' });
    expect(res.status).toBe(200);
  });
});

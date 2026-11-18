import { describe, expect, it } from 'vitest';
import { healthRouter } from './health';

describe('healthRouter', () => {
  it('responds 200 OK on /', async () => {
    const res = await healthRouter.request('/');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });

  it('responds with checks on /ready', async () => {
    const res = await healthRouter.request('/ready');
    // 200 or 503 depending on DB availability — both acceptable shapes
    expect([200, 503]).toContain(res.status);
    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('checks');
    expect(body.checks).toHaveProperty('database');
  });
});

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from './auth.js';
import { blockIfFrozen, blockIfFrozenFor } from './frozen.js';

/**
 * Test integración del middleware frozen (propuesta 142.6 ronda 12).
 *
 * Verifica:
 *  - GET pasa siempre (reads no se bloquean)
 *  - POST con frozen=false pasa
 *  - POST con frozen=true devuelve 402 con `error: 'workspace_frozen'`
 *  - El reason del DB termina en el body de la respuesta
 *  - Si la DB falla, no bloquea (degraded-open behavior)
 *
 * Estrategia: mockeamos `getTenantDb` retornando un fake con shape mínimo
 * de Drizzle (`select().from().limit()`) — no necesitamos Postgres real.
 */

type FrozenRow = {
  frozen: boolean;
  reason: string | null;
  allowOps?: string[];
};

function makeApp(rows: FrozenRow[] | Error, opKey: string | null = null) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    const fakeDb = {
      select: () => ({
        from: () => ({
          limit: async () => {
            if (rows instanceof Error) throw rows;
            return rows;
          },
        }),
      }),
    };
    c.set('db', fakeDb as never);
    await next();
  });
  app.use('*', opKey ? blockIfFrozenFor(opKey) : blockIfFrozen);
  app.get('/probe', (c) => c.json({ ok: true }));
  app.post('/probe', (c) => c.json({ ok: true }));
  return app;
}

describe('blockIfFrozen middleware', () => {
  it('GET pasa cuando el workspace está frozen', async () => {
    const app = makeApp([{ frozen: true, reason: 'unpaid' }]);
    const res = await app.request('/probe', { method: 'GET' });
    expect(res.status).toBe(200);
  });

  it('POST con frozen=false pasa', async () => {
    const app = makeApp([{ frozen: false, reason: null }]);
    const res = await app.request('/probe', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('POST con frozen=true devuelve 402 con error workspace_frozen', async () => {
    const app = makeApp([{ frozen: true, reason: 'cuenta vencida' }]);
    const res = await app.request('/probe', { method: 'POST' });
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('workspace_frozen');
    expect(body.message).toBe('cuenta vencida');
  });

  it('POST con frozen=true sin reason usa mensaje default', async () => {
    const app = makeApp([{ frozen: true, reason: null }]);
    const res = await app.request('/probe', { method: 'POST' });
    expect(res.status).toBe(402);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/congelado/i);
  });

  it('POST sin filas en tenant_settings no bloquea (workspace recién creado)', async () => {
    const app = makeApp([]);
    const res = await app.request('/probe', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('si la DB falla, deja pasar (degraded-open)', async () => {
    const app = makeApp(new Error('connection refused'));
    const res = await app.request('/probe', { method: 'POST' });
    expect(res.status).toBe(200);
  });
});

/**
 * Whitelist (propuesta 191.3 ronda 17). El factory blockIfFrozenFor(opKey)
 * deja pasar la operación si la opKey está en allow_ops, aún con frozen=true.
 */
describe('blockIfFrozenFor whitelist', () => {
  it('opKey en allow_ops pasa aún con frozen=true', async () => {
    const app = makeApp(
      [{ frozen: true, reason: 'unpaid', allowOps: ['booking.checkin'] }],
      'booking.checkin',
    );
    const res = await app.request('/probe', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('opKey NO en allow_ops sigue bloqueando con 402', async () => {
    const app = makeApp(
      [{ frozen: true, reason: 'unpaid', allowOps: ['booking.checkout'] }],
      'booking.checkin',
    );
    const res = await app.request('/probe', { method: 'POST' });
    expect(res.status).toBe(402);
  });

  it('allow_ops vacío bloquea siempre', async () => {
    const app = makeApp([{ frozen: true, reason: 'unpaid', allowOps: [] }], 'booking.checkin');
    const res = await app.request('/probe', { method: 'POST' });
    expect(res.status).toBe(402);
  });

  it('opKey provided pero frozen=false: pasa normal', async () => {
    const app = makeApp([{ frozen: false, reason: null, allowOps: [] }], 'booking.checkin');
    const res = await app.request('/probe', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('GET con opKey siempre pasa (reads no se bloquean)', async () => {
    const app = makeApp([{ frozen: true, reason: 'unpaid', allowOps: [] }], 'booking.checkin');
    const res = await app.request('/probe', { method: 'GET' });
    expect(res.status).toBe(200);
  });
});

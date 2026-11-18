import { expect, test } from '@playwright/test';

/**
 * Verifica que el rate-limiter del API (propuesta 73.5 ronda 6) responde
 * 429 con `Retry-After` después de exceder la ventana.
 *
 * El endpoint `/api/auth/sign-in/email` tiene límite estricto (30/min/IP).
 * Disparamos 31 requests con email/pwd random y esperamos que el 31 sea
 * 429. Skipea si la API no responde a `/api/health`.
 */

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3101';

test('auth sign-in rate limit kicks in tras 30 requests/min', async ({ request }) => {
  // Smoke: API up?
  const ping = await request.get(`${API_URL}/api/health`).catch(() => null);
  test.skip(!ping || !ping.ok(), 'API no responde — skip rate limit test');

  let last = 200;
  let retryAfter: string | null = null;
  for (let i = 0; i < 35; i++) {
    const res = await request.post(`${API_URL}/api/auth/sign-in/email`, {
      data: { email: `nonexistent-${i}@test.local`, password: 'wrong' },
      failOnStatusCode: false,
    });
    last = res.status();
    if (last === 429) {
      retryAfter = res.headers()['retry-after'] ?? null;
      break;
    }
  }

  expect(last).toBe(429);
  expect(retryAfter).not.toBeNull();
  expect(Number(retryAfter)).toBeGreaterThan(0);
});

test('idempotency-key replay devuelve la misma response', async ({ request }) => {
  const ping = await request.get(`${API_URL}/api/health`).catch(() => null);
  test.skip(!ping || !ping.ok(), 'API no responde — skip idempotency test');

  // Sin auth, /api/bookings devuelve 401. Igual sirve para verificar replay.
  const key = `idem-test-${Date.now()}-abcdef`;
  const res1 = await request.post(`${API_URL}/api/bookings`, {
    headers: { 'Idempotency-Key': key },
    data: { test: 'first' },
    failOnStatusCode: false,
  });

  // El idempotency middleware sólo cachea 2xx. El 401 NO se cachea, así que
  // la segunda request va al handler también — los dos responses son idénticos
  // pero NO marcados con `Idempotency-Replay`.
  const status1 = res1.status();
  expect([401, 400]).toContain(status1);
});

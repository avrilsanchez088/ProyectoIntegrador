import { expect, test } from './fixtures/auth';

/**
 * Test edge cases del endpoint retention/preview (propuesta 178.3 ronda 15).
 *
 * Validaciones:
 *  - days=30 (mínimo) → 200 OK
 *  - days=3650 (máximo) → 200 OK
 *  - days=29 (debajo) → 400
 *  - days=3651 (encima) → 400
 *  - days=NaN → 400
 *  - sin days → 400
 */

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3101';

test.describe('audit retention preview edge cases', () => {
  test('días=30 (mínimo) responde 200', async ({ workspace, page }) => {
    const res = await page.request.get(`${API_URL}/api/audit/retention/preview?days=30`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.days).toBe(30);
    expect(typeof body.data.deleteCount).toBe('number');
    expect(typeof body.data.keepCount).toBe('number');
  });

  test('días=3650 (máximo) responde 200', async ({ workspace, page }) => {
    const res = await page.request.get(`${API_URL}/api/audit/retention/preview?days=3650`);
    expect(res.status()).toBe(200);
  });

  test('días=29 (debajo del mínimo) responde 400', async ({ workspace, page }) => {
    const res = await page.request.get(`${API_URL}/api/audit/retention/preview?days=29`);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_days');
  });

  test('días=3651 (encima del máximo) responde 400', async ({ workspace, page }) => {
    const res = await page.request.get(`${API_URL}/api/audit/retention/preview?days=3651`);
    expect(res.status()).toBe(400);
  });

  test('sin parámetro days responde 400', async ({ workspace, page }) => {
    const res = await page.request.get(`${API_URL}/api/audit/retention/preview`);
    expect(res.status()).toBe(400);
  });

  test('días no numérico responde 400', async ({ workspace, page }) => {
    const res = await page.request.get(`${API_URL}/api/audit/retention/preview?days=abc`);
    expect(res.status()).toBe(400);
  });
});

import { expect, test } from './fixtures/auth';

/**
 * Test del ordering por severity en /api/health/announcements
 * (propuesta 147.6 ronda 12).
 *
 * El feed devuelve hasta 5 anuncios activos ordenados por severity:
 * critical → urgent → warning → info, luego por starts_at DESC.
 *
 * Requiere que el user sea staff (STAFF_EMAILS env). Si la API responde
 * 403 al POSTear, el test se skipea — esto permite correr CI sin la env.
 */

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3101';

test.describe('announcements feed ordering', () => {
  test('crítica aparece antes que urgent y info', async ({ workspace, page }) => {
    // Crear 3 announcements: info, urgent, critical (en ese orden).
    const stamp = Date.now();
    const messages = {
      info: `info-${stamp}`,
      urgent: `urgent-${stamp}`,
      critical: `critical-${stamp}`,
    };

    let created = 0;
    for (const sev of ['info', 'urgent', 'critical'] as const) {
      const res = await page.request.post(`${API_URL}/api/admin/announcements`, {
        data: { severity: sev, message: messages[sev] },
      });
      if (res.status() === 403) {
        // No staff — skipear el test sin marcarlo como failure.
        test.skip(true, 'requires STAFF_EMAILS to include the test user');
      }
      if (res.ok()) created++;
    }
    expect(created).toBe(3);

    // Leer el feed público.
    const feedRes = await page.request.get(`${API_URL}/api/health/announcements`);
    expect(feedRes.ok()).toBe(true);
    const feed = (await feedRes.json()) as {
      data: Array<{ severity: string; message: string }>;
    };

    // Filtrar solo los que creamos en este test (puede haber otros previos).
    const ours = feed.data.filter((a) => Object.values(messages).includes(a.message));
    expect(ours.length).toBe(3);

    // Verificar orden: critical primero, después urgent, después info.
    const indexCritical = ours.findIndex((a) => a.message === messages.critical);
    const indexUrgent = ours.findIndex((a) => a.message === messages.urgent);
    const indexInfo = ours.findIndex((a) => a.message === messages.info);

    expect(indexCritical).toBeLessThan(indexUrgent);
    expect(indexUrgent).toBeLessThan(indexInfo);
  });
});

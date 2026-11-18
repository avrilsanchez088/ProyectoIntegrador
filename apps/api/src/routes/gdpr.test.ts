/**
 * Tests del endpoint público /gdpr/requests (propuesta 187.7 ronda 17).
 *
 * Cubre:
 *  - schema validation (action, email, organizationId)
 *  - duplicate detection en 24h por (email, org, action)
 *  - IP capture via x-forwarded-for header
 *
 * Mockeamos `adminDb` para no requerir Postgres en este suite.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@impacto/db', async () => {
  const actual = await vi.importActual<typeof import('@impacto/db')>('@impacto/db');
  let duplicateForNext = false;
  let lastInsert: Record<string, unknown> | null = null;

  // El handler hace, en orden, para cada request:
  //   1) SELECT COUNT(*) ...           → devolver el contador
  //   2) INSERT INTO data_subject_requests RETURNING id → devolver el id
  //   3) INSERT INTO system_announcements (best-effort, ignorable)
  // Trackeamos por contador para no depender del shape interno del `sql`
  // template de Drizzle (cambió entre versiones).
  let stepInRequest = 0;
  const startRequest = () => {
    stepInRequest = 0;
  };

  // Extrae los valores reales del sql template object de drizzle. Las versiones
  // recientes guardan los Param en `queryChunks`. Tomamos los `.value` de cada
  // Param item.
  function extractValues(q: unknown): unknown[] {
    if (!q || typeof q !== 'object') return [];
    const chunks = (q as { queryChunks?: unknown[] }).queryChunks;
    if (!Array.isArray(chunks)) {
      const legacy = (q as { values?: unknown[] }).values;
      return Array.isArray(legacy) ? legacy : [];
    }
    // En drizzle el `sql\`${v}\`` produce queryChunks intercalando:
    //  - StringChunk (clase con `value: string[]`) → fragmentos SQL fijos
    //  - String/Number/null/Param → valor interpolado (param)
    // Skipeamos los StringChunk y devolvemos el resto.
    const out: unknown[] = [];
    for (const chunk of chunks) {
      const className = (chunk as { constructor?: { name?: string } })?.constructor?.name;
      if (className === 'StringChunk') continue;
      if (className === 'Param') {
        out.push((chunk as { value: unknown }).value);
        continue;
      }
      // primitive interpolado (string, number) o null
      out.push(chunk);
    }
    return out;
  }

  return {
    ...actual,
    createDb: () => ({
      execute: vi.fn(async (q: unknown) => {
        stepInRequest++;
        if (stepInRequest === 1) {
          // SELECT COUNT(*) para anti-duplicate
          return [{ count: duplicateForNext ? 1 : 0 }];
        }
        if (stepInRequest === 2) {
          // INSERT INTO data_subject_requests RETURNING id
          lastInsert = { values: extractValues(q) };
          return [{ id: 'fake-uuid-1234' }];
        }
        // INSERT system_announcements u otros — no afecta al test
        return [];
      }),
    }),
    __testHooks: {
      setDuplicate: (v: boolean) => {
        duplicateForNext = v;
      },
      getLastInsert: () => lastInsert,
      reset: () => {
        duplicateForNext = false;
        lastInsert = null;
        startRequest();
      },
    },
  };
});

const { gdprPublicRouter } = await import('./gdpr.js');
// biome-ignore lint/suspicious/noExplicitAny: test hook
const { __testHooks } = (await import('@impacto/db')) as any;

describe('POST /gdpr/requests', () => {
  it('rechaza request sin email', async () => {
    __testHooks.reset();
    const res = await gdprPublicRouter.request('/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: 'org-1', action: 'export' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('rechaza email mal formateado', async () => {
    __testHooks.reset();
    const res = await gdprPublicRouter.request('/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: 'org-1',
        email: 'not-an-email',
        action: 'export',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rechaza action no en enum', async () => {
    __testHooks.reset();
    const res = await gdprPublicRouter.request('/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: 'org-1',
        email: 'foo@bar.com',
        action: 'destroy',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('crea solicitud válida y devuelve 201 con id', async () => {
    __testHooks.reset();
    const res = await gdprPublicRouter.request('/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: 'org-1',
        email: 'foo@bar.com',
        action: 'export',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe('fake-uuid-1234');
    expect(body.data.message).toMatch(/recibimos/i);
  });

  it('devuelve 409 si hay duplicate en 24h', async () => {
    __testHooks.reset();
    __testHooks.setDuplicate(true);
    const res = await gdprPublicRouter.request('/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: 'org-1',
        email: 'dup@bar.com',
        action: 'delete',
      }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('duplicate_request');
  });

  it('captura IP del header x-forwarded-for', async () => {
    __testHooks.reset();
    const res = await gdprPublicRouter.request('/requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.42, 10.0.0.1',
      },
      body: JSON.stringify({
        organizationId: 'org-1',
        email: 'ip@bar.com',
        action: 'export',
      }),
    });
    expect(res.status).toBe(201);
    const inserted = __testHooks.getLastInsert();
    const values = (inserted?.values as unknown[]) ?? [];
    // El IP debe ser el primero del CSV (203.0.113.42), no el reverse-proxy.
    expect(values).toContain('203.0.113.42');
  });

  it('action delete tiene mensaje distinto al export', async () => {
    __testHooks.reset();
    const exp = await gdprPublicRouter.request('/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: 'org-1',
        email: 'a@b.com',
        action: 'export',
      }),
    });
    const expBody = await exp.json();
    expect(expBody.data.message).toMatch(/link/i);

    __testHooks.reset();
    const del = await gdprPublicRouter.request('/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: 'org-1',
        email: 'c@d.com',
        action: 'delete',
      }),
    });
    const delBody = await del.json();
    expect(delBody.data.message).toMatch(/anonimizad/i);
  });
});

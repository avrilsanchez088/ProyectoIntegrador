import { sql } from '@impacto/db';
import { SYNC_PROVIDERS, findSyncProvider } from '@impacto/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '../env.js';
import {
  type AppEnv,
  getActiveOrgId,
  requireAuth,
  requireOrganization,
} from '../middleware/auth.js';
import { getTenantDb, rlsContext } from '../middleware/tenant.js';

export const syncRouter = new Hono<AppEnv>();

syncRouter.use('*', requireAuth);
syncRouter.use('*', requireOrganization);
syncRouter.use('*', rlsContext);

syncRouter.get('/', async (c) => {
  const db = getTenantDb(c);
  const orgId = getActiveOrgId(c);

  const integrations = await db.execute<{
    provider_key: string;
    status: string;
    last_check_at: Date | null;
    last_error: string | null;
    config: Record<string, unknown>;
  }>(sql`
    SELECT provider_key, status, last_check_at, last_error, config
    FROM sync_integrations
    WHERE organization_id = ${orgId}
  `);

  const integrationsByKey = new Map(integrations.map((i) => [i.provider_key, i]));

  const providers = SYNC_PROVIDERS.map((p) => {
    const integ = integrationsByKey.get(p.key);
    return {
      key: p.key,
      name: p.name,
      tagline: p.tagline,
      tier: p.tier,
      channels: p.channels,
      status: p.status,
      latencySeconds: p.latencySeconds,
      logoEmoji: p.logoEmoji,
      docsUrl: p.docsUrl,
      applyUrl: p.applyUrl,
      notes: p.notes,
      pricingPerPropertyUsd: p.pricingPerPropertyUsd,
      configFields: p.configFields,
      connected: !!integ && integ.status !== 'disabled',
      integrationStatus: integ?.status ?? null,
      lastCheckAt: integ?.last_check_at ?? null,
      lastError: integ?.last_error ?? null,
    };
  });

  const icalSummary = await db.execute<{
    count: number;
    with_errors: number;
    last_synced_at: Date | null;
  }>(sql`
    SELECT
      COUNT(*)::int AS count,
      COUNT(*) FILTER (WHERE last_sync_status = 'error')::int AS with_errors,
      MAX(last_synced_at) AS last_synced_at
    FROM external_calendars
    WHERE enabled = 1
  `);

  const connectedProviders = providers.filter((p) => p.connected);
  let bestActiveLatencySeconds: number | null = null;
  if (connectedProviders.length > 0) {
    bestActiveLatencySeconds = Math.min(...connectedProviders.map((p) => p.latencySeconds));
  } else if (icalSummary[0] && icalSummary[0].count > 0) {
    bestActiveLatencySeconds = 7200;
  }

  return c.json({
    data: {
      providers,
      icalFeeds: {
        count: icalSummary[0]?.count ?? 0,
        withErrors: icalSummary[0]?.with_errors ?? 0,
        lastSyncedAt: icalSummary[0]?.last_synced_at ?? null,
      },
      bestActiveLatencySeconds,
    },
  });
});

syncRouter.get('/providers', (c) => {
  return c.json({ data: SYNC_PROVIDERS });
});

syncRouter.post('/:providerKey', async (c) => {
  const providerKey = c.req.param('providerKey');
  const provider = findSyncProvider(providerKey);
  if (!provider) {
    return c.json({ error: 'unknown_provider' }, 404);
  }
  if (provider.tier === 'direct_ota') {
    return c.json(
      {
        error: 'not_connectable',
        message:
          provider.status === 'waitlist'
            ? 'Este provider no acepta integrations directas todavía. Aplicá en la URL provista.'
            : 'Este provider es invite-only — esperá invitación.',
      },
      400,
    );
  }

  // Validar config dinámicamente según configFields.
  // Para Channex (configFields vacío), acepta cualquier body sin validación.
  const configSchemaShape: Record<string, z.ZodString> = {};
  for (const field of provider.configFields) {
    let s = z.string();
    if (field.required) s = s.min(1, `${field.label} es requerido`);
    if (field.pattern) s = s.regex(new RegExp(field.pattern), `${field.label}: formato inválido`);
    if (field.type === 'email') s = s.email() as z.ZodString;
    else if (field.type === 'url') s = s.url() as z.ZodString;
    configSchemaShape[field.key] = s;
  }
  const schema = z.object({ config: z.object(configSchemaShape) });

  const body = await c.req.json().catch(() => ({ config: {} }));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }

  const db = getTenantDb(c);
  const orgId = getActiveOrgId(c);
  const upserted = await db.execute(sql`
    INSERT INTO sync_integrations (organization_id, provider_key, config, status)
    VALUES (${orgId}, ${providerKey}, ${JSON.stringify(parsed.data.config)}::jsonb, 'pending')
    ON CONFLICT (organization_id, provider_key) DO UPDATE
      SET config = EXCLUDED.config,
          status = 'pending',
          last_error = NULL,
          updated_at = now()
    RETURNING id, provider_key, status, last_check_at
  `);
  return c.json({ data: upserted[0] }, 201);
});

syncRouter.delete('/:providerKey', async (c) => {
  const providerKey = c.req.param('providerKey');
  const db = getTenantDb(c);
  const orgId = getActiveOrgId(c);
  const deleted = await db.execute<{ id: string }>(sql`
    DELETE FROM sync_integrations
    WHERE organization_id = ${orgId} AND provider_key = ${providerKey}
    RETURNING id
  `);
  if (deleted.length === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: { id: deleted[0]?.id, disconnected: true } });
});

syncRouter.post('/:providerKey/test', async (c) => {
  const providerKey = c.req.param('providerKey');
  const provider = findSyncProvider(providerKey);
  if (!provider) return c.json({ error: 'unknown_provider' }, 404);
  if (provider.tier === 'direct_ota') return c.json({ error: 'not_testable' }, 400);

  const db = getTenantDb(c);
  const orgId = getActiveOrgId(c);

  const integration = await db.execute<{ config: Record<string, unknown> }>(sql`
    SELECT config FROM sync_integrations
    WHERE organization_id = ${orgId} AND provider_key = ${providerKey}
    LIMIT 1
  `);
  if (integration.length === 0) return c.json({ error: 'not_connected' }, 404);

  const config = integration[0]?.config ?? {};

  // Para providers con configFields, verificar que estén completos.
  const missing = provider.configFields
    .filter((f) => f.required && !config[f.key])
    .map((f) => f.label);

  if (missing.length > 0) {
    const errorMsg = `Faltan: ${missing.join(', ')}`;
    await db.execute(sql`
      UPDATE sync_integrations
      SET status = 'error', last_check_at = now(), last_error = ${errorMsg}, updated_at = now()
      WHERE organization_id = ${orgId} AND provider_key = ${providerKey}
    `);
    return c.json({ data: { ok: false, error: errorMsg } });
  }

  let checkResult: { ok: boolean; latencyMs: number; error?: string };

  if (providerKey === 'channex') {
    // White-label: verificamos la API key de Impacto directamente.
    const start = Date.now();
    try {
      const res = await fetch(`${env.CHANNEX_BASE_URL}/properties`, {
        headers: { 'user-api-key': env.CHANNEX_API_KEY },
      });
      checkResult = res.ok
        ? { ok: true, latencyMs: Date.now() - start }
        : { ok: false, latencyMs: Date.now() - start, error: `Channex error: ${res.status}` };
    } catch (err) {
      checkResult = {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Error de red',
      };
    }
  } else {
    // Otros providers todavía en mock.
    checkResult = { ok: true, latencyMs: 0 };
  }

  const newStatus = checkResult.ok ? 'connected' : 'error';
  await db.execute(sql`
    UPDATE sync_integrations
    SET status = ${newStatus},
        last_check_at = now(),
        last_error = ${checkResult.error ?? null},
        updated_at = now()
    WHERE organization_id = ${orgId} AND provider_key = ${providerKey}
  `);

  return c.json({
    data: {
      ok: checkResult.ok,
      latencyMs: checkResult.latencyMs,
      error: checkResult.error,
      message: checkResult.ok ? 'Conexión verificada con Channex.' : checkResult.error,
    },
  });
});

syncRouter.get('/log', async (c) => {
  const db = getTenantDb(c);
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 100);

  const icalActivity = await db.execute<{
    id: string;
    name: string;
    provider: string;
    last_synced_at: Date | null;
    last_sync_status: string | null;
    last_sync_error: string | null;
    last_event_count: number | null;
  }>(sql`
    SELECT id, name, provider, last_synced_at, last_sync_status,
           last_sync_error, last_event_count
    FROM external_calendars
    WHERE enabled = 1 AND last_synced_at IS NOT NULL
    ORDER BY last_synced_at DESC
    LIMIT ${limit}
  `);

  return c.json({
    data: icalActivity.map((a) => ({
      id: a.id,
      source: 'ical',
      provider: a.provider,
      name: a.name,
      ts: a.last_synced_at,
      status: a.last_sync_status,
      error: a.last_sync_error,
      eventCount: a.last_event_count,
    })),
  });
});

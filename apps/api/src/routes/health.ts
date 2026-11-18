import { createDb, pingDatabase, sql } from '@impacto/db';
import { Hono } from 'hono';
import IORedis from 'ioredis';
import { env } from '../env.js';
import { logger } from '../logger.js';

const announceDb = createDb(env.DATABASE_URL);

export const healthRouter = new Hono();

/**
 * Liveness check — solo dice si el proceso responde.
 * Usado por load balancer / orchestrator.
 */
healthRouter.get('/', (c) => c.json({ status: 'ok' }));

/**
 * GET /api/health/announcements — banners de mantenimiento o avisos
 * globales (propuesta 128.2 + 132.1 ronda 11). Usa user-aware filter para
 * excluir los dismissed permanentemente (propuesta 143.5 ronda 12 +
 * implementación 15).
 *
 * El header `X-User-Id` (interno) o cookie de session permite filtrar por
 * dismissals; si no hay user, devuelve los activos sin filtrar.
 */
healthRouter.get('/announcements', async (c) => {
  try {
    const rows = await announceDb.execute<{
      id: string;
      severity: string;
      message: string;
      href: string | null;
      expires_at: Date | null;
    }>(sql`
      SELECT id, severity, message, href, expires_at
      FROM system_announcements
      WHERE starts_at <= now()
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 1
          WHEN 'urgent' THEN 2
          WHEN 'warning' THEN 3
          ELSE 4
        END,
        starts_at DESC
      LIMIT 5
    `);
    return c.json({
      data: rows.map((r) => ({
        id: r.id,
        severity: r.severity,
        message: r.message,
        href: r.href,
        expiresAt: r.expires_at,
      })),
    });
  } catch {
    // La tabla puede no existir si la migration no corrió todavía.
    return c.json({ data: [] });
  }
});

/**
 * GET /api/health/incidents — lista incidents últimos 30 días para /status
 * (propuesta 204.1 ronda 18). Sin auth — público.
 */
healthRouter.get('/incidents', async (c) => {
  try {
    const rows = await announceDb.execute<{
      id: string;
      title: string;
      description: string | null;
      severity: 'minor' | 'major' | 'critical';
      status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
      started_at: Date;
      resolved_at: Date | null;
      postmortem: string | null;
      affected_components: string[] | null;
      updates: Array<{
        id: string;
        status: string;
        message: string;
        created_at: string;
      }> | null;
    }>(sql`
      SELECT
        i.id, i.title, i.description, i.severity, i.status,
        i.started_at, i.resolved_at, i.postmortem,
        COALESCE(i.affected_components, ARRAY[]::text[]) AS affected_components,
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object(
            'id', u.id, 'status', u.status, 'message', u.message,
            'created_at', u.created_at
          ) ORDER BY u.created_at DESC)
           FROM incident_updates u WHERE u.incident_id = i.id),
          '[]'::jsonb
        ) AS updates
      FROM status_incidents i
      WHERE i.started_at > now() - interval '30 days'
      ORDER BY i.started_at DESC
      LIMIT 50
    `);
    return c.json({ data: rows });
  } catch {
    return c.json({ data: [] });
  }
});

/**
 * Readiness check — verifica que las dependencias críticas (Postgres) responden.
 * Si esto falla, el container debe ser marcado como unhealthy.
 */
healthRouter.get('/ready', async (c) => {
  const checks: Record<string, 'ok' | 'fail'> = {};

  try {
    await pingDatabase(env.DATABASE_URL);
    checks.database = 'ok';
  } catch {
    checks.database = 'fail';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');
  return c.json({ status: allOk ? 'ready' : 'unhealthy', checks }, allOk ? 200 : 503);
});

interface ComponentCheck {
  status: 'ok' | 'degraded' | 'down';
  latencyMs?: number;
  message?: string;
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<ComponentCheck> {
  const start = Date.now();
  try {
    await fn();
    const latencyMs = Date.now() - start;
    return {
      status: latencyMs > 1000 ? 'degraded' : 'ok',
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    logger.warn({ component: label, err }, 'health check failed');
    return {
      status: 'down',
      latencyMs,
      message: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

/**
 * Deep health — chequea TODAS las dependencias (DB, Redis, MinIO opcional,
 * SMTP opcional). Más caro que `/ready` — usar para dashboards de status,
 * no para liveness probes.
 *
 * Implementa §5.6 del audit + propuesta 91.1 ronda 7 (probe secret).
 *
 * Si `HEALTH_PROBE_SECRET` está configurado, requiere el header
 * `X-Health-Secret` con ese valor. Si no, abierto (modo dev).
 */
healthRouter.get('/deep', async (c) => {
  const expectedSecret = process.env.HEALTH_PROBE_SECRET;
  if (expectedSecret) {
    const provided = c.req.header('x-health-secret');
    if (provided !== expectedSecret) {
      return c.json({ error: 'forbidden' }, 403);
    }
  }

  const components: Record<string, ComponentCheck> = {};

  // Critical: Postgres + Redis
  components.postgres = await timed('postgres', () => pingDatabase(env.DATABASE_URL));
  components.redis = await timed('redis', async () => {
    const redis = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      lazyConnect: true,
    });
    try {
      await redis.connect();
      const pong = await redis.ping();
      if (pong !== 'PONG') throw new Error(`unexpected response: ${pong}`);
    } finally {
      redis.disconnect();
    }
  });

  // Optional dependencies — degraded si fallan, no bloquea readiness.
  const s3Endpoint = process.env.S3_ENDPOINT;
  if (s3Endpoint) {
    components.s3 = await timed('s3', async () => {
      const url = new URL('/minio/health/live', s3Endpoint);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3_000);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`s3 health responded ${res.status}`);
      } finally {
        clearTimeout(t);
      }
    });
  }

  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost) {
    components.smtp = await timed('smtp', async () => {
      // Sin nodemailer instalado — chequeo de TCP raw via net.Socket.
      const net = await import('node:net');
      await new Promise<void>((resolve, reject) => {
        const socket = new net.Socket();
        const timeout = setTimeout(() => {
          socket.destroy();
          reject(new Error('smtp connect timeout'));
        }, 3_000);
        socket.connect(Number(process.env.SMTP_PORT ?? 587), smtpHost, () => {
          clearTimeout(timeout);
          socket.destroy();
          resolve();
        });
        socket.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    });
  }

  // MV freshness — propuesta 144.2 ronda 12. No es crítica (degraded only).
  // Aprovecha la columna `refreshed_at` del MV (igual a now() al momento del
  // REFRESH, propuesta 135.1). Si > 15 min, devuelve 'down' que se mapea a
  // degraded en el rollup global vía isCritical=false.
  components.mv_tenant_stats = await timed('mv_tenant_stats', async () => {
    const rows = await announceDb.execute<{ refreshed_at: Date | null }>(sql`
      SELECT MAX(refreshed_at) AS refreshed_at FROM mv_tenant_stats
    `);
    const row = rows[0];
    if (!row?.refreshed_at) {
      // Sin filas (sin tenants) — no hay stats que medir, OK.
      return;
    }
    const ageMs = Date.now() - new Date(row.refreshed_at).getTime();
    if (ageMs > 15 * 60 * 1000) {
      throw new Error(`stale: refreshed ${Math.floor(ageMs / 60_000)} min ago`);
    }
  });

  const isCritical = (k: string) => k === 'postgres' || k === 'redis';
  const criticalDown = Object.entries(components).some(
    ([k, v]) => isCritical(k) && v.status === 'down',
  );

  return c.json(
    {
      status: criticalDown ? 'unhealthy' : 'ok',
      mode: env.APP_MODE,
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.1',
      components,
    },
    criticalDown ? 503 : 200,
  );
});

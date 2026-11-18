import type { Context, Next } from 'hono';
import { logger } from '../logger.js';

/**
 * Idempotency-Key middleware (propuesta 91.3 ronda 7).
 *
 * Si el cliente envía `Idempotency-Key: <random>` en un POST, cacheamos la
 * primera response (status + body) por 24h. Si llega un segundo request con
 * la misma key dentro de la ventana, devolvemos la response cached sin
 * re-ejecutar el handler.
 *
 * Caso de uso: usuario en mobile con WiFi spotty hace POST de booking, el
 * timeout cliente lo retry 2 veces — la API recibe el mismo POST 3 veces.
 * Sin idempotency, crea 3 bookings. Con idempotency, devuelve la misma
 * response (la del primer 201).
 *
 * Implementación: Map en memoria. Para múltiples replicas, mover a Redis
 * (con `SET key val EX 86400 NX`).
 *
 * Standard Stripe: la key tiene que ser única por usuario+operación.
 */

interface CachedResponse {
  status: number;
  bodyText: string;
  contentType: string;
  expiresAt: number;
}

const cache = new Map<string, CachedResponse>();
const TTL_MS = 24 * 60 * 60 * 1000;

// GC cada 5min: borrar entries vencidas.
const gcTimer = setInterval(
  () => {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiresAt < now) cache.delete(k);
    }
  },
  5 * 60 * 1000,
);
if (typeof gcTimer.unref === 'function') gcTimer.unref();

export async function idempotency(c: Context, next: Next) {
  const key = c.req.header('idempotency-key');
  if (!key) {
    await next();
    return;
  }

  // Solo POST. PATCH y DELETE no típicamente necesitan idempotency
  // (PATCH es naturalmente idempotente; DELETE devuelve 404 second time).
  if (c.req.method !== 'POST') {
    await next();
    return;
  }

  // Sanitizar key: máx 100 chars, alfanumeric + dash/underscore.
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) {
    return c.json({ error: 'invalid_idempotency_key' }, 400);
  }

  // Scope la key por path para evitar collision entre endpoints.
  const cacheKey = `${c.req.path}:${key}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    logger.info({ key, path: c.req.path }, 'idempotency cache hit');
    c.header('Idempotency-Replay', 'true');
    c.header('Content-Type', cached.contentType);
    return c.body(cached.bodyText, cached.status as 200 | 201);
  }

  await next();

  // Cachear solo responses 2xx — errores no se quieren replayear.
  if (c.res.status >= 200 && c.res.status < 300) {
    try {
      const cloned = c.res.clone();
      const bodyText = await cloned.text();
      const contentType = c.res.headers.get('content-type') ?? 'application/json';
      cache.set(cacheKey, {
        status: c.res.status,
        bodyText,
        contentType,
        expiresAt: Date.now() + TTL_MS,
      });
    } catch (err) {
      logger.warn({ err, key }, 'failed to cache idempotency response');
    }
  }
}

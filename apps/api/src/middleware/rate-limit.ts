import type { Context, Next } from 'hono';

/**
 * Rate limiter token-bucket en memoria por IP. Suficiente para una sola
 * instancia del API en V1. Cuando escalemos a múltiples replicas usar Redis
 * (BullMQ ya conectado) o un lib distribuido.
 *
 * Implementa §1.12 del audit (la env var WHATSAPP_RATE_LIMIT_PER_SECOND
 * existe sin consumir; este middleware aplica el límite genérico HTTP, no el
 * de WhatsApp — ese va en M7 contra la cola de salida).
 *
 * Uso:
 *   app.use('*', rateLimit({ windowMs: 60_000, max: 200 }));     // 200 reqs/min/IP
 *   app.use('/api/auth/*', rateLimit({ windowMs: 60_000, max: 20 }));  // login más estricto
 */

interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Si true, errores no consumen cupo. Default false. */
  skipFailedRequests?: boolean;
  /** Función para extraer la key. Default: IP. */
  keyGenerator?: (c: Context) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function defaultKey(c: Context): string {
  // Hono no expone IP directo. Usamos x-forwarded-for si está, sino el remote
  // address del request (si está en el adapter). Fallback a 'unknown' para
  // no romper.
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'unknown'
  );
}

export function rateLimit(opts: RateLimitOptions) {
  return async (c: Context, next: Next) => {
    const key = (opts.keyGenerator ?? defaultKey)(c);
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    } else {
      bucket.count++;
      if (bucket.count > opts.max) {
        const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
        c.header('Retry-After', String(retryAfterSec));
        c.header('X-RateLimit-Limit', String(opts.max));
        c.header('X-RateLimit-Remaining', '0');
        c.header('X-RateLimit-Reset', String(Math.floor(bucket.resetAt / 1000)));
        return c.json({ error: 'rate_limit_exceeded', retryAfterSec }, 429);
      }
      c.header('X-RateLimit-Limit', String(opts.max));
      c.header('X-RateLimit-Remaining', String(Math.max(opts.max - bucket.count, 0)));
      c.header('X-RateLimit-Reset', String(Math.floor(bucket.resetAt / 1000)));
    }

    await next();

    if (opts.skipFailedRequests && c.res.status >= 500) {
      const b = buckets.get(key);
      if (b && b.count > 0) b.count--;
    }
  };
}

/**
 * Garbage collection de buckets vencidos. Corre cada 60s sin bloquear el
 * event loop si la app está parada. `unref()` permite que el proceso termine
 * sin esperar este timer.
 */
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k);
  }
}, 60_000);
if (typeof cleanup.unref === 'function') cleanup.unref();

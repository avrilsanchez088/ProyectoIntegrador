import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

/**
 * Request ID middleware (propuesta 182.1 ronda 14).
 *
 * Setea `c.set('requestId', uuid)` y header `X-Request-Id` en la response.
 * Si el cliente envía `X-Request-Id` (ej. desde un load balancer), lo
 * preservamos para tracing distribuido.
 *
 * El logger pino lo recoge automáticamente vía child logger en el
 * middleware de logging.
 */
export const requestId: MiddlewareHandler = async (c, next) => {
  const fromHeader = c.req.header('x-request-id');
  // Validamos shape — UUID v4 o string hex de 8-64 chars. Sino, generamos.
  const id = fromHeader && /^[a-zA-Z0-9-]{8,64}$/.test(fromHeader) ? fromHeader : randomUUID();
  // biome-ignore lint/suspicious/noExplicitAny: hono ContextVariableMap
  (c as any).set('requestId', id);
  c.header('X-Request-Id', id);
  await next();
};

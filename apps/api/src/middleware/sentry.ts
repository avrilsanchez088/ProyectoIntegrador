import type { MiddlewareHandler } from 'hono';
import { logger } from '../logger.js';

/**
 * Sentry integration con breadcrumbs por request (propuesta 158.4 ronda 13).
 *
 * Comportamiento:
 *  - Si `SENTRY_DSN` no está configurado, todo es no-op silencioso (dev mode).
 *  - Si está pero `@sentry/node` no está instalado, log warn una vez y no-op.
 *  - Si ambas condiciones se cumplen, init Sentry + middleware que:
 *      · Pushea breadcrumb por cada request (method, path, status, ms)
 *      · Setea user context (id, email) si hay sesión
 *      · Captura excepciones unhandled antes del onError
 *
 * Diseño deliberado: el lazy dynamic-import permite que la build pase sin
 * necesitar `@sentry/node` en deps. Cuando deployemos a prod, se instala con
 * `pnpm add -F @impacto/api @sentry/node`.
 */

interface SentryAdapter {
  init: (opts: Record<string, unknown>) => void;
  addBreadcrumb: (b: Record<string, unknown>) => void;
  setUser: (u: Record<string, unknown> | null) => void;
  captureException: (err: unknown) => void;
}

let sentryReady: SentryAdapter | null = null;
let sentryInitAttempted = false;

async function tryInit(): Promise<SentryAdapter | null> {
  if (sentryInitAttempted) return sentryReady;
  sentryInitAttempted = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null;

  try {
    // Dynamic import — el módulo puede no estar instalado. Usamos string
    // dinámica para que TS no exija que el package exista en tiempo de typecheck.
    const moduleName = '@sentry/node';
    const mod: unknown = await import(/* @vite-ignore */ moduleName).catch(() => null);
    if (!mod || typeof mod !== 'object') {
      logger.warn('SENTRY_DSN configurado pero @sentry/node no instalado — sin reporting');
      return null;
    }
    const Sentry = mod as SentryAdapter;
    Sentry.init({
      dsn,
      environment: process.env.APP_MODE ?? 'dev',
      tracesSampleRate: 0.1,
    });
    sentryReady = Sentry;
    logger.info('Sentry inicializado');
    return Sentry;
  } catch (err) {
    logger.warn({ err }, 'Sentry init failed');
    return null;
  }
}

/**
 * Middleware Hono. Pushea breadcrumb por request. Llamar en el stack global
 * antes de los routers de negocio.
 */
export const sentryBreadcrumbs: MiddlewareHandler = async (c, next) => {
  const sentry = sentryReady ?? (await tryInit());
  if (!sentry) {
    await next();
    return;
  }

  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  // Pre-request breadcrumb (categoría http) y user context si existe.
  // biome-ignore lint/suspicious/noExplicitAny: ctx variable shape
  const user = (c as any).get?.('user') as { id: string; email?: string | null } | undefined;
  if (user) {
    sentry.setUser({ id: user.id, email: user.email ?? undefined });
  }

  try {
    await next();
    const ms = Date.now() - start;
    sentry.addBreadcrumb({
      category: 'http',
      type: 'http',
      level: c.res.status >= 500 ? 'error' : c.res.status >= 400 ? 'warning' : 'info',
      data: { method, path, status: c.res.status, ms },
    });
  } catch (err) {
    sentry.captureException(err);
    throw err;
  }
};

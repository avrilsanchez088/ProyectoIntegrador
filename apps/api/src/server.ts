import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { auth } from './auth.js';
import { env } from './env.js';
import { logIntegrationMode } from './lib/mocks/index.js';
import { logger } from './logger.js';
import { idempotency } from './middleware/idempotency.js';
import { rateLimit } from './middleware/rate-limit.js';
import { requestId } from './middleware/request-id.js';
import { sentryBreadcrumbs } from './middleware/sentry.js';
import { adminRouter } from './routes/admin.js';
import { announcementsRouter } from './routes/announcements.js';
import { auditRouter } from './routes/audit.js';
import { availabilityRouter } from './routes/availability.js';
import { bookingsRouter } from './routes/bookings.js';
import { calendarsRouter } from './routes/calendars.js';
import { gcalRouter } from './routes/gcal.js';
import { gdprPublicRouter } from './routes/gdpr.js';
import { healthRouter } from './routes/health.js';
import { icalPublicRouter } from './routes/ical-public.js';
import { mockRouter } from './routes/mock.js';
import { notificationsRouter } from './routes/notifications.js';
import { photosRouter } from './routes/photos.js';
import { policiesRouter } from './routes/policies.js';
import { propertiesRouter } from './routes/properties.js';
import { ratesRouter } from './routes/rates.js';
import { seasonsRouter } from './routes/seasons.js';
import { settingsRouter } from './routes/settings.js';
import { syncRouter } from './routes/sync.js';
import { teamRouter } from './routes/team.js';
import { unitsRouter } from './routes/units.js';
import { webhooksRouter } from './routes/webhooks.js';

const app = new Hono();

// Security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
// HSTS en prod, etc). Aplicado antes de CORS para que todas las respuestas
// lo lleven.
app.use(
  '*',
  secureHeaders({
    // HSTS solo en prod — en dev (HTTP) bloquearía el browser.
    strictTransportSecurity:
      env.NODE_ENV === 'production' ? 'max-age=15552000; includeSubDomains' : false,
    // No queremos restringir frames en la API (cors maneja origin).
    xFrameOptions: 'DENY',
    referrerPolicy: 'strict-origin-when-cross-origin',
  }),
);

// CORS — permite que el frontend hable con la API
app.use(
  '*',
  cors({
    origin: env.PUBLIC_WEB_URL,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
  }),
);

// Request ID (propuesta 182.1 ronda 14) — primero del stack para que el
// resto pueda referenciarlo en logs.
app.use('*', requestId);

// Sentry breadcrumbs (propuesta 158.4 ronda 13). No-op silencioso si
// SENTRY_DSN no está o `@sentry/node` no está instalado.
app.use('*', sentryBreadcrumbs);

// Request logger ligero — incluye requestId para correlación.
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  // biome-ignore lint/suspicious/noExplicitAny: c.var typing
  const reqId = (c as any).get('requestId');
  logger.info(
    { method: c.req.method, path: c.req.path, status: c.res.status, ms, reqId },
    'request',
  );
});

// Rate limit global por IP — protege endpoints públicos y autenticados (G1.12).
// El feed iCal público comparte este bucket — el token es la auth, los headers
// X-RateLimit-* permiten al canal externo respetar el límite.
app.use('*', rateLimit({ windowMs: 60_000, max: 300 }));

// Rate limit más estricto en endpoints de auth para evitar brute force.
app.use('/api/auth/*', rateLimit({ windowMs: 60_000, max: 30 }));

// Idempotency-Key cache para POSTs críticos (reservas, pagos). Aplica a
// cualquier POST que envíe el header — opcional para el cliente.
app.use('/api/bookings', idempotency);
app.use('/api/photos', idempotency);

// Better Auth handler — captura todo /api/auth/*
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// Rutas de la app
app.route('/api/health', healthRouter);
app.route('/api/audit', auditRouter);
app.route('/api/admin', adminRouter);
app.route('/api/announcements', announcementsRouter);
app.route('/api/properties', propertiesRouter);
app.route('/api/units', unitsRouter);
app.route('/api/seasons', seasonsRouter);
app.route('/api/rates', ratesRouter);
app.route('/api/policies', policiesRouter);
app.route('/api/photos', photosRouter);
app.route('/api/bookings', bookingsRouter);
app.route('/api/availability', availabilityRouter);
app.route('/api/calendars', calendarsRouter);
app.route('/api/gcal', gcalRouter);
app.route('/api/notifications', notificationsRouter);
app.route('/api/settings', settingsRouter);
app.route('/api/sync', syncRouter);
app.route('/api/team', teamRouter);
// Public iCal feed (no auth — auth via token in URL).
app.route('/ical', icalPublicRouter);
// Public GDPR submission (rate-limited, anti-abuse en handler).
app.route('/gdpr', gdprPublicRouter);
// Webhooks de servicios externos (WhatsApp, MP, Stripe). Auth por firma HMAC.
app.route('/api/webhooks', webhooksRouter);

// Endpoints de mock (iCal sintético, etc.) solo en demo mode (§1.4).
if (env.APP_MODE === 'demo') {
  app.route('/mock', mockRouter);
}

// Root
const root = app.get('/', (c) => c.json({ name: 'impacto-api', version: '0.0.1' }));

// 404 fallback
app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));

// Error handler global
app.onError((err, c) => {
  logger.error({ err, path: c.req.path }, 'unhandled error');
  return c.json({ error: 'internal_error', message: err.message }, 500);
});

/**
 * Type export para Hono RPC (`hc<AppType>(...)`) — §9.1 / G20.1 del audit.
 *
 * Permite que `apps/web` consuma el API con autocompletado de paths +
 * shapes de request/response. Ver `apps/web/src/lib/rpc.ts`.
 *
 * Patrón requiere preservar la cadena de chained `.route()` calls. Por
 * ahora exportamos `typeof root` (el último handler registrado) que captura
 * solo el endpoint root — para el RPC completo migrar todas las routes a
 * `app.route(...).route(...).route(...)` chained y exportar `typeof app`.
 * Esa migración se hace gradualmente sin romper el api actual.
 */
export type AppType = typeof root;
export { app };

logger.info({ port: env.PORT, mode: env.APP_MODE }, '🚀 Impacto API starting');
logIntegrationMode();

// Process-level error handlers — los handlers de Hono solo capturan errores
// dentro del request lifecycle. Promises sueltas (ej. setTimeout que falla)
// terminarian como unhandledRejection y antes mataban el proceso silencioso.
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise: String(promise) }, 'unhandledRejection in api process');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException in api process');
  // Fail fast en errores sincronos no capturados. Docker reinicia.
  process.exit(1);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info(`✅ API ready at http://localhost:${info.port}`);
});

import { Hono } from 'hono';
import { logger } from '../logger.js';
import {
  type AppEnv,
  getActiveOrgId,
  requireAuth,
  requireOrganization,
} from '../middleware/auth.js';
import { rlsContext } from '../middleware/tenant.js';

/**
 * Google Calendar integration scaffold (§1.11 del audit / G4.5).
 *
 * Diferencia con iCal feeds (Booking/Airbnb):
 *  - GCal soporta **push notifications** vía Watch API → cuando el dueño
 *    crea un evento en su Google Calendar, Google nos pega el webhook.
 *  - Renovación cada 7 días (`expiration` máximo del Watch).
 *  - Requiere OAuth offline para refresh tokens.
 *
 * Endpoints:
 *  - GET  /api/gcal/oauth/start   → redirige a Google con consent screen
 *  - GET  /api/gcal/oauth/callback → recibe el code, persistir tokens
 *  - POST /api/gcal/watch/:unitId  → registra Watch en GCal API
 *  - POST /webhooks/gcal           → push notif (definido en `webhooks.ts` cuando llegue M5)
 *
 * Esta versión es **scaffold de M5**: deja la estructura URL + middleware.
 * Los handlers reales (oauth flow, calls a googleapis) se implementan
 * cuando GOOGLE_CLIENT_ID/SECRET estén configurados.
 */
export const gcalRouter = new Hono<AppEnv>();

gcalRouter.use('/oauth/*', requireAuth);
gcalRouter.use('/oauth/*', requireOrganization);
gcalRouter.use('/oauth/*', rlsContext);
gcalRouter.use('/watch/*', requireAuth);
gcalRouter.use('/watch/*', requireOrganization);
gcalRouter.use('/watch/*', rlsContext);

const GOOGLE_OAUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GCAL_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

/**
 * GET /api/gcal/oauth/start?unitId=xxx
 * Construye la URL de consent y redirige al user. El `state` lleva orgId+unitId
 * codificados para recuperarlos en el callback (validados después).
 */
gcalRouter.get('/oauth/start', (c) => {
  const unitId = c.req.query('unitId');
  if (!unitId) return c.json({ error: 'missing_unit_id' }, 400);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return c.json(
      {
        error: 'oauth_not_configured',
        message: 'GOOGLE_CLIENT_ID no configurado. Activar en M5.',
      },
      501,
    );
  }

  const orgId = getActiveOrgId(c);
  const state = Buffer.from(JSON.stringify({ orgId, unitId, ts: Date.now() })).toString(
    'base64url',
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${process.env.PUBLIC_API_URL}/api/gcal/oauth/callback`,
    response_type: 'code',
    scope: GCAL_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return c.redirect(`${GOOGLE_OAUTH_BASE}?${params}`);
});

/**
 * GET /api/gcal/oauth/callback?code=...&state=...
 * Intercambia el code por tokens y los persiste. Schema futuro:
 *
 *   gcal_integrations(
 *     id uuid PK,
 *     organization_id text,
 *     unit_id uuid,
 *     google_email text,
 *     access_token text,         -- encrypted
 *     refresh_token text,        -- encrypted
 *     expires_at timestamptz,
 *     watch_channel_id text,
 *     watch_resource_id text,
 *     watch_expires_at timestamptz
 *   )
 */
gcalRouter.get('/oauth/callback', (c) => {
  const code = c.req.query('code');
  const stateRaw = c.req.query('state');
  if (!code || !stateRaw) return c.json({ error: 'invalid_callback' }, 400);

  // TODO M5: parse state, valida ts no viejo (>10min), POST a
  // https://oauth2.googleapis.com/token con code, persiste tokens encriptados
  // (pgcrypto), encola job para iniciar Watch.
  logger.info({ codeLen: code.length }, 'gcal callback received (handler pending — M5)');

  // De momento redirigir al dashboard con flag.
  return c.redirect(`${process.env.PUBLIC_WEB_URL}/dashboard/calendars?gcal=pending`);
});

/**
 * POST /api/gcal/watch/:unitId
 * Inicia (o renueva) un Watch contra el calendar del user. La renovación
 * automática se hace via cron cada 6 días (Google da 7 max).
 */
gcalRouter.post('/watch/:unitId', (c) => {
  return c.json(
    {
      error: 'not_implemented',
      message: 'Watch API pendiente. Activar tras OAuth flow (M5).',
    },
    501,
  );
});

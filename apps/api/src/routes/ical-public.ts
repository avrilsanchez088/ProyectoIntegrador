import { createDb, schema, setTenantContext, sql } from '@impacto/db';
import { buildIcal } from '@impacto/ical';
import { Hono } from 'hono';
import { env } from '../env.js';
import { logger } from '../logger.js';

/**
 * Endpoint público de exportación iCal.
 *
 *   GET /ical/:token.ics
 *
 * NO requiere auth: la URL contiene un token de alta entropía (32 bytes).
 * Internamente:
 *   1. Buscamos el token con el client superuser (bypass RLS) — solo seleccionamos
 *      el row mínimo para conocer org/unit.
 *   2. Re-abrimos una transaction con tenant context = org del token.
 *   3. Listamos bookings activos de esa unit y serializamos a iCal.
 */

// Cliente con role superuser (bypass RLS). Solo lo usamos para resolver el token.
// Si la app no tiene APP_DATABASE_URL distinto, esto degrada al mismo client que
// la app — RLS sigue funcionando porque el query ignora `app.tenant_id` no seteado.
const adminDb = createDb(env.DATABASE_URL);

export const icalPublicRouter = new Hono();

icalPublicRouter.get('/:tokenWithExt', async (c) => {
  const tokenWithExt = c.req.param('tokenWithExt');
  const token = tokenWithExt.replace(/\.ics$/i, '');

  if (!token || token.length < 20) {
    return c.json({ error: 'invalid_token' }, 400);
  }

  // Paso 1: resolver token (sin RLS — el token mismo es la auth).
  const tokenRows = await adminDb
    .select({
      id: schema.icalExportTokens.id,
      organizationId: schema.icalExportTokens.organizationId,
      unitId: schema.icalExportTokens.unitId,
      revokedAt: schema.icalExportTokens.revokedAt,
    })
    .from(schema.icalExportTokens)
    .where(sql`token = ${token}`)
    .limit(1);

  const tokenRow = tokenRows[0];
  if (!tokenRow || tokenRow.revokedAt) {
    return c.json({ error: 'not_found' }, 404);
  }

  // Paso 2: query bookings con tenant context. Usamos `appDb` (rol no-superuser)
  // para que RLS valide que el token efectivamente pertenece a esa org.
  const appDb = createDb(env.APP_DATABASE_URL ?? env.DATABASE_URL);

  let bookingsResult: Array<{
    id: string;
    check_in: Date;
    check_out: Date;
    code: string;
    status: string;
  }> = [];

  await appDb.transaction(async (tx) => {
    await setTenantContext(tx, tokenRow.organizationId);

    const result = await tx.execute(sql`
      SELECT id, check_in, check_out, code, status
      FROM bookings
      WHERE unit_id = ${tokenRow.unitId}
        AND status NOT IN ('cancelled', 'no_show')
      ORDER BY check_in ASC
    `);

    // postgres-js devuelve `RowList<Record<string, unknown>[]>`; el SELECT
    // es controlado y conocemos el shape, así que pasamos por unknown.
    bookingsResult = result as unknown as typeof bookingsResult;
  });

  // Paso 3: marcar último acceso (best-effort, sin bloquear la respuesta).
  adminDb
    .update(schema.icalExportTokens)
    .set({ lastAccessedAt: new Date() })
    .where(sql`id = ${tokenRow.id}`)
    .catch((err) => logger.warn({ err }, 'failed to update ical token last_accessed_at'));

  // Paso 4: armar feed.
  const ics = buildIcal({
    calendarName: `Impacto · ${tokenRow.unitId}`,
    prodId: '-//Impacto//Reservas//ES',
    events: bookingsResult.map((b) => ({
      uid: `${b.id}@impacto`,
      start: new Date(b.check_in),
      end: new Date(b.check_out),
      summary: `Reserva ${b.code}`,
      status: b.status === 'tentative' ? 'TENTATIVE' : 'CONFIRMED',
    })),
  });

  return c.body(ics, 200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'Content-Disposition': `inline; filename="${tokenRow.unitId}.ics"`,
  });
});

import { and, desc, eq, schema, sql } from '@impacto/db';
import { createBookingSchema, updateBookingSchema } from '@impacto/shared';
import { Hono } from 'hono';
import { loadCancellationPolicySnapshot, quoteForBooking } from '../lib/booking-quote.js';
import { syncAvailabilityToChannex } from '../lib/channex-availability.js';
import { tpl } from '../lib/notify-templates.js';
import { notifyTenant } from '../lib/notify.js';
import { logger } from '../logger.js';
import {
  type AppEnv,
  getActiveOrgId,
  requireAuth,
  requireOrganization,
} from '../middleware/auth.js';
import { blockIfFrozen, blockIfFrozenFor } from '../middleware/frozen.js';
import { getTenantDb, rlsContext } from '../middleware/tenant.js';

export const bookingsRouter = new Hono<AppEnv>();

bookingsRouter.use('*', requireAuth);
bookingsRouter.use('*', requireOrganization);
bookingsRouter.use('*', rlsContext);

// blockIfFrozen aplica a TODAS las mutations excepto los endpoints de
// transition (/checkin, /checkout) que tienen su propio middleware con
// soporte de whitelist (propuesta 201.1 ronda 18).
bookingsRouter.use('*', async (c, next) => {
  const path = c.req.path;
  if (/\/(checkin|checkout)$/.test(path)) {
    return next();
  }
  return blockIfFrozen(c, next);
});

const ACTIVE_STATUSES = ['tentative', 'confirmed', 'checked_in'] as const;

/** Tope superior para evitar que un caller maleducado pida toda la tabla. */
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

function parsePagination(c: { req: { query: (k: string) => string | undefined } }) {
  const limitRaw = Number(c.req.query('limit') ?? DEFAULT_PAGE_SIZE);
  const offsetRaw = Number(c.req.query('offset') ?? 0);
  const limit = Math.min(
    Math.max(Number.isFinite(limitRaw) ? limitRaw : DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);
  return { limit, offset };
}

/**
 * GET /api/bookings?unitId=xxx&status=confirmed&limit=50&offset=0
 * Lista bookings, filtrables por unit y status. Ordenado por checkIn DESC.
 * Paginado: default 50, máximo 200 por página.
 * Devuelve { data, pagination: { total, limit, offset } }.
 */
bookingsRouter.get('/', async (c) => {
  const unitId = c.req.query('unitId');
  const status = c.req.query('status');
  const db = getTenantDb(c);
  const { limit, offset } = parsePagination(c);

  const filters: ReturnType<typeof eq>[] = [];
  if (unitId) filters.push(eq(schema.bookings.unitId, unitId));
  if (status) filters.push(eq(schema.bookings.status, status as never));
  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(schema.bookings)
      .where(whereClause)
      .orderBy(desc(schema.bookings.checkIn))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.bookings).where(whereClause),
  ]);

  return c.json({
    data: rows,
    pagination: { total: totalRows[0]?.count ?? 0, limit, offset },
  });
});

/**
 * GET /api/bookings/counts
 * Devuelve el conteo de bookings agrupado por status. Optimiza el badge del
 * sidebar (que antes traía toda la tabla solo para contar tentatives).
 */
bookingsRouter.get('/counts', async (c) => {
  const db = getTenantDb(c);
  const rows = await db
    .select({ status: schema.bookings.status, count: sql<number>`count(*)::int` })
    .from(schema.bookings)
    .groupBy(schema.bookings.status);

  const counts: Record<string, number> = {
    tentative: 0,
    confirmed: 0,
    checked_in: 0,
    checked_out: 0,
    cancelled: 0,
    no_show: 0,
  };
  for (const r of rows) counts[r.status] = r.count;

  return c.json({ data: counts });
});

bookingsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getTenantDb(c);
  const rows = await db.select().from(schema.bookings).where(eq(schema.bookings.id, id));
  if (!rows[0]) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: rows[0] });
});

bookingsRouter.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }

  const orgId = getActiveOrgId(c);
  const db = getTenantDb(c);

  const { unitId, checkIn, checkOut, status } = parsed.data;
  const isActive = (ACTIVE_STATUSES as readonly string[]).includes(status);

  // Pre-check de overlap. La EXCLUDE constraint en DB es la red final, pero
  // queremos un 409 amigable en lugar de excepción raw.
  if (isActive) {
    const overlap = await db.execute(sql`
      SELECT 1 FROM bookings
      WHERE unit_id = ${unitId}
        AND status NOT IN ('cancelled', 'no_show')
        AND tstzrange(check_in, check_out, '[)') && tstzrange(${checkIn}::timestamptz, ${checkOut}::timestamptz, '[)')
      LIMIT 1
    `);
    if (overlap.length > 0) {
      return c.json({ error: 'overlap', message: 'Ya existe una reserva en ese rango' }, 409);
    }

    const blockOverlap = await db.execute(sql`
      SELECT 1 FROM availability_blocks
      WHERE unit_id = ${unitId}
        AND tstzrange(starts_at, ends_at, '[)') && tstzrange(${checkIn}::timestamptz, ${checkOut}::timestamptz, '[)')
      LIMIT 1
    `);
    if (blockOverlap.length > 0) {
      return c.json({ error: 'blocked', message: 'Hay un bloqueo activo en ese rango' }, 409);
    }
  }

  // Si el caller no manda quote, lo calculamos con el pricing engine.
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
  const callerProvidedQuote = parsed.data.totalCents !== undefined;

  let subtotalCents = parsed.data.subtotalCents ?? 0;
  let feesTotalCents = parsed.data.feesTotalCents ?? 0;
  let discountCents = parsed.data.discountCents ?? 0;
  let totalCents = parsed.data.totalCents ?? 0;
  let refundableTotalCents = parsed.data.refundableTotalCents ?? 0;
  let quoteSnapshot: Record<string, unknown> = {};

  if (!callerProvidedQuote) {
    try {
      const quoted = await quoteForBooking(db, {
        unitId,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        guests: parsed.data.guestsCount,
        pets: parsed.data.petsCount,
      });
      if (quoted.error) {
        return c.json({ error: 'quote_failed', reason: quoted.error }, 422);
      }
      subtotalCents = quoted.subtotalCents;
      totalCents = quoted.totalCents;
      refundableTotalCents = quoted.refundableTotalCents;
      // Suma de fees + premiums - discounts ≈ total - subtotal
      feesTotalCents = quoted.lineItems
        .filter((li) => li.type === 'fee' || li.type === 'premium')
        .reduce((acc, li) => acc + li.amountCents, 0);
      discountCents = quoted.lineItems
        .filter((li) => li.type === 'discount')
        .reduce((acc, li) => acc + Math.abs(li.amountCents), 0);
      quoteSnapshot = {
        nights: quoted.nights,
        avgNightlyRateCents: quoted.avgNightlyRateCents,
        lineItems: quoted.lineItems,
        computedAt: new Date().toISOString(),
      };
    } catch (err) {
      logger.warn({ err, unitId }, 'auto-quote failed, persisting booking with zeros');
    }
  }

  // Snapshot de la cancellation policy aplicable. Nunca bloquea la creación:
  // si no hay policy, persiste {}. El tipo del schema es jsonb, así que
  // aceptamos cualquier objeto serializable.
  let cancellationPolicySnapshot: Record<string, unknown> = {};
  try {
    const snapshot = await loadCancellationPolicySnapshot(db, unitId);
    if (snapshot) cancellationPolicySnapshot = snapshot as unknown as Record<string, unknown>;
  } catch (err) {
    logger.warn({ err, unitId }, 'failed to load cancellation policy snapshot');
  }

  try {
    const [created] = await db
      .insert(schema.bookings)
      .values({
        organizationId: orgId,
        unitId,
        code: parsed.data.code,
        source: parsed.data.source,
        status,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        guestsCount: parsed.data.guestsCount,
        petsCount: parsed.data.petsCount,
        guestName: parsed.data.guestName,
        guestEmail: parsed.data.guestEmail,
        guestPhone: parsed.data.guestPhone,
        notes: parsed.data.notes,
        subtotalCents,
        feesTotalCents,
        discountCents,
        totalCents,
        refundableTotalCents,
        currency: parsed.data.currency,
        quoteSnapshot,
        cancellationPolicySnapshot,
      })
      .returning();

    // Notificación in-app — broadcast al workspace (best-effort).
    if (created) {
      const tplFn = status === 'tentative' ? tpl.bookingTentative : tpl.bookingConfirmed;
      await notifyTenant(
        db,
        tplFn({
          organizationId: orgId,
          bookingId: created.id,
          code: created.code,
          checkIn: created.checkIn.toISOString(),
          checkOut: created.checkOut.toISOString(),
          guestName: created.guestName,
        }),
      );
    }
    // Sincronizar disponibilidad con Channex (best-effort).
    if (created && isActive) {
      const { createDb } = await import('@impacto/db');
      const rootDb = createDb(process.env.DATABASE_URL ?? '');
      syncAvailabilityToChannex({
        unitId: created.unitId,
        checkIn: created.checkIn,
        checkOut: created.checkOut,
        availability: 0,
        rootDb,
      }).catch((err) => {
        logger.error({ err, bookingId: created.id }, '❌ [channex] sync availability failed');
      });
    }

    return c.json({ data: created }, 201);
  } catch (err) {
    // Catch del EXCLUDE constraint si la pre-check no lo agarró (race).
    if (err instanceof Error && /exclusion|conflict/i.test(err.message)) {
      return c.json({ error: 'overlap_db', message: 'Conflicto de disponibilidad' }, 409);
    }
    throw err;
  }
});

bookingsRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateBookingSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }

  const db = getTenantDb(c);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    if (k === 'checkIn' || k === 'checkOut') {
      updates[k] = new Date(v as string);
    } else {
      updates[k] = v;
    }
  }
  if (parsed.data.status === 'cancelled' && !('cancelledAt' in updates)) {
    updates.cancelledAt = new Date();
  }

  try {
    const [updated] = await db
      .update(schema.bookings)
      .set(updates)
      .where(eq(schema.bookings.id, id))
      .returning();
    if (!updated) return c.json({ error: 'not_found' }, 404);
    return c.json({ data: updated });
  } catch (err) {
    if (err instanceof Error && /exclusion|conflict/i.test(err.message)) {
      return c.json({ error: 'overlap_db', message: 'Conflicto de disponibilidad' }, 409);
    }
    throw err;
  }
});

/**
 * POST /api/bookings/:id/checkin  → marca booking como checked_in.
 * POST /api/bookings/:id/checkout → marca booking como checked_out.
 *
 * Estos endpoints respetan `tenant_settings.frozen_allow_ops` (propuestas
 * 142.3 + 201.1 ronda 12-18). Si el workspace está congelado pero la op
 * está en la whitelist, pasan igual. Útil para que un dueño moroso pueda
 * seguir registrando huéspedes que ya están en el alojamiento.
 */
bookingsRouter.post('/:id/checkin', blockIfFrozenFor('booking.checkin'), async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'invalid_id' }, 400);
  const db = getTenantDb(c);
  const [updated] = await db
    .update(schema.bookings)
    .set({ status: 'checked_in', updatedAt: new Date() })
    .where(eq(schema.bookings.id, id))
    .returning();
  if (!updated) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: updated });
});

bookingsRouter.post('/:id/checkout', blockIfFrozenFor('booking.checkout'), async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'invalid_id' }, 400);
  const db = getTenantDb(c);
  const [updated] = await db
    .update(schema.bookings)
    .set({ status: 'checked_out', updatedAt: new Date() })
    .where(eq(schema.bookings.id, id))
    .returning();
  if (!updated) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: updated });
});

/**
 * DELETE /api/bookings/:id  → soft cancel (status = 'cancelled')
 * No removemos rows: queremos historial. Si se quiere borrar de verdad,
 * ya hay otra ruta o se hace via DB admin.
 */
bookingsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const orgId = getActiveOrgId(c);
  const db = getTenantDb(c);
  const [cancelled] = await db
    .update(schema.bookings)
    .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.bookings.id, id))
    .returning({ id: schema.bookings.id, code: schema.bookings.code });
  if (!cancelled) return c.json({ error: 'not_found' }, 404);

  await notifyTenant(
    db,
    tpl.bookingCancelled({
      organizationId: orgId,
      bookingId: cancelled.id,
      code: cancelled.code,
    }),
  );

  // Liberar disponibilidad en Channex (best-effort).
  if (cancelled) {
    const booking = await db
      .select({
        unitId: schema.bookings.unitId,
        checkIn: schema.bookings.checkIn,
        checkOut: schema.bookings.checkOut,
      })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, id))
      .limit(1);

    if (booking[0]) {
      const { createDb } = await import('@impacto/db');
      const rootDb = createDb(process.env.DATABASE_URL ?? '');
      syncAvailabilityToChannex({
        unitId: booking[0].unitId,
        checkIn: booking[0].checkIn,
        checkOut: booking[0].checkOut,
        availability: 1,
        rootDb,
      }).catch((err) => {
        logger.error({ err, bookingId: id }, '❌ [channex] sync availability on cancel failed');
      });
    }
  }

  return c.json({ data: { id: cancelled.id, cancelled: true } });
});

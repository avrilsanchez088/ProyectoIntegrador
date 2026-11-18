import { Hono } from 'hono';
import { logger } from '../logger.js';
import { rateLimit } from '../middleware/rate-limit.js';

export const webhooksRouter = new Hono();

webhooksRouter.use('*', rateLimit({ windowMs: 60_000, max: 1_000 }));

// ─── WhatsApp Cloud API ─────────────────────────────────────────
webhooksRouter.get('/whatsapp', (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token && expected && token === expected) {
    return c.text(challenge ?? '', 200);
  }
  return c.text('forbidden', 403);
});

webhooksRouter.post('/whatsapp', async (c) => {
  const signature = c.req.header('x-hub-signature-256');
  const rawBody = await c.req.text();

  const secret = process.env.META_APP_SECRET;
  if (secret) {
    const ok = await verifyHmacSha256(rawBody, signature ?? '', secret);
    if (!ok) {
      logger.warn({ signature }, 'whatsapp webhook signature mismatch');
      return c.json({ error: 'invalid_signature' }, 401);
    }
  } else {
    logger.warn('META_APP_SECRET not set — accepting webhook unverified (demo mode only)');
  }

  try {
    const payload = JSON.parse(rawBody);
    logger.info({ entries: payload.entry?.length ?? 0 }, '📩 whatsapp webhook received');
  } catch {
    /* payload no JSON — ignorar */
  }

  return c.json({ received: true });
});

// ─── Mercado Pago ────────────────────────────────────────────────
webhooksRouter.post('/mercadopago', async (c) => {
  const expectedSecret = process.env.MP_WEBHOOK_SECRET;
  const givenSecret = c.req.query('secret') ?? c.req.header('x-mp-secret');

  if (expectedSecret && givenSecret !== expectedSecret) {
    return c.json({ error: 'invalid_secret' }, 401);
  }

  const payload = await c.req.json().catch(() => ({}));
  logger.info(
    { topic: payload.topic ?? payload.type, id: payload.data?.id ?? payload.id },
    '💳 mercadopago webhook received',
  );

  return c.json({ received: true });
});

// ─── Stripe ──────────────────────────────────────────────────────
webhooksRouter.post('/stripe', async (c) => {
  const sig = c.req.header('stripe-signature');
  const expected = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody = await c.req.text();

  if (!sig || !expected) {
    logger.warn('stripe webhook missing signature or secret not configured');
    return c.json({ error: 'invalid_signature' }, 401);
  }

  try {
    const event = JSON.parse(rawBody);
    logger.info({ type: event.type, id: event.id }, '💳 stripe webhook received (unverified)');
  } catch {
    /* ignore */
  }

  return c.json({ received: true });
});

// ─── Helpers ─────────────────────────────────────────────────────
async function verifyHmacSha256(body: string, headerSig: string, secret: string): Promise<boolean> {
  if (!headerSig.startsWith('sha256=')) return false;
  const expectedHex = headerSig.slice('sha256='.length);
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
    const hex = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return timingSafeEqual(hex, expectedHex);
  } catch {
    return false;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Channex ─────────────────────────────────────────────────────
webhooksRouter.post('/channex', async (c) => {
  const secret = process.env.CHANNEX_WEBHOOK_SECRET;
  const givenSecret = c.req.header('x-channex-webhook-secret');

  if (secret && givenSecret !== secret) {
    logger.warn('channex webhook secret mismatch');
    return c.json({ error: 'invalid_secret' }, 401);
  }

  const payload = await c.req.json().catch(() => null);
  if (!payload) return c.json({ error: 'invalid_payload' }, 400);

  const event = payload.event as string;
  const propertyId = payload.property_id as string;

  logger.info({ event, propertyId }, '📩 [channex] webhook received');

  if (
    event === 'booking_new' ||
    event === 'booking_modification' ||
    event === 'booking_cancellation' ||
    event === 'non_acked_booking'
  ) {
    const revisionId = payload.payload?.revision_id ?? payload.payload?.booking_revision_id;

    if (!revisionId) {
      logger.warn({ event, payload }, '⚠️ [channex] sin revision_id en payload');
      return c.json({ received: true });
    }

    (async () => {
      try {
        const { createDb } = await import('@impacto/db');
        const { sql } = await import('@impacto/db');
        const { channexAdapter } = await import('../lib/sync-adapters/channex.js');
        const { syncAvailabilityToChannex } = await import('../lib/channex-availability.js');
        const rootDb = createDb(process.env.DATABASE_URL ?? '');

        // 1. Pull del booking revision completo desde Channex.
        const revision = await channexAdapter.getBookingRevision(revisionId);

        // 2. Buscar tenant por channex_property_id.
        const propertyMapping = (await rootDb.execute(sql`
          SELECT organization_id, property_id
          FROM channex_property_mappings
          WHERE channex_property_id = ${propertyId}
          LIMIT 1
        `)) as unknown as { organization_id: string; property_id: string }[];

        if (!propertyMapping[0]) {
          logger.warn({ propertyId }, '⚠️ [channex] property no encontrada en Impacto');
          await channexAdapter.ackBookingRevision(revisionId);
          return;
        }

        const orgId = propertyMapping[0].organization_id;

        // 3. Buscar unit_id por room_type_id de Channex.
        const roomTypeId = revision.rooms?.[0]?.room_type_id;
        const unitMapping = (await rootDb.execute(sql`
          SELECT unit_id FROM channex_unit_mappings
          WHERE channex_room_type_id = ${roomTypeId}
          LIMIT 1
        `)) as unknown as { unit_id: string }[];

        if (!unitMapping[0]) {
          logger.warn({ roomTypeId }, '⚠️ [channex] unit no encontrada en Impacto');
          await channexAdapter.ackBookingRevision(revisionId);
          return;
        }

        const unitId = unitMapping[0].unit_id;
        const checkIn = new Date(revision.arrival_date);
        const checkOut = new Date(revision.departure_date);
        const isCancellation = event === 'booking_cancellation' || revision.status === 'cancelled';

        // 4. Procesar según tipo de evento.
        if (isCancellation) {
          await rootDb.execute(sql`
            UPDATE bookings
            SET status = 'cancelled', cancelled_at = now(), updated_at = now()
            WHERE external_id = ${revision.booking_id}
              AND organization_id = ${orgId}
          `);
          logger.info(
            { bookingId: revision.booking_id },
            '✅ [channex] booking cancelado en Impacto',
          );

          // Liberar disponibilidad.
          await syncAvailabilityToChannex({
            unitId,
            checkIn,
            checkOut,
            availability: 1,
            rootDb,
          });
        } else {
          const existing = (await rootDb.execute(sql`
            SELECT id, check_in, check_out FROM bookings
            WHERE external_id = ${revision.booking_id} LIMIT 1
          `)) as unknown as { id: string; check_in: Date; check_out: Date }[];

          if (!existing[0]) {
            // Nueva reserva.
            await rootDb.execute(sql`
              INSERT INTO bookings (
                organization_id, unit_id, source, status,
                check_in, check_out,
                guest_name, guest_email, guest_phone,
                total_cents, currency, external_id,
                guests_count, code
              ) VALUES (
                ${orgId}, ${unitId}, 'channex', 'confirmed',
                ${revision.arrival_date}::timestamptz,
                ${revision.departure_date}::timestamptz,
                ${revision.customer?.name ?? 'Huésped'},
                ${revision.customer?.email ?? null},
                ${revision.customer?.phone ?? null},
                ${Math.round(Number.parseFloat(revision.amount ?? '0') * 100)},
                ${revision.currency ?? 'USD'},
                ${revision.booking_id},
                1,
                ${`CH-${revision.booking_id.slice(0, 8).toUpperCase()}`}
              )
            `);
            logger.info(
              { bookingId: revision.booking_id, unitId },
              '✅ [channex] booking guardado en Impacto',
            );

            await syncAvailabilityToChannex({
              unitId,
              checkIn,
              checkOut,
              availability: 0,
              rootDb,
            });
          } else if (event === 'booking_modification') {
            // Modificación — actualizar fechas y recalcular disponibilidad.
            const oldCheckIn = new Date(existing[0].check_in);
            const oldCheckOut = new Date(existing[0].check_out);

            await rootDb.execute(sql`
              UPDATE bookings
              SET check_in = ${revision.arrival_date}::timestamptz,
                  check_out = ${revision.departure_date}::timestamptz,
                  total_cents = ${Math.round(Number.parseFloat(revision.amount ?? '0') * 100)},
                  updated_at = now()
              WHERE external_id = ${revision.booking_id}
                AND organization_id = ${orgId}
            `);
            logger.info(
              { bookingId: revision.booking_id },
              '✅ [channex] booking modificado en Impacto',
            );

            // Liberar fechas viejas y bloquear fechas nuevas.
            await syncAvailabilityToChannex({
              unitId,
              checkIn: oldCheckIn,
              checkOut: oldCheckOut,
              availability: 1,
              rootDb,
            });
            await syncAvailabilityToChannex({
              unitId,
              checkIn,
              checkOut,
              availability: 0,
              rootDb,
            });
          } else {
            logger.info(
              { bookingId: revision.booking_id },
              '⚠️ [channex] booking ya existe, saltando',
            );
          }
        }

        // 5. ACK a Channex.
        await channexAdapter.ackBookingRevision(revisionId);
      } catch (err) {
        logger.error({ err, event, revisionId }, '❌ [channex] error procesando webhook');
      }
    })();
  }

  return c.json({ received: true });
});

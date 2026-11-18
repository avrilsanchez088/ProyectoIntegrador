import { createDb, schema, setTenantContext, sql } from '@impacto/db';
import { parseIcal } from '@impacto/ical';
import { tpl } from '@impacto/shared';
import { Worker } from 'bullmq';
import { computeBookingCode, extractGuestName } from '../lib/ical-mappers.js';
import { logger } from '../logger.js';
import { redisConnection } from '../queues.js';

/**
 * iCal poll worker.
 *
 * Job payload:
 *   { externalCalendarId: string, organizationId: string }
 *
 * Pasos:
 *   1. Cargar `external_calendars` row (con superuser, no hay sesión web)
 *   2. fetch del feed con timeout 30s
 *   3. parseIcal del body
 *   4. Setear tenant context y upsertar bookings espejo
 *   5. Marcar como cancelled bookings cuyo externalUid ya no aparece en el feed
 *   6. Update last_synced_at + last_event_count + last_sync_status
 *
 * El scheduling (repeatable jobs por external_calendar) lo dispara la API
 * cuando se crea/edita una row en external_calendars (M5 wiring).
 */

const databaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL ?? databaseUrl;
if (!databaseUrl || !appDatabaseUrl) {
  throw new Error('DATABASE_URL not set in worker env');
}

// Superuser DB para resolver feed (sin tenant context).
const adminDb = createDb(databaseUrl);
// App DB con RLS para escribir bookings dentro de tenant context.
const appDb = createDb(appDatabaseUrl);

const FETCH_TIMEOUT_MS = 30_000;

interface IcalJobData {
  externalCalendarId: string;
}

async function fetchIcalFeed(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Impacto-iCal-Sync/1.0' },
    });
    if (!res.ok) {
      throw new Error(`feed responded ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function syncOneFeed(externalCalendarId: string): Promise<{
  eventCount: number;
  upserted: number;
  cancelled: number;
}> {
  // 1. Resolver feed metadata.
  const calRows = await adminDb
    .select()
    .from(schema.externalCalendars)
    .where(sql`id = ${externalCalendarId}`)
    .limit(1);
  const cal = calRows[0];
  if (!cal) throw new Error(`external_calendar ${externalCalendarId} not found`);
  if (cal.enabled !== 1) {
    logger.info({ externalCalendarId }, 'feed disabled, skipping');
    return { eventCount: 0, upserted: 0, cancelled: 0 };
  }

  // 2. Fetch + parse.
  const body = await fetchIcalFeed(cal.icalUrl);
  const events = parseIcal(body);
  logger.info({ externalCalendarId, count: events.length }, 'fetched + parsed iCal feed');

  // 3. Upsert dentro de tenant context.
  let upserted = 0;
  let cancelled = 0;

  await appDb.transaction(async (tx) => {
    await setTenantContext(tx, cal.organizationId);

    const incomingUids = new Set<string>();

    for (const ev of events) {
      // Saltamos cancelados según el feed.
      if (ev.status?.toUpperCase() === 'CANCELLED') continue;
      incomingUids.add(ev.uid);

      const code = computeBookingCode(cal.provider, ev.uid);
      const guestName = extractGuestName(ev) ?? `${cal.provider} import`;
      const status = ev.status?.toUpperCase() === 'TENTATIVE' ? 'tentative' : 'confirmed';

      // Upsert por (external_calendar_id, external_uid).
      // Si ya existe → update fechas/status. Si no → insert.
      await tx.execute(sql`
        INSERT INTO bookings (
          organization_id, unit_id, code, source, status,
          check_in, check_out, guests_count, pets_count,
          guest_name, external_uid, external_calendar_id, currency,
          quote_snapshot
        )
        VALUES (
          ${cal.organizationId}, ${cal.unitId}, ${code},
          ${cal.provider}::text, ${status}::text,
          ${ev.start.toISOString()}::timestamptz, ${ev.end.toISOString()}::timestamptz,
          1, 0,
          ${guestName}, ${ev.uid}, ${externalCalendarId}, 'USD',
          '{}'::jsonb
        )
        ON CONFLICT (external_calendar_id, external_uid)
        WHERE external_uid IS NOT NULL
        DO UPDATE SET
          status = EXCLUDED.status,
          check_in = EXCLUDED.check_in,
          check_out = EXCLUDED.check_out,
          updated_at = now()
      `);
      upserted++;
    }

    // 4. Reconciliar: cualquier booking que tenía externalCalendarId pero
    // ya no aparece en el feed → cancelar.
    if (incomingUids.size > 0) {
      // Pasamos el array como literal Postgres `text[]`.
      const uidsArray = Array.from(incomingUids);
      const result = await tx.execute(sql`
        UPDATE bookings
        SET status = 'cancelled',
            cancelled_at = COALESCE(cancelled_at, now()),
            cancelled_reason = 'removed_from_external_feed',
            updated_at = now()
        WHERE external_calendar_id = ${externalCalendarId}
          AND status NOT IN ('cancelled', 'no_show')
          AND external_uid IS NOT NULL
          AND NOT (external_uid = ANY(${uidsArray}::text[]))
      `);
      cancelled = (result as unknown as { count?: number }).count ?? 0;
    } else {
      // Feed vacío → cancelar todas las que estaban activas para este feed.
      const result = await tx.execute(sql`
        UPDATE bookings
        SET status = 'cancelled',
            cancelled_at = COALESCE(cancelled_at, now()),
            cancelled_reason = 'feed_empty',
            updated_at = now()
        WHERE external_calendar_id = ${externalCalendarId}
          AND status NOT IN ('cancelled', 'no_show')
      `);
      cancelled = (result as unknown as { count?: number }).count ?? 0;
    }
  });

  return { eventCount: events.length, upserted, cancelled };
}

export const icalWorker = new Worker<IcalJobData>(
  'ical',
  async (job) => {
    const { externalCalendarId } = job.data;
    logger.info({ jobId: job.id, externalCalendarId }, '📅 ical sync starting');

    try {
      const result = await syncOneFeed(externalCalendarId);

      await adminDb
        .update(schema.externalCalendars)
        .set({
          lastSyncedAt: new Date(),
          lastSyncStatus: 'ok',
          lastSyncError: null,
          lastEventCount: result.eventCount,
        })
        .where(sql`id = ${externalCalendarId}`);

      logger.info({ jobId: job.id, ...result }, '✓ ical sync ok');
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Update the row + create in-app notif. Buscar la organizationId del feed.
      const calRows = await adminDb
        .select({
          organizationId: schema.externalCalendars.organizationId,
          name: schema.externalCalendars.name,
          provider: schema.externalCalendars.provider,
          unitId: schema.externalCalendars.unitId,
        })
        .from(schema.externalCalendars)
        .where(sql`id = ${externalCalendarId}`)
        .limit(1);

      await adminDb
        .update(schema.externalCalendars)
        .set({
          lastSyncedAt: new Date(),
          lastSyncStatus: 'error',
          lastSyncError: msg.slice(0, 1000),
        })
        .where(sql`id = ${externalCalendarId}`);

      // Notif al workspace dueño del feed (G71.2 ronda 6 + 95.1 ronda 8).
      const cal = calRows[0];
      if (cal) {
        try {
          const params = tpl.icalSyncFailed({
            organizationId: cal.organizationId,
            feedName: cal.name,
            externalCalendarId,
            errorMessage: msg,
            provider: cal.provider,
            unitId: cal.unitId,
          });
          await adminDb.transaction(async (tx) => {
            await setTenantContext(tx, cal.organizationId);
            await tx.insert(schema.inAppNotifications).values({
              organizationId: params.organizationId,
              userId: params.userId ?? null,
              category: params.category,
              severity: params.severity ?? 'info',
              title: params.title,
              body: params.body,
              actionUrl: params.actionUrl,
              data: params.data ?? {},
            });
          });
        } catch (notifyErr) {
          logger.warn({ notifyErr, externalCalendarId }, 'failed to create sync-fail notif');
        }
      }
      logger.error({ jobId: job.id, externalCalendarId, err: msg }, '✗ ical sync failed');
      throw err;
    }
  },
  { connection: redisConnection, concurrency: 4 },
);

icalWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, '✓ ical job completed');
});

icalWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, '✗ ical job failed');
});

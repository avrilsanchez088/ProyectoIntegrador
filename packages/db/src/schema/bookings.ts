import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { units } from './properties';

/**
 * Módulo M4 · Calendar + iCal sync.
 *
 * Premisa de negocio:
 * - Booking.com / Airbnb / GCal sincronizan HACIA nosotros (somos el sistema
 *   maestro). Importamos via iCal para marcar slots ocupados.
 * - Nosotros también exportamos iCal para que canales externos lean nuestra
 *   disponibilidad.
 * - Anti-double-booking lo enforzamos en DB con EXCLUDE constraint usando
 *   tstzrange. Aplicamos solo a status NO cancelados.
 *
 * Tablas:
 * - `bookings`: la reserva confirmada/tentativa. Origen interno o externo.
 * - `availability_blocks`: bloqueos manuales (mantenimiento, owner stay, etc.).
 * - `external_calendars`: feeds iCal de canales (Booking, Airbnb, GCal) que
 *    pollea el worker para crear bookings espejo con `source = 'airbnb'`, etc.
 */

// ─── bookings ───────────────────────────────────────
export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),

    /** Código corto legible para el huésped. Ej: "MERAKI-AB12X". Único por org. */
    code: text('code').notNull(),

    /**
     * Origen de la reserva:
     * - 'direct'   : tomada por el bot/staff (sistema maestro)
     * - 'airbnb'   : importada via iCal feed
     * - 'booking'  : importada via iCal feed
     * - 'gcal'     : importada via Google Calendar
     * - 'manual'   : carga manual del staff en panel
     * - 'ical'     : iCal genérico (otros canales)
     */
    source: text('source', {
      enum: ['direct', 'airbnb', 'booking', 'gcal', 'manual', 'ical'],
    })
      .notNull()
      .default('direct'),

    /**
     * Status:
     * - 'tentative' : pre-reserva, no bloquea hasta confirmar
     * - 'confirmed' : confirmada
     * - 'checked_in': huésped en sitio
     * - 'checked_out': finalizada con éxito
     * - 'cancelled' : cancelada (NO ocupa el slot)
     * - 'no_show'   : no se presentó (NO ocupa el slot a futuro)
     */
    status: text('status', {
      enum: ['tentative', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'],
    })
      .notNull()
      .default('tentative'),

    /** Fechas de la estadía (inclusive checkIn, exclusive checkOut). */
    checkIn: timestamp('check_in', { withTimezone: true }).notNull(),
    checkOut: timestamp('check_out', { withTimezone: true }).notNull(),

    /** Cantidad de huéspedes y mascotas confirmadas. */
    guestsCount: integer('guests_count').notNull().default(2),
    petsCount: integer('pets_count').notNull().default(0),

    /** Datos del huésped (snapshot al momento de la reserva). */
    guestName: text('guest_name'),
    guestEmail: text('guest_email'),
    guestPhone: text('guest_phone'),

    /** Quote final aplicado (resultado del pricing engine al confirmar). */
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    feesTotalCents: integer('fees_total_cents').notNull().default(0),
    discountCents: integer('discount_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    refundableTotalCents: integer('refundable_total_cents').notNull().default(0),
    currency: text('currency').notNull().default('USD'),

    /** Snapshot del lineItems del quote para auditoría. */
    quoteSnapshot: jsonb('quote_snapshot').notNull().default({}),

    /**
     * Snapshot de la cancellation policy aplicable al momento de crear la
     * reserva. Si después el dueño edita la policy del workspace, los bookings
     * viejos siguen rigiéndose por la versión que tenían al momento de
     * confirmarse. Resuelve G3.4.
     *
     * Shape: { id, name, tiers, defaultRefundPercent, capturedAt } o {} si la
     * unit/workspace no tenía policy default al momento de crear el booking.
     */
    cancellationPolicySnapshot: jsonb('cancellation_policy_snapshot').notNull().default({}),

    /** Si vino de iCal externo, su UID (para deduplicar al re-poll). */
    externalUid: text('external_uid'),
    externalCalendarId: uuid('external_calendar_id'),

    /** Notas internas del staff. */
    notes: text('notes'),

    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledReason: text('cancelled_reason'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bookings_org_code_idx').on(t.organizationId, t.code),
    // Para deduplicar imports externos por UID iCal.
    uniqueIndex('bookings_external_uid_idx')
      .on(t.externalCalendarId, t.externalUid)
      .where(sql`external_uid IS NOT NULL`),
    index('bookings_unit_status_idx').on(t.unitId, t.status),
    index('bookings_unit_dates_idx').on(t.unitId, t.checkIn, t.checkOut),
    pgPolicy('tenant_isolation_select', {
      for: 'select',
      using: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_insert', {
      for: 'insert',
      withCheck: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_update', {
      for: 'update',
      using: sql`organization_id = current_setting('app.tenant_id', true)`,
      withCheck: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_delete', {
      for: 'delete',
      using: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
  ],
);

// ─── availability_blocks ────────────────────────────
/**
 * Bloqueos manuales que no son reservas: mantenimiento, owner stay, hold de
 * pre-reserva sin booking aún, etc. También cuenta para el EXCLUDE.
 */
export const availabilityBlocks = pgTable(
  'availability_blocks',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),

    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),

    /** Razón legible. */
    reason: text('reason', {
      enum: ['maintenance', 'owner_stay', 'hold', 'closure', 'other'],
    })
      .notNull()
      .default('other'),

    /** Nota libre. */
    notes: text('notes'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('availability_blocks_unit_dates_idx').on(t.unitId, t.startsAt, t.endsAt),
    pgPolicy('tenant_isolation_select', {
      for: 'select',
      using: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_insert', {
      for: 'insert',
      withCheck: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_update', {
      for: 'update',
      using: sql`organization_id = current_setting('app.tenant_id', true)`,
      withCheck: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_delete', {
      for: 'delete',
      using: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
  ],
);

// ─── external_calendars ─────────────────────────────
/**
 * Feeds iCal externos a importar. El worker pollea cada `pollIntervalMinutes`
 * y crea bookings espejo con `source = provider`.
 */
export const externalCalendars = pgTable(
  'external_calendars',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),

    /** Canal origen. */
    provider: text('provider', {
      enum: ['airbnb', 'booking', 'gcal', 'ical'],
    }).notNull(),

    /** Nombre legible: "Airbnb · Cabaña Aurora". */
    name: text('name').notNull(),

    /** URL del feed iCal. */
    icalUrl: text('ical_url').notNull(),

    /** Cada cuánto se reimporta (default 15 min). */
    pollIntervalMinutes: integer('poll_interval_minutes').notNull().default(15),

    /** Activo / pausado. */
    enabled: integer('enabled').notNull().default(1),

    /** Estado del último poll. */
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastSyncStatus: text('last_sync_status', {
      enum: ['ok', 'error'],
    }),
    lastSyncError: text('last_sync_error'),
    lastEventCount: integer('last_event_count').notNull().default(0),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('external_calendars_unit_idx').on(t.unitId),
    pgPolicy('tenant_isolation_select', {
      for: 'select',
      using: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_insert', {
      for: 'insert',
      withCheck: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_update', {
      for: 'update',
      using: sql`organization_id = current_setting('app.tenant_id', true)`,
      withCheck: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_delete', {
      for: 'delete',
      using: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
  ],
);

// ─── ical_export_tokens ─────────────────────────────
/**
 * Tokens públicos rotables para que canales externos consuman nuestro feed
 * iCal sin auth. Se reparten por unit. URL final: /api/ical/:token.ics
 */
export const icalExportTokens = pgTable(
  'ical_export_tokens',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),

    /** Token random URL-safe (alta entropía). Único global. */
    token: text('token').notNull(),

    /** Etiqueta para identificar al canal: "Para Booking", "Para Airbnb". */
    label: text('label'),

    /** Cuándo se accedió por última vez (auditoría). */
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),

    /** Si se rotó / desactivó. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ical_export_tokens_token_idx').on(t.token),
    index('ical_export_tokens_unit_idx').on(t.unitId),
    pgPolicy('tenant_isolation_select', {
      for: 'select',
      using: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_insert', {
      for: 'insert',
      withCheck: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_update', {
      for: 'update',
      using: sql`organization_id = current_setting('app.tenant_id', true)`,
      withCheck: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_delete', {
      for: 'delete',
      using: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
  ],
);

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type AvailabilityBlock = typeof availabilityBlocks.$inferSelect;
export type NewAvailabilityBlock = typeof availabilityBlocks.$inferInsert;
export type ExternalCalendar = typeof externalCalendars.$inferSelect;
export type NewExternalCalendar = typeof externalCalendars.$inferInsert;
export type IcalExportToken = typeof icalExportTokens.$inferSelect;
export type NewIcalExportToken = typeof icalExportTokens.$inferInsert;

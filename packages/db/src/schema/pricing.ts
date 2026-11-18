import { sql } from 'drizzle-orm';
import {
  date,
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
import { properties, units } from './properties';

/**
 * Decisión 2026-05-06: el sistema NO hardcodea políticas de pricing/cancelación.
 * Cada cliente (workspace) define sus propias reglas. Almacenamos como JSONB
 * validado por Zod en el backend.
 *
 * Tablas:
 * - `seasons`: rangos de fechas con tipo (high/medium/low). Por property.
 * - `rates`: precio por noche para una unit en una season.
 * - `cancellation_policies`: tier list de "días antes → % refund".
 * - `unit_fees`: cleaning fee, security deposit, fee por mascota, etc.
 * - `pricing_rules`: min nights, weekend premium, last-minute discount, length-of-stay.
 */

// ─── seasons ────────────────────────────────────────
export const seasons = pgTable(
  'seasons',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    /** Nombre legible. Ej: "Alta · verano 2026". */
    name: text('name').notNull(),

    /** Tipo. Solo informativo + para defaults de pricing. */
    seasonType: text('season_type', { enum: ['high', 'medium', 'low', 'special'] }).notNull(),

    /** Rangos de fecha (inclusivos). Una season puede tener varios rangos. */
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),

    /** Sort order — la season con order menor se evalúa primero (override). */
    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  () => [
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

// ─── rates ──────────────────────────────────────────
export const rates = pgTable(
  'rates',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),

    /** Precio por noche en cents (USD). 18000 = USD 180. */
    pricePerNightCents: integer('price_per_night_cents').notNull(),

    /** Precio extra por persona adicional (por encima de baseGuests). En cents. */
    extraGuestPriceCents: integer('extra_guest_price_cents').notNull().default(0),

    /** Cantidad de huéspedes incluidos en el precio base. */
    baseGuests: integer('base_guests').notNull().default(2),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    // Una sola tarifa por unit + season.
    uniqueIndex('rates_unit_season_idx').on(t.unitId, t.seasonId),
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

// ─── cancellation policies ──────────────────────────
/**
 * Una cancellation_policy define una serie de tiers tipo:
 *   "más de 14 días antes → 100% refund"
 *   "entre 7-14 días antes → 50% refund"
 *   "menos de 7 días → 0%"
 *
 * Cada policy puede aplicar a toda la organization (default) o a una unit
 * específica via la columna unitId. La definición concreta vive en `tiers`
 * (JSONB validado por Zod en el backend).
 */
export const cancellationPolicies = pgTable(
  'cancellation_policies',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** NULL = aplica a toda la organization (default). */
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),

    /**
     * JSON con la forma:
     *   { tiers: [{ daysBefore: 14, refundPercent: 100 }, ...] }
     * Validado con Zod en runtime.
     */
    tiers: jsonb('tiers').notNull(),

    /** Si true, esta es la política default del workspace. */
    isDefault: integer('is_default').notNull().default(0), // 0/1, no boolean para compat

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  () => [
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

// ─── unit fees ──────────────────────────────────────
/**
 * Cleaning fees, security deposits, pet fees, transfer fees, etc.
 * Configurables por unit. El bot consulta esto al cotizar.
 */
export const unitFees = pgTable(
  'unit_fees',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),

    name: text('name').notNull(), // "Limpieza", "Depósito de seguridad", "Mascota"
    feeType: text('fee_type', {
      enum: ['cleaning', 'deposit', 'pet', 'extra_guest', 'transfer', 'other'],
    }).notNull(),

    /** Cómo se calcula:
     *  - 'fixed': monto fijo
     *  - 'per_night': monto * cantidad de noches
     *  - 'per_guest': monto * cantidad de huéspedes
     *  - 'per_pet': monto * cantidad de mascotas
     *  - 'percent_of_total': porcentaje del total de la reserva
     */
    chargeType: text('charge_type', {
      enum: ['fixed', 'per_night', 'per_guest', 'per_pet', 'percent_of_total'],
    }).notNull(),

    /** Monto en cents (USD). Si chargeType es percent, este es el % * 100 (ej: 1500 = 15%). */
    amountCents: integer('amount_cents').notNull(),

    /** Si true, es reembolsable (depósitos lo son típicamente). */
    refundable: integer('refundable').notNull().default(0),

    /** Si true, es opcional (el huésped puede declinarlo). */
    optional: integer('optional').notNull().default(0),

    /** Para mostrar en orden ascendente. */
    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  () => [
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

// ─── pricing rules ──────────────────────────────────
/**
 * Reglas extra de pricing por property o unit:
 * - min_nights por día de la semana
 * - weekend premium
 * - last-minute discount
 * - length-of-stay discount
 *
 * Almacenado como JSONB validado por Zod (el shape exacto vive en
 * `@impacto/shared/schemas`).
 */
export const pricingRules = pgTable(
  'pricing_rules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** NULL = aplica a toda la organization. */
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),

    /** JSON validado contra `pricingRulesConfigSchema` en @impacto/shared. */
    config: jsonb('config').notNull().default({}),

    /** Si true, está activa. */
    enabled: integer('enabled').notNull().default(1),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  () => [
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

export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
export type Rate = typeof rates.$inferSelect;
export type NewRate = typeof rates.$inferInsert;
export type CancellationPolicy = typeof cancellationPolicies.$inferSelect;
export type UnitFee = typeof unitFees.$inferSelect;
export type PricingRule = typeof pricingRules.$inferSelect;

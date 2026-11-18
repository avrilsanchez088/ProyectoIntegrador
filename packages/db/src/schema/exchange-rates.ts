import { sql } from 'drizzle-orm';
import { date, numeric, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Tabla de tasas de cambio históricas (G10 / §1.6 del audit).
 *
 * Decisión 2026-05-06:
 *  - Source: open.er-api.com (free, sin API key, soporta ARS y UYU)
 *  - Refresh diario via cron del worker
 *  - Tasa fija al momento de crear la reserva (NO al pagar) → snapshot en
 *    `bookings.quoteSnapshot.exchangeRate` cuando se necesite mostrar al
 *    huésped en su moneda local
 *
 * No tiene RLS — es data global (todas las orgs ven las mismas tasas).
 *
 * Ejemplos:
 *   { day: 2026-05-10, base: 'USD', quote: 'UYU', rate: 39.45 }
 *   { day: 2026-05-10, base: 'USD', quote: 'ARS', rate: 1180.50 }
 */
export const exchangeRates = pgTable(
  'exchange_rates',
  {
    /** Día (no timestamp) — tasa diaria. */
    day: date('day').notNull(),

    /** Moneda base (típicamente USD). ISO 4217. */
    base: text('base').notNull(),

    /** Moneda destino (UYU / ARS / etc). ISO 4217. */
    quote: text('quote').notNull(),

    /** rate * base = quote. Numeric para no perder precisión. */
    rate: numeric('rate', { precision: 18, scale: 8 }).notNull(),

    /** Provider que produjo la tasa (audit). */
    source: text('source').notNull().default('open.er-api.com'),

    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique por (día, par) — el cron diario hace upsert.
    uniqueIndex('exchange_rates_day_pair_idx').on(t.day, t.base, t.quote),
  ],
);

export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type NewExchangeRate = typeof exchangeRates.$inferInsert;

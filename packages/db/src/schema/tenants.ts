import { sql } from 'drizzle-orm';
import { boolean, integer, jsonb, pgPolicy, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

/**
 * `tenant_settings` — datos de negocio asociados a una organization (workspace).
 *
 * Relación: 1 organization ↔ 1 tenant_settings (mismo id).
 *
 * Better Auth maneja la organization (nombre, slug, logo, members, invitations).
 * Acá guardamos lo que NO es responsabilidad de auth: timezone, currency, plan
 * Stripe, settings UI custom, etc.
 *
 * Decisión 2026-05-06:
 * - 1 dueño tiene 1 organization (workspace)
 * - 1 organization tiene N properties (alojamientos)
 * - Múltiples users colaboran via members (Better Auth org plugin)
 */
export const tenantSettings = pgTable(
  'tenant_settings',
  {
    /** PK = organization.id (mismo valor). 1:1 con organizations. */
    id: text('id')
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** ISO country code. Default UY. */
    country: text('country').notNull().default('UY'),

    /** IANA timezone. Default America/Montevideo. */
    timezone: text('timezone').notNull().default('America/Montevideo'),

    /** ISO 4217 currency interna del tenant. Default USD. */
    currency: text('currency').notNull().default('USD'),

    /** Plan Stripe activo. NULL durante trial inicial. */
    plan: text('plan'),

    /** Stripe customer/subscription IDs (null hasta activar billing). */
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),

    /** Trial expira el ... NULL si ya tienen subscription activa. */
    trialEndsAt: timestamp('trial_ends_at'),

    /** Settings UI / custom (logo URL, colores, voice del bot, etc.). */
    settings: jsonb('settings').notNull().default({}),

    /**
     * Si true, el workspace está congelado por staff Impacto (problemas de
     * pago, abuso, etc.). Mutations API devuelven 402 hasta que se quita.
     * Propuesta 118.3 ronda 10.
     */
    frozen: boolean('frozen').notNull().default(false),
    frozenReason: text('frozen_reason'),
    frozenAt: timestamp('frozen_at', { withTimezone: true }),

    /**
     * Whitelist de op-keys que pasan aún si frozen=true (propuesta 142.3
     * ronda 12). Ej: ['booking.checkin', 'booking.checkout']. El middleware
     * blockIfFrozen mapea path+method → op-key.
     */
    frozenAllowOps: text('frozen_allow_ops').array().notNull().default(sql`'{}'::text[]`),

    /**
     * Días de retención del audit log (propuesta 141.4 ronda 12). Worker
     * `audit-purge` borra eventos más viejos que esto. Default 365.
     */
    auditRetentionDays: integer('audit_retention_days').notNull().default(365),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  () => [
    // RLS: id (= organization.id) debe matchear el tenant_id de la sesión.
    pgPolicy('tenant_isolation_select', {
      for: 'select',
      using: sql`id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_insert', {
      for: 'insert',
      withCheck: sql`id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_update', {
      for: 'update',
      using: sql`id = current_setting('app.tenant_id', true)`,
      withCheck: sql`id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_delete', {
      for: 'delete',
      using: sql`id = current_setting('app.tenant_id', true)`,
    }),
  ],
);

export type TenantSettings = typeof tenantSettings.$inferSelect;
export type NewTenantSettings = typeof tenantSettings.$inferInsert;

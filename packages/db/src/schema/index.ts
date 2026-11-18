// Schema barrel — exporta todas las tablas y relaciones.
// Cada dominio del producto tiene su propio archivo para mantener el orden.

export * from './auth'; // users, sessions, accounts, verifications
export * from './organizations'; // organizations, members, invitations (Better Auth)
export * from './tenants'; // tenant_settings (1:1 con organizations)
export * from './properties'; // properties, units, photos (con RLS)
export * from './pricing'; // seasons, rates, cancellation_policies, unit_fees, pricing_rules (con RLS)
export * from './bookings'; // bookings, availability_blocks, external_calendars, ical_export_tokens (M4)
export * from './exchange-rates'; // exchange_rates (cron diario, sin RLS)
export * from './notifications'; // in_app_notifications (con RLS)
export * from './admin'; // tablas staff-only (announcements, incidents, gdpr, workers, freeze log, tags, integrations)

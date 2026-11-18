/**
 * Workspace member roles, ordered by privilege descending.
 * Owner has all permissions including billing and workspace deletion.
 */
export const ROLES = ['owner', 'admin', 'agent', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Per-role capabilities. The Role check is done at the API boundary.
 */
export const ROLE_CAPABILITIES: Record<Role, readonly string[]> = {
  owner: ['*'],
  admin: [
    'workspace:read',
    'workspace:write',
    'members:invite',
    'members:remove',
    'properties:*',
    'units:*',
    'reservations:*',
    'leads:*',
    'reports:*',
  ],
  agent: [
    'workspace:read',
    'reservations:read',
    'reservations:create',
    'leads:*',
    'conversations:*',
  ],
  viewer: [
    'workspace:read',
    'properties:read',
    'units:read',
    'reservations:read',
    'leads:read',
    'reports:read',
  ],
} as const;

/**
 * Lead pipeline stages. Order matters — used in kanban UI.
 */
export const LEAD_STAGES = [
  'new',
  'qualified',
  'quoted',
  'pending_deposit',
  'confirmed',
  'lost',
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/**
 * Booking sources we recognize. Debe matchear el enum del schema
 * `bookings.source` (packages/db/src/schema/bookings.ts).
 * Si cambia uno, cambia el otro.
 */
export const BOOKING_SOURCES = ['direct', 'airbnb', 'booking', 'gcal', 'manual', 'ical'] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

/**
 * Reservation status lifecycle.
 */
export const RESERVATION_STATUS = [
  'pending',
  'pending_deposit',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
  'no_show',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUS)[number];

/**
 * Subscription plan tiers (Stripe products).
 */
export const PLANS = ['starter', 'pro', 'performance'] as const;
export type Plan = (typeof PLANS)[number];

export const TENANT_DEFAULT_TIMEZONE = 'America/Montevideo' as const;
export const TENANT_DEFAULT_CURRENCY = 'USD' as const;

/**
 * API DTOs — shapes que la API expone y el frontend consume.
 *
 * Vivían duplicados como `type X = {...}` inline en cada page del dashboard.
 * Centralizándolos acá (G9.1, G9.5):
 *  - frontend importa `import type { Property, Booking } from '@impacto/shared'`
 *  - cuando el shape cambie en el schema, basta cambiar acá y typecheck rompe
 *    en TODOS los consumidores.
 *
 * No usamos los `$inferSelect` de Drizzle directamente porque ese tipo trae
 * Date objects en columnas timestamp, mientras que la API serializa todo a
 * JSON (strings ISO). Acá modelamos el shape *después* del JSON.parse.
 */

// ─── Property ───────────────────────────────────────
export interface Property {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  propertyType: string;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
  coverPhotoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ─── Unit ───────────────────────────────────────────
export interface Unit {
  id: string;
  organizationId: string;
  propertyId: string;
  name: string;
  slug: string;
  unitType: string;
  description: string | null;
  maxGuests: number;
  bedrooms: number | null;
  bathrooms: number | null;
  amenities: string[];
  petsAllowed: number; // 0=no, 1=yes, 2=consult
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ─── Photo ──────────────────────────────────────────
export interface Photo {
  id: string;
  organizationId: string;
  propertyId: string | null;
  unitId: string | null;
  originalUrl: string;
  thumbSmallUrl: string | null;
  thumbLargeUrl: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  tags: string[];
  caption: string | null;
  sortOrder: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  createdAt: string;
  updatedAt: string;
}

// ─── Pricing ────────────────────────────────────────
export type SeasonType = 'high' | 'medium' | 'low' | 'special';

export interface Season {
  id: string;
  organizationId: string;
  propertyId: string;
  name: string;
  seasonType: SeasonType;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Rate {
  id: string;
  organizationId: string;
  unitId: string;
  seasonId: string;
  pricePerNightCents: number;
  baseGuests: number;
  extraGuestPriceCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface CancellationPolicy {
  id: string;
  organizationId: string;
  unitId: string | null;
  name: string;
  tiers: Array<{ daysBefore: number; refundPercent: number; description?: string }>;
  isDefault: number; // 0|1
  createdAt: string;
  updatedAt: string;
}

export interface UnitFee {
  id: string;
  organizationId: string;
  unitId: string;
  name: string;
  feeType: string;
  chargeType: string;
  amountCents: number;
  refundable: number; // 0|1
  optional: number; // 0|1
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PricingRule {
  id: string;
  organizationId: string;
  unitId: string | null;
  name: string;
  config: Record<string, unknown>;
  enabled: number; // 0|1
  createdAt: string;
  updatedAt: string;
}

// ─── Bookings ───────────────────────────────────────
export type BookingStatus =
  | 'tentative'
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'no_show';

// BookingSource se exporta desde `./constants` (derivado de BOOKING_SOURCES).
// Lo re-importamos para que `Booking` lo use sin volver a declararlo.
import type { BookingSource } from './constants';

export interface Booking {
  id: string;
  organizationId: string;
  unitId: string;
  code: string;
  source: BookingSource;
  status: BookingStatus;
  checkIn: string;
  checkOut: string;
  guestsCount: number;
  petsCount: number;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  subtotalCents: number;
  feesTotalCents: number;
  discountCents: number;
  totalCents: number;
  refundableTotalCents: number;
  currency: string;
  quoteSnapshot: Record<string, unknown>;
  cancellationPolicySnapshot: Record<string, unknown>;
  externalUid: string | null;
  externalCalendarId: string | null;
  notes: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilityBlock {
  id: string;
  organizationId: string;
  unitId: string;
  startsAt: string;
  endsAt: string;
  reason: 'maintenance' | 'owner_stay' | 'hold' | 'closure' | 'other';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalCalendar {
  id: string;
  organizationId: string;
  unitId: string;
  provider: 'airbnb' | 'booking' | 'gcal' | 'ical';
  name: string;
  icalUrl: string;
  pollIntervalMinutes: number;
  enabled: number; // 0|1
  lastSyncedAt: string | null;
  lastSyncStatus: 'ok' | 'error' | null;
  lastSyncError: string | null;
  lastEventCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface IcalExportToken {
  id: string;
  organizationId: string;
  unitId: string;
  token: string;
  label: string | null;
  lastAccessedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

// ─── Notifications (in-app) ─────────────────────────
export type NotificationCategory =
  | 'wa_message'
  | 'booking'
  | 'ical_sync_failed'
  | 'payment'
  | 'mention'
  | 'system';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'urgent';

export interface NotifyParams {
  organizationId: string;
  /** Si null o undefined, broadcast a toda la org. */
  userId?: string | null;
  category: NotificationCategory;
  severity?: NotificationSeverity;
  title: string;
  body?: string;
  actionUrl?: string;
  data?: Record<string, unknown>;
}

// ─── Tenant settings ────────────────────────────────
export interface TenantSettings {
  id: string;
  country: string;
  timezone: string;
  currency: 'USD' | 'UYU' | 'ARS';
  plan: string | null;
  trialEndsAt: string | null;
  settings: Record<string, unknown>;
  materialized?: boolean; // flag custom de GET /api/settings
  createdAt: string | null;
  updatedAt: string | null;
}

// ─── Wrappers ───────────────────────────────────────
export interface ApiList<T> {
  data: T[];
  pagination?: { total?: number; limit: number; offset: number };
}

export interface ApiItem<T> {
  data: T;
}

export interface BookingCounts {
  tentative: number;
  confirmed: number;
  checked_in: number;
  checked_out: number;
  cancelled: number;
  no_show: number;
}

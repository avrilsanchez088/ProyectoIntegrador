import { z } from 'zod';

/**
 * Schemas de bookings (M4). Compartidos entre forms y validación API.
 */

// ─── booking ────────────────────────────────────────
export const bookingSourceSchema = z.enum([
  'direct',
  'airbnb',
  'booking',
  'gcal',
  'manual',
  'ical',
]);

export const bookingStatusSchema = z.enum([
  'tentative',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
  'no_show',
]);

/** ISO datetime con timezone (ej: "2026-11-15T14:00:00Z"). */
const isoDateTime = z.string().datetime({ offset: true });

export const createBookingSchema = z
  .object({
    unitId: z.string().uuid(),
    code: z
      .string()
      .min(3)
      .max(40)
      .regex(/^[A-Z0-9-]+$/, 'Solo mayúsculas, números y guiones'),
    source: bookingSourceSchema.default('direct'),
    status: bookingStatusSchema.default('tentative'),
    checkIn: isoDateTime,
    checkOut: isoDateTime,
    guestsCount: z.number().int().min(1).max(50).default(2),
    petsCount: z.number().int().min(0).max(20).default(0),
    guestName: z.string().max(120).optional(),
    guestEmail: z.string().email().optional(),
    guestPhone: z.string().max(40).optional(),
    notes: z.string().max(1000).optional(),
    // Quote opcional (si no se manda, lo calcula el backend con el pricing engine).
    subtotalCents: z.number().int().min(0).optional(),
    feesTotalCents: z.number().int().min(0).optional(),
    discountCents: z.number().int().min(0).optional(),
    totalCents: z.number().int().min(0).optional(),
    refundableTotalCents: z.number().int().min(0).optional(),
    currency: z.string().length(3).default('USD'),
  })
  .refine((d) => new Date(d.checkOut) > new Date(d.checkIn), {
    message: 'checkOut debe ser posterior a checkIn',
    path: ['checkOut'],
  });

export const updateBookingSchema = z
  .object({
    status: bookingStatusSchema.optional(),
    checkIn: isoDateTime.optional(),
    checkOut: isoDateTime.optional(),
    guestsCount: z.number().int().min(1).max(50).optional(),
    petsCount: z.number().int().min(0).max(20).optional(),
    guestName: z.string().max(120).optional(),
    guestEmail: z.string().email().optional(),
    guestPhone: z.string().max(40).optional(),
    notes: z.string().max(1000).optional(),
    cancelledReason: z.string().max(500).optional(),
  })
  .refine((d) => !d.checkIn || !d.checkOut || new Date(d.checkOut) > new Date(d.checkIn), {
    message: 'checkOut debe ser posterior a checkIn',
    path: ['checkOut'],
  });

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;

// ─── availability_blocks ────────────────────────────
export const blockReasonSchema = z.enum(['maintenance', 'owner_stay', 'hold', 'closure', 'other']);

// Object base sin `.refine()` para que `.partial()` funcione.
const availabilityBlockBaseObject = z.object({
  unitId: z.string().uuid(),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  reason: blockReasonSchema.default('other'),
  notes: z.string().max(1000).optional(),
});

export const createAvailabilityBlockSchema = availabilityBlockBaseObject.refine(
  (d) => new Date(d.endsAt) > new Date(d.startsAt),
  {
    message: 'endsAt debe ser posterior a startsAt',
    path: ['endsAt'],
  },
);

export const updateAvailabilityBlockSchema = availabilityBlockBaseObject.partial();

export type CreateAvailabilityBlockInput = z.infer<typeof createAvailabilityBlockSchema>;

// ─── external_calendars ─────────────────────────────
export const calendarProviderSchema = z.enum(['airbnb', 'booking', 'gcal', 'ical']);

export const createExternalCalendarSchema = z.object({
  unitId: z.string().uuid(),
  provider: calendarProviderSchema,
  name: z.string().min(2).max(100),
  icalUrl: z.string().url(),
  pollIntervalMinutes: z.number().int().min(5).max(1440).default(15),
  enabled: z.boolean().default(true),
});

export const updateExternalCalendarSchema = createExternalCalendarSchema.partial();

export type CreateExternalCalendarInput = z.infer<typeof createExternalCalendarSchema>;

// ─── ical export tokens ─────────────────────────────
export const createIcalExportTokenSchema = z.object({
  unitId: z.string().uuid(),
  label: z.string().max(100).optional(),
});

export type CreateIcalExportTokenInput = z.infer<typeof createIcalExportTokenSchema>;

// ─── availability query ─────────────────────────────
export const availabilityQuerySchema = z
  .object({
    unitId: z.string().uuid(),
    from: isoDateTime,
    to: isoDateTime,
  })
  .refine((d) => new Date(d.to) > new Date(d.from), {
    message: 'to debe ser posterior a from',
    path: ['to'],
  });

export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;

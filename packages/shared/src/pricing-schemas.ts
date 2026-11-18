import { z } from 'zod';

/**
 * Schemas declarativos para los JSONB del módulo pricing.
 *
 * Decisión clave 2026-05-06: el SaaS NO hardcodea políticas de pricing/
 * cancelación/fees. Cada cliente define las suyas, validadas con estos schemas.
 */

// ─── Cancellation policy ────────────────────────────
/**
 * Tier individual de una política de cancelación.
 * Ej: { daysBefore: 14, refundPercent: 100 } = "más de 14 días antes → 100%"
 */
export const cancellationTierSchema = z.object({
  daysBefore: z.number().int().min(0).max(365),
  refundPercent: z.number().min(0).max(100),
  description: z.string().max(200).optional(),
});

export const cancellationTiersSchema = z.object({
  tiers: z.array(cancellationTierSchema).min(1, 'Mínimo 1 tier'),
  /** Refund por defecto si no matchea ningún tier (típicamente 0). */
  defaultRefundPercent: z.number().min(0).max(100).default(0),
});

export type CancellationTier = z.infer<typeof cancellationTierSchema>;
export type CancellationTiers = z.infer<typeof cancellationTiersSchema>;

// ─── Pricing rules ──────────────────────────────────
/**
 * Reglas extras configurables por property/unit.
 */
export const pricingRulesConfigSchema = z.object({
  /** Mínimo de noches por día de la semana (1=lunes, 7=domingo). */
  minNightsByDayOfWeek: z
    .object({
      monday: z.number().int().min(1).max(30).optional(),
      tuesday: z.number().int().min(1).max(30).optional(),
      wednesday: z.number().int().min(1).max(30).optional(),
      thursday: z.number().int().min(1).max(30).optional(),
      friday: z.number().int().min(1).max(30).optional(),
      saturday: z.number().int().min(1).max(30).optional(),
      sunday: z.number().int().min(1).max(30).optional(),
    })
    .optional(),

  /** Premium % a aplicar para reservas que incluyen viernes/sábado. */
  weekendPremiumPercent: z.number().min(0).max(100).optional(),

  /** Last-minute discount: si reserva con menos de N días, % off. */
  lastMinuteDiscount: z
    .object({
      daysBefore: z.number().int().min(1).max(30),
      discountPercent: z.number().min(0).max(50),
    })
    .optional(),

  /** Length-of-stay discount tier list. Ej: 5 noches → 5% off, 7 → 10%. */
  lengthOfStayDiscount: z
    .array(
      z.object({
        minNights: z.number().int().min(2),
        discountPercent: z.number().min(0).max(50),
      }),
    )
    .optional(),

  /** Check-in/out times (24h format "14:00"). */
  checkInTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  checkOutTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),

  /** Mínimo de noches global (si no hay regla específica del DOW). */
  minNightsDefault: z.number().int().min(1).max(30).default(1),
  maxNightsDefault: z.number().int().min(1).max(365).optional(),

  /** Booking window: cuántos días para adelante se puede reservar. */
  advanceBookingDays: z.number().int().min(1).max(730).default(365),
  /** Cuántos días de anticipación mínimos. 0 = same-day OK. */
  minAdvanceBookingDays: z.number().int().min(0).max(365).default(0),
});

export type PricingRulesConfig = z.infer<typeof pricingRulesConfigSchema>;

// ─── Forms (CRUD) ───────────────────────────────────
import { slugSchema } from './schemas';

// Re-export para uso en API/forms
export { slugSchema };

/**
 * Object base — sin `.refine()` para que `.partial()` funcione (ZodEffects no
 * tiene `.partial()`). Lo exponemos sólo para construir el `update` schema.
 */
const seasonBaseObject = z.object({
  propertyId: z.string().uuid(),
  name: z.string().min(2).max(100),
  seasonType: z.enum(['high', 'medium', 'low', 'special']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  sortOrder: z.number().int().default(0),
});

export const createSeasonSchema = seasonBaseObject.refine((d) => d.endDate >= d.startDate, {
  message: 'endDate debe ser mayor o igual a startDate',
  path: ['endDate'],
});

/**
 * Verifica si dos seasons se superponen en fechas. Útil para chequear server-side
 * antes de insertar (no se puede expresar en zod refine ya que necesita
 * comparar contra otros rows en la DB).
 */
export function seasonsOverlap(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export const createRateSchema = z.object({
  unitId: z.string().uuid(),
  seasonId: z.string().uuid(),
  pricePerNightCents: z.number().int().min(0),
  extraGuestPriceCents: z.number().int().min(0).default(0),
  baseGuests: z.number().int().min(1).default(2),
});

export const createCancellationPolicySchema = z.object({
  unitId: z.string().uuid().nullable().optional(),
  name: z.string().min(2).max(100),
  tiers: cancellationTiersSchema,
  isDefault: z.boolean().default(false),
});

export const createUnitFeeSchema = z.object({
  unitId: z.string().uuid(),
  name: z.string().min(2).max(100),
  feeType: z.enum(['cleaning', 'deposit', 'pet', 'extra_guest', 'transfer', 'other']),
  chargeType: z.enum(['fixed', 'per_night', 'per_guest', 'per_pet', 'percent_of_total']),
  amountCents: z.number().int().min(0),
  refundable: z.boolean().default(false),
  optional: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export type CreateSeasonInput = z.infer<typeof createSeasonSchema>;
export type CreateRateInput = z.infer<typeof createRateSchema>;
export type CreateCancellationPolicyInput = z.infer<typeof createCancellationPolicySchema>;
export type CreateUnitFeeInput = z.infer<typeof createUnitFeeSchema>;

// Update versions = partial of create. Para `season`, usamos el object base
// sin `.refine()` (ZodEffects no tiene `.partial()`).
export const updateSeasonSchema = seasonBaseObject.partial();
export const updateRateSchema = createRateSchema.partial();
export const updateCancellationPolicySchema = createCancellationPolicySchema.partial();
export const updateUnitFeeSchema = createUnitFeeSchema.partial();

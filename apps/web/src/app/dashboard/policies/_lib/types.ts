/**
 * Types y schemas compartidos entre policies y rules sections (§8.2 del audit).
 * Antes vivían inline en page.tsx (1160 líneas).
 */
import { z } from 'zod';

export type Tier = {
  daysBefore: number;
  refundPercent: number;
  description?: string;
};

export type Policy = {
  id: string;
  unitId: string | null;
  name: string;
  tiers: { tiers: Tier[]; defaultRefundPercent: number };
  isDefault: number;
  createdAt: string;
};

export type Unit = { id: string; name: string };

export type DayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export const DAYS: { key: DayKey; label: string }[] = [
  { key: 'monday', label: 'Lun' },
  { key: 'tuesday', label: 'Mar' },
  { key: 'wednesday', label: 'Mié' },
  { key: 'thursday', label: 'Jue' },
  { key: 'friday', label: 'Vie' },
  { key: 'saturday', label: 'Sáb' },
  { key: 'sunday', label: 'Dom' },
];

export type PricingRuleConfig = {
  minNightsByDayOfWeek?: Partial<Record<DayKey, number>>;
  weekendPremiumPercent?: number;
  lastMinuteDiscount?: { daysBefore: number; discountPercent: number };
  lengthOfStayDiscount?: Array<{ minNights: number; discountPercent: number }>;
  checkInTime?: string;
  checkOutTime?: string;
  minNightsDefault?: number;
  maxNightsDefault?: number;
  advanceBookingDays?: number;
  minAdvanceBookingDays?: number;
};

export type PricingRule = {
  id: string;
  unitId: string | null;
  name: string;
  config: PricingRuleConfig;
  enabled: number;
};

// ─── Form schemas ───────────────────────────────────
export const policyForm = z.object({
  name: z.string().min(2).max(100),
  unitId: z.string().uuid().nullable(),
  isDefault: z.boolean().default(false),
  defaultRefundPercent: z.coerce.number().min(0).max(100).default(0),
  tiers: z
    .array(
      z.object({
        daysBefore: z.coerce.number().int().min(0).max(365),
        refundPercent: z.coerce.number().min(0).max(100),
        description: z.string().max(200).optional(),
      }),
    )
    .min(1, 'Mínimo 1 tier'),
});
export type PolicyFormValues = z.infer<typeof policyForm>;

export const ruleForm = z.object({
  name: z.string().min(2).max(100),
  unitId: z.string().uuid().nullable(),
  enabled: z.boolean().default(true),
  minNightsDefault: z.coerce.number().int().min(1).max(30).default(1),
  maxNightsDefault: z.coerce.number().int().min(1).max(365).optional(),
  advanceBookingDays: z.coerce.number().int().min(1).max(730).default(365),
  minAdvanceBookingDays: z.coerce.number().int().min(0).max(365).default(0),
  checkInTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .or(z.literal('')),
  checkOutTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .or(z.literal('')),
  weekendPremiumPercent: z.coerce.number().min(0).max(100).optional(),
  monday: z.coerce.number().int().min(0).max(30).optional(),
  tuesday: z.coerce.number().int().min(0).max(30).optional(),
  wednesday: z.coerce.number().int().min(0).max(30).optional(),
  thursday: z.coerce.number().int().min(0).max(30).optional(),
  friday: z.coerce.number().int().min(0).max(30).optional(),
  saturday: z.coerce.number().int().min(0).max(30).optional(),
  sunday: z.coerce.number().int().min(0).max(30).optional(),
  lastMinuteDays: z.coerce.number().int().min(1).max(30).optional(),
  lastMinutePercent: z.coerce.number().min(0).max(50).optional(),
  losTiers: z
    .array(
      z.object({
        minNights: z.coerce.number().int().min(2),
        discountPercent: z.coerce.number().min(0).max(50),
      }),
    )
    .default([]),
});
export type RuleFormValues = z.infer<typeof ruleForm>;

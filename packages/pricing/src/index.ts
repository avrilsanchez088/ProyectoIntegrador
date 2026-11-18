/**
 * Pricing engine puro. No tiene side-effects ni dependencias de DB.
 *
 * Recibe los inputs (rates, fees, rules) y devuelve la cotización.
 * Usado por el bot WhatsApp y por el UI para mostrar precios al huésped.
 *
 * Idempotente y testeable.
 */

import type { CancellationTiers, PricingRulesConfig } from '@impacto/shared';

export type FeeType = 'cleaning' | 'deposit' | 'pet' | 'extra_guest' | 'transfer' | 'other';
export type ChargeType = 'fixed' | 'per_night' | 'per_guest' | 'per_pet' | 'percent_of_total';

export interface RateInput {
  /** Inicio de la season (YYYY-MM-DD inclusive). */
  startDate: string;
  /** Fin de la season (YYYY-MM-DD inclusive). */
  endDate: string;
  /** Precio por noche en cents USD. */
  pricePerNightCents: number;
  /** Precio por huésped extra (por encima de baseGuests) en cents. */
  extraGuestPriceCents: number;
  /** Cantidad de huéspedes incluidos en el precio base. */
  baseGuests: number;
}

export interface FeeInput {
  name: string;
  feeType: FeeType;
  chargeType: ChargeType;
  amountCents: number;
  refundable: boolean;
  optional: boolean;
}

export interface QuoteInput {
  /** Check-in YYYY-MM-DD (inclusive). */
  checkIn: string;
  /** Check-out YYYY-MM-DD (exclusive — la última noche es checkOut - 1). */
  checkOut: string;
  /** Cantidad total de huéspedes. */
  guests: number;
  /** Cantidad de mascotas (afecta pet fees). */
  pets: number;
  /** Tarifas activas del unit. La función elige la que corresponde a las fechas. */
  rates: RateInput[];
  /** Fees aplicables al unit. Las opcionales se pueden filtrar antes. */
  fees: FeeInput[];
  /** Reglas de pricing (length-of-stay, last-minute, weekend premium). */
  rules?: PricingRulesConfig;
  /** Día actual (para last-minute discount). Default: hoy. YYYY-MM-DD. */
  today?: string;
}

export interface QuoteLineItem {
  type: 'nights' | 'extra_guests' | 'fee' | 'discount' | 'premium';
  label: string;
  amountCents: number;
  refundable?: boolean;
}

export interface QuoteResult {
  /** Cantidad de noches reservadas. */
  nights: number;
  /** Tarifa aplicable promedio (cents). */
  avgNightlyRateCents: number;
  /** Subtotal: noches × precio + extra-guest. */
  subtotalCents: number;
  /** Línea por línea para mostrar al huésped. */
  lineItems: QuoteLineItem[];
  /** Total final = subtotal + premiums - discounts + fees. */
  totalCents: number;
  /** Suma de fees reembolsables (depósitos). */
  refundableTotalCents: number;
  /** Razón si la cotización falla (out of season, sin rate, etc.). */
  error?: string;
}

// ─── Helpers ────────────────────────────────────────

function parseDate(s: string): Date {
  // Asumimos UTC para evitar drift de timezone en cálculos de noches.
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y as number, (m as number) - 1, d as number));
}

function diffNights(checkIn: string, checkOut: string): number {
  const ms = parseDate(checkOut).getTime() - parseDate(checkIn).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/**
 * ¿Una fecha (YYYY-MM-DD) está dentro de un range [startDate, endDate]?
 */
function dateInRange(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate;
}

/**
 * Itera todas las noches del booking y devuelve qué rate se aplica a cada una.
 * Si una noche no matchea ninguna rate → error.
 */
function selectNightlyRates(input: QuoteInput): RateInput[] | null {
  const nights: RateInput[] = [];
  const start = parseDate(input.checkIn);
  const end = parseDate(input.checkOut);
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    const matched = input.rates.find((r) => dateInRange(dateStr, r.startDate, r.endDate));
    if (!matched) return null;
    nights.push(matched);
  }
  return nights;
}

/**
 * ¿La fecha es viernes (5) o sábado (6)?
 * Day of week: 0=domingo, 1=lunes, ..., 6=sábado.
 */
function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 5 || day === 6;
}

/**
 * Calcula min nights requerido para un rango.
 * Si rules tiene minNightsByDayOfWeek y el check-in es viernes con minNights=2,
 * el booking debe tener al menos 2 noches.
 */
export function getMinNightsForCheckIn(checkIn: string, rules?: PricingRulesConfig): number {
  if (!rules) return 1;
  const dayOfWeek = parseDate(checkIn).getUTCDay();
  const map = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ] as const;
  const dayKey = map[dayOfWeek];
  if (dayKey) {
    const v = rules.minNightsByDayOfWeek?.[dayKey];
    if (v) return v;
  }
  return rules.minNightsDefault ?? 1;
}

// ─── Main quote function ────────────────────────────

/**
 * Calcula la cotización completa para un booking dado.
 * Pure function: misma input → misma output, sin side-effects.
 */
export function quote(input: QuoteInput): QuoteResult {
  const nights = diffNights(input.checkIn, input.checkOut);

  // Validations
  if (nights <= 0) {
    return {
      nights: 0,
      avgNightlyRateCents: 0,
      subtotalCents: 0,
      lineItems: [],
      totalCents: 0,
      refundableTotalCents: 0,
      error: 'invalid_date_range',
    };
  }

  if (input.guests < 1) {
    return {
      nights,
      avgNightlyRateCents: 0,
      subtotalCents: 0,
      lineItems: [],
      totalCents: 0,
      refundableTotalCents: 0,
      error: 'invalid_guests',
    };
  }

  // Min nights check (si hay rules)
  if (input.rules) {
    const minNights = getMinNightsForCheckIn(input.checkIn, input.rules);
    if (nights < minNights) {
      return {
        nights,
        avgNightlyRateCents: 0,
        subtotalCents: 0,
        lineItems: [],
        totalCents: 0,
        refundableTotalCents: 0,
        error: `min_nights_${minNights}`,
      };
    }
    if (input.rules.maxNightsDefault && nights > input.rules.maxNightsDefault) {
      return {
        nights,
        avgNightlyRateCents: 0,
        subtotalCents: 0,
        lineItems: [],
        totalCents: 0,
        refundableTotalCents: 0,
        error: `max_nights_${input.rules.maxNightsDefault}`,
      };
    }
  }

  // Resolve rates per night
  const nightRates = selectNightlyRates(input);
  if (!nightRates) {
    return {
      nights,
      avgNightlyRateCents: 0,
      subtotalCents: 0,
      lineItems: [],
      totalCents: 0,
      refundableTotalCents: 0,
      error: 'no_rate_for_dates',
    };
  }

  // Subtotal = sum of nightly rates
  const baseGuestsCommon = nightRates[0]?.baseGuests ?? 2;
  const baseSubtotal = nightRates.reduce((acc, r) => acc + r.pricePerNightCents, 0);
  const lineItems: QuoteLineItem[] = [
    {
      type: 'nights',
      label: `${nights} noche${nights === 1 ? '' : 's'}`,
      amountCents: baseSubtotal,
    },
  ];

  // Extra guests
  const extraGuestsCount = Math.max(0, input.guests - baseGuestsCommon);
  let extraGuestsCharge = 0;
  if (extraGuestsCount > 0) {
    extraGuestsCharge = nightRates.reduce(
      (acc, r) => acc + r.extraGuestPriceCents * extraGuestsCount,
      0,
    );
    lineItems.push({
      type: 'extra_guests',
      label: `${extraGuestsCount} huésped${extraGuestsCount === 1 ? '' : 'es'} extra × ${nights} noche${nights === 1 ? '' : 's'}`,
      amountCents: extraGuestsCharge,
    });
  }

  let runningTotal = baseSubtotal + extraGuestsCharge;

  // Weekend premium
  if (input.rules?.weekendPremiumPercent && input.rules.weekendPremiumPercent > 0) {
    const start = parseDate(input.checkIn);
    const end = parseDate(input.checkOut);
    let weekendNights = 0;
    let weekendBase = 0;
    let i = 0;
    for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
      if (isWeekend(d)) {
        weekendNights++;
        weekendBase += nightRates[i]?.pricePerNightCents ?? 0;
      }
      i++;
    }
    if (weekendNights > 0) {
      const premium = Math.round((weekendBase * input.rules.weekendPremiumPercent) / 100);
      runningTotal += premium;
      lineItems.push({
        type: 'premium',
        label: `Premium de fin de semana (${input.rules.weekendPremiumPercent}%)`,
        amountCents: premium,
      });
    }
  }

  // Length-of-stay discount (el más alto que aplica)
  if (input.rules?.lengthOfStayDiscount && input.rules.lengthOfStayDiscount.length > 0) {
    const eligible = input.rules.lengthOfStayDiscount
      .filter((tier) => nights >= tier.minNights)
      .sort((a, b) => b.discountPercent - a.discountPercent);
    if (eligible.length > 0 && eligible[0]) {
      const tier = eligible[0];
      const discount = Math.round((runningTotal * tier.discountPercent) / 100);
      runningTotal -= discount;
      lineItems.push({
        type: 'discount',
        label: `Descuento por estadía larga (${tier.discountPercent}%, ${tier.minNights}+ noches)`,
        amountCents: -discount,
      });
    }
  }

  // Last-minute discount
  if (input.rules?.lastMinuteDiscount) {
    const today = parseDate(input.today ?? new Date().toISOString().slice(0, 10));
    const checkIn = parseDate(input.checkIn);
    const daysToCheckIn = Math.round((checkIn.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    if (daysToCheckIn >= 0 && daysToCheckIn <= input.rules.lastMinuteDiscount.daysBefore) {
      const discount = Math.round(
        (runningTotal * input.rules.lastMinuteDiscount.discountPercent) / 100,
      );
      runningTotal -= discount;
      lineItems.push({
        type: 'discount',
        label: `Last-minute (-${input.rules.lastMinuteDiscount.discountPercent}%)`,
        amountCents: -discount,
      });
    }
  }

  // Fees
  let refundableTotal = 0;
  for (const fee of input.fees) {
    let amount = 0;
    switch (fee.chargeType) {
      case 'fixed':
        amount = fee.amountCents;
        break;
      case 'per_night':
        amount = fee.amountCents * nights;
        break;
      case 'per_guest':
        amount = fee.amountCents * input.guests;
        break;
      case 'per_pet':
        amount = fee.amountCents * input.pets;
        break;
      case 'percent_of_total':
        amount = Math.round((runningTotal * fee.amountCents) / 10000); // 10000 because amount is %*100
        break;
    }
    if (amount === 0) continue;
    runningTotal += amount;
    if (fee.refundable) refundableTotal += amount;
    lineItems.push({
      type: 'fee',
      label: fee.name,
      amountCents: amount,
      refundable: fee.refundable,
    });
  }

  return {
    nights,
    avgNightlyRateCents: Math.round(baseSubtotal / nights),
    subtotalCents: baseSubtotal + extraGuestsCharge,
    lineItems,
    totalCents: runningTotal,
    refundableTotalCents: refundableTotal,
  };
}

// ─── Cancellation refund calculator ────────────────

/**
 * Dado una cancellation policy y la cantidad de días antes del check-in,
 * devuelve el % de refund que aplica.
 */
export function calculateRefundPercent(
  daysBeforeCheckIn: number,
  policy: CancellationTiers,
): number {
  // Tiers ordenados por daysBefore descendente (más restrictivos primero)
  const sorted = [...policy.tiers].sort((a, b) => b.daysBefore - a.daysBefore);
  for (const tier of sorted) {
    if (daysBeforeCheckIn >= tier.daysBefore) {
      return tier.refundPercent;
    }
  }
  return policy.defaultRefundPercent ?? 0;
}

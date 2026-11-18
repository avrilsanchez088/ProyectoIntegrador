import { describe, expect, it } from 'vitest';
import {
  cancellationTiersSchema,
  createRateSchema,
  createSeasonSchema,
  createUnitFeeSchema,
  pricingRulesConfigSchema,
} from './pricing-schemas';

describe('cancellationTiersSchema', () => {
  it('accepts valid tiered policy', () => {
    const result = cancellationTiersSchema.parse({
      tiers: [
        { daysBefore: 30, refundPercent: 100 },
        { daysBefore: 14, refundPercent: 50 },
        { daysBefore: 0, refundPercent: 0 },
      ],
      defaultRefundPercent: 0,
    });
    expect(result.tiers).toHaveLength(3);
  });

  it('rejects empty tiers', () => {
    expect(() => cancellationTiersSchema.parse({ tiers: [] })).toThrow();
  });

  it('rejects refundPercent > 100', () => {
    expect(() =>
      cancellationTiersSchema.parse({ tiers: [{ daysBefore: 7, refundPercent: 150 }] }),
    ).toThrow();
  });

  it('rejects negative daysBefore', () => {
    expect(() =>
      cancellationTiersSchema.parse({ tiers: [{ daysBefore: -1, refundPercent: 100 }] }),
    ).toThrow();
  });
});

describe('pricingRulesConfigSchema', () => {
  it('accepts empty config (all defaults)', () => {
    const result = pricingRulesConfigSchema.parse({});
    expect(result.minNightsDefault).toBe(1);
    expect(result.advanceBookingDays).toBe(365);
  });

  it('accepts full config', () => {
    const result = pricingRulesConfigSchema.parse({
      minNightsByDayOfWeek: { friday: 2, saturday: 2 },
      weekendPremiumPercent: 20,
      lastMinuteDiscount: { daysBefore: 7, discountPercent: 15 },
      lengthOfStayDiscount: [{ minNights: 7, discountPercent: 10 }],
      checkInTime: '14:00',
      checkOutTime: '11:00',
    });
    expect(result.weekendPremiumPercent).toBe(20);
  });

  it('rejects invalid time format', () => {
    expect(() => pricingRulesConfigSchema.parse({ checkInTime: '14h' })).toThrow();
  });

  it('rejects discountPercent > 50', () => {
    expect(() =>
      pricingRulesConfigSchema.parse({
        lastMinuteDiscount: { daysBefore: 3, discountPercent: 60 },
      }),
    ).toThrow();
  });
});

describe('createSeasonSchema', () => {
  it('accepts valid season input', () => {
    const result = createSeasonSchema.parse({
      propertyId: '019231d6-4f5e-7c12-9d4a-8b3f5c2e1a0b',
      name: 'Alta · verano 2026',
      seasonType: 'high',
      startDate: '2026-12-01',
      endDate: '2027-02-28',
    });
    expect(result.seasonType).toBe('high');
  });

  it('rejects invalid date format', () => {
    expect(() =>
      createSeasonSchema.parse({
        propertyId: '019231d6-4f5e-7c12-9d4a-8b3f5c2e1a0b',
        name: 'X',
        seasonType: 'high',
        startDate: 'tomorrow',
        endDate: '2027-02-28',
      }),
    ).toThrow();
  });

  it('rejects invalid seasonType', () => {
    expect(() =>
      createSeasonSchema.parse({
        propertyId: '019231d6-4f5e-7c12-9d4a-8b3f5c2e1a0b',
        name: 'X',
        seasonType: 'sometimes',
        startDate: '2026-12-01',
        endDate: '2027-02-28',
      }),
    ).toThrow();
  });
});

describe('createRateSchema', () => {
  it('accepts valid rate', () => {
    const result = createRateSchema.parse({
      unitId: '019231d6-4f5e-7c12-9d4a-8b3f5c2e1a0b',
      seasonId: '019231d6-4f5e-7c12-9d4a-8b3f5c2e1a0c',
      pricePerNightCents: 18000,
      extraGuestPriceCents: 2000,
      baseGuests: 2,
    });
    expect(result.pricePerNightCents).toBe(18000);
  });

  it('rejects negative price', () => {
    expect(() =>
      createRateSchema.parse({
        unitId: '019231d6-4f5e-7c12-9d4a-8b3f5c2e1a0b',
        seasonId: '019231d6-4f5e-7c12-9d4a-8b3f5c2e1a0c',
        pricePerNightCents: -100,
      }),
    ).toThrow();
  });
});

describe('createUnitFeeSchema', () => {
  it('accepts cleaning fee', () => {
    const result = createUnitFeeSchema.parse({
      unitId: '019231d6-4f5e-7c12-9d4a-8b3f5c2e1a0b',
      name: 'Limpieza final',
      feeType: 'cleaning',
      chargeType: 'fixed',
      amountCents: 2500,
      refundable: false,
      optional: false,
    });
    expect(result.feeType).toBe('cleaning');
  });

  it('accepts deposit refundable', () => {
    const result = createUnitFeeSchema.parse({
      unitId: '019231d6-4f5e-7c12-9d4a-8b3f5c2e1a0b',
      name: 'Depósito',
      feeType: 'deposit',
      chargeType: 'fixed',
      amountCents: 10000,
      refundable: true,
      optional: false,
    });
    expect(result.refundable).toBe(true);
  });

  it('accepts pet fee per night', () => {
    const result = createUnitFeeSchema.parse({
      unitId: '019231d6-4f5e-7c12-9d4a-8b3f5c2e1a0b',
      name: 'Mascota',
      feeType: 'pet',
      chargeType: 'per_night',
      amountCents: 1500,
    });
    expect(result.chargeType).toBe('per_night');
  });
});

import { describe, expect, it } from 'vitest';
import { calculateRefundPercent, getMinNightsForCheckIn, quote } from './index';

const baseRate = {
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  pricePerNightCents: 18000, // USD 180
  extraGuestPriceCents: 2000,
  baseGuests: 2,
};

describe('quote — basic scenarios', () => {
  it('charges correctly for 2 nights, 2 guests, no fees', () => {
    const result = quote({
      checkIn: '2026-11-15',
      checkOut: '2026-11-17',
      guests: 2,
      pets: 0,
      rates: [baseRate],
      fees: [],
    });
    expect(result.error).toBeUndefined();
    expect(result.nights).toBe(2);
    expect(result.subtotalCents).toBe(36000); // 2 × 18000
    expect(result.totalCents).toBe(36000);
  });

  it('charges extra guest fee for 4 guests on a 2-base unit', () => {
    const result = quote({
      checkIn: '2026-11-15',
      checkOut: '2026-11-17',
      guests: 4, // 2 base + 2 extra
      pets: 0,
      rates: [baseRate],
      fees: [],
    });
    // 2 nights × 18000 base + 2 extra × 2000 × 2 nights = 36000 + 8000 = 44000
    expect(result.totalCents).toBe(44000);
    expect(result.lineItems[1]?.label).toContain('2 huéspedes extra');
  });

  it('returns error if checkOut <= checkIn', () => {
    const result = quote({
      checkIn: '2026-11-17',
      checkOut: '2026-11-15',
      guests: 2,
      pets: 0,
      rates: [baseRate],
      fees: [],
    });
    expect(result.error).toBe('invalid_date_range');
  });

  it('returns error if no rate covers the dates', () => {
    const result = quote({
      checkIn: '2027-01-01',
      checkOut: '2027-01-03',
      guests: 2,
      pets: 0,
      rates: [baseRate],
      fees: [],
    });
    expect(result.error).toBe('no_rate_for_dates');
  });
});

describe('quote — fees', () => {
  it('applies fixed cleaning fee', () => {
    const result = quote({
      checkIn: '2026-11-15',
      checkOut: '2026-11-17',
      guests: 2,
      pets: 0,
      rates: [baseRate],
      fees: [
        {
          name: 'Limpieza',
          feeType: 'cleaning',
          chargeType: 'fixed',
          amountCents: 2500,
          refundable: false,
          optional: false,
        },
      ],
    });
    expect(result.totalCents).toBe(38500); // 36000 + 2500
  });

  it('applies refundable deposit (does not change total but tracks in refundable)', () => {
    const result = quote({
      checkIn: '2026-11-15',
      checkOut: '2026-11-17',
      guests: 2,
      pets: 0,
      rates: [baseRate],
      fees: [
        {
          name: 'Depósito',
          feeType: 'deposit',
          chargeType: 'fixed',
          amountCents: 10000,
          refundable: true,
          optional: false,
        },
      ],
    });
    expect(result.totalCents).toBe(46000); // 36000 + 10000
    expect(result.refundableTotalCents).toBe(10000);
  });

  it('applies per_night pet fee', () => {
    const result = quote({
      checkIn: '2026-11-15',
      checkOut: '2026-11-17',
      guests: 2,
      pets: 2,
      rates: [baseRate],
      fees: [
        {
          name: 'Mascota',
          feeType: 'pet',
          chargeType: 'per_pet',
          amountCents: 1500,
          refundable: false,
          optional: false,
        },
      ],
    });
    // 2 mascotas × 1500 = 3000
    expect(result.totalCents).toBe(36000 + 3000);
  });

  it('applies percent_of_total fee correctly', () => {
    const result = quote({
      checkIn: '2026-11-15',
      checkOut: '2026-11-17',
      guests: 2,
      pets: 0,
      rates: [baseRate],
      fees: [
        // 10% (encoded as 1000 = 10.00%)
        {
          name: 'Servicio',
          feeType: 'other',
          chargeType: 'percent_of_total',
          amountCents: 1000,
          refundable: false,
          optional: false,
        },
      ],
    });
    // 36000 × 10% = 3600
    expect(result.totalCents).toBe(36000 + 3600);
  });
});

describe('quote — pricing rules', () => {
  it('applies length-of-stay discount (5+ nights = 10% off)', () => {
    const result = quote({
      checkIn: '2026-11-10',
      checkOut: '2026-11-15', // 5 nights
      guests: 2,
      pets: 0,
      rates: [baseRate],
      fees: [],
      rules: {
        minNightsDefault: 1,
        advanceBookingDays: 365,
        minAdvanceBookingDays: 0,
        lengthOfStayDiscount: [{ minNights: 5, discountPercent: 10 }],
      },
    });
    // 5 × 18000 = 90000, descuento 10% = 9000
    expect(result.totalCents).toBe(90000 - 9000);
  });

  it('applies last-minute discount when within window', () => {
    const result = quote({
      checkIn: '2026-05-08',
      checkOut: '2026-05-10',
      guests: 2,
      pets: 0,
      rates: [baseRate],
      fees: [],
      rules: {
        minNightsDefault: 1,
        advanceBookingDays: 365,
        minAdvanceBookingDays: 0,
        lastMinuteDiscount: { daysBefore: 7, discountPercent: 15 },
      },
      today: '2026-05-06', // 2 días antes → eligible
    });
    expect(result.totalCents).toBe(36000 - Math.round(36000 * 0.15));
  });

  it('rejects booking that violates min nights for friday', () => {
    const result = quote({
      checkIn: '2026-11-13', // viernes
      checkOut: '2026-11-14', // 1 night
      guests: 2,
      pets: 0,
      rates: [baseRate],
      fees: [],
      rules: {
        minNightsDefault: 1,
        advanceBookingDays: 365,
        minAdvanceBookingDays: 0,
        minNightsByDayOfWeek: { friday: 2 },
      },
    });
    expect(result.error).toBe('min_nights_2');
  });
});

describe('calculateRefundPercent', () => {
  const policy = {
    tiers: [
      { daysBefore: 30, refundPercent: 100 },
      { daysBefore: 14, refundPercent: 50 },
      { daysBefore: 7, refundPercent: 25 },
    ],
    defaultRefundPercent: 0,
  };

  it('full refund if cancelled 60 days before', () => {
    expect(calculateRefundPercent(60, policy)).toBe(100);
  });

  it('50% if cancelled 20 days before', () => {
    expect(calculateRefundPercent(20, policy)).toBe(50);
  });

  it('25% if cancelled 10 days before', () => {
    expect(calculateRefundPercent(10, policy)).toBe(25);
  });

  it('0% (default) if cancelled 3 days before', () => {
    expect(calculateRefundPercent(3, policy)).toBe(0);
  });

  it('uses default if no tiers match (cancel 0 days before)', () => {
    expect(calculateRefundPercent(0, policy)).toBe(0);
  });
});

describe('getMinNightsForCheckIn', () => {
  it('returns rules default when no DOW override', () => {
    expect(
      getMinNightsForCheckIn('2026-11-15', {
        minNightsDefault: 2,
        advanceBookingDays: 365,
        minAdvanceBookingDays: 0,
      }),
    ).toBe(2);
  });

  it('uses DOW override when present', () => {
    expect(
      getMinNightsForCheckIn('2026-11-13', {
        minNightsDefault: 1,
        advanceBookingDays: 365,
        minAdvanceBookingDays: 0,
        minNightsByDayOfWeek: { friday: 3 },
      }),
    ).toBe(3); // friday = 3
  });

  it('returns 1 when no rules', () => {
    expect(getMinNightsForCheckIn('2026-11-15')).toBe(1);
  });
});

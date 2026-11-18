import { describe, expect, it } from 'vitest';
import { toLocalDateString } from './booking-quote';

describe('toLocalDateString', () => {
  it('returns YYYY-MM-DD in UTC for UTC tz', () => {
    const d = new Date('2026-11-15T14:30:00Z');
    expect(toLocalDateString(d, 'UTC')).toBe('2026-11-15');
  });

  it('preserves the local day in Buenos Aires when UTC time crosses midnight', () => {
    // 2026-11-15 22:00 ART = 2026-11-16 01:00 UTC
    // Con timezone Argentina, sigue siendo el día 15 local.
    const d = new Date('2026-11-16T01:00:00Z');
    expect(toLocalDateString(d, 'America/Argentina/Buenos_Aires')).toBe('2026-11-15');
  });

  it('preserves Montevideo timezone (UY default)', () => {
    // 2026-12-31 23:30 Montevideo (-03) = 2027-01-01 02:30 UTC
    const d = new Date('2027-01-01T02:30:00Z');
    expect(toLocalDateString(d, 'America/Montevideo')).toBe('2026-12-31');
  });

  it('falls back to UTC for invalid timezone', () => {
    const d = new Date('2026-06-15T10:00:00Z');
    expect(toLocalDateString(d, 'Bogus/Not_A_Tz')).toBe('2026-06-15');
  });

  it('handles DST cleanly (US tz)', () => {
    // Justo después del cambio de hora en LA: 2026-03-08T10:30 UTC = 03:30 LA (PDT)
    const d = new Date('2026-03-08T10:30:00Z');
    expect(toLocalDateString(d, 'America/Los_Angeles')).toBe('2026-03-08');
  });
});

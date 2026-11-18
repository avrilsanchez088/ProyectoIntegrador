import { describe, expect, it } from 'vitest';
import { computeBookingCode, extractGuestName } from './ical-mappers';

const baseEvent = {
  uid: 'evt-1@airbnb',
  start: new Date('2026-11-15T14:00:00Z'),
  end: new Date('2026-11-17T10:00:00Z'),
};

describe('extractGuestName', () => {
  it('returns undefined when summary is missing', () => {
    expect(extractGuestName({ ...baseEvent })).toBeUndefined();
  });

  it('parses "Reserved by Name"', () => {
    expect(extractGuestName({ ...baseEvent, summary: 'Reserved by John Doe' })).toBe('John Doe');
  });

  it('parses "Booked by Name"', () => {
    expect(extractGuestName({ ...baseEvent, summary: 'Booked by María López' })).toBe(
      'María López',
    );
  });

  it('parses "Guest: Name"', () => {
    expect(extractGuestName({ ...baseEvent, summary: 'Guest: Pedro Ramírez' })).toBe(
      'Pedro Ramírez',
    );
  });

  it('returns undefined for "CLOSED - Not available" pattern', () => {
    expect(extractGuestName({ ...baseEvent, summary: 'CLOSED - Not available' })).toBeUndefined();
  });

  it('is case-insensitive', () => {
    expect(extractGuestName({ ...baseEvent, summary: 'reserved BY Ana' })).toBe('Ana');
  });
});

describe('computeBookingCode', () => {
  it('uppercases provider and trims uid hash to 8 chars', () => {
    expect(computeBookingCode('airbnb', 'abcdef0123456789@airbnb')).toBe('AIRBNB-ABCDEF01');
  });

  it('strips non-alphanumeric chars from uid', () => {
    expect(computeBookingCode('booking', 'res-2026/03-15:abc')).toBe('BOOKING-RES20260');
  });

  it('handles short uids gracefully', () => {
    expect(computeBookingCode('gcal', 'x1')).toBe('GCAL-X1');
  });
});

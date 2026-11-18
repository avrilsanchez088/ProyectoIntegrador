/**
 * Mock de feeds iCal de Booking.com / Airbnb. Genera un .ics sintético con
 * un puñado de bookings random para que el demo mode tenga data.
 *
 * En modo real, el feed se trae de Airbnb / Booking via HTTP — el iCal worker
 * ya hace fetch + parseIcal. Este mock se sirve desde un endpoint local
 * `/mock/ical/airbnb.ics` que el worker puede consumir como cualquier otro
 * feed externo (pegándole sin tokens).
 */
import { buildIcal } from '@impacto/ical';

interface MockEvent {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
}

function dayOffset(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

const AIRBNB_FIXTURES: MockEvent[] = [
  {
    uid: 'mock-airbnb-1@impacto',
    start: dayOffset(7),
    end: dayOffset(10),
    summary: 'Reserved - Airbnb (Juan P)',
  },
  {
    uid: 'mock-airbnb-2@impacto',
    start: dayOffset(20),
    end: dayOffset(23),
    summary: 'Reserved - Airbnb',
  },
];

const BOOKING_FIXTURES: MockEvent[] = [
  {
    uid: 'mock-booking-1@impacto',
    start: dayOffset(14),
    end: dayOffset(17),
    summary: 'CLOSED - Not available',
  },
];

export function buildMockAirbnbIcal(): string {
  return buildIcal({
    calendarName: 'Mock Airbnb · Impacto demo',
    prodId: '-//Impacto//mock-airbnb//ES',
    events: AIRBNB_FIXTURES,
  });
}

export function buildMockBookingIcal(): string {
  return buildIcal({
    calendarName: 'Mock Booking.com · Impacto demo',
    prodId: '-//Impacto//mock-booking//ES',
    events: BOOKING_FIXTURES,
  });
}

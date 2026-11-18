import { describe, expect, it } from 'vitest';
import { buildIcal, parseIcal } from './index';

describe('parseIcal', () => {
  it('parses a minimal VEVENT with start/end', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//EN',
      'BEGIN:VEVENT',
      'UID:test-1@impacto',
      'DTSTART:20261115T140000Z',
      'DTEND:20261117T100000Z',
      'SUMMARY:Reserva Airbnb',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const events = parseIcal(ics);
    expect(events).toHaveLength(1);
    expect(events[0]?.uid).toBe('test-1@impacto');
    expect(events[0]?.summary).toBe('Reserva Airbnb');
    expect(events[0]?.status).toBe('CONFIRMED');
    expect(events[0]?.start.toISOString()).toBe('2026-11-15T14:00:00.000Z');
    expect(events[0]?.end.toISOString()).toBe('2026-11-17T10:00:00.000Z');
  });

  it('skips VEVENT without start/end', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//EN',
      'BEGIN:VEVENT',
      'UID:incomplete-1',
      'SUMMARY:Sin fechas',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    expect(parseIcal(ics)).toHaveLength(0);
  });

  it('parses multiple events', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//EN',
      'BEGIN:VEVENT',
      'UID:a@x',
      'DTSTART:20261101T000000Z',
      'DTEND:20261103T000000Z',
      'SUMMARY:A',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:b@x',
      'DTSTART:20261110T000000Z',
      'DTEND:20261112T000000Z',
      'SUMMARY:B',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const events = parseIcal(ics);
    expect(events).toHaveLength(2);
    const uids = events.map((e) => e.uid).sort();
    expect(uids).toEqual(['a@x', 'b@x']);
  });
});

describe('buildIcal', () => {
  it('emits a valid feed with one event', () => {
    const out = buildIcal({
      calendarName: 'Cabaña Aurora · Impacto',
      prodId: '-//Impacto//Reservas//ES',
      events: [
        {
          uid: 'res-1@impacto',
          start: new Date('2026-11-15T14:00:00Z'),
          end: new Date('2026-11-17T10:00:00Z'),
          summary: 'Reserva confirmada',
        },
      ],
    });

    expect(out).toContain('BEGIN:VCALENDAR');
    expect(out).toContain('PRODID:-//Impacto//Reservas//ES');
    expect(out).toContain('UID:res-1@impacto');
    expect(out).toContain('SUMMARY:Reserva confirmada');
    expect(out).toContain('STATUS:CONFIRMED');
    expect(out).toContain('END:VCALENDAR');
  });

  it('round-trips through parseIcal', () => {
    const out = buildIcal({
      calendarName: 'Test',
      prodId: '-//Impacto//Test//ES',
      events: [
        {
          uid: 'rt-1@impacto',
          start: new Date('2026-12-01T15:00:00Z'),
          end: new Date('2026-12-05T11:00:00Z'),
          summary: 'Round trip',
        },
      ],
    });

    const events = parseIcal(out);
    expect(events).toHaveLength(1);
    expect(events[0]?.uid).toBe('rt-1@impacto');
    expect(events[0]?.summary).toBe('Round trip');
    expect(events[0]?.start.toISOString()).toBe('2026-12-01T15:00:00.000Z');
    expect(events[0]?.end.toISOString()).toBe('2026-12-05T11:00:00.000Z');
  });
});

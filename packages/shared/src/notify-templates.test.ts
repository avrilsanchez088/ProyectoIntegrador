import { describe, expect, it } from 'vitest';
import { tpl } from './notify-templates';

/**
 * Tests para validar que cada template factory devuelve un shape correcto
 * (propuesta 111.2 ronda 7 / 95.4 ronda 8).
 *
 * Atrapa typos como `severty` en lugar de `severity` antes de que lleguen
 * al worker / API.
 */

const VALID_CATEGORIES = [
  'wa_message',
  'booking',
  'ical_sync_failed',
  'payment',
  'mention',
  'system',
] as const;

const VALID_SEVERITIES = ['info', 'success', 'warning', 'urgent'] as const;

function expectValidShape(p: ReturnType<typeof tpl.systemAlert>) {
  expect(p.organizationId).toBeTruthy();
  expect(VALID_CATEGORIES).toContain(p.category);
  if (p.severity) expect(VALID_SEVERITIES).toContain(p.severity);
  expect(p.title).toBeTruthy();
  expect(p.title.length).toBeLessThanOrEqual(120);
  if (p.body) expect(p.body.length).toBeLessThanOrEqual(500);
  if (p.actionUrl) {
    // URL relativo o absoluto — debe parsearse.
    if (!p.actionUrl.startsWith('http')) {
      expect(p.actionUrl).toMatch(/^\//);
    }
  }
}

describe('notify-templates', () => {
  it('bookingConfirmed', () => {
    const p = tpl.bookingConfirmed({
      organizationId: 'org-1',
      bookingId: 'b-1',
      code: 'RES-ABC',
      checkIn: '2026-12-01T15:00:00Z',
      checkOut: '2026-12-05T11:00:00Z',
      guestName: 'Juan',
    });
    expectValidShape(p);
    expect(p.category).toBe('booking');
    expect(p.severity).toBe('success');
    expect(p.title).toContain('RES-ABC');
    expect(p.body).toContain('Juan');
  });

  it('bookingTentative', () => {
    const p = tpl.bookingTentative({
      organizationId: 'org-1',
      bookingId: 'b-1',
      code: 'RES-XYZ',
      checkIn: '2026-12-01T15:00:00Z',
      checkOut: '2026-12-05T11:00:00Z',
    });
    expectValidShape(p);
    expect(p.severity).toBe('warning');
  });

  it('bookingCancelled', () => {
    const p = tpl.bookingCancelled({
      organizationId: 'org-1',
      bookingId: 'b-1',
      code: 'RES-ABC',
    });
    expectValidShape(p);
    expect(p.severity).toBe('warning');
    expect(p.actionUrl).toContain('/dashboard/bookings/');
  });

  it('bookingImported', () => {
    const p = tpl.bookingImported({
      organizationId: 'org-1',
      bookingId: 'b-1',
      code: 'AIR-1',
      checkIn: '2026-12-01T15:00:00Z',
      checkOut: '2026-12-05T11:00:00Z',
      source: 'airbnb',
    });
    expectValidShape(p);
    expect(p.title).toContain('Airbnb');
  });

  it('icalSyncFailed', () => {
    const p = tpl.icalSyncFailed({
      organizationId: 'org-1',
      feedName: 'Airbnb · Cabaña Aurora',
      externalCalendarId: 'cal-1',
      errorMessage: 'fetch failed: timeout 30s',
    });
    expectValidShape(p);
    expect(p.category).toBe('ical_sync_failed');
    expect(p.actionUrl).toBe('/dashboard/calendars');
  });

  it('paymentReceived', () => {
    const p = tpl.paymentReceived({
      organizationId: 'org-1',
      bookingId: 'b-1',
      bookingCode: 'RES-ABC',
      amountUsd: 250,
      paymentId: 'pay-1',
      provider: 'mercadopago',
    });
    expectValidShape(p);
    expect(p.category).toBe('payment');
    expect(p.severity).toBe('success');
    expect(p.title).toContain('250');
  });

  it('waMessage', () => {
    const p = tpl.waMessage({
      organizationId: 'org-1',
      fromPhone: '+598999111222',
      fromName: 'Pepe',
      preview: 'Hola, quiero reservar',
    });
    expectValidShape(p);
    expect(p.category).toBe('wa_message');
    expect(p.title).toContain('Pepe');
  });

  it('waMessage trims preview a 140 chars', () => {
    const longPreview = 'x'.repeat(200);
    const p = tpl.waMessage({
      organizationId: 'org-1',
      fromPhone: '+598',
      preview: longPreview,
    });
    expect(p.body?.length).toBe(140);
  });

  it('systemAlert con severity custom', () => {
    const p = tpl.systemAlert({
      organizationId: 'org-1',
      title: 'Mantenimiento programado',
      body: 'Reiniciamos servicios el domingo a las 03:00.',
      severity: 'warning',
      actionUrl: '/dashboard',
    });
    expectValidShape(p);
    expect(p.severity).toBe('warning');
  });

  it('systemAlert default severity es info', () => {
    const p = tpl.systemAlert({
      organizationId: 'org-1',
      title: 'Bienvenido',
    });
    expect(p.severity).toBe('info');
  });
});

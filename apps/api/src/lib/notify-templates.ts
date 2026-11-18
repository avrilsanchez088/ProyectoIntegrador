import type { NotifyParams } from './notify.js';

/**
 * Templates tipados de notificaciones (propuesta 85.1 ronda 7).
 *
 * En lugar de armar `{ category, severity, title, body, ... }` a mano en
 * cada handler — y arriesgar typos / inconsistencias — usamos factory
 * functions con TypeScript types que garantizan el shape correcto.
 *
 * Uso:
 *   await notifyTenant(db, tpl.bookingConfirmed({
 *     organizationId: orgId,
 *     code: 'ABC123',
 *     guestName: 'Juan',
 *     checkIn: '2026-12-01',
 *     checkOut: '2026-12-05',
 *     bookingId: 'uuid',
 *   }));
 *
 * Cuando llegue i18n (propuesta 85.2), las strings vendrán de `t()` keys —
 * la API de cada template no cambia.
 */

interface BookingTplBase {
  organizationId: string;
  bookingId: string;
  code: string;
  userId?: string | null;
}

interface BookingDates {
  checkIn: string;
  checkOut: string;
  guestName?: string | null;
}

function fmtRange(d: BookingDates): string {
  const a = new Date(d.checkIn).toISOString().slice(0, 10);
  const b = new Date(d.checkOut).toISOString().slice(0, 10);
  return d.guestName ? `${d.guestName} · ${a} → ${b}` : `${a} → ${b}`;
}

export const tpl = {
  bookingConfirmed(p: BookingTplBase & BookingDates): NotifyParams {
    return {
      organizationId: p.organizationId,
      userId: p.userId,
      category: 'booking',
      severity: 'success',
      title: `Reserva confirmada · ${p.code}`,
      body: fmtRange(p),
      actionUrl: `/dashboard/bookings/${p.bookingId}`,
      data: { bookingId: p.bookingId, action: 'confirmed' },
    };
  },

  bookingTentative(p: BookingTplBase & BookingDates): NotifyParams {
    return {
      organizationId: p.organizationId,
      userId: p.userId,
      category: 'booking',
      severity: 'warning',
      title: `Reserva tentativa · ${p.code}`,
      body: fmtRange(p),
      actionUrl: `/dashboard/bookings/${p.bookingId}`,
      data: { bookingId: p.bookingId, action: 'tentative' },
    };
  },

  bookingCancelled(p: BookingTplBase): NotifyParams {
    return {
      organizationId: p.organizationId,
      userId: p.userId,
      category: 'booking',
      severity: 'warning',
      title: `Reserva cancelada · ${p.code}`,
      body: 'El slot quedó disponible para nuevas reservas.',
      actionUrl: `/dashboard/bookings/${p.bookingId}`,
      data: { bookingId: p.bookingId, action: 'cancelled' },
    };
  },

  bookingImported(
    p: BookingTplBase & BookingDates & { source: 'airbnb' | 'booking' | 'gcal' | 'ical' },
  ): NotifyParams {
    const sourceLabel: Record<typeof p.source, string> = {
      airbnb: 'Airbnb',
      booking: 'Booking.com',
      gcal: 'Google Calendar',
      ical: 'iCal externo',
    };
    return {
      organizationId: p.organizationId,
      userId: p.userId,
      category: 'booking',
      severity: 'info',
      title: `Reserva importada de ${sourceLabel[p.source]}`,
      body: fmtRange(p),
      actionUrl: `/dashboard/bookings/${p.bookingId}`,
      data: { bookingId: p.bookingId, source: p.source, action: 'imported' },
    };
  },

  icalSyncFailed(p: {
    organizationId: string;
    feedName: string;
    externalCalendarId: string;
    errorMessage: string;
  }): NotifyParams {
    return {
      organizationId: p.organizationId,
      category: 'ical_sync_failed',
      severity: 'warning',
      title: `Sync falló: ${p.feedName}`,
      body: p.errorMessage.slice(0, 200),
      actionUrl: '/dashboard/calendars',
      data: { externalCalendarId: p.externalCalendarId },
    };
  },

  paymentReceived(p: {
    organizationId: string;
    bookingId: string;
    bookingCode: string;
    amountUsd: number;
    paymentId: string;
    provider: 'mercadopago' | 'stripe';
  }): NotifyParams {
    return {
      organizationId: p.organizationId,
      category: 'payment',
      severity: 'success',
      title: `Pago recibido · USD ${p.amountUsd.toFixed(2)}`,
      body: `Reserva ${p.bookingCode} · vía ${p.provider}`,
      actionUrl: `/dashboard/bookings/${p.bookingId}`,
      data: { bookingId: p.bookingId, paymentId: p.paymentId, provider: p.provider },
    };
  },

  waMessage(p: {
    organizationId: string;
    fromPhone: string;
    fromName?: string;
    preview: string;
    conversationId?: string;
  }): NotifyParams {
    return {
      organizationId: p.organizationId,
      category: 'wa_message',
      severity: 'info',
      title: `Mensaje WhatsApp${p.fromName ? ` de ${p.fromName}` : ''}`,
      body: p.preview.slice(0, 140),
      actionUrl: p.conversationId ? `/dashboard/inbox/${p.conversationId}` : '/dashboard/inbox',
      data: { fromPhone: p.fromPhone, conversationId: p.conversationId },
    };
  },

  systemAlert(p: {
    organizationId: string;
    title: string;
    body?: string;
    severity?: 'info' | 'warning' | 'urgent';
    actionUrl?: string;
  }): NotifyParams {
    return {
      organizationId: p.organizationId,
      category: 'system',
      severity: p.severity ?? 'info',
      title: p.title,
      body: p.body,
      actionUrl: p.actionUrl,
    };
  },
} as const;

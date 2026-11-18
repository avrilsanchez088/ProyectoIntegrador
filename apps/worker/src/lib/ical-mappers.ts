import type { ParsedEvent } from '@impacto/ical';

/**
 * Helpers puros usados por el iCal worker. Sin DB ni Redis para que sean
 * fácilmente testeables.
 */

/**
 * Heurística para extraer nombre del guest del SUMMARY iCal.
 *
 * Booking.com: típicamente "CLOSED - Not available" o "Reserved by John Doe".
 * Airbnb: típicamente "Reserved" o "Closed - Not available" — no trae nombre.
 * Genérico: "Guest: María López".
 *
 * Devuelve undefined si no logra parsear nombre.
 */
export function extractGuestName(ev: ParsedEvent): string | undefined {
  if (!ev.summary) return undefined;
  const m = ev.summary.match(/(?:reserved by|booked by|guest:)\s*(.+)$/i);
  return m?.[1]?.trim();
}

/**
 * Code legible único derivado del UID iCal.
 * Ej: "AIRBNB-3F9C2A". Trunca a 8 chars del hash del UID, en mayúsculas.
 */
export function computeBookingCode(provider: string, uid: string): string {
  const hash = uid
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 8)
    .toUpperCase();
  return `${provider.toUpperCase()}-${hash}`;
}

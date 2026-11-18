/**
 * Tone tokens — pares `bg/text/border` por estado, centralizados.
 *
 * Antes (rondas 1-7) cada page repetía sus propios `STATUS_TONE` /
 * `SEVERITY_TONE` con clases Tailwind. Esto generaba:
 *  - inconsistencia visual entre páginas (ej. `tentative` con tono distinto)
 *  - duplicación al agregar dark-mode variants
 *  - typos al copy-pastear (ej. `text-rose-90` faltando un cero)
 *
 * Solución: una sola fuente de verdad por dominio. Si querés cambiar el
 * tono de "confirmed" en todo el dashboard, lo hacés acá una vez.
 *
 * Propuesta 79.5 ronda 7.
 */

import type { BookingStatus } from '@impacto/shared';

export const BOOKING_STATUS_TONE: Record<BookingStatus, string> = {
  tentative: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  confirmed: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  checked_in: 'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200',
  checked_out: 'bg-muted text-muted-foreground',
  cancelled: 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
  no_show: 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
};

/** Banda larga (calendar mensual) — más saturada para visibility en grid. */
export const BOOKING_STATUS_BAND_TONE: Record<BookingStatus, string> = {
  tentative: 'bg-amber-200 text-amber-900 hover:bg-amber-300 dark:bg-amber-800 dark:text-amber-50',
  confirmed:
    'bg-emerald-300 text-emerald-950 hover:bg-emerald-400 dark:bg-emerald-700 dark:text-emerald-50',
  checked_in: 'bg-blue-300 text-blue-950 hover:bg-blue-400 dark:bg-blue-700 dark:text-blue-50',
  checked_out: 'bg-muted text-muted-foreground',
  cancelled: 'bg-rose-200 text-rose-900 line-through dark:bg-rose-900',
  no_show: 'bg-rose-200 text-rose-900 dark:bg-rose-900',
};

export const NOTIFICATION_SEVERITY_TONE: Record<'info' | 'success' | 'warning' | 'urgent', string> =
  {
    info: 'text-muted-foreground',
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    urgent: 'text-rose-600 dark:text-rose-400',
  };

export const SEASON_TONE: Record<'high' | 'medium' | 'low' | 'special', string> = {
  high: 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
  medium: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  low: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  special: 'bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200',
};

export const BLOCK_TONE_BAND = 'bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200';

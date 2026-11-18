/**
 * Types y constantes compartidas entre las 3 secciones de la pricing page
 * (§8.2 del audit). Antes vivían inline en page.tsx (1048 líneas) — ahora
 * la page principal queda en ~80 líneas y cada sección es testeable
 * en aislamiento.
 */

export type Season = {
  id: string;
  propertyId: string;
  name: string;
  seasonType: 'high' | 'medium' | 'low' | 'special';
  startDate: string;
  endDate: string;
  sortOrder: number;
};

export type Unit = { id: string; name: string; propertyId: string };

export type Rate = {
  id: string;
  unitId: string;
  seasonId: string;
  pricePerNightCents: number;
  extraGuestPriceCents: number;
  baseGuests: number;
};

export type Fee = {
  id: string;
  unitId: string;
  name: string;
  feeType: 'cleaning' | 'deposit' | 'pet' | 'extra_guest' | 'transfer' | 'other';
  chargeType: 'fixed' | 'per_night' | 'per_guest' | 'per_pet' | 'percent_of_total';
  amountCents: number;
  refundable: number;
  optional: number;
};

export const FEE_TYPE_LABEL: Record<Fee['feeType'], string> = {
  cleaning: 'Limpieza',
  deposit: 'Depósito',
  pet: 'Mascota',
  extra_guest: 'Huésped extra',
  transfer: 'Traslado',
  other: 'Otro',
};

export const CHARGE_TYPE_LABEL: Record<Fee['chargeType'], string> = {
  fixed: 'Fijo',
  per_night: 'Por noche',
  per_guest: 'Por huésped',
  per_pet: 'Por mascota',
  percent_of_total: '% del total',
};

export const SEASON_TONE: Record<Season['seasonType'], string> = {
  high: 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
  medium: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  low: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  special: 'bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200',
};

export const SEASON_LABEL: Record<Season['seasonType'], string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
  special: 'Especial',
};

export function formatDate(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y?.slice(2)}`;
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Catálogo declarativo de op-keys que pueden incluirse en
 * `tenant_settings.frozen_allow_ops` (propuestas 142.3 + 191.2 ronda 12-17).
 *
 * Cuando el middleware `blockIfFrozenFor(opKey)` es invocado en un endpoint,
 * la key debe estar en este enum. Mantener sincronizado con uso real.
 */

export const FREEZE_OP_KEYS = [
  // Service-side ops que no querríamos bloquear aún con tenant moroso —
  // el huésped ya está ahí, no podemos rechazar el check-in.
  {
    key: 'booking.checkin',
    label: 'Check-in del huésped',
    description: 'Marcar booking como checked_in. El huésped ya llegó.',
  },
  {
    key: 'booking.checkout',
    label: 'Check-out del huésped',
    description: 'Marcar booking como checked_out al finalizar la estadía.',
  },
  {
    key: 'booking.cancel',
    label: 'Cancelación de reserva',
    description: 'Permitir que el dueño cancele bookings (ej: emergencia).',
  },
  {
    key: 'notification.read',
    label: 'Marcar notificaciones leídas',
    description: 'No bloquea operaciones críticas, mejora UX.',
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  description: string;
}>;

export type FreezeOpKey = (typeof FREEZE_OP_KEYS)[number]['key'];

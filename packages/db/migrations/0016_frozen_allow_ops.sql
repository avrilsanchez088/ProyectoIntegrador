-- Migration 0016 · Whitelist de operaciones permitidas durante freeze
-- (propuesta 142.3 ronda 12).
--
-- Hoy `blockIfFrozen` rechaza TODAS las mutaciones cuando el workspace está
-- congelado. Pero hay operaciones service-side (check-in, check-out) que
-- queremos permitir aún si el tenant está moroso — el huésped ya está ahí.
--
-- `frozen_allow_ops` es un text[] de op-keys que el middleware respeta.
-- Default vacío = comportamiento actual (bloquear todo).

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS frozen_allow_ops text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN tenant_settings.frozen_allow_ops IS
  'Lista de op-keys que se permiten incluso con frozen=true. '
  'Ej: {"booking.checkin","booking.checkout"}. '
  'El middleware blockIfFrozen mapea path+method → op-key.';

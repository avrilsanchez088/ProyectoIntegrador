-- Migration 0008 · Freeze tenant flag (propuesta 118.3 / 100.2).
--
-- Para clientes con problemas de pago / abuso, el staff Impacto puede
-- "freeze" el workspace. Mutations devuelven 402 Payment Required hasta
-- que el flag se quite.
--
-- Implementación: campo `frozen` boolean en `tenant_settings`. El middleware
-- API rechaza si está true.

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS frozen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_reason text,
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz;

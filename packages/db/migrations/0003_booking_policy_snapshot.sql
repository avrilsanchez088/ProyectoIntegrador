-- Migration 0003 · Cancellation policy snapshot en bookings (G3.4 / §2.12).
--
-- Cuando el dueño cambia una cancellation policy, las reservas viejas no
-- deberían heredar el cambio. Capturamos un snapshot JSON al crear el booking.
--
-- Default `'{}'::jsonb` permite agregar la columna sobre filas existentes sin
-- backfill. Las reservas pre-existentes quedan con `{}` y deben tratarse como
-- "sin policy capturada" (cae al default del workspace en runtime).

ALTER TABLE bookings
  ADD COLUMN cancellation_policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

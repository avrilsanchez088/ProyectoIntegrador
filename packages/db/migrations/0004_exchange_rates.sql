-- Migration 0004 · exchange_rates (G10 / §1.6).
--
-- Tabla global (sin RLS) con tasas de cambio diarias. Source: open.er-api.com.
-- El worker corre un job repeatable diario que upserta las tasas que el SaaS
-- usa (USD→UYU, USD→ARS al menos en V1).

CREATE TABLE IF NOT EXISTS exchange_rates (
  day        date NOT NULL,
  base       text NOT NULL,
  quote      text NOT NULL,
  rate       numeric(18, 8) NOT NULL,
  source     text NOT NULL DEFAULT 'open.er-api.com',
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS exchange_rates_day_pair_idx
  ON exchange_rates (day, base, quote);

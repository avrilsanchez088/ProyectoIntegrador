-- Migration 0013 · Freeze history (propuesta 142.7 ronda 12).
--
-- `tenant_settings.frozen` es un solo bool — no hay historial de quién
-- congeló cuándo y por qué. Esta tabla guarda cada toggle freeze/unfreeze.
-- Visible en /admin/tenants/[id] como timeline.

CREATE TABLE IF NOT EXISTS tenant_freeze_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  frozen          boolean NOT NULL,
  reason          text,
  by_user_id      text REFERENCES users(id) ON DELETE SET NULL,
  ts              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_freeze_log_org_ts_idx
  ON tenant_freeze_log (organization_id, ts DESC);

COMMENT ON TABLE tenant_freeze_log IS
  'Historial de toggles freeze/unfreeze por tenant. Inmutable — staff puede '
  'leer pero no editar. Útil para compliance + outreach a tenants frozen long-term.';

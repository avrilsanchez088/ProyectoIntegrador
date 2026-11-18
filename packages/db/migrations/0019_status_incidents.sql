-- Migration 0019 · Status page incidents history (propuesta 204.1 ronda 18).
--
-- Tabla append-only de incidents publicados en /status. Diferente de
-- `system_announcements`:
--   - announcements son avisos in-app de staff a tenants (mantenimiento,
--     features, etc).
--   - incidents son eventos públicos de degradación/downtime que viven en
--     /status (visible sin login). Persisten 30+ días.
--
-- Sin RLS — la página /status no autentica.

CREATE TABLE IF NOT EXISTS status_incidents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  severity    text NOT NULL DEFAULT 'minor'
    CHECK (severity IN ('minor', 'major', 'critical')),
  status      text NOT NULL DEFAULT 'investigating'
    CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_by  text REFERENCES users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS status_incidents_started_idx
  ON status_incidents (started_at DESC);

COMMENT ON TABLE status_incidents IS
  'Incidents publicados en /status (página pública). Staff crea/edita desde '
  '/admin/status. Retention: el audit-purge worker borra > 90 días.';

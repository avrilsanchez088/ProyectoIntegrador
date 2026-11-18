-- Migration 0021 · Incident affected_components + worker parent_run_id
-- (propuestas 227.4 + 230.3 ronda 21).

-- ──────────────────────────────────────────────────────────────────
-- Incidents: tags de componentes afectados (propuesta 227.4)
-- text[] simple — el conjunto válido se valida en application code.
-- Mantenemos abierto el set para no requerir migration cada vez que
-- agregamos un componente.
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE status_incidents
  ADD COLUMN IF NOT EXISTS affected_components text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN status_incidents.affected_components IS
  'Tags de componentes afectados (whatsapp, bookings, dashboard, etc). '
  'Valores libres validados en app — UI muestra como chips.';

-- ──────────────────────────────────────────────────────────────────
-- System announcements: campo data jsonb para metadata extra (ej:
-- gdpr_request_id, auto-close logic). Propuesta 229.3 ronda 21.
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE system_announcements
  ADD COLUMN IF NOT EXISTS data jsonb;

CREATE INDEX IF NOT EXISTS system_announcements_data_gdpr_idx
  ON system_announcements ((data->>'gdpr_request_id'))
  WHERE data ? 'gdpr_request_id';

-- ──────────────────────────────────────────────────────────────────
-- Worker runs: parent_run_id para tracking de re-triggers (propuesta 230.3)
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE worker_runs
  ADD COLUMN IF NOT EXISTS parent_run_id uuid REFERENCES worker_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS triggered_by text REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS worker_runs_parent_idx
  ON worker_runs (parent_run_id) WHERE parent_run_id IS NOT NULL;

COMMENT ON COLUMN worker_runs.parent_run_id IS
  'Si este run vino de un re-trigger manual (propuesta 220.1), apunta al run '
  'original que el staff clickeó. NULL para runs scheduled.';

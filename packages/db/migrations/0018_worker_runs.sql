-- Migration 0018 · Worker job stats (propuestas 163.5 + 182.4 ronda 12-14).
--
-- Tabla append-only que captura cada ejecución de los workers (mv-refresh,
-- audit-purge, fx, ical, etc). Permite UI /admin/workers que muestra:
--   - última ejecución
--   - duración
--   - status (success/failure)
--   - mensaje de error si aplica
--
-- Sin RLS — solo staff lo ve.

CREATE TABLE IF NOT EXISTS worker_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name   text NOT NULL,
  job_id        text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  status        text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'failure', 'skipped')),
  duration_ms   int,
  result        jsonb,
  error_message text
);

CREATE INDEX IF NOT EXISTS worker_runs_name_started_idx
  ON worker_runs (worker_name, started_at DESC);
CREATE INDEX IF NOT EXISTS worker_runs_status_idx
  ON worker_runs (status, started_at DESC) WHERE status = 'failure';

-- Retention: borrar runs > 30 días (los workers piggyback en audit-purge).
COMMENT ON TABLE worker_runs IS
  'Append-only log de ejecuciones de workers BullMQ. Borra > 30 días vía audit-purge.';

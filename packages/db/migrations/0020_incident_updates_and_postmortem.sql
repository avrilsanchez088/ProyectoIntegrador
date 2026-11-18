-- Migration 0020 · Incident updates timeline + postmortem field
-- (propuestas 218.1 + 218.2 ronda 20).
--
-- Cambios:
--  1. ALTER status_incidents: agregar `postmortem text`.
--  2. CREATE TABLE incident_updates: tabla append-only de updates
--     publicados durante un incident. Renderizada como timeline en /status.
--
-- Sin RLS — público lee, staff escribe.

ALTER TABLE status_incidents
  ADD COLUMN IF NOT EXISTS postmortem text;

CREATE TABLE IF NOT EXISTS incident_updates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES status_incidents(id) ON DELETE CASCADE,
  status      text NOT NULL
    CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  message     text NOT NULL,
  created_by  text REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incident_updates_incident_idx
  ON incident_updates (incident_id, created_at DESC);

COMMENT ON TABLE incident_updates IS
  'Updates publicados durante un incident. Append-only. /status renderiza '
  'como timeline. Borrado en cascade con el incident parent.';

COMMENT ON COLUMN status_incidents.postmortem IS
  'Análisis post-mortem cuando el incident se resuelve. Markdown OK. '
  'Visible en /status como collapse "Ver postmortem".';

-- Migration 0017 · GDPR / data subject requests (propuestas 158.1 + 158.2 ronda 13).
--
-- Tabla que captura solicitudes de huéspedes (no-users) sobre su data:
--   action='export'  → bundle CSV con su info, link signed via email
--   action='delete'  → soft-anonymize en DB (replace name/email/phone)
--
-- Sin RLS — staff procesa estas requests manualmente desde /admin.
-- El email es el identificador (no son user accounts en el sistema).

CREATE TABLE IF NOT EXISTS data_subject_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           text NOT NULL,
  action          text NOT NULL CHECK (action IN ('export', 'delete')),
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  request_ip      inet,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  processed_by    text REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS data_subject_requests_org_status_idx
  ON data_subject_requests (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS data_subject_requests_email_idx
  ON data_subject_requests (lower(email));

COMMENT ON TABLE data_subject_requests IS
  'Solicitudes ARCO/GDPR de huéspedes sobre su data. Staff procesa manualmente; '
  'el endpoint solo registra la solicitud y notifica.';

-- Migration 0010 · System announcements (propuesta 132.1 ronda 11).
--
-- Tabla global (sin RLS) con anuncios que el StatusBanner muestra a TODOS
-- los users del producto. Administrada por staff Impacto desde
-- `/admin/announcements`.
--
-- Targeting opcional: `target_role` (filtra por rol del user en su
-- workspace activo) y `target_org_id` (visible solo en ese workspace).
-- NULL en ambos = broadcast global.

CREATE TABLE IF NOT EXISTS system_announcements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity        text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'urgent', 'critical')),
  message         text NOT NULL,
  href            text,
  starts_at       timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  target_role     text CHECK (target_role IN ('owner', 'admin', 'member', 'all')),
  target_org_id   text REFERENCES organizations(id) ON DELETE CASCADE,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index para query "anuncios activos ahora": starts_at <= now() AND
-- (expires_at IS NULL OR expires_at > now()).
CREATE INDEX IF NOT EXISTS system_announcements_active_idx
  ON system_announcements (starts_at, expires_at);
CREATE INDEX IF NOT EXISTS system_announcements_target_org_idx
  ON system_announcements (target_org_id) WHERE target_org_id IS NOT NULL;

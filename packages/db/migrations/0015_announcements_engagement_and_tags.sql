-- Migration 0015 · Announcements engagement + workspace tagging + indexes.
-- Combina varias propuestas de PROPOSALS.md:
--  · 143.4 ronda 12 — analytics CTR via announcement_views
--  · 143.5 ronda 12 — dismiss permanente per-user via announcement_dismissals
--  · 166.1 ronda 14 — workspace tagging via tenant_tags
--  · 168.1 ronda 14 — index parcial en system_announcements (target_role)

-- ═══════════════════════════════════════════════════════════════
-- announcement_views — registra impresiones y clicks por user
-- (propuestas 143.4 + 143.5 ronda 12)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS announcement_views (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES system_announcements(id) ON DELETE CASCADE,
  user_id         text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at       timestamptz NOT NULL DEFAULT now(),
  clicked_at      timestamptz,
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS announcement_views_announcement_idx
  ON announcement_views (announcement_id);

-- ═══════════════════════════════════════════════════════════════
-- announcement_dismissals — per-user dismiss permanente
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS announcement_dismissals (
  user_id         text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  announcement_id uuid NOT NULL REFERENCES system_announcements(id) ON DELETE CASCADE,
  dismissed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, announcement_id)
);

-- ═══════════════════════════════════════════════════════════════
-- tenant_tags — staff-side tags coloreables (propuesta 166.1 ronda 14)
-- Sin RLS — solo staff lo lee/escribe.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tenant_tags (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tag             text NOT NULL,
  color           text NOT NULL DEFAULT 'gray'
    CHECK (color IN ('gray', 'red', 'amber', 'green', 'blue', 'violet')),
  created_by      text REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, tag)
);

CREATE INDEX IF NOT EXISTS tenant_tags_org_idx
  ON tenant_tags (organization_id);

-- ═══════════════════════════════════════════════════════════════
-- Index sobre system_announcements (target_role)
-- (propuesta 168.1 ronda 14) — speedup feed staff queries.
-- Nota: el predicate parcial `WHERE expires_at IS NULL OR expires_at > now()`
-- no es válido en Postgres (now() es STABLE, no IMMUTABLE). El filtro de
-- expiración se aplica en runtime; el index full cubre el patrón de query.
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS system_announcements_role_active_idx
  ON system_announcements (target_role, starts_at DESC);

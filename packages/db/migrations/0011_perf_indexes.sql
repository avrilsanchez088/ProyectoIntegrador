-- Migration 0011 · Indexes para queries hot-path (propuestas 146.1 + 146.2 ronda 12).
--
-- 1. /api/team/activity — JOIN sessions × members. Sin índices, scan secuencial
--    por workspace puede degradar a varios cientos de ms con 50+ users + 1k sesiones.
-- 2. Bookings listing por status NOT IN (...) AND check_in BETWEEN — index parcial
--    permite usar index-only scan ignorando rows cancelled/no_show.
-- 3. Notifications unread_count — query muy frecuente (cada navegación), beneficia
--    de un partial index.

-- members(organization_id, user_id) — cubre la query del JOIN en /team/activity
CREATE INDEX IF NOT EXISTS members_org_user_idx
  ON members (organization_id, user_id);

-- sessions(user_id, updated_at DESC) — para MAX(updated_at) en /team/activity
CREATE INDEX IF NOT EXISTS sessions_user_updated_idx
  ON sessions (user_id, updated_at DESC);

-- bookings activos por tenant + check_in (146.3)
CREATE INDEX IF NOT EXISTS bookings_active_check_in_idx
  ON bookings (organization_id, check_in)
  WHERE status NOT IN ('cancelled', 'no_show');

-- in_app_notifications unread (146 follow-up)
CREATE INDEX IF NOT EXISTS in_app_notifications_unread_idx
  ON in_app_notifications (organization_id, user_id, created_at DESC)
  WHERE read_at IS NULL;

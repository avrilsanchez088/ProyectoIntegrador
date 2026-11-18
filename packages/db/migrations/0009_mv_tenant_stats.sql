-- Migration 0009 · Materialized view de stats por tenant (propuesta 127.1).
--
-- El endpoint /api/admin/tenants hace 5 sub-queries por row al listar 200
-- tenants. Con materialized view, queda 1 SELECT plano. Refresh manual o
-- via cron del worker (cada 5min).
--
-- Si la cantidad de tenants crece y los counts son baratos, se puede
-- evaluar reemplazar por un VIEW normal o cached endpoint en API.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_tenant_stats AS
SELECT
  o.id AS organization_id,
  o.name,
  o.slug,
  o.created_at,
  ts.plan,
  COALESCE(ts.frozen, false) AS frozen,
  (SELECT COUNT(*) FROM members m WHERE m.organization_id = o.id)::int AS members_count,
  (SELECT COUNT(*) FROM properties p WHERE p.organization_id = o.id AND p.deleted_at IS NULL)::int AS properties_count,
  (SELECT COUNT(*) FROM units u WHERE u.organization_id = o.id AND u.deleted_at IS NULL)::int AS units_count,
  (SELECT COUNT(*) FROM bookings b WHERE b.organization_id = o.id)::int AS bookings_total,
  (SELECT COUNT(*) FROM bookings b WHERE b.organization_id = o.id AND b.status NOT IN ('cancelled', 'no_show'))::int AS bookings_active,
  (SELECT MAX(created_at) FROM bookings b WHERE b.organization_id = o.id) AS last_booking_at,
  (SELECT MAX(s.updated_at) FROM sessions s
    JOIN members m ON m.user_id = s.user_id
    WHERE m.organization_id = o.id) AS last_session_at,
  now() AS refreshed_at
FROM organizations o
LEFT JOIN tenant_settings ts ON ts.id = o.id;

CREATE UNIQUE INDEX IF NOT EXISTS mv_tenant_stats_pk ON mv_tenant_stats (organization_id);
CREATE INDEX IF NOT EXISTS mv_tenant_stats_created_idx ON mv_tenant_stats (created_at DESC);

-- Permisos: solo superuser y los staff (que se conectan via DATABASE_URL)
-- pueden leer. App role (impacto_app) no necesita acceso.

-- Función helper para refresh CONCURRENTLY (no bloquea reads).
CREATE OR REPLACE FUNCTION refresh_mv_tenant_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_tenant_stats;
END;
$$ LANGUAGE plpgsql;

-- Migration 0006 · Audit log via triggers Postgres (M16 / propuesta 90.1).
--
-- Schema dedicado `audit` para que:
--  - el rol app no tenga acceso default a las tablas de audit
--  - los reports / queries no se confundan con tablas operacionales
--
-- Cada cambio en bookings / properties / units / cancellation_policies /
-- pricing_rules / unit_fees genera una fila en audit.events con:
--   - tabla, op (I/U/D)
--   - old_row + new_row JSON
--   - organization_id (extraído de la fila si existe)
--   - user_id (extraído de current_setting('app.user_id') si lo seteamos)
--   - timestamp
--
-- RLS sobre audit.events: el app role no puede leer audit (solo staff
-- impacto-admin via superuser). Cuando se exponga UI, el endpoint sirve
-- como bridge controlado.

CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text,
  user_id         text,
  table_name      text NOT NULL,
  op              char(1) NOT NULL CHECK (op IN ('I', 'U', 'D')),
  row_id          text,
  old_row         jsonb,
  new_row         jsonb,
  ts              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_org_ts_idx ON audit.events (organization_id, ts DESC);
CREATE INDEX IF NOT EXISTS audit_events_table_ts_idx ON audit.events (table_name, ts DESC);
CREATE INDEX IF NOT EXISTS audit_events_user_ts_idx ON audit.events (user_id, ts DESC) WHERE user_id IS NOT NULL;

-- Función trigger genérica.
CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS trigger AS $$
DECLARE
  v_org text;
  v_id text;
  v_user text;
BEGIN
  -- Extract organization_id si la tabla lo tiene (todas las operacionales).
  IF TG_OP = 'DELETE' THEN
    v_org := COALESCE((to_jsonb(OLD)->>'organization_id'), (to_jsonb(OLD)->>'id'));
    v_id := to_jsonb(OLD)->>'id';
  ELSE
    v_org := COALESCE((to_jsonb(NEW)->>'organization_id'), (to_jsonb(NEW)->>'id'));
    v_id := to_jsonb(NEW)->>'id';
  END IF;

  -- user_id viene del setting si lo setean los handlers (futuro: middleware).
  -- Si no, queda NULL.
  BEGIN
    v_user := current_setting('app.user_id', true);
    IF v_user = '' THEN v_user := NULL; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_user := NULL;
  END;

  INSERT INTO audit.events (organization_id, user_id, table_name, op, row_id, old_row, new_row)
  VALUES (
    v_org,
    v_user,
    TG_TABLE_NAME,
    SUBSTRING(TG_OP FROM 1 FOR 1),
    v_id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicar el trigger a las tablas críticas. Cada CREATE TRIGGER es
-- idempotente vía DROP + CREATE.
DROP TRIGGER IF EXISTS audit_log_bookings ON bookings;
CREATE TRIGGER audit_log_bookings
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

DROP TRIGGER IF EXISTS audit_log_properties ON properties;
CREATE TRIGGER audit_log_properties
  AFTER INSERT OR UPDATE OR DELETE ON properties
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

DROP TRIGGER IF EXISTS audit_log_units ON units;
CREATE TRIGGER audit_log_units
  AFTER INSERT OR UPDATE OR DELETE ON units
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

DROP TRIGGER IF EXISTS audit_log_cancellation_policies ON cancellation_policies;
CREATE TRIGGER audit_log_cancellation_policies
  AFTER INSERT OR UPDATE OR DELETE ON cancellation_policies
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

DROP TRIGGER IF EXISTS audit_log_pricing_rules ON pricing_rules;
CREATE TRIGGER audit_log_pricing_rules
  AFTER INSERT OR UPDATE OR DELETE ON pricing_rules
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

DROP TRIGGER IF EXISTS audit_log_unit_fees ON unit_fees;
CREATE TRIGGER audit_log_unit_fees
  AFTER INSERT OR UPDATE OR DELETE ON unit_fees
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

DROP TRIGGER IF EXISTS audit_log_tenant_settings ON tenant_settings;
CREATE TRIGGER audit_log_tenant_settings
  AFTER INSERT OR UPDATE OR DELETE ON tenant_settings
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

-- Permisos: app role NO debe poder leer audit.events directamente. Cualquier
-- query desde el dashboard tiene que pasar por un endpoint server-side.
REVOKE ALL ON SCHEMA audit FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA audit FROM PUBLIC;
GRANT USAGE ON SCHEMA audit TO impacto_app;
-- App puede INSERT (los triggers lo necesitan) pero NO SELECT/UPDATE/DELETE.
GRANT INSERT ON audit.events TO impacto_app;

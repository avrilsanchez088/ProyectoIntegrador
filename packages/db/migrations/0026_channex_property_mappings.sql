-- Migration 0026 · Channex property mappings.
-- Guarda el ID de la property creada en Channex para cada property de Impacto.

CREATE TABLE IF NOT EXISTS channex_property_mappings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id           uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  channex_property_id   text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id)
);

CREATE INDEX IF NOT EXISTS channex_property_mappings_org_idx
  ON channex_property_mappings (organization_id);

ALTER TABLE channex_property_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE channex_property_mappings FORCE ROW LEVEL SECURITY;

CREATE POLICY channex_property_mappings_tenant_select ON channex_property_mappings
  FOR SELECT
  USING (organization_id = current_setting('app.tenant_id', true));

CREATE POLICY channex_property_mappings_tenant_insert ON channex_property_mappings
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.tenant_id', true));

CREATE POLICY channex_property_mappings_tenant_update ON channex_property_mappings
  FOR UPDATE
  USING (organization_id = current_setting('app.tenant_id', true))
  WITH CHECK (organization_id = current_setting('app.tenant_id', true));

CREATE POLICY channex_property_mappings_tenant_delete ON channex_property_mappings
  FOR DELETE
  USING (organization_id = current_setting('app.tenant_id', true));

COMMENT ON TABLE channex_property_mappings IS
  'Mapeo entre properties de Impacto y su equivalente en Channex. '
  'Se crea automáticamente cuando el anfitrión agrega una propiedad.';
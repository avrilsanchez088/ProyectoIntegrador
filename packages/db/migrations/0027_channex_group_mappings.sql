-- Migration 0027 · Channex group mappings.
-- Mapea cada workspace (organization) de Impacto con su Group en Channex.
-- El group se crea automáticamente cuando el anfitrión crea su workspace.

CREATE TABLE IF NOT EXISTS channex_group_mappings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channex_group_id    text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS channex_group_mappings_org_idx
  ON channex_group_mappings (organization_id);

ALTER TABLE channex_group_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE channex_group_mappings FORCE ROW LEVEL SECURITY;

CREATE POLICY channex_group_mappings_tenant_select ON channex_group_mappings
  FOR SELECT
  USING (organization_id = current_setting('app.tenant_id', true));

CREATE POLICY channex_group_mappings_tenant_insert ON channex_group_mappings
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.tenant_id', true));

CREATE POLICY channex_group_mappings_tenant_update ON channex_group_mappings
  FOR UPDATE
  USING (organization_id = current_setting('app.tenant_id', true))
  WITH CHECK (organization_id = current_setting('app.tenant_id', true));

CREATE POLICY channex_group_mappings_tenant_delete ON channex_group_mappings
  FOR DELETE
  USING (organization_id = current_setting('app.tenant_id', true));

COMMENT ON TABLE channex_group_mappings IS
  'Mapeo entre workspaces de Impacto y su Group en Channex. '
  'Permite agrupar las properties de cada anfitrión en el panel de Channex.';
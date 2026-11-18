-- Migration 0025 · Channex unit mappings.
--
-- Mapea cada unidad de Impacto (units.id) con sus equivalentes en Channex:
--   - room_type_id: ID del room type en Channex
--   - rate_plan_id: ID del rate plan en Channex
--
-- Cuando se crea una reserva en Impacto, este mapeo permite saber a qué
-- room_type y rate_plan de Channex hay que actualizar la disponibilidad.
--
-- Un workspace puede tener una sola integración Channex (sync_integrations),
-- pero cada unidad tiene su propio room_type y rate_plan en Channex.

CREATE TABLE IF NOT EXISTS channex_unit_mappings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  unit_id           uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,

  -- IDs en Channex (UUIDs).
  channex_property_id  text NOT NULL,
  channex_room_type_id text NOT NULL,
  channex_rate_plan_id text NOT NULL,

  -- Auditoría.
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- Una unidad solo tiene 1 mapeo por property de Channex.
  UNIQUE (unit_id, channex_property_id)
);

CREATE INDEX IF NOT EXISTS channex_unit_mappings_org_idx
  ON channex_unit_mappings (organization_id);

CREATE INDEX IF NOT EXISTS channex_unit_mappings_unit_idx
  ON channex_unit_mappings (unit_id);

ALTER TABLE channex_unit_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE channex_unit_mappings FORCE ROW LEVEL SECURITY;

CREATE POLICY channex_unit_mappings_tenant_select ON channex_unit_mappings
  FOR SELECT
  USING (organization_id = current_setting('app.tenant_id', true));

CREATE POLICY channex_unit_mappings_tenant_insert ON channex_unit_mappings
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.tenant_id', true));

CREATE POLICY channex_unit_mappings_tenant_update ON channex_unit_mappings
  FOR UPDATE
  USING (organization_id = current_setting('app.tenant_id', true))
  WITH CHECK (organization_id = current_setting('app.tenant_id', true));

CREATE POLICY channex_unit_mappings_tenant_delete ON channex_unit_mappings
  FOR DELETE
  USING (organization_id = current_setting('app.tenant_id', true));

COMMENT ON TABLE channex_unit_mappings IS
  'Mapeo entre unidades de Impacto y sus equivalentes en Channex '
  '(room_type_id + rate_plan_id). Usado para sincronizar disponibilidad '
  'y precios cuando cambia el estado de una reserva.';
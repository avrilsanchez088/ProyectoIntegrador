-- Migration 0024 · Performance indexes en FK columns
-- (descubierto al auditar pg_constraint vs pg_index).
--
-- Razón: tablas con RLS filtran TODA query por `organization_id` via el
-- setting `app.tenant_id`. Sin índice, cada lista hace seq scan. Lo mismo
-- pasa con FK columns sin índice — cascade deletes y joins escanean toda
-- la tabla referencante.
--
-- Solo agregamos los críticos (RLS-scoped + frecuentes en joins). El resto
-- (accounts, invitations, tenant_freeze_log) son tablas chicas y/o admin.
--
-- IF NOT EXISTS para idempotencia.

-- properties: toda query del dashboard filtra por orgId.
CREATE INDEX IF NOT EXISTS properties_organization_id_idx
  ON properties (organization_id) WHERE deleted_at IS NULL;

-- units: lista por property y por org. Composite (org, property) cubre
-- ambos casos comunes; el index simple en property también es útil para
-- joins desde rates/seasons/photos.
CREATE INDEX IF NOT EXISTS units_org_property_idx
  ON units (organization_id, property_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS units_property_id_idx
  ON units (property_id) WHERE deleted_at IS NULL;

-- photos: query típicamente filtra por unit_id O property_id. RLS filtra
-- por org_id (cubierto en el composite con unit).
CREATE INDEX IF NOT EXISTS photos_unit_idx
  ON photos (unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS photos_property_idx
  ON photos (property_id) WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS photos_organization_id_idx
  ON photos (organization_id);

-- seasons: query por property + por org (RLS).
CREATE INDEX IF NOT EXISTS seasons_property_id_idx
  ON seasons (property_id);
CREATE INDEX IF NOT EXISTS seasons_organization_id_idx
  ON seasons (organization_id);

-- rates: el composite unique (unit_id, season_id) ya cubre lookups por
-- unit. Falta el FK simple para org-level queries.
CREATE INDEX IF NOT EXISTS rates_organization_id_idx
  ON rates (organization_id);

-- cancellation_policies: lookup por unit y por org-default (unit_id NULL).
CREATE INDEX IF NOT EXISTS cancellation_policies_unit_idx
  ON cancellation_policies (unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cancellation_policies_org_default_idx
  ON cancellation_policies (organization_id, is_default) WHERE is_default = 1;

-- pricing_rules: lookup similar a cancellation_policies (unit o org-wide).
CREATE INDEX IF NOT EXISTS pricing_rules_unit_idx
  ON pricing_rules (unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pricing_rules_organization_id_idx
  ON pricing_rules (organization_id);

-- unit_fees: query por unit.
CREATE INDEX IF NOT EXISTS unit_fees_unit_id_idx
  ON unit_fees (unit_id);
CREATE INDEX IF NOT EXISTS unit_fees_organization_id_idx
  ON unit_fees (organization_id);

-- availability_blocks: las queries filtran por (unit_id, date_range).
-- El EXCLUDE constraint ya da el GIST index. Agregamos btree simple
-- por org para listing admin.
CREATE INDEX IF NOT EXISTS availability_blocks_organization_id_idx
  ON availability_blocks (organization_id);

-- external_calendars, ical_export_tokens: lookups por unit y por org.
CREATE INDEX IF NOT EXISTS external_calendars_unit_id_idx
  ON external_calendars (unit_id);
CREATE INDEX IF NOT EXISTS external_calendars_organization_id_idx
  ON external_calendars (organization_id);
CREATE INDEX IF NOT EXISTS ical_export_tokens_unit_id_idx
  ON ical_export_tokens (unit_id);
CREATE INDEX IF NOT EXISTS ical_export_tokens_organization_id_idx
  ON ical_export_tokens (organization_id);

-- accounts (Better Auth): user_id se queryea en cada session lookup.
CREATE INDEX IF NOT EXISTS accounts_user_id_idx
  ON accounts (user_id);

-- invitations: lookups por inviter (history) y por org (lista pending).
CREATE INDEX IF NOT EXISTS invitations_inviter_idx
  ON invitations (inviter_id);
CREATE INDEX IF NOT EXISTS invitations_organization_id_idx
  ON invitations (organization_id);

-- Migration 0022 · Sync integrations per tenant (página /dashboard/sync).
--
-- Almacena las conexiones de un workspace con channel managers (Channex,
-- Hostaway, etc.) o APIs directas de OTAs (Booking.com Connectivity,
-- Airbnb). Coexiste con `external_calendars` (iCal puro):
--
--   - iCal → tabla existente `external_calendars` (provider+url+poll_interval)
--   - Channel managers + Direct APIs → esta tabla nueva
--
-- Credentials se guardan en jsonb (encriptación at-rest pendiente — TODO
-- M7 cuando integremos secrets manager. V1: cleartext en DB del owner).
--
-- Sin RLS — usamos pgPolicy() para tenant isolation.

CREATE TABLE IF NOT EXISTS sync_integrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identificador del provider — el catálogo vive en
  -- packages/shared/src/sync-providers.ts. Ej: 'channex', 'hostaway',
  -- 'booking_direct', 'airbnb_direct', 'rentals_united'.
  provider_key    text NOT NULL,

  -- Credenciales y configuración del provider — shape varía. Ejemplos:
  --   channex:     { apiKey, propertyId }
  --   hostaway:    { accountId, apiKey }
  --   booking_direct: { hotelId, certificateId } (cuando bajemos)
  -- jsonb permite evolucionar sin migration por provider.
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Estado del integration. UI muestra coloreado.
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'connected', 'error', 'disabled')),

  -- Última verificación de salud (best-effort ping al provider).
  last_check_at   timestamptz,
  last_error      text,

  -- Auditoría.
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Un workspace solo tiene 1 conexión por provider — si hay que
  -- conectar otra cuenta, primero desconectar la actual.
  UNIQUE (organization_id, provider_key)
);

CREATE INDEX IF NOT EXISTS sync_integrations_org_idx
  ON sync_integrations (organization_id);

ALTER TABLE sync_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_integrations FORCE ROW LEVEL SECURITY;

CREATE POLICY sync_integrations_tenant_select ON sync_integrations
  FOR SELECT
  USING (organization_id = current_setting('app.tenant_id', true));

CREATE POLICY sync_integrations_tenant_insert ON sync_integrations
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.tenant_id', true));

CREATE POLICY sync_integrations_tenant_update ON sync_integrations
  FOR UPDATE
  USING (organization_id = current_setting('app.tenant_id', true))
  WITH CHECK (organization_id = current_setting('app.tenant_id', true));

CREATE POLICY sync_integrations_tenant_delete ON sync_integrations
  FOR DELETE
  USING (organization_id = current_setting('app.tenant_id', true));

COMMENT ON TABLE sync_integrations IS
  'Conexiones por tenant a channel managers (Channex, Hostaway, etc.) y APIs '
  'directas de OTAs (Booking Connectivity, Airbnb). Catálogo en '
  'packages/shared/src/sync-providers.ts. Credenciales en config jsonb '
  '(encriptación at-rest pendiente — M7).';

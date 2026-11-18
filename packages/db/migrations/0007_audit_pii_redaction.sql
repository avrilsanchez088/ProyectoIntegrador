-- Migration 0007 · PII redaction en audit triggers (propuesta 108.1 ronda 8).
--
-- Contexto: la migration 0006 escribe `old_row` y `new_row` JSONB a
-- `audit.events`. Eso incluye campos sensibles como `guest_email`,
-- `guest_phone`, `guest_name`, `password` (en accounts si jamás se trigeara).
--
-- Solución: redact los campos sensibles antes del INSERT al audit. El
-- trigger sigue capturando estructura del cambio, pero los valores PII se
-- reemplazan por `'***'`.
--
-- Compliance: GDPR-equivalent (Ley 25.326 AR, LGPD BR). Si un huésped pide
-- "right to erasure", su PII desaparece del DB principal — no queda en
-- audit como sombra eterna.

CREATE OR REPLACE FUNCTION audit.redact_pii(row_data jsonb)
RETURNS jsonb AS $$
DECLARE
  redacted jsonb;
  pii_fields text[] := ARRAY[
    'guest_email',
    'guest_phone',
    'guest_name',
    'password',
    'access_token',
    'refresh_token',
    'id_token',
    'two_factor_secret',
    'webhook_secret'
  ];
  field text;
BEGIN
  IF row_data IS NULL THEN
    RETURN NULL;
  END IF;

  redacted := row_data;
  FOREACH field IN ARRAY pii_fields LOOP
    IF redacted ? field AND redacted->field != 'null'::jsonb THEN
      redacted := jsonb_set(redacted, ARRAY[field], '"***"'::jsonb);
    END IF;
  END LOOP;

  RETURN redacted;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Reemplaza la función trigger para usar redact_pii.
CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS trigger AS $$
DECLARE
  v_org text;
  v_id text;
  v_user text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_org := COALESCE((to_jsonb(OLD)->>'organization_id'), (to_jsonb(OLD)->>'id'));
    v_id := to_jsonb(OLD)->>'id';
  ELSE
    v_org := COALESCE((to_jsonb(NEW)->>'organization_id'), (to_jsonb(NEW)->>'id'));
    v_id := to_jsonb(NEW)->>'id';
  END IF;

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
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE audit.redact_pii(to_jsonb(OLD)) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE audit.redact_pii(to_jsonb(NEW)) END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration 0023 · Fix ambigüedad en purge_old_audit_events
-- (descubierto via test src/audit-purge.test.ts).
--
-- La función 0012 declara `RETURNS TABLE(organization_id text, ...)` y
-- adentro hace `WHERE organization_id = org_record.id`. Postgres no sabe
-- si `organization_id` refiere a la OUT param o a la columna de audit.events.
--
-- Fix: aliasamos `audit.events` como `e` y calificamos la columna.

CREATE OR REPLACE FUNCTION purge_old_audit_events(p_batch_size int DEFAULT 5000)
RETURNS TABLE(organization_id text, deleted_count int) AS $$
DECLARE
  org_record RECORD;
  retention_days int;
  cutoff timestamptz;
  total_deleted int;
BEGIN
  FOR org_record IN
    SELECT o.id, COALESCE(ts.audit_retention_days, 365) AS retention
    FROM organizations o
    LEFT JOIN tenant_settings ts ON ts.id = o.id
  LOOP
    retention_days := org_record.retention;
    cutoff := now() - (retention_days || ' days')::interval;

    total_deleted := 0;
    LOOP
      WITH old_rows AS (
        SELECT e.id
        FROM audit.events e
        WHERE e.organization_id = org_record.id AND e.ts < cutoff
        ORDER BY e.ts ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM audit.events e
        USING old_rows
        WHERE e.id = old_rows.id;

      GET DIAGNOSTICS total_deleted = ROW_COUNT;
      EXIT WHEN total_deleted = 0;

      organization_id := org_record.id;
      deleted_count := total_deleted;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

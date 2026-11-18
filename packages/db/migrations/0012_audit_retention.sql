-- Migration 0012 · Audit retention policy configurable por tenant
-- (propuesta 141.4 ronda 12).
--
-- Razón: audit.events crece sin límite. Sin retention, una tabla con 10
-- workspaces * 1k mutations/día * 365 días = 3.6M rows/año. Postgres lo
-- maneja, pero vacuum y queries de listing sufren.
--
-- Solución: campo `audit_retention_days` en tenant_settings (default 365),
-- + función `purge_old_audit_events()` que un cron diario corre. La función
-- borra eventos más viejos que el TTL del workspace, batched para no
-- bloquear writes.

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS audit_retention_days int NOT NULL DEFAULT 365
    CHECK (audit_retention_days >= 30 AND audit_retention_days <= 3650);

-- Función de purge — corre por tenant para respetar el TTL configurado
-- por cada uno. Si tenant_settings no tiene fila, usa 365 default.
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

    -- Batch delete para no bloquear writes long-time. Loopea hasta que no
    -- queden rows old. p_batch_size debería estar en orden de miles.
    total_deleted := 0;
    LOOP
      WITH old_rows AS (
        SELECT id FROM audit.events
        WHERE organization_id = org_record.id AND ts < cutoff
        ORDER BY ts ASC
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

COMMENT ON FUNCTION purge_old_audit_events IS
  'Borra audit.events más viejos que el retention configurado por tenant. '
  'Batched. Llamar desde cron diario del worker.';

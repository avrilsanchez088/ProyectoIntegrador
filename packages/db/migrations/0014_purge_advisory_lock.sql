-- Migration 0014 · Advisory lock en purge_old_audit_events (propuesta 163.4 ronda 14).
--
-- Si el worker reinicia mid-cron o si por algún motivo se dispara doble el
-- mismo job, sin lock podríamos correr 2 instancias del purge en paralelo.
-- pg_advisory_lock garantiza serialización a nivel session.
--
-- Key 4242: arbitrario, debe ser único entre features que usen advisory locks.
-- Reservamos rango 4000-4099 para purge/maintenance jobs.

CREATE OR REPLACE FUNCTION purge_old_audit_events(p_batch_size int DEFAULT 5000)
RETURNS TABLE(organization_id text, deleted_count int) AS $$
DECLARE
  org_record RECORD;
  retention_days int;
  cutoff timestamptz;
  total_deleted int;
  got_lock bool;
BEGIN
  -- Try lock con timeout efectivo 0 — si no lo obtenemos, return vacío.
  SELECT pg_try_advisory_lock(4242) INTO got_lock;
  IF NOT got_lock THEN
    RAISE NOTICE 'purge_old_audit_events: advisory lock 4242 busy, skipping';
    RETURN;
  END IF;

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
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(4242);
    RAISE;
  END;

  PERFORM pg_advisory_unlock(4242);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION purge_old_audit_events IS
  'Borra audit.events más viejos que el retention configurado por tenant. '
  'Batched. Serialized via pg_advisory_lock(4242). '
  'Llamar desde cron diario del worker.';

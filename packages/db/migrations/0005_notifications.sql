-- Migration 0005 · in_app_notifications (§2.10 del audit).

CREATE TABLE IF NOT EXISTS in_app_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         text,
  category        text NOT NULL,
  severity        text NOT NULL DEFAULT 'info',
  title           text NOT NULL,
  body            text,
  action_url      text,
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS in_app_notifs_user_unread_idx
  ON in_app_notifications (organization_id, user_id, read_at);

ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE in_app_notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON in_app_notifications
  FOR SELECT
  USING (organization_id = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_insert ON in_app_notifications
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_update ON in_app_notifications
  FOR UPDATE
  USING (organization_id = current_setting('app.tenant_id', true))
  WITH CHECK (organization_id = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_delete ON in_app_notifications
  FOR DELETE
  USING (organization_id = current_setting('app.tenant_id', true));

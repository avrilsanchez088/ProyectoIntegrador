-- M4 · Calendar + iCal sync
-- Tablas: bookings, availability_blocks, external_calendars, ical_export_tokens
-- + EXCLUDE constraint anti-double-booking en bookings (GiST + tstzrange).

CREATE TABLE IF NOT EXISTS "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"unit_id" uuid NOT NULL,
	"code" text NOT NULL,
	"source" text DEFAULT 'direct' NOT NULL,
	"status" text DEFAULT 'tentative' NOT NULL,
	"check_in" timestamp with time zone NOT NULL,
	"check_out" timestamp with time zone NOT NULL,
	"guests_count" integer DEFAULT 2 NOT NULL,
	"pets_count" integer DEFAULT 0 NOT NULL,
	"guest_name" text,
	"guest_email" text,
	"guest_phone" text,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"fees_total_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"refundable_total_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"quote_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"external_uid" text,
	"external_calendar_id" uuid,
	"notes" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "availability_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"unit_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text DEFAULT 'other' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "availability_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "external_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"unit_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"ical_url" text NOT NULL,
	"poll_interval_minutes" integer DEFAULT 15 NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_status" text,
	"last_sync_error" text,
	"last_event_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_calendars" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ical_export_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"unit_id" uuid NOT NULL,
	"token" text NOT NULL,
	"label" text,
	"last_accessed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ical_export_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_calendars" ADD CONSTRAINT "external_calendars_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_calendars" ADD CONSTRAINT "external_calendars_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ical_export_tokens" ADD CONSTRAINT "ical_export_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ical_export_tokens" ADD CONSTRAINT "ical_export_tokens_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_org_code_idx" ON "bookings" USING btree ("organization_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_external_uid_idx" ON "bookings" USING btree ("external_calendar_id","external_uid") WHERE external_uid IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_unit_status_idx" ON "bookings" USING btree ("unit_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_unit_dates_idx" ON "bookings" USING btree ("unit_id","check_in","check_out");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "availability_blocks_unit_dates_idx" ON "availability_blocks" USING btree ("unit_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_calendars_unit_idx" ON "external_calendars" USING btree ("unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ical_export_tokens_token_idx" ON "ical_export_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ical_export_tokens_unit_idx" ON "ical_export_tokens" USING btree ("unit_id");--> statement-breakpoint
-- ─── EXCLUDE constraint anti-double-booking ─────────
-- GiST sobre (unit_id =, tstzrange(check_in, check_out) overlaps), filtrando
-- bookings cancelados/no-show. Requiere extension btree_gist (cargada en init).
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
   EXCLUDE USING gist (
     unit_id WITH =,
     tstzrange(check_in, check_out, '[)') WITH &&
   ) WHERE (status NOT IN ('cancelled', 'no_show'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- También en availability_blocks (no se solapan entre sí — la API valida vs bookings).
DO $$ BEGIN
 ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_no_overlap"
   EXCLUDE USING gist (
     unit_id WITH =,
     tstzrange(starts_at, ends_at, '[)') WITH &&
   );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE POLICY "tenant_isolation_select" ON "bookings" AS PERMISSIVE FOR SELECT TO public USING (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_insert" ON "bookings" AS PERMISSIVE FOR INSERT TO public WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_update" ON "bookings" AS PERMISSIVE FOR UPDATE TO public USING (organization_id = current_setting('app.tenant_id', true)) WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_delete" ON "bookings" AS PERMISSIVE FOR DELETE TO public USING (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_select" ON "availability_blocks" AS PERMISSIVE FOR SELECT TO public USING (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_insert" ON "availability_blocks" AS PERMISSIVE FOR INSERT TO public WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_update" ON "availability_blocks" AS PERMISSIVE FOR UPDATE TO public USING (organization_id = current_setting('app.tenant_id', true)) WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_delete" ON "availability_blocks" AS PERMISSIVE FOR DELETE TO public USING (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_select" ON "external_calendars" AS PERMISSIVE FOR SELECT TO public USING (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_insert" ON "external_calendars" AS PERMISSIVE FOR INSERT TO public WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_update" ON "external_calendars" AS PERMISSIVE FOR UPDATE TO public USING (organization_id = current_setting('app.tenant_id', true)) WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_delete" ON "external_calendars" AS PERMISSIVE FOR DELETE TO public USING (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_select" ON "ical_export_tokens" AS PERMISSIVE FOR SELECT TO public USING (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_insert" ON "ical_export_tokens" AS PERMISSIVE FOR INSERT TO public WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_update" ON "ical_export_tokens" AS PERMISSIVE FOR UPDATE TO public USING (organization_id = current_setting('app.tenant_id', true)) WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_delete" ON "ical_export_tokens" AS PERMISSIVE FOR DELETE TO public USING (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
-- RLS de tenant_settings (G3.9: id = current_setting('app.tenant_id', true)).
ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation_select" ON "tenant_settings";--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation_insert" ON "tenant_settings";--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation_update" ON "tenant_settings";--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation_delete" ON "tenant_settings";--> statement-breakpoint
CREATE POLICY "tenant_isolation_select" ON "tenant_settings" AS PERMISSIVE FOR SELECT TO public USING (id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_insert" ON "tenant_settings" AS PERMISSIVE FOR INSERT TO public WITH CHECK (id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_update" ON "tenant_settings" AS PERMISSIVE FOR UPDATE TO public USING (id = current_setting('app.tenant_id', true)) WITH CHECK (id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_delete" ON "tenant_settings" AS PERMISSIVE FOR DELETE TO public USING (id = current_setting('app.tenant_id', true));

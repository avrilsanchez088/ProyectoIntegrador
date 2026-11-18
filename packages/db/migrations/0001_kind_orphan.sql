CREATE TABLE IF NOT EXISTS "cancellation_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"unit_id" uuid,
	"name" text NOT NULL,
	"tiers" jsonb NOT NULL,
	"is_default" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cancellation_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pricing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"unit_id" uuid,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pricing_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"unit_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"price_per_night_cents" integer NOT NULL,
	"extra_guest_price_cents" integer DEFAULT 0 NOT NULL,
	"base_guests" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"season_type" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "seasons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unit_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"unit_id" uuid NOT NULL,
	"name" text NOT NULL,
	"fee_type" text NOT NULL,
	"charge_type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"refundable" integer DEFAULT 0 NOT NULL,
	"optional" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unit_fees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cancellation_policies" ADD CONSTRAINT "cancellation_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cancellation_policies" ADD CONSTRAINT "cancellation_policies_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rates" ADD CONSTRAINT "rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rates" ADD CONSTRAINT "rates_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rates" ADD CONSTRAINT "rates_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seasons" ADD CONSTRAINT "seasons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seasons" ADD CONSTRAINT "seasons_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "unit_fees" ADD CONSTRAINT "unit_fees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "unit_fees" ADD CONSTRAINT "unit_fees_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rates_unit_season_idx" ON "rates" USING btree ("unit_id","season_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation_select" ON "cancellation_policies" AS PERMISSIVE FOR SELECT TO public USING (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_insert" ON "cancellation_policies" AS PERMISSIVE FOR INSERT TO public WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_update" ON "cancellation_policies" AS PERMISSIVE FOR UPDATE TO public USING (organization_id = current_setting('app.tenant_id', true)) WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_delete" ON "cancellation_policies" AS PERMISSIVE FOR DELETE TO public USING (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_select" ON "pricing_rules" AS PERMISSIVE FOR SELECT TO public USING (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_insert" ON "pricing_rules" AS PERMISSIVE FOR INSERT TO public WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_update" ON "pricing_rules" AS PERMISSIVE FOR UPDATE TO public USING (organization_id = current_setting('app.tenant_id', true)) WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_delete" ON "pricing_rules" AS PERMISSIVE FOR DELETE TO public USING (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_select" ON "rates" AS PERMISSIVE FOR SELECT TO public USING (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_insert" ON "rates" AS PERMISSIVE FOR INSERT TO public WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_update" ON "rates" AS PERMISSIVE FOR UPDATE TO public USING (organization_id = current_setting('app.tenant_id', true)) WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_delete" ON "rates" AS PERMISSIVE FOR DELETE TO public USING (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_select" ON "seasons" AS PERMISSIVE FOR SELECT TO public USING (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_insert" ON "seasons" AS PERMISSIVE FOR INSERT TO public WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_update" ON "seasons" AS PERMISSIVE FOR UPDATE TO public USING (organization_id = current_setting('app.tenant_id', true)) WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_delete" ON "seasons" AS PERMISSIVE FOR DELETE TO public USING (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_select" ON "unit_fees" AS PERMISSIVE FOR SELECT TO public USING (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_insert" ON "unit_fees" AS PERMISSIVE FOR INSERT TO public WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_update" ON "unit_fees" AS PERMISSIVE FOR UPDATE TO public USING (organization_id = current_setting('app.tenant_id', true)) WITH CHECK (organization_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation_delete" ON "unit_fees" AS PERMISSIVE FOR DELETE TO public USING (organization_id = current_setting('app.tenant_id', true));
-- generator output, hand-extended after it like 0009 and 0010.
--
-- docs/specs/03-data-model.md §"Maps in the rebuild" is the decision this carries. what is
-- new here is a table that is deployment-wide with a **tenant-scoped pivot beside it**:
-- `map` and `map_kml_file` belong to no operator and take the write authority
-- §"Catalogue write authority in the rebuild" decided, while `map_organization` reads like
-- `membership`, so one operator cannot learn which others a map is assigned to.
--
-- the assignment is not an access control. it decides which tenants see a map in their
-- report, never who may reach `/map/{slug}` - docs/specs/08-maps.md.

CREATE TYPE "public"."layer_type" AS ENUM('no_fly_3_7km', 'ring_5km', 'lzr', 'ctr', 'atz', 'chko');--> statement-breakpoint
CREATE TABLE "map" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"allow_dark_basemap" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "map" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "map_kml_file" (
	"id" serial PRIMARY KEY NOT NULL,
	"map_id" integer NOT NULL,
	"file_path" text NOT NULL,
	"display_name" text,
	"default_title" text,
	"default_description" text,
	"layer_type" "layer_type",
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_not_geozone" boolean DEFAULT false NOT NULL,
	"default_when_no_geozone" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "map_kml_file" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "map_organization" (
	"id" serial PRIMARY KEY NOT NULL,
	"map_id" integer NOT NULL,
	"organization_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "map_organization" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "map_kml_file" ADD CONSTRAINT "map_kml_file_map_id_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."map"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_organization" ADD CONSTRAINT "map_organization_map_id_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."map"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_organization" ADD CONSTRAINT "map_organization_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "map_slug_key" ON "map" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "map_kml_file_map_idx" ON "map_kml_file" USING btree ("map_id");--> statement-breakpoint
CREATE UNIQUE INDEX "map_organization_map_organization_key" ON "map_organization" USING btree ("map_id","organization_id");--> statement-breakpoint
CREATE INDEX "map_organization_organization_idx" ON "map_organization" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "map_deployment_wide" ON "map" AS PERMISSIVE FOR ALL TO public USING (nullif(current_setting('app.person_id', true), '')::integer is not null) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false));--> statement-breakpoint
CREATE POLICY "map_delete_superadmin_only" ON "map" AS RESTRICTIVE FOR DELETE TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false));--> statement-breakpoint
CREATE POLICY "map_kml_file_deployment_wide" ON "map_kml_file" AS PERMISSIVE FOR ALL TO public USING (nullif(current_setting('app.person_id', true), '')::integer is not null) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false));--> statement-breakpoint
CREATE POLICY "map_kml_file_delete_superadmin_only" ON "map_kml_file" AS RESTRICTIVE FOR DELETE TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false));--> statement-breakpoint
CREATE POLICY "map_organization_tenant_isolation" ON "map_organization" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "map_organization"."organization_id" in (select app_acting_organizations())) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false));--> statement-breakpoint
CREATE POLICY "map_organization_delete_superadmin_only" ON "map_organization" AS RESTRICTIVE FOR DELETE TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false));--> statement-breakpoint

-- hand-extended past the generator, for the two reasons 0001 exists at all.

-- ENABLE alone exempts the table owner, so a maintenance connection would rewrite the
-- geozone maps of the whole deployment with row-level security reported as on.
ALTER TABLE "map" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "map_organization" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "map_kml_file" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- and the GRANT is re-issued here where 0010 deliberately did not, for the opposite
-- reason: all three tables are created *after* 0001, so its ON ALL TABLES IN SCHEMA is a
-- snapshot that never reached them - and it applies to the table and its sequence
-- separately.
GRANT SELECT, INSERT, UPDATE, DELETE ON "map" TO tarmacview_app;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "map_id_seq" TO tarmacview_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "map_organization" TO tarmacview_app;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "map_organization_id_seq" TO tarmacview_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "map_kml_file" TO tarmacview_app;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "map_kml_file_id_seq" TO tarmacview_app;
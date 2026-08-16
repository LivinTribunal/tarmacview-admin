-- generator output, hand-extended after it like 0007, and unlike 0007 not reordered: both
-- referenceable pairs this migration needs already exist by the time a foreign key names
-- them. `device_id_organization_key` landed in 0007, and `flight_id_organization_key` is
-- inline in the CREATE TABLE below rather than a later ALTER, so `flight_log`'s composite
-- key finds it. nothing here has to move.
--
-- docs/specs/03-data-model.md §"Flights in the rebuild" is the decision this carries.

CREATE TYPE "public"."entry_mode" AS ENUM('dji_log', 'agro_export', 'manual', 'controller_sync');--> statement-breakpoint
CREATE TYPE "public"."parsing_status" AS ENUM('processed', 'failed');--> statement-breakpoint
CREATE TABLE "flight" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"device_id" integer,
	"pilot_id" integer,
	"imported_by" integer,
	"file_name" text,
	"entry_mode" "entry_mode" NOT NULL,
	"total_flight_time_seconds" integer,
	"max_altitude_meters" numeric,
	"max_distance_meters" numeric,
	"total_distance_meters" numeric,
	"parsing_status" "parsing_status",
	"parsing_errors" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flight_id_organization_key" UNIQUE("id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "flight" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "flight_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"flight_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"distance_meters" numeric,
	"max_altitude_meters" numeric,
	"aircraft" text
);
--> statement-breakpoint
ALTER TABLE "flight_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flight" ADD CONSTRAINT "flight_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight" ADD CONSTRAINT "flight_pilot_id_person_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight" ADD CONSTRAINT "flight_imported_by_person_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight" ADD CONSTRAINT "flight_device_id_organization_id_fk" FOREIGN KEY ("device_id","organization_id") REFERENCES "public"."device"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_log" ADD CONSTRAINT "flight_log_flight_id_organization_id_fk" FOREIGN KEY ("flight_id","organization_id") REFERENCES "public"."flight"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flight_organization_idx" ON "flight" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "flight_log_flight_idx" ON "flight_log" USING btree ("flight_id");--> statement-breakpoint
CREATE INDEX "flight_log_organization_idx" ON "flight_log" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "flight_tenant_isolation" ON "flight" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "flight"."organization_id" in (select app_acting_organizations())) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "flight"."organization_id" in (select app_acting_organizations()));--> statement-breakpoint
CREATE POLICY "flight_log_tenant_isolation" ON "flight_log" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "flight_log"."organization_id" in (select app_acting_organizations())) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "flight_log"."organization_id" in (select app_acting_organizations()));--> statement-breakpoint

-- hand-extended past the generator, for the two reasons 0001 exists at all.

-- ENABLE alone exempts the table owner, so a maintenance connection would read every
-- tenant's flight records with row-level security reported as on.
ALTER TABLE "flight" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flight_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- 0001 grants ON ALL TABLES IN SCHEMA, which is a snapshot taken at that migration and
-- does not reach a table created after it - and it applies to each new table and each new
-- sequence separately.
GRANT SELECT, INSERT, UPDATE, DELETE ON "flight" TO tarmacview_app;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "flight_id_seq" TO tarmacview_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "flight_log" TO tarmacview_app;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "flight_log_id_seq" TO tarmacview_app;
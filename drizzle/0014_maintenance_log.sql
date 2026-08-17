-- generator output, hand-extended after it like 0008, 0011 and 0013, and needing no
-- reordering: the referenceable pair the composite foreign key below names already exists -
-- `device_id_organization_key` landed inline in 0000's CREATE TABLE, so nothing here has to
-- move.
--
-- docs/specs/03-data-model.md §"Maintenance log in the rebuild" is the decision this
-- carries. `device_id` is **not null**, unlike the composite keys on `flight` and
-- `incident`: a service is performed on an airframe, so the constraint is enforced on every
-- row here rather than left unenforced by a null.

CREATE TABLE "maintenance_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"device_id" integer NOT NULL,
	"maintenance_date" date NOT NULL,
	"total_flight_hours" text NOT NULL,
	"total_flights" integer,
	"maintenance_performed_by" text,
	"fault_and_maintenance_description" text,
	"preflight_check_performed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maintenance_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "maintenance_log" ADD CONSTRAINT "maintenance_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_log" ADD CONSTRAINT "maintenance_log_device_id_organization_id_fk" FOREIGN KEY ("device_id","organization_id") REFERENCES "public"."device"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_log_organization_idx" ON "maintenance_log" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "maintenance_log_tenant_isolation" ON "maintenance_log" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "maintenance_log"."organization_id" in (select app_acting_organizations())) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "maintenance_log"."organization_id" in (select app_acting_organizations()));--> statement-breakpoint

-- hand-extended past the generator, for the two reasons 0001 exists at all.

-- ENABLE alone exempts the table owner, so a maintenance connection would read every
-- operator's maintenance history with row-level security reported as on.
ALTER TABLE "maintenance_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- 0001 grants ON ALL TABLES IN SCHEMA, which is a snapshot taken at that migration and
-- does not reach a table created after it - and it applies to the table and its sequence
-- separately.
GRANT SELECT, INSERT, UPDATE, DELETE ON "maintenance_log" TO tarmacview_app;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "maintenance_log_id_seq" TO tarmacview_app;
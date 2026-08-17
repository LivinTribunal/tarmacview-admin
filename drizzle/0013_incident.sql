-- generator output, hand-extended after it like 0008 and 0011, and needing no reordering:
-- the referenceable pair the composite foreign key below names already exists -
-- `flight_id_organization_key` landed inline in 0008's CREATE TABLE, so nothing here has
-- to move.
--
-- docs/specs/03-data-model.md §"Incidents in the rebuild" is the decision this carries.
-- one thing here has no precedent in 0000-0012 and is the slice: `injuries` is a
-- **nullable** boolean, where the three this application renders as flags are
-- `not null default false`.

CREATE TABLE "incident" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"incident_date" date NOT NULL,
	"flight_id" integer,
	"injuries" boolean,
	"notes" text,
	"file_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incident" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_flight_id_organization_id_fk" FOREIGN KEY ("flight_id","organization_id") REFERENCES "public"."flight"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incident_organization_idx" ON "incident" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "incident_tenant_isolation" ON "incident" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "incident"."organization_id" in (select app_acting_organizations())) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "incident"."organization_id" in (select app_acting_organizations()));--> statement-breakpoint

-- hand-extended past the generator, for the two reasons 0001 exists at all.

-- ENABLE alone exempts the table owner, so a maintenance connection would read every
-- operator's occurrence reports with row-level security reported as on.
ALTER TABLE "incident" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- 0001 grants ON ALL TABLES IN SCHEMA, which is a snapshot taken at that migration and
-- does not reach a table created after it - and it applies to the table and its sequence
-- separately.
GRANT SELECT, INSERT, UPDATE, DELETE ON "incident" TO tarmacview_app;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "incident_id_seq" TO tarmacview_app;

-- hand-reordered past the generator, and then hand-extended after it like 0002.
--
-- the reorder is not cosmetic. drizzle-kit emitted the two composite foreign keys before
-- the unique constraints they reference, and Postgres requires the referenced columns to
-- already carry one - so as generated this migration fails on the first apply. the two
-- ALTER TABLE ... UNIQUE statements are lifted above every FOREIGN KEY below.
--
-- docs/specs/03-data-model.md §"Trainings in the rebuild" is the decision this carries.

-- the referenceable pairs. redundant beside each primary key, and existing to be
-- referenced: they are what lets `training` and `training_device` carry `organization_id`
-- into a foreign key, so a row naming another operator's syllabus entry or airframe is
-- rejected by Postgres rather than merely hidden from a read.
ALTER TABLE "device" ADD CONSTRAINT "device_id_organization_key" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "training_type" ADD CONSTRAINT "training_type_id_organization_key" UNIQUE("id","organization_id");--> statement-breakpoint

-- generator output from here down, in its own order.

CREATE TABLE "training" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"training_type_id" integer,
	"pilot_id" integer NOT NULL,
	"held_on" date,
	"valid_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_id_organization_key" UNIQUE("id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "training" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "training_device" (
	"id" serial PRIMARY KEY NOT NULL,
	"training_id" integer NOT NULL,
	"device_id" integer NOT NULL,
	"organization_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_device" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "training" ADD CONSTRAINT "training_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training" ADD CONSTRAINT "training_pilot_id_person_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training" ADD CONSTRAINT "training_training_type_id_organization_id_fk" FOREIGN KEY ("training_type_id","organization_id") REFERENCES "public"."training_type"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_device" ADD CONSTRAINT "training_device_training_id_organization_id_fk" FOREIGN KEY ("training_id","organization_id") REFERENCES "public"."training"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_device" ADD CONSTRAINT "training_device_device_id_organization_id_fk" FOREIGN KEY ("device_id","organization_id") REFERENCES "public"."device"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_organization_idx" ON "training" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_device_training_device_key" ON "training_device" USING btree ("training_id","device_id");--> statement-breakpoint
CREATE INDEX "training_device_organization_idx" ON "training_device" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "training_tenant_isolation" ON "training" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "training"."organization_id" in (select app_acting_organizations())) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "training"."organization_id" in (select app_acting_organizations()));--> statement-breakpoint
CREATE POLICY "training_device_tenant_isolation" ON "training_device" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "training_device"."organization_id" in (select app_acting_organizations())) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "training_device"."organization_id" in (select app_acting_organizations()));--> statement-breakpoint

-- hand-extended past the generator, for the two reasons 0001 exists at all.

-- ENABLE alone exempts the table owner, so a maintenance connection would read every
-- tenant's training records with row-level security reported as on.
ALTER TABLE "training" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "training_device" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- 0001 grants ON ALL TABLES IN SCHEMA, which is a snapshot taken at that migration and
-- does not reach a table created after it - 0002's footnote, and it applies to each new
-- table and each new sequence separately.
GRANT SELECT, INSERT, UPDATE, DELETE ON "training" TO tarmacview_app;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "training_id_seq" TO tarmacview_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "training_device" TO tarmacview_app;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "training_device_id_seq" TO tarmacview_app;

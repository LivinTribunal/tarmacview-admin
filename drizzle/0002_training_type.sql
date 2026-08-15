CREATE TABLE "training_type" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_type" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "training_type" ADD CONSTRAINT "training_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "training_type_organization_code_key" ON "training_type" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "training_type_organization_idx" ON "training_type" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "training_type_tenant_isolation" ON "training_type" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "training_type"."organization_id" in (select m.organization_id from membership m where m.person_id = nullif(current_setting('app.person_id', true), '')::integer)) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "training_type"."organization_id" in (select m.organization_id from membership m where m.person_id = nullif(current_setting('app.person_id', true), '')::integer));--> statement-breakpoint

-- hand-extended past the generator, for the two reasons 0001 exists at all.

-- ENABLE alone exempts the table owner, so a maintenance connection would read every
-- tenant's syllabus with row-level security reported as on.
ALTER TABLE "training_type" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- 0001 grants ON ALL TABLES IN SCHEMA, which is a snapshot taken at that migration and
-- does not reach a table created after it. without these the application role fails with
-- `permission denied` rather than on policy - and the tempting fix, reading or seeding
-- through the owner connection, bypasses row-level security instead of satisfying it.
GRANT SELECT, INSERT, UPDATE, DELETE ON "training_type" TO tarmacview_app;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "training_type_id_seq" TO tarmacview_app;
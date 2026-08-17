-- generator output, hand-extended after it like 0008, and needing no reordering: this
-- migration creates one table and references only tables that landed long before it.
--
-- docs/specs/03-data-model.md §"The global document library in the rebuild" is the decision
-- this carries. two things here have no precedent in 0000-0008 and are the slice:
-- `organization_id` is nullable, and the policy's USING and WITH CHECK are deliberately
-- different - equal here would let any member publish into every operator's library.

CREATE TYPE "public"."document_category" AS ENUM('general', 'forms', 'permits', 'operations');--> statement-breakpoint
CREATE TABLE "document" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer,
	"category" "document_category" NOT NULL,
	"name" text NOT NULL,
	"file_path" text NOT NULL,
	"note" text,
	"valid_until" date,
	"is_public" boolean DEFAULT false NOT NULL,
	"uploaded_by" integer,
	"size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_general_is_global" CHECK (("document"."category" = 'general') = ("document"."organization_id" is null))
);
--> statement-breakpoint
ALTER TABLE "document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_uploaded_by_person_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_organization_idx" ON "document" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "document_tenant_isolation" ON "document" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false)
        or (nullif(current_setting('app.person_id', true), '')::integer is not null and "document"."organization_id" is null)
        or "document"."organization_id" in (select app_acting_organizations())) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "document"."organization_id" in (select app_acting_organizations()));--> statement-breakpoint
CREATE POLICY "document_global_update_superadmin_only" ON "document" AS RESTRICTIVE FOR UPDATE TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "document"."organization_id" is not null);--> statement-breakpoint
CREATE POLICY "document_global_delete_superadmin_only" ON "document" AS RESTRICTIVE FOR DELETE TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "document"."organization_id" is not null);--> statement-breakpoint

-- hand-extended past the generator, for the two reasons 0001 exists at all.

-- ENABLE alone exempts the table owner, so a maintenance connection would read and write
-- the global library with row-level security reported as on.
ALTER TABLE "document" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- 0001 grants ON ALL TABLES IN SCHEMA, which is a snapshot taken at that migration and
-- does not reach a table created after it - and it applies to the table and its sequence
-- separately.
GRANT SELECT, INSERT, UPDATE, DELETE ON "document" TO tarmacview_app;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "document_id_seq" TO tarmacview_app;
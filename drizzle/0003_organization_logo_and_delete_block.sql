-- generator output. two things, both on the table the tenancy model keys off: the logo
-- column the organisation form has always carried, and the delete block -
-- docs/specs/03-data-model.md §"Organisation deletion and the logo in the rebuild".
--
-- unlike 0002 this adds no GRANT: 0001's ON ALL TABLES IN SCHEMA is table-level and
-- every table touched here already existed when it ran, so a new column inherits it.

ALTER TABLE "device" DROP CONSTRAINT "device_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "training_type" DROP CONSTRAINT "training_type_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "logo_path" text;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_type" ADD CONSTRAINT "training_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;
-- generator output. the *Osvedčenia* section of doc 04 §UserResource as three columns on
-- `person` - docs/specs/03-data-model.md §"Certificates in the rebuild". columns only: no
-- policy here, and the shared-organisation read 0005 landed already scopes every one of
-- them, since a policy is on the table rather than on its columns.
--
-- like 0003 this adds no GRANT. 0001's ON ALL TABLES IN SCHEMA is table-level and `person`
-- existed when it ran, so a new column inherits it - and a type needs none: CREATE TYPE
-- leaves USAGE with PUBLIC.

CREATE TYPE "public"."certificate_type" AS ENUM('A1_A3', 'A2', 'STS');--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "certificate_number" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "certificate_types" "certificate_type"[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "certificate_valid_until" date;
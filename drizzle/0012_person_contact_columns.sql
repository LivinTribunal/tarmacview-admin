-- generator output. doc 05 §0's `Telefón` and `Pozícia` columns as two columns on `person`
-- - docs/specs/03-data-model.md §"Contact and job-title columns in the rebuild". doc 03 records
-- all three of the predecessor's contact fields as Observed; `note` is left out here,
-- because no column in either people tab renders it and no write path fills it.
--
-- columns only, like 0006. no policy: `person_shared_organization_or_self` is on the table
-- rather than on its columns, so both of these are scoped the moment they exist. no GRANT:
-- 0001's ON ALL TABLES IN SCHEMA is table-level and `person` existed when it ran.

ALTER TABLE "person" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "position" text;

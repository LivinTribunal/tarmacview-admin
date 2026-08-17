-- generator output, hand-extended after it like 0009. the table this touches is the one
-- that had no row-level security at all - docs/specs/03-data-model.md §"Catalogue write
-- authority in the rebuild" is the decision it carries.
--
-- deployment-wide was always the right half and it stays: neither policy below asks about
-- an organisation, because the catalogue has none to ask about. what was missing is the
-- other half - with no policy at all, 0001's grant left every member holding INSERT, UPDATE
-- and DELETE over every operator's airframe types.

ALTER TABLE "device_type" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "device_type_deployment_wide" ON "device_type" AS PERMISSIVE FOR ALL TO public USING (nullif(current_setting('app.person_id', true), '')::integer is not null) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false));--> statement-breakpoint
CREATE POLICY "device_type_delete_superadmin_only" ON "device_type" AS RESTRICTIVE FOR DELETE TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false));--> statement-breakpoint

-- hand-extended past the generator, for the first of the two reasons 0001 exists.

-- ENABLE alone exempts the table owner, so a maintenance connection would rewrite the
-- catalogue with row-level security reported as on.
ALTER TABLE "device_type" FORCE ROW LEVEL SECURITY;

-- and no GRANT, unlike 0009: `device_type` was created in 0000, so 0001's ON ALL TABLES IN
-- SCHEMA reached it and its sequence when it ran. that grant is why this migration exists,
-- and re-issuing it here would say the opposite.

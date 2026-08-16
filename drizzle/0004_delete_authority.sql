-- generator output. who may DELETE, on the three tables where the `for: 'all'` policy's
-- superadmin-only WITH CHECK never reached deletion - docs/specs/03-data-model.md
-- §"Delete authority in the rebuild". RESTRICTIVE is the load-bearing word: a permissive
-- delete policy would OR with the policy already there and narrow nothing.
--
-- like 0003 this adds no GRANT. a policy is not a privilege, and no table and no sequence
-- is created here, so 0002's grant footnote does not apply.

CREATE POLICY "membership_delete_superadmin_only" ON "membership" AS RESTRICTIVE FOR DELETE TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false));--> statement-breakpoint
CREATE POLICY "organization_delete_superadmin_only" ON "organization" AS RESTRICTIVE FOR DELETE TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false));--> statement-breakpoint
CREATE POLICY "person_delete_superadmin_only" ON "person" AS RESTRICTIVE FOR DELETE TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false));
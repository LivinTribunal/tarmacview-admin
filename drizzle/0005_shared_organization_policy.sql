-- hand-extended ahead of the generator rather than after it like 0002: every policy
-- below calls this function and CREATE POLICY resolves it at creation time, so it has to
-- exist first.

-- which organisations the acting person holds a membership of, answered outside row-level
-- security - docs/specs/03-data-model.md §"The shared-organisation read in the rebuild".
-- a policy expression reads another table under that table's own policies, so membership's
-- policy cannot ask this question of `membership` without asking itself. SECURITY DEFINER
-- is the escape: the question is answered once, by a function that reads no policy.
--
-- it answers that one question and nothing else. it must never read `app.system_role` -
-- superadmin lives in the policies, so this function has exactly one reason to be trusted.
--
-- SET search_path = '' with `public.membership` written out, because a definer function
-- that resolves its own names through the caller's search_path is the standard way one of
-- these is turned into a privilege escalation. STABLE and not IMMUTABLE: the answer
-- changes with the transaction's own settings.
--
-- and a deployment constraint no schema dump shows: whoever applies this migration owns the
-- function, and SECURITY DEFINER escapes row-level security only if that owner is a role
-- row-level security does not apply to. FORCE ROW LEVEL SECURITY (0001) means a plain table
-- owner is not one - owned by such a role, this reads `membership` under the policy it
-- exists to answer without, and every scoped read dies on stack depth rather than leaking.
-- tests/tenancy/shared-organization-policy.test.ts asserts the owner rather than assuming.
CREATE FUNCTION app_acting_organizations() RETURNS SETOF integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT m.organization_id FROM public.membership m
  WHERE m.person_id = nullif(current_setting('app.person_id', true), '')::integer
$$;--> statement-breakpoint

-- EXECUTE is granted to PUBLIC by default, which on a definer function means every role in
-- the cluster. revoke that, then grant it to the one role that needs it.
REVOKE EXECUTE ON FUNCTION app_acting_organizations() FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_acting_organizations() TO tarmacview_app;--> statement-breakpoint

-- generator output. the rename is a DROP and a CREATE, not an ALTER: a policy's name is
-- not something ALTER POLICY changes alongside its predicate, and the two policies say
-- different things anyway. no GRANT on tables or sequences follows, for 0004's reason -
-- no table and no sequence is created here, and a policy is not a privilege.
DROP POLICY "membership_own_or_superadmin" ON "membership" CASCADE;--> statement-breakpoint
DROP POLICY "person_self_or_superadmin" ON "person" CASCADE;--> statement-breakpoint
CREATE POLICY "membership_tenant_isolation" ON "membership" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "membership"."organization_id" in (select app_acting_organizations())) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false));--> statement-breakpoint
CREATE POLICY "person_shared_organization_or_self" ON "person" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "person"."id" = nullif(current_setting('app.person_id', true), '')::integer
        or exists (select 1 from public.membership m
                   where m.person_id = "person"."id"
                     and m.organization_id in (select app_acting_organizations()))) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false));--> statement-breakpoint
ALTER POLICY "device_tenant_isolation" ON "device" TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "device"."organization_id" in (select app_acting_organizations())) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "device"."organization_id" in (select app_acting_organizations()));--> statement-breakpoint
ALTER POLICY "organization_tenant_isolation" ON "organization" TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "organization"."id" in (select app_acting_organizations())) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false));--> statement-breakpoint
ALTER POLICY "training_type_tenant_isolation" ON "training_type" TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "training_type"."organization_id" in (select app_acting_organizations())) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "training_type"."organization_id" in (select app_acting_organizations()));
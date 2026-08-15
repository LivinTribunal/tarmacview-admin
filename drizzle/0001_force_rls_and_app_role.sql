-- custom migration: the two halves of row-level security that a generated schema
-- cannot express, and without which the policies in 0000 are decoration.

-- FORCE makes the table owner subject to its own policies. ENABLE alone exempts the
-- owner, so a migration or maintenance connection would read every tenant's rows with
-- row-level security reported as on.
ALTER TABLE "organization" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "person" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "membership" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "device" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- the role the application connects as. a NOLOGIN group role: the deployment grants a
-- login role membership of it, and tests/support/database.ts does the same. it must
-- never be SUPERUSER and must never carry BYPASSRLS - either one skips every policy
-- above without changing anything a schema dump would show.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tarmacview_app') THEN
    CREATE ROLE tarmacview_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;--> statement-breakpoint

GRANT USAGE ON SCHEMA "public" TO tarmacview_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO tarmacview_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "public" TO tarmacview_app;

CREATE TYPE "public"."device_status" AS ENUM('active', 'inactive', 'maintenance', 'retired');--> statement-breakpoint
CREATE TYPE "public"."operation_type" AS ENUM('VLOS', 'BVLOS');--> statement-breakpoint
CREATE TYPE "public"."organization_role" AS ENUM('accountable_manager', 'operations', 'pilot', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."system_role" AS ENUM('superadmin', 'member');--> statement-breakpoint
CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"person_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"serial_number" text NOT NULL,
	"name" text,
	"model" text,
	"manufacturer" text,
	"device_type_id" integer,
	"status" "device_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "device_type" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"max_vlos" numeric,
	"service_interval" integer,
	"service_interval_months" integer,
	"battery_service_interval" integer,
	"maintenance_instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" serial PRIMARY KEY NOT NULL,
	"person_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"role" "organization_role" NOT NULL,
	"is_primary_contact" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"uas_registration_number" text,
	"specific_permit_number" text,
	"specific_operation_type" "operation_type",
	"max_allowed_altitude" numeric,
	"insurance_valid_until" date,
	"licence_expiry_warning_days" integer DEFAULT 40 NOT NULL,
	"report_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "person" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"system_role" "system_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_user" ADD CONSTRAINT "auth_user_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_device_type_id_device_type_id_fk" FOREIGN KEY ("device_type_id") REFERENCES "public"."device_type"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_session_token_key" ON "auth_session" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_user_email_key" ON "auth_user" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_user_person_key" ON "auth_user" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "device_organization_idx" ON "device" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_person_organization_key" ON "membership" USING btree ("person_id","organization_id");--> statement-breakpoint
CREATE INDEX "membership_organization_idx" ON "membership" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_report_token_key" ON "organization" USING btree ("report_token");--> statement-breakpoint
CREATE UNIQUE INDEX "person_email_key" ON "person" USING btree ("email") WHERE "person"."email" is not null;--> statement-breakpoint
CREATE POLICY "device_tenant_isolation" ON "device" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "device"."organization_id" in (select m.organization_id from membership m where m.person_id = nullif(current_setting('app.person_id', true), '')::integer)) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "device"."organization_id" in (select m.organization_id from membership m where m.person_id = nullif(current_setting('app.person_id', true), '')::integer));--> statement-breakpoint
CREATE POLICY "membership_own_or_superadmin" ON "membership" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "membership"."person_id" = nullif(current_setting('app.person_id', true), '')::integer) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false));--> statement-breakpoint
CREATE POLICY "organization_tenant_isolation" ON "organization" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "organization"."id" in (select m.organization_id from membership m where m.person_id = nullif(current_setting('app.person_id', true), '')::integer)) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false));--> statement-breakpoint
CREATE POLICY "person_self_or_superadmin" ON "person" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.system_role', true) = 'superadmin', false) or "person"."id" = nullif(current_setting('app.person_id', true), '')::integer) WITH CHECK (coalesce(current_setting('app.system_role', true) = 'superadmin', false));
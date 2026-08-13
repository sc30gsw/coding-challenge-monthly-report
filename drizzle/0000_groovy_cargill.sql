CREATE TYPE "public"."report_line_status" AS ENUM('pending', 'approved', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('draft', 'in_review', 'confirmed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'sales');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"default_addressee" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"line_id" uuid,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"project_name" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" "report_line_status" DEFAULT 'pending' NOT NULL,
	"sales_owner_id" uuid NOT NULL,
	"change_request_reason" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_lines_reason_only_when_changes_requested" CHECK (("report_lines"."status" = 'changes_requested') = ("report_lines"."change_request_reason" is not null)),
	CONSTRAINT "report_lines_amount_non_negative" CHECK ("report_lines"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"client_id" uuid NOT NULL,
	"client_name" text NOT NULL,
	"addressee" text NOT NULL,
	"target_month" date NOT NULL,
	"status" "report_status" DEFAULT 'draft' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_series_version_unique" UNIQUE("series_id","version"),
	CONSTRAINT "reports_confirmed_at_matches_status" CHECK (("reports"."status" in ('confirmed', 'superseded')) = ("reports"."confirmed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_line_id_report_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."report_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_lines" ADD CONSTRAINT "report_lines_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_lines" ADD CONSTRAINT "report_lines_sales_owner_id_users_id_fk" FOREIGN KEY ("sales_owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_report_idx" ON "comments" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "comments_line_idx" ON "comments" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "report_lines_report_idx" ON "report_lines" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_lines_owner_idx" ON "report_lines" USING btree ("sales_owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_one_open_version_per_series" ON "reports" USING btree ("series_id") WHERE "reports"."status" in ('draft', 'in_review');--> statement-breakpoint
CREATE INDEX "reports_series_idx" ON "reports" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "reports_client_idx" ON "reports" USING btree ("client_id");
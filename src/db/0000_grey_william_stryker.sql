-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "trash" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"original_project_id" text,
	"deleted_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'local' NOT NULL,
	"text" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"reminder_time" text,
	"notified" boolean DEFAULT false NOT NULL,
	"repeat_type" text,
	"repeat_days" integer[],
	"linked_episode_id" text,
	"linked_episode_title" text,
	"linked_episode_number" integer,
	"linked_project_id" text,
	"linked_project_title" text,
	"linked_client_name" text,
	"linked_partner_id" text,
	"linked_partner_name" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"page_path" text,
	"status" text DEFAULT 'pending',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"email" text,
	"phone" text,
	"company" text,
	"address" text,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "custom_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "custom_roles_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"episode_number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"client" text,
	"work_content" text[],
	"work_items" jsonb,
	"status" text DEFAULT 'waiting' NOT NULL,
	"assignee" text,
	"manager" text,
	"start_date" text,
	"end_date" text,
	"due_date" text,
	"budget_total" numeric DEFAULT '0',
	"budget_partner" numeric DEFAULT '0',
	"budget_management" numeric DEFAULT '0',
	"work_steps" jsonb,
	"work_budgets" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone,
	"payment_due_date" text,
	"payment_status" text DEFAULT 'pending',
	"invoice_date" text,
	"invoice_status" text DEFAULT 'pending',
	"client_id" uuid,
	CONSTRAINT "episodes_project_episode_number_unique" UNIQUE("project_id","episode_number")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"amount" numeric DEFAULT '0' NOT NULL,
	"category" text DEFAULT '기타' NOT NULL,
	"expense_date" date DEFAULT CURRENT_DATE NOT NULL,
	"description" text,
	"spender_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payment_type" text DEFAULT 'one_time' NOT NULL,
	"next_renewal_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"cancel_reason" text
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"excerpt" text,
	"slug" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"tags" text[] DEFAULT '{""""}',
	"featured_image" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "planhigh_contact_requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "planhigh_contact_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"hospital_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"service" text,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "strategy_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"emoji" text DEFAULT '📁' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_docs" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"title" text DEFAULT '새 페이지' NOT NULL,
	"emoji" text DEFAULT '📝' NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text NOT NULL,
	"project_type" text NOT NULL,
	"budget" text,
	"message" text NOT NULL,
	"references_links" text[] DEFAULT '{""""}',
	"portfolio_references" jsonb DEFAULT '[]'::jsonb,
	"referral_source" text,
	"status" text DEFAULT 'new',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "planhigh_site_content" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "single_row" CHECK (id = 1)
);
--> statement-breakpoint
CREATE TABLE "sent_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid,
	"sender_email" text NOT NULL,
	"to" text[] NOT NULL,
	"cc" text[],
	"bcc" text[],
	"subject" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_name" text NOT NULL,
	"row_id" uuid,
	"action" text NOT NULL,
	"actor_id" uuid,
	"diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_action_check" CHECK (action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text]))
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "partner_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"invited_email" text,
	"invited_name" text,
	"invited_by" uuid,
	"legacy_hint_id" uuid,
	"expires_at" timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
	"used_at" timestamp with time zone,
	"used_by" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_invites_token_key" UNIQUE("token"),
	CONSTRAINT "partner_invites_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'used'::text, 'expired'::text, 'revoked'::text]))
);
--> statement-breakpoint
CREATE TABLE "app_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app" text NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"date" date DEFAULT CURRENT_DATE NOT NULL,
	"tag" text,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "app_updates_app_check" CHECK (app = ANY (ARRAY['erp'::text, 'bibot'::text]))
);
--> statement-breakpoint
CREATE TABLE "partner_meta" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"tier" text,
	"bank_name" text,
	"bank_account" text,
	"bank_holder" text,
	"work_formats" text[] DEFAULT '{""""}' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" date,
	"legacy_partner_id" uuid,
	"legacy_mapped_at" timestamp with time zone,
	"legacy_mapped_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_meta_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'suspended'::text])),
	CONSTRAINT "partner_meta_type_check" CHECK (type = ANY (ARRAY['freelancer'::text, 'business'::text]))
);
--> statement-breakpoint
CREATE TABLE "vimo_staff" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"department" text,
	"position" text,
	"hire_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_type" text DEFAULT 'staff' NOT NULL,
	"name" text,
	"avatar_url" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text,
	"password_hash" text,
	CONSTRAINT "profiles_user_type_check" CHECK (user_type = ANY (ARRAY['staff'::text, 'partner'::text, 'external'::text]))
);
--> statement-breakpoint
CREATE TABLE "app_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"app_code" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp with time zone,
	CONSTRAINT "app_access_user_id_app_code_key" UNIQUE("user_id","app_code"),
	CONSTRAINT "app_access_status_check" CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text]))
);
--> statement-breakpoint
CREATE TABLE "apps" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"sso_enabled" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"company" text,
	"partner_type" text,
	"role" text DEFAULT 'partner' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"generation" integer,
	"bank" text,
	"bank_account" text,
	"profile_image" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"position" text DEFAULT 'partner',
	"job_title" text,
	"job_rank" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"client" text,
	"partner_id" text,
	"status" text DEFAULT 'planning' NOT NULL,
	"total_amount" numeric DEFAULT '0',
	"partner_payment" numeric DEFAULT '0',
	"management_fee" numeric DEFAULT '0',
	"margin_rate" numeric DEFAULT '0',
	"work_content" text[],
	"tags" text[],
	"thumbnail_url" text,
	"video_url" text,
	"completed_at" timestamp with time zone,
	"work_type_costs" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"partner_ids" text[] DEFAULT '{""""}',
	"manager_ids" text[] DEFAULT '{""""}',
	"category" text,
	"client_id" uuid,
	"channels" text[]
);
--> statement-breakpoint
CREATE TABLE "partner_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impersonation_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"target_profile_id" uuid NOT NULL,
	"target_email" text,
	"reason" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"client" text,
	"partner_id" text,
	"completed_at" text,
	"tags" text[] DEFAULT '{""""}',
	"youtube_url" text,
	"is_published" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"category" text DEFAULT '기타',
	"display_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role" text DEFAULT 'manager' NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"email" text,
	"approved" boolean DEFAULT false,
	"needs_password_change" boolean DEFAULT false,
	"tutorial_done" jsonb DEFAULT '{}'::jsonb,
	"password_hash" text,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_docs" ADD CONSTRAINT "strategy_docs_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."strategy_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_invites" ADD CONSTRAINT "partner_invites_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_invites" ADD CONSTRAINT "partner_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_meta" ADD CONSTRAINT "partner_meta_legacy_mapped_by_fkey" FOREIGN KEY ("legacy_mapped_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_meta" ADD CONSTRAINT "partner_meta_legacy_partner_fk" FOREIGN KEY ("legacy_partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_meta" ADD CONSTRAINT "partner_meta_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vimo_staff" ADD CONSTRAINT "vimo_staff_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_access" ADD CONSTRAINT "app_access_app_code_fkey" FOREIGN KEY ("app_code") REFERENCES "public"."apps"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_access" ADD CONSTRAINT "app_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_history" ADD CONSTRAINT "partner_history_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_issues" ADD CONSTRAINT "partner_issues_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_trash_deleted_at" ON "trash" USING btree ("deleted_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_checklists_user_id" ON "checklists" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_episodes_project_id" ON "episodes" USING btree ("project_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_log_actor" ON "audit_log" USING btree ("actor_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_log_table_row" ON "audit_log" USING btree ("table_name" text_ops,"row_id" uuid_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_push_subscriptions_user_id" ON "push_subscriptions" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_partner_invites_status_expires" ON "partner_invites" USING btree ("status" text_ops,"expires_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_partner_invites_token" ON "partner_invites" USING btree ("token" text_ops) WHERE (status = 'pending'::text);--> statement-breakpoint
CREATE INDEX "idx_app_updates_app_date" ON "app_updates" USING btree ("app" date_ops,"date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_partner_meta_legacy" ON "partner_meta" USING btree ("legacy_partner_id" uuid_ops) WHERE (legacy_partner_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_partner_meta_status" ON "partner_meta" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_profiles_email" ON "profiles" USING btree ("email" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ux_profiles_email_lower" ON "profiles" USING btree (lower(email) text_ops) WHERE (email IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "app_access_erp_exclusive" ON "app_access" USING btree ("user_id" uuid_ops) WHERE (app_code = ANY (ARRAY['vimo_erp'::text, 'partner_erp'::text]));--> statement-breakpoint
CREATE INDEX "idx_app_access_app_status" ON "app_access" USING btree ("app_code" text_ops,"status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_app_access_user" ON "app_access" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_projects_client_id" ON "projects" USING btree ("client_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_projects_client_name" ON "projects" USING btree ("client" text_ops);--> statement-breakpoint
CREATE INDEX "idx_projects_status" ON "projects" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "partner_history_partner_id_idx" ON "partner_history" USING btree ("partner_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "partner_issues_partner_id_idx" ON "partner_issues" USING btree ("partner_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ux_user_profiles_email_lower" ON "user_profiles" USING btree (lower(email) text_ops) WHERE (email IS NOT NULL);
*/
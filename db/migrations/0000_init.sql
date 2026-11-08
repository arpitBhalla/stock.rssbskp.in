CREATE TYPE "public"."borrow_status" AS ENUM('pending', 'approved', 'partially_returned', 'returned', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."txn_kind" AS ENUM('intake', 'adjustment', 'borrow_out', 'borrow_in', 'return_out', 'return_in', 'issue');--> statement-breakpoint
CREATE TYPE "public"."challan_kind" AS ENUM('receipt', 'transfer', 'return', 'adjustment', 'issue');--> statement-breakpoint
CREATE TYPE "public"."challan_status" AS ENUM('issued', 'acknowledged', 'void');--> statement-breakpoint
CREATE TYPE "public"."dept_role" AS ENUM('manager', 'viewer');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
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
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text,
	"display_username" text,
	"role" text DEFAULT 'viewer' NOT NULL,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "borrow_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"borrow_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"returned_qty" numeric(14, 3) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "borrows" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_department_id" integer NOT NULL,
	"to_department_id" integer NOT NULL,
	"status" "borrow_status" DEFAULT 'pending' NOT NULL,
	"requested_by" text NOT NULL,
	"approved_by" text,
	"note" text,
	"due_date" date,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "centers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "department_inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"required_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "department_inventory_qty_nonneg" CHECK ("department_inventory"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"center_id" integer NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"delta" numeric(14, 3) NOT NULL,
	"kind" "txn_kind" NOT NULL,
	"borrow_id" integer,
	"challan_id" integer,
	"note" text,
	"performed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sku" text NOT NULL,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"barcode" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_sku_unique" UNIQUE("sku"),
	CONSTRAINT "items_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challan_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"challan_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit" text NOT NULL,
	"rate" numeric(14, 2),
	"amount" numeric(14, 2)
);
--> statement-breakpoint
CREATE TABLE "challan_series" (
	"center_id" integer NOT NULL,
	"fiscal_year" text NOT NULL,
	"kind" "challan_kind" NOT NULL,
	"next_no" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "challan_series_center_id_fiscal_year_kind_pk" PRIMARY KEY("center_id","fiscal_year","kind")
);
--> statement-breakpoint
CREATE TABLE "challans" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"kind" "challan_kind" NOT NULL,
	"status" "challan_status" DEFAULT 'issued' NOT NULL,
	"center_id" integer NOT NULL,
	"from_department_id" integer,
	"to_department_id" integer,
	"borrow_id" integer,
	"party_name" text,
	"party_ref" text,
	"total_amount" numeric(14, 2),
	"bill_attachment_id" integer,
	"note" text,
	"public_token" text NOT NULL,
	"client_mutation_id" text,
	"issued_by" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_by" text,
	"acknowledged_by_name" text,
	"acknowledged_by_phone" text,
	"acknowledged_at" timestamp with time zone,
	"voided_by" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	CONSTRAINT "challans_number_unique" UNIQUE("number"),
	CONSTRAINT "challans_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "challans_client_mutation_id_unique" UNIQUE("client_mutation_id")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "user_departments" (
	"user_id" text NOT NULL,
	"department_id" integer NOT NULL,
	"role" "dept_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_departments_user_id_department_id_pk" PRIMARY KEY("user_id","department_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borrow_items" ADD CONSTRAINT "borrow_items_borrow_id_borrows_id_fk" FOREIGN KEY ("borrow_id") REFERENCES "public"."borrows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borrow_items" ADD CONSTRAINT "borrow_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borrows" ADD CONSTRAINT "borrows_from_department_id_departments_id_fk" FOREIGN KEY ("from_department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borrows" ADD CONSTRAINT "borrows_to_department_id_departments_id_fk" FOREIGN KEY ("to_department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borrows" ADD CONSTRAINT "borrows_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borrows" ADD CONSTRAINT "borrows_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_inventory" ADD CONSTRAINT "department_inventory_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_inventory" ADD CONSTRAINT "department_inventory_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_borrow_id_borrows_id_fk" FOREIGN KEY ("borrow_id") REFERENCES "public"."borrows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_challan_id_challans_id_fk" FOREIGN KEY ("challan_id") REFERENCES "public"."challans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_performed_by_user_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challan_lines" ADD CONSTRAINT "challan_lines_challan_id_challans_id_fk" FOREIGN KEY ("challan_id") REFERENCES "public"."challans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challan_lines" ADD CONSTRAINT "challan_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challan_series" ADD CONSTRAINT "challan_series_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challans" ADD CONSTRAINT "challans_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challans" ADD CONSTRAINT "challans_from_department_id_departments_id_fk" FOREIGN KEY ("from_department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challans" ADD CONSTRAINT "challans_to_department_id_departments_id_fk" FOREIGN KEY ("to_department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challans" ADD CONSTRAINT "challans_borrow_id_borrows_id_fk" FOREIGN KEY ("borrow_id") REFERENCES "public"."borrows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challans" ADD CONSTRAINT "challans_bill_attachment_id_attachments_id_fk" FOREIGN KEY ("bill_attachment_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challans" ADD CONSTRAINT "challans_issued_by_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challans" ADD CONSTRAINT "challans_acknowledged_by_user_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challans" ADD CONSTRAINT "challans_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_departments" ADD CONSTRAINT "user_departments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_departments" ADD CONSTRAINT "user_departments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "borrow_items_borrow_idx" ON "borrow_items" USING btree ("borrow_id");--> statement-breakpoint
CREATE INDEX "borrows_status_idx" ON "borrows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "borrows_from_dept_idx" ON "borrows" USING btree ("from_department_id");--> statement-breakpoint
CREATE INDEX "borrows_to_dept_idx" ON "borrows" USING btree ("to_department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "department_inventory_dept_item_uq" ON "department_inventory" USING btree ("department_id","item_id");--> statement-breakpoint
CREATE INDEX "department_inventory_dept_idx" ON "department_inventory" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "departments_center_code_uq" ON "departments" USING btree ("center_id","code");--> statement-breakpoint
CREATE INDEX "inv_txn_dept_item_idx" ON "inventory_transactions" USING btree ("department_id","item_id");--> statement-breakpoint
CREATE INDEX "inv_txn_borrow_idx" ON "inventory_transactions" USING btree ("borrow_id");--> statement-breakpoint
CREATE INDEX "inv_txn_challan_idx" ON "inventory_transactions" USING btree ("challan_id");--> statement-breakpoint
CREATE INDEX "inv_txn_created_idx" ON "inventory_transactions" USING btree ("created_at" desc);--> statement-breakpoint
CREATE INDEX "challan_lines_challan_idx" ON "challan_lines" USING btree ("challan_id");--> statement-breakpoint
CREATE INDEX "challans_from_dept_idx" ON "challans" USING btree ("from_department_id");--> statement-breakpoint
CREATE INDEX "challans_to_dept_idx" ON "challans" USING btree ("to_department_id");--> statement-breakpoint
CREATE INDEX "challans_borrow_idx" ON "challans" USING btree ("borrow_id");--> statement-breakpoint
CREATE INDEX "challans_issued_at_idx" ON "challans" USING btree ("issued_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_departments_dept_idx" ON "user_departments" USING btree ("department_id");
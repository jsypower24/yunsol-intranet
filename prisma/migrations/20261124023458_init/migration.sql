-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "given_name" TEXT NOT NULL DEFAULT '',
    "secret" TEXT,
    "admin" BOOLEAN NOT NULL DEFAULT false,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "team_added" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tracker_access" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "birth_date" TEXT NOT NULL DEFAULT '',
    "work_phone" TEXT NOT NULL DEFAULT '',
    "extension" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "dept" TEXT NOT NULL DEFAULT '',
    "position" TEXT NOT NULL DEFAULT '',
    "performance_base" BIGINT NOT NULL DEFAULT 0,
    "tracker_title" TEXT NOT NULL DEFAULT '',
    "tracker_icon" JSONB,
    "edited" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '진행(자문)',
    "setup" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL DEFAULT '',
    "cms" TEXT NOT NULL DEFAULT '',
    "bizno" TEXT NOT NULL DEFAULT '',
    "bizno_digits" TEXT NOT NULL DEFAULT '',
    "ceo" TEXT NOT NULL DEFAULT '',
    "related" TEXT NOT NULL DEFAULT '',
    "sales" TEXT NOT NULL DEFAULT '',
    "comm" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "book_fee" TEXT NOT NULL DEFAULT '',
    "support_fee" TEXT NOT NULL DEFAULT '',
    "payday" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '',
    "payment_method" TEXT NOT NULL DEFAULT '',
    "transfer_method" TEXT NOT NULL DEFAULT '',
    "closed_on" TEXT NOT NULL DEFAULT '',
    "closure_reason" TEXT NOT NULL DEFAULT '',
    "detail_notes" TEXT NOT NULL DEFAULT '',
    "detail_images" JSONB,
    "detail_blocks" JSONB,
    "last_active_category" TEXT NOT NULL DEFAULT '',
    "main_managers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fee_owners" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "custom" JSONB NOT NULL DEFAULT '{}',
    "edited" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" TEXT,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_payments" (
    "company_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "encrypted" BYTEA NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_payments_pkey" PRIMARY KEY ("company_id")
);

-- CreateTable
CREATE TABLE "works" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "month" TEXT NOT NULL DEFAULT '',
    "payday" TEXT NOT NULL DEFAULT '',
    "roster" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "accounting_info" TEXT NOT NULL DEFAULT '',
    "deadline" TEXT NOT NULL DEFAULT '',
    "hire" TEXT NOT NULL DEFAULT '',
    "worker" TEXT NOT NULL DEFAULT '',
    "round" TEXT NOT NULL DEFAULT '',
    "when" TEXT NOT NULL DEFAULT '',
    "selection" TEXT NOT NULL DEFAULT '',
    "agency" TEXT NOT NULL DEFAULT '',
    "fee" TEXT NOT NULL DEFAULT '',
    "requested" BOOLEAN NOT NULL DEFAULT false,
    "started" BOOLEAN NOT NULL DEFAULT false,
    "received" BOOLEAN NOT NULL DEFAULT false,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "payslip" BOOLEAN NOT NULL DEFAULT false,
    "accounting" BOOLEAN NOT NULL DEFAULT false,
    "fee_checked" BOOLEAN NOT NULL DEFAULT false,
    "employment" BOOLEAN NOT NULL DEFAULT false,
    "daily" BOOLEAN NOT NULL DEFAULT false,
    "insurance" BOOLEAN NOT NULL DEFAULT false,
    "class_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "closed" TEXT NOT NULL DEFAULT '진행',
    "edited" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" TEXT,

    CONSTRAINT "works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setup_rows" (
    "id" TEXT NOT NULL,
    "contract_setup" BOOLEAN NOT NULL DEFAULT false,
    "previous_agency_dismissed" BOOLEAN NOT NULL DEFAULT false,
    "tax_request" BOOLEAN NOT NULL DEFAULT false,
    "report_needed" BOOLEAN NOT NULL DEFAULT false,
    "report_completed" BOOLEAN NOT NULL DEFAULT false,
    "advice_contract" BOOLEAN NOT NULL DEFAULT false,
    "folder_created" BOOLEAN NOT NULL DEFAULT false,
    "cms_member" BOOLEAN NOT NULL DEFAULT false,
    "setup_debit" BOOLEAN NOT NULL DEFAULT false,
    "cms_bill" BOOLEAN NOT NULL DEFAULT false,
    "edi" BOOLEAN NOT NULL DEFAULT false,
    "employee_roster" BOOLEAN NOT NULL DEFAULT false,
    "notion" BOOLEAN NOT NULL DEFAULT false,
    "google_sheet" BOOLEAN NOT NULL DEFAULT false,
    "hr_helper" BOOLEAN NOT NULL DEFAULT false,
    "certificate_received" BOOLEAN NOT NULL DEFAULT false,
    "setup_fee" TEXT NOT NULL DEFAULT '',
    "first_debit" TEXT NOT NULL DEFAULT '',
    "work_start" TEXT NOT NULL DEFAULT '',
    "payroll_start" TEXT NOT NULL DEFAULT '',
    "subsidy" TEXT NOT NULL DEFAULT '',
    "special_notes" TEXT NOT NULL DEFAULT '',
    "base_managers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "temporary_managers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "edited" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" TEXT,

    CONSTRAINT "setup_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_people" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "org" TEXT NOT NULL DEFAULT '',
    "rate" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "edited" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" TEXT,

    CONSTRAINT "sales_people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "new_leads" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "edited" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" TEXT,

    CONSTRAINT "new_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fees" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "cms" TEXT NOT NULL DEFAULT '',
    "member_name" TEXT NOT NULL DEFAULT '',
    "billing_month" TEXT NOT NULL,
    "product" TEXT NOT NULL DEFAULT '',
    "amount" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT '',
    "method" TEXT NOT NULL DEFAULT '',
    "contract_day" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL DEFAULT '',
    "company_ref" TEXT NOT NULL DEFAULT '',
    "edited" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" TEXT,

    CONSTRAINT "fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "cms" TEXT NOT NULL DEFAULT '',
    "billing_month" TEXT NOT NULL DEFAULT '',
    "transmission" TEXT NOT NULL DEFAULT '',
    "amount" BIGINT NOT NULL DEFAULT 0,
    "written" TEXT NOT NULL DEFAULT '',
    "issued" TEXT NOT NULL DEFAULT '',
    "approval" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'hyosung',

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_imports" (
    "month" TEXT NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_imports_pkey" PRIMARY KEY ("month")
);

-- CreateTable
CREATE TABLE "overtime_rows" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "start" TEXT NOT NULL DEFAULT '',
    "end" TEXT NOT NULL DEFAULT '',
    "break_hours" DOUBLE PRECISION,
    "used_hours" DOUBLE PRECISION,
    "reason" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "edited" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" TEXT,

    CONSTRAINT "overtime_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subsidy_discovery" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "member_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "company_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "type" TEXT NOT NULL DEFAULT '',
    "headcount" INTEGER,
    "status" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "edited" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" TEXT,

    CONSTRAINT "subsidy_discovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "column_orders" (
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" JSONB NOT NULL,

    CONSTRAINT "column_orders_pkey" PRIMARY KEY ("user_id","name")
);

-- CreateTable
CREATE TABLE "private_trackers" (
    "user_id" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "values" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "private_trackers_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" TEXT,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "change_log" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT,
    "user_name" TEXT NOT NULL DEFAULT '',
    "collection" TEXT NOT NULL,
    "row_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "before" JSONB,
    "after" JSONB,

    CONSTRAINT "change_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "companies_bizno_digits_idx" ON "companies"("bizno_digits");

-- CreateIndex
CREATE INDEX "companies_cms_idx" ON "companies"("cms");

-- CreateIndex
CREATE INDEX "works_company_id_idx" ON "works"("company_id");

-- CreateIndex
CREATE INDEX "fees_billing_month_idx" ON "fees"("billing_month");

-- CreateIndex
CREATE INDEX "fees_cms_idx" ON "fees"("cms");

-- CreateIndex
CREATE INDEX "invoices_written_idx" ON "invoices"("written");

-- CreateIndex
CREATE INDEX "overtime_rows_date_idx" ON "overtime_rows"("date");

-- CreateIndex
CREATE INDEX "subsidy_discovery_date_idx" ON "subsidy_discovery"("date");

-- CreateIndex
CREATE INDEX "change_log_collection_row_id_id_idx" ON "change_log"("collection", "row_id", "id");

-- CreateIndex
CREATE INDEX "change_log_at_idx" ON "change_log"("at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_payments" ADD CONSTRAINT "company_payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setup_rows" ADD CONSTRAINT "setup_rows_id_fkey" FOREIGN KEY ("id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "column_orders" ADD CONSTRAINT "column_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_trackers" ADD CONSTRAINT "private_trackers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

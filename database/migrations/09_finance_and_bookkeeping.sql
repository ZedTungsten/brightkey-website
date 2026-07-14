-- ==========================================
-- Source: 09_bookkeeping_and_journal.sql
-- ==========================================

-- =============================================================================
-- BrightKey Consolidated Bookkeeping and Journal Schema (09_bookkeeping_and_journal.sql)
-- Consolidates general journal, journal accounts, bookkeeping transactions, lines,
-- attachments, and default Chart of Accounts and Transaction Types.
-- =============================================================================

-- ── 1. Drop existing tables in dependency order ──────────────────────────────
DROP TABLE IF EXISTS public.bookkeeping_attachments CASCADE;
DROP TABLE IF EXISTS public.bookkeeping_lines CASCADE;
DROP TABLE IF EXISTS public.bookkeeping CASCADE;
DROP TABLE IF EXISTS public.bookkeeping_accounts CASCADE;
DROP TABLE IF EXISTS public.bookkeeping_transaction_types CASCADE;
DROP TABLE IF EXISTS public.journal_audit_log CASCADE;
DROP TABLE IF EXISTS public.general_journal CASCADE;
DROP TABLE IF EXISTS public.journal_accounts CASCADE;

-- ── 2. Create Journal and Audit Log Tables ───────────────────────────────────

CREATE TABLE public.journal_accounts (
  id          SERIAL PRIMARY KEY,
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.general_journal (
  id            SERIAL PRIMARY KEY,
  company_id    UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  entry_number  INTEGER NOT NULL,
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL,
  date          DATE NOT NULL,
  account       TEXT NOT NULL,
  debit         NUMERIC(15,2),
  credit        NUMERIC(15,2),
  description_1 TEXT,
  description_2 TEXT,
  attachments   TEXT[] DEFAULT '{}',
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.journal_audit_log (
  id            SERIAL PRIMARY KEY,
  company_id    UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,
  entry_number  INTEGER NOT NULL,
  entry_label   TEXT,
  field_changed TEXT,
  old_value     TEXT,
  new_value     TEXT,
  ip_address    TEXT,
  device_info   TEXT,
  logged_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 3. Create Bookkeeping Tables ─────────────────────────────────────────────

CREATE TABLE public.bookkeeping_transaction_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE, -- NULL for system defaults
  parent_id   UUID REFERENCES public.bookkeeping_transaction_types(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.bookkeeping_accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID REFERENCES public.companies(id) ON DELETE CASCADE, -- NULL for system-wide defaults
  account_code         TEXT NOT NULL,
  account_name         TEXT NOT NULL,
  account_type         TEXT NOT NULL CHECK (account_type IN ('Asset', 'Liability', 'Equity', 'Revenue', 'COGS', 'Expense', 'Other')),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  is_payment_account   BOOLEAN NOT NULL DEFAULT FALSE,
  payment_account_type TEXT CHECK (payment_account_type IN ('debit', 'credit_card', 'cash_account', 'e_wallet', 'other_payment_account')),
  bank                 TEXT,
  statement_date       INTEGER CHECK (statement_date BETWEEN 1 AND 31),
  due_date             INTEGER CHECK (due_date BETWEEN 1 AND 31),
  credit_limit         INTEGER, -- in centavos (pesos * 100)
  card_number_last_4   VARCHAR(4) CHECK (card_number_last_4 ~ '^\d{3,4}$'),
  card_holder_name     TEXT,
  rewards              TEXT,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_bookkeeping_accounts_uniq ON public.bookkeeping_accounts (account_code) WHERE company_id IS NULL;
CREATE UNIQUE INDEX idx_bookkeeping_accounts_company_uniq ON public.bookkeeping_accounts (company_id, account_code) WHERE company_id IS NOT NULL;

CREATE TABLE public.bookkeeping (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  transaction_type_id UUID REFERENCES public.bookkeeping_transaction_types(id) ON DELETE RESTRICT NOT NULL,
  transaction_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_no        TEXT,
  description         TEXT,
  entry_no            INTEGER, -- Links to general_journal entry
  amount              INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'draft',
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.bookkeeping_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bookkeeping_id UUID REFERENCES public.bookkeeping(id) ON DELETE CASCADE NOT NULL,
  account_id     UUID REFERENCES public.bookkeeping_accounts(id) ON DELETE RESTRICT NOT NULL,
  debit          NUMERIC(15,2),
  credit         NUMERIC(15,2),
  description    TEXT,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.bookkeeping_attachments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bookkeeping_id UUID REFERENCES public.bookkeeping(id) ON DELETE CASCADE NOT NULL,
  file_path      TEXT NOT NULL,
  file_name      TEXT NOT NULL,
  file_type      TEXT,
  file_size      BIGINT,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 4. Enable Row Level Security ─────────────────────────────────────────────

ALTER TABLE public.general_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bookkeeping_transaction_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_attachments ENABLE ROW LEVEL SECURITY;

-- ── 5. Row Level Security Policies ───────────────────────────────────────────

DROP POLICY IF EXISTS "Company staff journal access"            ON public.general_journal;
DROP POLICY IF EXISTS "Finance module general_journal"          ON public.general_journal;
CREATE POLICY "Finance module general_journal" ON public.general_journal
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Finance'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Finance'));

DROP POLICY IF EXISTS "Company staff journal_accounts access"   ON public.journal_accounts;
DROP POLICY IF EXISTS "Finance module journal_accounts"         ON public.journal_accounts;
CREATE POLICY "Finance module journal_accounts" ON public.journal_accounts
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Finance'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Finance'));

DROP POLICY IF EXISTS "Company staff audit log access"          ON public.journal_audit_log;
DROP POLICY IF EXISTS "Finance module journal_audit_log"        ON public.journal_audit_log;
CREATE POLICY "Finance module journal_audit_log" ON public.journal_audit_log
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Finance'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Finance'));

-- bookkeeping_transaction_types: NULL company_id = system defaults; any Finance user can read
DROP POLICY IF EXISTS "Bookkeeping transaction types select"    ON public.bookkeeping_transaction_types;
DROP POLICY IF EXISTS "Bookkeeping transaction types insert"    ON public.bookkeeping_transaction_types;
DROP POLICY IF EXISTS "Bookkeeping transaction types update"    ON public.bookkeeping_transaction_types;
DROP POLICY IF EXISTS "Bookkeeping transaction types delete"    ON public.bookkeeping_transaction_types;
DROP POLICY IF EXISTS "Finance module bookkeeping_transaction_types" ON public.bookkeeping_transaction_types;
CREATE POLICY "Finance module bookkeeping_transaction_types" ON public.bookkeeping_transaction_types
  FOR ALL TO authenticated
  USING (
    company_id IS NULL  -- system-wide defaults readable by any Finance user
    OR public.has_module_access(auth.uid(), company_id, 'Finance')
  )
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Finance'));

-- bookkeeping_accounts: same NULL-company_id handling
DROP POLICY IF EXISTS "Bookkeeping accounts select"             ON public.bookkeeping_accounts;
DROP POLICY IF EXISTS "Bookkeeping accounts insert"             ON public.bookkeeping_accounts;
DROP POLICY IF EXISTS "Bookkeeping accounts update"             ON public.bookkeeping_accounts;
DROP POLICY IF EXISTS "Bookkeeping accounts delete"             ON public.bookkeeping_accounts;
DROP POLICY IF EXISTS "Finance module bookkeeping_accounts"     ON public.bookkeeping_accounts;
CREATE POLICY "Finance module bookkeeping_accounts" ON public.bookkeeping_accounts
  FOR ALL TO authenticated
  USING (
    company_id IS NULL
    OR public.has_module_access(auth.uid(), company_id, 'Finance')
  )
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Finance'));

DROP POLICY IF EXISTS "Bookkeeping access"                      ON public.bookkeeping;
DROP POLICY IF EXISTS "Finance module bookkeeping"              ON public.bookkeeping;
CREATE POLICY "Finance module bookkeeping" ON public.bookkeeping
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Finance'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Finance'));

-- bookkeeping_lines: no direct company_id — join through bookkeeping
DROP POLICY IF EXISTS "Bookkeeping lines access"                ON public.bookkeeping_lines;
DROP POLICY IF EXISTS "Finance module bookkeeping_lines"        ON public.bookkeeping_lines;
CREATE POLICY "Finance module bookkeeping_lines" ON public.bookkeeping_lines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookkeeping b
      WHERE b.id = bookkeeping_lines.bookkeeping_id
        AND public.has_module_access(auth.uid(), b.company_id, 'Finance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookkeeping b
      WHERE b.id = bookkeeping_lines.bookkeeping_id
        AND public.has_module_access(auth.uid(), b.company_id, 'Finance')
    )
  );

-- bookkeeping_attachments: same join pattern (was previously completely open!)
DROP POLICY IF EXISTS "Bookkeeping attachments access"          ON public.bookkeeping_attachments;
DROP POLICY IF EXISTS "Finance module bookkeeping_attachments"  ON public.bookkeeping_attachments;
CREATE POLICY "Finance module bookkeeping_attachments" ON public.bookkeeping_attachments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookkeeping b
      WHERE b.id = bookkeeping_attachments.bookkeeping_id
        AND public.has_module_access(auth.uid(), b.company_id, 'Finance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookkeeping b
      WHERE b.id = bookkeeping_attachments.bookkeeping_id
        AND public.has_module_access(auth.uid(), b.company_id, 'Finance')
    )
  );

-- ── 6. Performance Indexes ───────────────────────────────────────────────────
CREATE INDEX idx_bookkeeping_accounts_type ON public.bookkeeping_accounts(account_type);
CREATE INDEX idx_bookkeeping_accounts_company ON public.bookkeeping_accounts(company_id);

-- ── 7. Seeding & Initialization ──────────────────────────────────────────────

DO $$
DECLARE
  v_company_id UUID;
  v_sales_id UUID;
  v_purchasing_id UUID;
  v_payroll_id UUID;
  v_expense_id UUID;
  v_exp_payment_id UUID;
  v_credit_card_id UUID;
  v_owner_id UUID;
  v_owner_tx_id UUID;
  v_loans_id UUID;
  v_tax_id UUID;
  v_banking_id UUID;
  v_accounting_id UUID;
BEGIN
  -- Resolve BrightKey company ID
  SELECT id INTO v_company_id FROM public.companies WHERE subdomain = 'brightkey' LIMIT 1;
  
  IF v_company_id IS NOT NULL THEN

    -- Seed Transaction Types Scoped to BrightKey
    INSERT INTO public.bookkeeping_transaction_types (company_id, name) VALUES (v_company_id, 'Sales') RETURNING id INTO v_sales_id;
    INSERT INTO public.bookkeeping_transaction_types (company_id, parent_id, name) VALUES
      (v_company_id, v_sales_id, 'Customer Deposit'),
      (v_company_id, v_sales_id, 'Complete Sale'),
      (v_company_id, v_sales_id, 'Receive Payment'),
      (v_company_id, v_sales_id, 'Sale + Payment');

    INSERT INTO public.bookkeeping_transaction_types (company_id, name) VALUES (v_company_id, 'Purchasing & Inventory') RETURNING id INTO v_purchasing_id;
    INSERT INTO public.bookkeeping_transaction_types (company_id, parent_id, name) VALUES
      (v_company_id, v_purchasing_id, 'Supplier Advance Payment'),
      (v_company_id, v_purchasing_id, 'Inventory Receipt');

    INSERT INTO public.bookkeeping_transaction_types (company_id, name) VALUES (v_company_id, 'Payroll & Compensation') RETURNING id INTO v_payroll_id;
    INSERT INTO public.bookkeeping_transaction_types (company_id, parent_id, name) VALUES
      (v_company_id, v_payroll_id, 'Employee Payroll'),
      (v_company_id, v_payroll_id, 'Installer Payroll'),
      (v_company_id, v_payroll_id, 'Commission Payment'),
      (v_company_id, v_payroll_id, 'Affiliate Payment'),
      (v_company_id, v_payroll_id, 'Bonus Payment'),
      (v_company_id, v_payroll_id, 'Contractor Payment'),
      (v_company_id, v_payroll_id, 'Installer Gas Allowance'),
      (v_company_id, v_payroll_id, 'Sales Incentive');

    INSERT INTO public.bookkeeping_transaction_types (company_id, name) VALUES (v_company_id, 'Expense Management') RETURNING id INTO v_expense_id;
    INSERT INTO public.bookkeeping_transaction_types (company_id, parent_id, name) VALUES (v_company_id, v_expense_id, 'Expense Payment') RETURNING id INTO v_exp_payment_id;
    INSERT INTO public.bookkeeping_transaction_types (company_id, parent_id, name) VALUES
      (v_company_id, v_exp_payment_id, 'Internet'),
      (v_company_id, v_exp_payment_id, 'Electricity'),
      (v_company_id, v_exp_payment_id, 'Lease'),
      (v_company_id, v_exp_payment_id, 'Software Subscription'),
      (v_company_id, v_exp_payment_id, 'Facebook Ads'),
      (v_company_id, v_exp_payment_id, 'Meals & Entertainment'),
      (v_company_id, v_exp_payment_id, 'Staff Welfare'),
      (v_company_id, v_exp_payment_id, 'Repairs & Maintenance'),
      (v_company_id, v_exp_payment_id, 'Office Fixtures'),
      (v_company_id, v_exp_payment_id, 'Workshop Instructor'),
      (v_company_id, v_exp_payment_id, 'Workshop Supplies'),
      (v_company_id, v_exp_payment_id, 'Workshop Food'),
      (v_company_id, v_exp_payment_id, 'Representation / Client Entertainment'),
      (v_company_id, v_exp_payment_id, 'Brochures / Flyers'),
      (v_company_id, v_exp_payment_id, 'Events / Exhibits'),
      (v_company_id, v_exp_payment_id, 'Promo Materials'),
      (v_company_id, v_exp_payment_id, 'Packaging Supplies'),
      (v_company_id, v_exp_payment_id, 'Lalamove'),
      (v_company_id, v_exp_payment_id, 'Lalamove Tips & Tolls'),
      (v_company_id, v_exp_payment_id, 'ID Printing'),
      (v_company_id, v_exp_payment_id, 'Shirt Printing'),
      (v_company_id, v_exp_payment_id, 'Installer Tools'),
      (v_company_id, v_exp_payment_id, 'Installer Supplies'),
      (v_company_id, v_exp_payment_id, 'Miscellaneous');

    INSERT INTO public.bookkeeping_transaction_types (company_id, parent_id, name) VALUES
      (v_company_id, v_expense_id, 'Expense Reimbursement Request'),
      (v_company_id, v_expense_id, 'Pay Reimbursement');

    INSERT INTO public.bookkeeping_transaction_types (company_id, name) VALUES (v_company_id, 'Credit Cards') RETURNING id INTO v_credit_card_id;
    INSERT INTO public.bookkeeping_transaction_types (company_id, parent_id, name) VALUES
      (v_company_id, v_credit_card_id, 'Credit Card Charge'),
      (v_company_id, v_credit_card_id, 'Pay Credit Card Statement');

    INSERT INTO public.bookkeeping_transaction_types (company_id, name) VALUES (v_company_id, 'Owner Transactions') RETURNING id INTO v_owner_id;
    INSERT INTO public.bookkeeping_transaction_types (company_id, parent_id, name) VALUES
      (v_company_id, v_owner_id, 'Capital Injection'),
      (v_company_id, v_owner_id, 'Owner Distribution');
      
    INSERT INTO public.bookkeeping_transaction_types (company_id, parent_id, name) VALUES (v_company_id, v_owner_id, 'Owner Transaction') RETURNING id INTO v_owner_tx_id;
    INSERT INTO public.bookkeeping_transaction_types (company_id, parent_id, name) VALUES
      (v_company_id, v_owner_tx_id, 'Collection'),
      (v_company_id, v_owner_tx_id, 'Remittance'),
      (v_company_id, v_owner_tx_id, 'Loan Draw'),
      (v_company_id, v_owner_tx_id, 'Loan Repayment'),
      (v_company_id, v_owner_tx_id, 'Survival Fund'),
      (v_company_id, v_owner_tx_id, 'Offset');

    INSERT INTO public.bookkeeping_transaction_types (company_id, name) VALUES (v_company_id, 'Loans') RETURNING id INTO v_loans_id;
    INSERT INTO public.bookkeeping_transaction_types (company_id, parent_id, name) VALUES
      (v_company_id, v_loans_id, 'Partner Loan Payment'),
      (v_company_id, v_loans_id, 'Overpayment Refund');

    INSERT INTO public.bookkeeping_transaction_types (company_id, name) VALUES (v_company_id, 'Tax') RETURNING id INTO v_tax_id;
    INSERT INTO public.bookkeeping_transaction_types (company_id, parent_id, name) VALUES
      (v_company_id, v_tax_id, 'VAT Payment');

    INSERT INTO public.bookkeeping_transaction_types (company_id, name) VALUES (v_company_id, 'Banking') RETURNING id INTO v_banking_id;
    INSERT INTO public.bookkeeping_transaction_types (company_id, parent_id, name) VALUES
      (v_company_id, v_banking_id, 'Bank Transfer'),
      (v_company_id, v_banking_id, 'Deposit to Savings');

    INSERT INTO public.bookkeeping_transaction_types (company_id, name) VALUES (v_company_id, 'Accounting') RETURNING id INTO v_accounting_id;
    INSERT INTO public.bookkeeping_transaction_types (company_id, parent_id, name) VALUES
      (v_company_id, v_accounting_id, 'Manual Journal Entry');


    -- Seed Chart of Accounts Scoped to BrightKey
    INSERT INTO public.bookkeeping_accounts (company_id, account_code, account_name, account_type, is_payment_account) VALUES
      -- Assets
      (v_company_id, '1000', 'CIMB Bank', 'Asset', TRUE),
      (v_company_id, '1010', 'GCash', 'Asset', TRUE),
      (v_company_id, '1020', 'Cash on Hand', 'Asset', TRUE),
      (v_company_id, '1030', 'PayMongo Clearing', 'Asset', TRUE),
      (v_company_id, '1040', 'Savings Account', 'Asset', TRUE),
      (v_company_id, '1050', 'Warehouse Cash', 'Asset', TRUE),
      (v_company_id, '1060', 'Petty Cash - General', 'Asset', TRUE),
      (v_company_id, '1070', 'Petty Cash - John', 'Asset', TRUE),
      (v_company_id, '1100', 'Accounts Receivable', 'Asset', FALSE),
      (v_company_id, '1200', 'Inventory - Smart Locks', 'Asset', FALSE),
      (v_company_id, '1210', 'Inventory - CCTV', 'Asset', FALSE),
      (v_company_id, '1220', 'Inventory - Accessories', 'Asset', FALSE),
      (v_company_id, '1300', 'Supplier Advances', 'Asset', FALSE),
      (v_company_id, '1400', 'Input VAT', 'Asset', FALSE),
      (v_company_id, '1410', 'EWT Receivable', 'Asset', FALSE),
      (v_company_id, '1500', 'Due from Owner', 'Asset', FALSE),
      (v_company_id, '1510', 'Due from Employee', 'Asset', FALSE),
      (v_company_id, '1520', 'Due from Installer', 'Asset', FALSE),
      (v_company_id, '1600', 'Prepaid Expenses', 'Asset', FALSE),

      -- Liabilities
      (v_company_id, '2000', 'Accounts Payable', 'Liability', FALSE),
      (v_company_id, '2100', 'Customer Deposits', 'Liability', FALSE),
      (v_company_id, '2200', 'Credit Card Payable', 'Liability', FALSE),
      (v_company_id, '2300', 'Output VAT Payable', 'Liability', FALSE),
      (v_company_id, '2330', 'Withholding Tax Payable', 'Liability', FALSE),
      (v_company_id, '2400', 'Partner Loan Payable', 'Liability', FALSE),
      (v_company_id, '2500', 'Due to Owner', 'Liability', FALSE),
      (v_company_id, '2510', 'Due to Employee', 'Liability', FALSE),
      (v_company_id, '2520', 'Due to Installer', 'Liability', FALSE),
      (v_company_id, '2530', 'Due to Contractor', 'Liability', FALSE),

      -- Equity
      (v_company_id, '3000', 'Owner Capital', 'Equity', FALSE),
      (v_company_id, '3100', 'Owner Drawings', 'Equity', FALSE),
      (v_company_id, '3200', 'Retained Earnings', 'Equity', FALSE),
      (v_company_id, '3300', 'Current Year Earnings', 'Equity', FALSE),

      -- Revenue
      (v_company_id, '4000', 'Sales - Smart Locks', 'Revenue', FALSE),
      (v_company_id, '4010', 'Sales - CCTV', 'Revenue', FALSE),
      (v_company_id, '4020', 'Installation Revenue', 'Revenue', FALSE),
      (v_company_id, '4030', 'Software Revenue', 'Revenue', FALSE),
      (v_company_id, '4040', 'Other Revenue', 'Revenue', FALSE),

      -- COGS
      (v_company_id, '5000', 'COGS - Smart Locks', 'COGS', FALSE),
      (v_company_id, '5010', 'COGS - CCTV', 'COGS', FALSE),
      (v_company_id, '5020', 'COGS - Accessories', 'COGS', FALSE),

      -- Expenses
      (v_company_id, '6000', 'Salary Expense', 'Expense', FALSE),
      (v_company_id, '6010', 'Installer Expense', 'Expense', FALSE),
      (v_company_id, '6020', 'Commission Expense', 'Expense', FALSE),
      (v_company_id, '6030', 'Sales Incentive Expense', 'Expense', FALSE),
      (v_company_id, '6040', 'Bonus Expense', 'Expense', FALSE),
      (v_company_id, '6050', 'Affiliate Expense', 'Expense', FALSE),
      (v_company_id, '6060', 'Contractor Expense', 'Expense', FALSE),
      (v_company_id, '6100', 'Facebook Ads Expense', 'Expense', FALSE),
      (v_company_id, '6110', 'Software Subscription Expense', 'Expense', FALSE),
      (v_company_id, '6120', 'Lease Expense', 'Expense', FALSE),
      (v_company_id, '6130', 'Internet Expense', 'Expense', FALSE),
      (v_company_id, '6140', 'Electricity Expense', 'Expense', FALSE),
      (v_company_id, '6150', 'Repairs & Maintenance Expense', 'Expense', FALSE),
      (v_company_id, '6160', 'Office Fixtures Expense', 'Expense', FALSE),
      (v_company_id, '6170', 'Staff Welfare Expense', 'Expense', FALSE),
      (v_company_id, '6180', 'Meals & Entertainment Expense', 'Expense', FALSE),
      (v_company_id, '6190', 'Representation Expense', 'Expense', FALSE),
      (v_company_id, '6200', 'Workshop Expense', 'Expense', FALSE),
      (v_company_id, '6210', 'Brochures & Flyers Expense', 'Expense', FALSE),
      (v_company_id, '6220', 'Events & Exhibits Expense', 'Expense', FALSE),
      (v_company_id, '6230', 'Packaging Expense', 'Expense', FALSE),
      (v_company_id, '6240', 'Lalamove Expense', 'Expense', FALSE),
      (v_company_id, '6250', 'Printing Expense', 'Expense', FALSE),
      (v_company_id, '6260', 'Installer Supplies Expense', 'Expense', FALSE),
      (v_company_id, '6270', 'Installer Tools Expense', 'Expense', FALSE),
      (v_company_id, '6280', 'Miscellaneous Expense', 'Expense', FALSE),
      (v_company_id, '6300', 'Credit Card Fees Expense', 'Expense', FALSE),
      (v_company_id, '6310', 'Bank Charges Expense', 'Expense', FALSE),
      (v_company_id, '6320', 'Loan Interest Expense', 'Expense', FALSE),

      -- Other
      (v_company_id, '9000', 'Overpayment Suspense', 'Other', FALSE),
      (v_company_id, '9100', 'Opening Balance Equity', 'Other', FALSE);

  END IF;
END $$;

-- ── 8. Debug count helper function ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.debug_get_counts()
RETURNS JSONB SECURITY DEFINER AS $$
DECLARE
  v_comp_count INT;
  v_type_count INT;
  v_acct_count INT;
  v_companies JSONB;
BEGIN
  SELECT count(*) INTO v_comp_count FROM public.companies;
  SELECT count(*) INTO v_type_count FROM public.bookkeeping_transaction_types;
  SELECT count(*) INTO v_acct_count FROM public.bookkeeping_accounts;
  
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'subdomain', subdomain)), '[]'::jsonb)
  INTO v_companies 
  FROM public.companies;
  
  RETURN jsonb_build_object(
    'companies_count', v_comp_count,
    'types_count', v_type_count,
    'accounts_count', v_acct_count,
    'companies', v_companies
  );
END;
$$ LANGUAGE plpgsql;


-- ==========================================
-- Source: 49_add_is_visible_to_journal_accounts.sql
-- ==========================================

-- Add is_visible column to journal_accounts table
ALTER TABLE public.journal_accounts ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT TRUE;


-- ==========================================
-- Source: 54_add_software_subscriptions.sql
-- ==========================================

-- 1. Create software_subscriptions table if not exists
CREATE TABLE IF NOT EXISTS public.software_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    mode TEXT NOT NULL CHECK (mode IN ('pay_as_you_go', 'monthly', 'annual')),
    cost_centavos INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed')),
    subscribed_date DATE NOT NULL DEFAULT CURRENT_DATE,
    unsubscribed_date DATE,
    billing_url TEXT,
    account_email TEXT,
    card_last_four TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add columns if they do not exist
ALTER TABLE public.software_subscriptions ADD COLUMN IF NOT EXISTS billing_url TEXT;
ALTER TABLE public.software_subscriptions ADD COLUMN IF NOT EXISTS account_email TEXT;
ALTER TABLE public.software_subscriptions ADD COLUMN IF NOT EXISTS card_last_four TEXT;

-- 3. Enable RLS
ALTER TABLE public.software_subscriptions ENABLE ROW LEVEL SECURITY;

-- 4. Create policies conditionally
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'software_subscriptions' AND policyname = 'Allow company members read software_subscriptions'
    ) THEN
        CREATE POLICY "Allow company members read software_subscriptions" ON public.software_subscriptions
            FOR SELECT USING (
                company_id IN (
                    SELECT c.id FROM public.companies c
                    JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
                    WHERE tm.user_id = auth.uid()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'software_subscriptions' AND policyname = 'Allow company members write software_subscriptions'
    ) THEN
        CREATE POLICY "Allow company members write software_subscriptions" ON public.software_subscriptions
            FOR ALL USING (
                company_id IN (
                    SELECT c.id FROM public.companies c
                    JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
                    WHERE tm.user_id = auth.uid()
                )
            );
    END IF;
END $$;

-- 5. Create software_subscription_billing table if not exists
CREATE TABLE IF NOT EXISTS public.software_subscription_billing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES public.software_subscriptions(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    billing_month DATE NOT NULL, -- First of the month, e.g. '2026-07-01'
    cost_centavos INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('pay_as_you_go', 'monthly', 'annual', 'unsubscribed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (subscription_id, billing_month)
);

-- 6. Enable RLS
ALTER TABLE public.software_subscription_billing ENABLE ROW LEVEL SECURITY;

-- 7. Create policies conditionally for billing table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'software_subscription_billing' AND policyname = 'Allow company members read software_subscription_billing'
    ) THEN
        CREATE POLICY "Allow company members read software_subscription_billing" ON public.software_subscription_billing
            FOR SELECT USING (
                company_id IN (
                    SELECT c.id FROM public.companies c
                    JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
                    WHERE tm.user_id = auth.uid()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'software_subscription_billing' AND policyname = 'Allow company members write software_subscription_billing'
    ) THEN
        CREATE POLICY "Allow company members write software_subscription_billing" ON public.software_subscription_billing
            FOR ALL USING (
                company_id IN (
                    SELECT c.id FROM public.companies c
                    JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
                    WHERE tm.user_id = auth.uid()
                )
            );
    END IF;
END $$;


-- ==========================================
-- Source: 55_add_suppliers.sql
-- ==========================================

-- Create Suppliers Table
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  business_id UUID REFERENCES public.tenant_businesses(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  street_address TEXT,
  city TEXT,
  province TEXT,
  contact_number TEXT,
  contact_number_2 TEXT,
  email TEXT,
  email_2 TEXT,
  website TEXT,
  tin TEXT,
  payment_account_name TEXT,
  payment_account_number TEXT,
  qr_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow select suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Allow manage suppliers" ON public.suppliers;

-- Create Policies
CREATE POLICY "Allow select suppliers" ON public.suppliers
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow manage suppliers" ON public.suppliers
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );


-- ==========================================
-- Source: 56_add_supplier_extra_contacts.sql
-- ==========================================

-- Add additional contact number and email to suppliers table
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS contact_number_2 TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email_2 TEXT;


-- ==========================================
-- Source: 57_add_supplier_tin.sql
-- ==========================================

-- Add tin column to suppliers table
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS tin TEXT;


-- ==========================================
-- Source: 61_add_payment_bank_name_to_suppliers.sql
-- ==========================================

-- Migration to add payment_bank_name to suppliers table
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS payment_bank_name TEXT;


-- ==========================================
-- Source: 62_add_account_id_to_general_journal.sql
-- ==========================================

-- Add account_id column referencing public.journal_accounts
ALTER TABLE public.general_journal ADD COLUMN IF NOT EXISTS account_id BIGINT REFERENCES public.journal_accounts(id) ON DELETE SET NULL;

-- Backfill existing entries by matching names
UPDATE public.general_journal gj
SET account_id = ja.id
FROM public.journal_accounts ja
WHERE gj.account = ja.name AND gj.company_id = ja.company_id;


-- ==========================================
-- Source: 63_locked_profit_loss_statements.sql
-- ==========================================

-- Migration: 63_locked_profit_loss_statements.sql
-- Create table to cache computed Profit & Loss statements for locked months

CREATE TABLE IF NOT EXISTS public.locked_profit_loss_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL, -- Format: YYYY-MM
  statement_data JSONB NOT NULL, -- Stores all computed P&L values
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT locked_pl_company_month_unique UNIQUE (company_id, month)
);

-- Enable Row-Level Security
ALTER TABLE public.locked_profit_loss_statements ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist to prevent crashes on rerun
DROP POLICY IF EXISTS "Allow company members read locked statements" ON public.locked_profit_loss_statements;
DROP POLICY IF EXISTS "Allow company members insert locked statements" ON public.locked_profit_loss_statements;
DROP POLICY IF EXISTS "Allow company members update locked statements" ON public.locked_profit_loss_statements;
DROP POLICY IF EXISTS "Allow company members delete locked statements" ON public.locked_profit_loss_statements;

-- Create policies for tenant members
CREATE POLICY "Allow company members read locked statements" ON public.locked_profit_loss_statements
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members insert locked statements" ON public.locked_profit_loss_statements
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members update locked statements" ON public.locked_profit_loss_statements
  FOR UPDATE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members delete locked statements" ON public.locked_profit_loss_statements
  FOR DELETE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );


-- ==========================================
-- Source: 64_finance_adjustments_payables_receivables.sql
-- ==========================================

-- Migration: 64_finance_adjustments_payables_receivables.sql
-- Consolidated tracking tables for Supplier Cost Adjustments, Supplier Payables (Accounts Payable), Company Receivables, and Receivable Payments

-- 1. Create supplier_cost_adjustments table
CREATE TABLE IF NOT EXISTS public.supplier_cost_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL, -- positive or negative value in centavos
  adjustment_date DATE NOT NULL, -- date the adjustment belongs to (for monthly scope)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create supplier_payables table
CREATE TABLE IF NOT EXISTS public.supplier_payables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  invoice_number TEXT,
  amount_cents INTEGER NOT NULL, -- payable amount in centavos
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid', -- unpaid, paid, void
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create company_receivables table
CREATE TABLE IF NOT EXISTS public.company_receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('owner', 'staff', 'supplier')),
  party_name TEXT NOT NULL,
  reference_no TEXT,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  grand_total_cents INTEGER NOT NULL,
  balance_due_cents INTEGER NOT NULL,
  contact_number TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'overdue', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create receivable_payments table
CREATE TABLE IF NOT EXISTS public.receivable_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.installation_bookings(id) ON DELETE CASCADE,
  receivable_id UUID REFERENCES public.company_receivables(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  payment_method TEXT NOT NULL DEFAULT 'Cash',
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE public.supplier_cost_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivable_payments ENABLE ROW LEVEL SECURITY;

-- Conditional policies for supplier_cost_adjustments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_cost_adjustments' 
      AND policyname = 'Allow company members read adjustments'
  ) THEN
    CREATE POLICY "Allow company members read adjustments" ON public.supplier_cost_adjustments
      FOR SELECT USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_cost_adjustments' 
      AND policyname = 'Allow company members insert adjustments'
  ) THEN
    CREATE POLICY "Allow company members insert adjustments" ON public.supplier_cost_adjustments
      FOR INSERT WITH CHECK (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_cost_adjustments' 
      AND policyname = 'Allow company members update adjustments'
  ) THEN
    CREATE POLICY "Allow company members update adjustments" ON public.supplier_cost_adjustments
      FOR UPDATE USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_cost_adjustments' 
      AND policyname = 'Allow company members delete adjustments'
  ) THEN
    CREATE POLICY "Allow company members delete adjustments" ON public.supplier_cost_adjustments
      FOR DELETE USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

-- Conditional policies for supplier_payables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_payables' 
      AND policyname = 'Allow company members read payables'
  ) THEN
    CREATE POLICY "Allow company members read payables" ON public.supplier_payables
      FOR SELECT USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_payables' 
      AND policyname = 'Allow company members insert payables'
  ) THEN
    CREATE POLICY "Allow company members insert payables" ON public.supplier_payables
      FOR INSERT WITH CHECK (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_payables' 
      AND policyname = 'Allow company members update payables'
  ) THEN
    CREATE POLICY "Allow company members update payables" ON public.supplier_payables
      FOR UPDATE USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_payables' 
      AND policyname = 'Allow company members delete payables'
  ) THEN
    CREATE POLICY "Allow company members delete payables" ON public.supplier_payables
      FOR DELETE USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

-- Conditional policies for company_receivables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'company_receivables' 
      AND policyname = 'Allow company members read company_receivables'
  ) THEN
    CREATE POLICY "Allow company members read company_receivables" ON public.company_receivables
      FOR SELECT USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'company_receivables' 
      AND policyname = 'Allow company members insert company_receivables'
  ) THEN
    CREATE POLICY "Allow company members insert company_receivables" ON public.company_receivables
      FOR INSERT WITH CHECK (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'company_receivables' 
      AND policyname = 'Allow company members update company_receivables'
  ) THEN
    CREATE POLICY "Allow company members update company_receivables" ON public.company_receivables
      FOR UPDATE USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'company_receivables' 
      AND policyname = 'Allow company members delete company_receivables'
  ) THEN
    CREATE POLICY "Allow company members delete company_receivables" ON public.company_receivables
      FOR DELETE USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

-- Conditional policies for receivable_payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'receivable_payments' 
      AND policyname = 'Allow company members read payments'
  ) THEN
    CREATE POLICY "Allow company members read payments" ON public.receivable_payments
      FOR SELECT USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'receivable_payments' 
      AND policyname = 'Allow company members insert payments'
  ) THEN
    CREATE POLICY "Allow company members insert payments" ON public.receivable_payments
      FOR INSERT WITH CHECK (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'receivable_payments' 
      AND policyname = 'Allow company members update payments'
  ) THEN
    CREATE POLICY "Allow company members update payments" ON public.receivable_payments
      FOR UPDATE USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'receivable_payments' 
      AND policyname = 'Allow company members delete payments'
  ) THEN
    CREATE POLICY "Allow company members delete payments" ON public.receivable_payments
      FOR DELETE USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

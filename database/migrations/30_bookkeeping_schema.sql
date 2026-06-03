-- Migration 30: Bookkeeping Core Tables and Seeding
-- Defines the bookkeeping schema (tables, constraints, scoping) and seeds default hierarchical transaction types.

-- 1. Create bookkeeping_transaction_types
CREATE TABLE IF NOT EXISTS public.bookkeeping_transaction_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE, -- NULL for system defaults
  parent_id   UUID REFERENCES public.bookkeeping_transaction_types(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create bookkeeping_accounts
CREATE TABLE IF NOT EXISTS public.bookkeeping_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE, -- NULL for system defaults
  name        TEXT NOT NULL,
  code        TEXT,
  category    TEXT NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create bookkeeping
CREATE TABLE IF NOT EXISTS public.bookkeeping (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  transaction_type_id UUID REFERENCES public.bookkeeping_transaction_types(id) ON DELETE RESTRICT NOT NULL,
  date                DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_no        TEXT,
  description         TEXT,
  entry_number        INTEGER, -- Links to general_journal entry
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create bookkeeping_lines
CREATE TABLE IF NOT EXISTS public.bookkeeping_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bookkeeping_id UUID REFERENCES public.bookkeeping(id) ON DELETE CASCADE NOT NULL,
  account_id     UUID REFERENCES public.bookkeeping_accounts(id) ON DELETE RESTRICT NOT NULL,
  debit          NUMERIC(15,2),
  credit         NUMERIC(15,2),
  notes          TEXT
);

-- 5. Create bookkeeping_attachments
CREATE TABLE IF NOT EXISTS public.bookkeeping_attachments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bookkeeping_id UUID REFERENCES public.bookkeeping(id) ON DELETE CASCADE NOT NULL,
  file_url       TEXT NOT NULL,
  file_name      TEXT NOT NULL,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Enable RLS
ALTER TABLE public.bookkeeping_transaction_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_attachments ENABLE ROW LEVEL SECURITY;

-- 7. Define RLS Policies
DROP POLICY IF EXISTS "Bookkeeping transaction types access" ON public.bookkeeping_transaction_types;
CREATE POLICY "Bookkeeping transaction types access" ON public.bookkeeping_transaction_types
  FOR ALL USING (
    company_id IS NULL OR company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Bookkeeping accounts access" ON public.bookkeeping_accounts;
CREATE POLICY "Bookkeeping accounts access" ON public.bookkeeping_accounts
  FOR ALL USING (
    company_id IS NULL OR company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Bookkeeping access" ON public.bookkeeping;
CREATE POLICY "Bookkeeping access" ON public.bookkeeping
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Bookkeeping lines access" ON public.bookkeeping_lines;
CREATE POLICY "Bookkeeping lines access" ON public.bookkeeping_lines
  FOR ALL USING (
    bookkeeping_id IN (
      SELECT id FROM public.bookkeeping
    )
  );

DROP POLICY IF EXISTS "Bookkeeping attachments access" ON public.bookkeeping_attachments;
CREATE POLICY "Bookkeeping attachments access" ON public.bookkeeping_attachments
  FOR ALL USING (
    bookkeeping_id IN (
      SELECT id FROM public.bookkeeping
    )
  );

-- 8. Seed Default Transaction Types Taxonomy
DO $$
DECLARE
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
  -- Clear defaults first to prevent duplicates
  DELETE FROM public.bookkeeping_transaction_types WHERE company_id IS NULL;

  -- ── Sales ──
  INSERT INTO public.bookkeeping_transaction_types (name) VALUES ('Sales') RETURNING id INTO v_sales_id;
  INSERT INTO public.bookkeeping_transaction_types (parent_id, name) VALUES
    (v_sales_id, 'Customer Deposit'),
    (v_sales_id, 'Complete Sale'),
    (v_sales_id, 'Receive Payment'),
    (v_sales_id, 'Sale + Payment');

  -- ── Purchasing & Inventory ──
  INSERT INTO public.bookkeeping_transaction_types (name) VALUES ('Purchasing & Inventory') RETURNING id INTO v_purchasing_id;
  INSERT INTO public.bookkeeping_transaction_types (parent_id, name) VALUES
    (v_purchasing_id, 'Supplier Advance Payment'),
    (v_purchasing_id, 'Inventory Receipt');

  -- ── Payroll & Compensation ──
  INSERT INTO public.bookkeeping_transaction_types (name) VALUES ('Payroll & Compensation') RETURNING id INTO v_payroll_id;
  INSERT INTO public.bookkeeping_transaction_types (parent_id, name) VALUES
    (v_payroll_id, 'Employee Payroll'),
    (v_payroll_id, 'Installer Payroll'),
    (v_payroll_id, 'Commission Payment'),
    (v_payroll_id, 'Affiliate Payment'),
    (v_payroll_id, 'Bonus Payment'),
    (v_payroll_id, 'Contractor Payment'),
    (v_payroll_id, 'Installer Gas Allowance'),
    (v_payroll_id, 'Sales Incentive');

  -- ── Expense Management ──
  INSERT INTO public.bookkeeping_transaction_types (name) VALUES ('Expense Management') RETURNING id INTO v_expense_id;
  
  -- Expense Payment & submenus
  INSERT INTO public.bookkeeping_transaction_types (parent_id, name) VALUES (v_expense_id, 'Expense Payment') RETURNING id INTO v_exp_payment_id;
  INSERT INTO public.bookkeeping_transaction_types (parent_id, name) VALUES
    (v_exp_payment_id, 'Internet'),
    (v_exp_payment_id, 'Electricity'),
    (v_exp_payment_id, 'Lease'),
    (v_exp_payment_id, 'Software Subscription'),
    (v_exp_payment_id, 'Facebook Ads'),
    (v_exp_payment_id, 'Meals & Entertainment'),
    (v_exp_payment_id, 'Staff Welfare'),
    (v_exp_payment_id, 'Repairs & Maintenance'),
    (v_exp_payment_id, 'Office Fixtures'),
    (v_exp_payment_id, 'Workshop Instructor'),
    (v_exp_payment_id, 'Workshop Supplies'),
    (v_exp_payment_id, 'Workshop Food'),
    (v_exp_payment_id, 'Representation / Client Entertainment'),
    (v_exp_payment_id, 'Brochures / Flyers'),
    (v_exp_payment_id, 'Events / Exhibits'),
    (v_exp_payment_id, 'Promo Materials'),
    (v_exp_payment_id, 'Packaging Supplies'),
    (v_exp_payment_id, 'Lalamove'),
    (v_exp_payment_id, 'Lalamove Tips & Tolls'),
    (v_exp_payment_id, 'ID Printing'),
    (v_exp_payment_id, 'Shirt Printing'),
    (v_exp_payment_id, 'Installer Tools'),
    (v_exp_payment_id, 'Installer Supplies'),
    (v_exp_payment_id, 'Miscellaneous');

  INSERT INTO public.bookkeeping_transaction_types (parent_id, name) VALUES
    (v_expense_id, 'Expense Reimbursement Request'),
    (v_expense_id, 'Pay Reimbursement');

  -- ── Credit Cards ──
  INSERT INTO public.bookkeeping_transaction_types (name) VALUES ('Credit Cards') RETURNING id INTO v_credit_card_id;
  INSERT INTO public.bookkeeping_transaction_types (parent_id, name) VALUES
    (v_credit_card_id, 'Credit Card Charge'),
    (v_credit_card_id, 'Pay Credit Card Statement');

  -- ── Owner Transactions ──
  INSERT INTO public.bookkeeping_transaction_types (name) VALUES ('Owner Transactions') RETURNING id INTO v_owner_id;
  INSERT INTO public.bookkeeping_transaction_types (parent_id, name) VALUES
    (v_owner_id, 'Capital Injection'),
    (v_owner_id, 'Owner Distribution');
    
  INSERT INTO public.bookkeeping_transaction_types (parent_id, name) VALUES (v_owner_id, 'Owner Transaction') RETURNING id INTO v_owner_tx_id;
  INSERT INTO public.bookkeeping_transaction_types (parent_id, name) VALUES
    (v_owner_tx_id, 'Collection'),
    (v_owner_tx_id, 'Remittance'),
    (v_owner_tx_id, 'Loan Draw'),
    (v_owner_tx_id, 'Loan Repayment'),
    (v_owner_tx_id, 'Survival Fund'),
    (v_owner_tx_id, 'Offset');

  -- ── Loans ──
  INSERT INTO public.bookkeeping_transaction_types (name) VALUES ('Loans') RETURNING id INTO v_loans_id;
  INSERT INTO public.bookkeeping_transaction_types (parent_id, name) VALUES
    (v_loans_id, 'Partner Loan Payment'),
    (v_loans_id, 'Overpayment Refund');

  -- ── Tax ──
  INSERT INTO public.bookkeeping_transaction_types (name) VALUES ('Tax') RETURNING id INTO v_tax_id;
  INSERT INTO public.bookkeeping_transaction_types (parent_id, name) VALUES
    (v_tax_id, 'VAT Payment');

  -- ── Banking ──
  INSERT INTO public.bookkeeping_transaction_types (name) VALUES ('Banking') RETURNING id INTO v_banking_id;
  INSERT INTO public.bookkeeping_transaction_types (parent_id, name) VALUES
    (v_banking_id, 'Bank Transfer'),
    (v_banking_id, 'Deposit to Savings');

  -- ── Accounting ──
  INSERT INTO public.bookkeeping_transaction_types (name) VALUES ('Accounting') RETURNING id INTO v_accounting_id;
  INSERT INTO public.bookkeeping_transaction_types (parent_id, name) VALUES
    (v_accounting_id, 'Manual Journal Entry');

END $$;

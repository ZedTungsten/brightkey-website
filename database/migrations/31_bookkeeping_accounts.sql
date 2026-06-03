-- Migration 31: Bookkeeping Chart of Accounts Schema & Seeding
-- Drops placeholder bookkeeping accounts and lines tables, rebuilds them with final columns, indexes, and RLS, and seeds the Chart of Accounts.

-- 1. Drop placeholder tables to clean up dependency chain
DROP TABLE IF EXISTS public.bookkeeping_lines CASCADE;
DROP TABLE IF EXISTS public.bookkeeping_accounts CASCADE;

-- 2. Create bookkeeping_accounts table with final schema
CREATE TABLE public.bookkeeping_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE, -- NULL for system-wide defaults
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('Asset', 'Liability', 'Equity', 'Revenue', 'COGS', 'Expense', 'Other')),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create unique constraints/indexes supporting null company_id (global default template vs tenant customized codes)
CREATE UNIQUE INDEX idx_bookkeeping_accounts_uniq ON public.bookkeeping_accounts (account_code) WHERE company_id IS NULL;
CREATE UNIQUE INDEX idx_bookkeeping_accounts_company_uniq ON public.bookkeeping_accounts (company_id, account_code) WHERE company_id IS NOT NULL;

-- 4. Re-create bookkeeping_lines table
CREATE TABLE public.bookkeeping_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bookkeeping_id UUID REFERENCES public.bookkeeping(id) ON DELETE CASCADE NOT NULL,
  account_id     UUID REFERENCES public.bookkeeping_accounts(id) ON DELETE RESTRICT NOT NULL,
  debit          NUMERIC(15,2),
  credit         NUMERIC(15,2),
  notes          TEXT
);

-- 5. Enable RLS
ALTER TABLE public.bookkeeping_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_lines ENABLE ROW LEVEL SECURITY;

-- 6. Define RLS Policies
DROP POLICY IF EXISTS "Bookkeeping accounts access" ON public.bookkeeping_accounts;
CREATE POLICY "Bookkeeping accounts access" ON public.bookkeeping_accounts
  FOR ALL USING (
    company_id IS NULL OR company_id IN (
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

-- 7. Performance Indexes
CREATE INDEX idx_bookkeeping_accounts_type ON public.bookkeeping_accounts(account_type);
CREATE INDEX idx_bookkeeping_accounts_company ON public.bookkeeping_accounts(company_id);

-- 8. Seed Chart of Accounts
INSERT INTO public.bookkeeping_accounts (account_code, account_name, account_type) VALUES
  -- Assets
  ('1000', 'CIMB Bank', 'Asset'),
  ('1010', 'GCash', 'Asset'),
  ('1020', 'Cash on Hand', 'Asset'),
  ('1030', 'PayMongo Clearing', 'Asset'),
  ('1040', 'Savings Account', 'Asset'),
  ('1100', 'Accounts Receivable', 'Asset'),
  ('1200', 'Inventory - Smart Locks', 'Asset'),
  ('1210', 'Inventory - CCTV', 'Asset'),
  ('1220', 'Inventory - Accessories', 'Asset'),
  ('1300', 'Supplier Advances', 'Asset'),
  ('1400', 'Input VAT', 'Asset'),
  ('1410', 'EWT Receivable', 'Asset'),
  ('1500', 'Due from Owner', 'Asset'),
  ('1510', 'Due from Employee', 'Asset'),
  ('1520', 'Due from Installer', 'Asset'),
  ('1600', 'Prepaid Expenses', 'Asset'),

  -- Liabilities
  ('2000', 'Accounts Payable', 'Liability'),
  ('2100', 'Customer Deposits', 'Liability'),
  ('2200', 'Credit Card Payable', 'Liability'),
  ('2300', 'Output VAT Payable', 'Liability'),
  ('2330', 'Withholding Tax Payable', 'Liability'),
  ('2400', 'Partner Loan Payable', 'Liability'),
  ('2500', 'Due to Owner', 'Liability'),
  ('2510', 'Due to Employee', 'Liability'),
  ('2520', 'Due to Installer', 'Liability'),
  ('2530', 'Due to Contractor', 'Liability'),

  -- Equity
  ('3000', 'Owner Capital', 'Equity'),
  ('3100', 'Owner Drawings', 'Equity'),
  ('3200', 'Retained Earnings', 'Equity'),
  ('3300', 'Current Year Earnings', 'Equity'),

  -- Revenue
  ('4000', 'Sales - Smart Locks', 'Revenue'),
  ('4010', 'Sales - CCTV', 'Revenue'),
  ('4020', 'Installation Revenue', 'Revenue'),
  ('4030', 'Software Revenue', 'Revenue'),
  ('4040', 'Other Revenue', 'Revenue'),

  -- COGS
  ('5000', 'COGS - Smart Locks', 'COGS'),
  ('5010', 'COGS - CCTV', 'COGS'),
  ('5020', 'COGS - Accessories', 'COGS'),

  -- Expenses
  ('6000', 'Salary Expense', 'Expense'),
  ('6010', 'Installer Expense', 'Expense'),
  ('6020', 'Commission Expense', 'Expense'),
  ('6030', 'Sales Incentive Expense', 'Expense'),
  ('6040', 'Bonus Expense', 'Expense'),
  ('6050', 'Affiliate Expense', 'Expense'),
  ('6060', 'Contractor Expense', 'Expense'),
  ('6070', 'Gas Allowance Expense', 'Expense'),
  ('6100', 'Facebook Ads Expense', 'Expense'),
  ('6110', 'Software Subscription Expense', 'Expense'),
  ('6120', 'Lease Expense', 'Expense'),
  ('6130', 'Internet Expense', 'Expense'),
  ('6140', 'Electricity Expense', 'Expense'),
  ('6150', 'Repairs & Maintenance Expense', 'Expense'),
  ('6160', 'Office Fixtures Expense', 'Expense'),
  ('6170', 'Staff Welfare Expense', 'Expense'),
  ('6180', 'Meals & Entertainment Expense', 'Expense'),
  ('6190', 'Representation Expense', 'Expense'),
  ('6200', 'Workshop Expense', 'Expense'),
  ('6210', 'Brochures & Flyers Expense', 'Expense'),
  ('6220', 'Events & Exhibits Expense', 'Expense'),
  ('6230', 'Packaging Expense', 'Expense'),
  ('6240', 'Lalamove Expense', 'Expense'),
  ('6250', 'Printing Expense', 'Expense'),
  ('6260', 'Installer Supplies Expense', 'Expense'),
  ('6270', 'Installer Tools Expense', 'Expense'),
  ('6280', 'Miscellaneous Expense', 'Expense'),
  ('6300', 'Credit Card Fees Expense', 'Expense'),
  ('6310', 'Bank Charges Expense', 'Expense'),
  ('6320', 'Loan Interest Expense', 'Expense'),

  -- Other
  ('9000', 'Overpayment Suspense', 'Other'),
  ('9100', 'Opening Balance Equity', 'Other');

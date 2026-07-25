-- =============================================================================
-- BrightKey Consolidated Finance & Bookkeeping Migration (06_finance_and_bookkeeping.sql)
-- Consolidates general journal, bookkeeping transactions, transaction types,
-- payment accounts, chart of accounts, suppliers, payables, customers, and receivables.
-- All operations are safe and non-destructive.
-- =============================================================================

-- ── 1. Journal and Audit Log Tables ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.journal_accounts (
  id          SERIAL PRIMARY KEY,
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.general_journal (
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

CREATE TABLE IF NOT EXISTS public.journal_audit_log (
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

-- ── 2. Bookkeeping Tables ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bookkeeping_transaction_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES public.bookkeeping_transaction_types(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bookkeeping_accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  account_code         TEXT NOT NULL,
  account_name         TEXT NOT NULL,
  account_type         TEXT NOT NULL CHECK (account_type IN ('Asset', 'Liability', 'Equity', 'Revenue', 'COGS', 'Expense', 'Other')),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  is_payment_account   BOOLEAN NOT NULL DEFAULT FALSE,
  payment_account_type TEXT CHECK (payment_account_type IN ('debit', 'credit_card', 'cash_account', 'e_wallet', 'other_payment_account')),
  bank                 TEXT,
  statement_date       INTEGER CHECK (statement_date BETWEEN 1 AND 31),
  due_date             INTEGER CHECK (due_date BETWEEN 1 AND 31),
  credit_limit         INTEGER,
  card_number_last_4   VARCHAR(4) CHECK (card_number_last_4 ~ '^\d{3,4}$'),
  card_holder_name     TEXT,
  rewards              TEXT,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bookkeeping (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  transaction_type_id UUID REFERENCES public.bookkeeping_transaction_types(id) ON DELETE RESTRICT NOT NULL,
  transaction_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_no        TEXT,
  description         TEXT,
  entry_no            INTEGER,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bookkeeping_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bookkeeping_id      UUID REFERENCES public.bookkeeping(id) ON DELETE CASCADE NOT NULL,
  account_id          UUID REFERENCES public.bookkeeping_accounts(id) ON DELETE RESTRICT NOT NULL,
  debit_amount        INTEGER NOT NULL DEFAULT 0, -- centavos
  credit_amount       INTEGER NOT NULL DEFAULT 0, -- centavos
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_debit_credit CHECK (debit_amount >= 0 AND credit_amount >= 0 AND (debit_amount > 0 OR credit_amount > 0))
);

CREATE TABLE IF NOT EXISTS public.bookkeeping_attachments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bookkeeping_id      UUID REFERENCES public.bookkeeping(id) ON DELETE CASCADE NOT NULL,
  file_name           TEXT NOT NULL,
  file_url            TEXT NOT NULL,
  file_size_bytes     BIGINT,
  mime_type           TEXT,
  uploaded_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Payables & Suppliers Tables ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppliers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name                TEXT NOT NULL,
  contact_person      TEXT,
  email               TEXT,
  phone               TEXT,
  address             TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payable_bills (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  supplier_id         UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  bill_number         TEXT NOT NULL,
  bill_date           DATE NOT NULL,
  due_date            DATE,
  total_amount        INTEGER NOT NULL DEFAULT 0, -- centavos
  paid_amount         INTEGER NOT NULL DEFAULT 0, -- centavos
  status              TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'cancelled')),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payable_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  bill_id             UUID REFERENCES public.payable_bills(id) ON DELETE CASCADE NOT NULL,
  payment_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  amount              INTEGER NOT NULL DEFAULT 0, -- centavos
  payment_method      TEXT,
  reference_number    TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Receivables & Customers Tables ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name                TEXT NOT NULL,
  contact_person      TEXT,
  email               TEXT,
  phone               TEXT,
  address             TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.receivable_invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  customer_id         UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  invoice_number      TEXT NOT NULL,
  invoice_date        DATE NOT NULL,
  due_date            DATE,
  total_amount        INTEGER NOT NULL DEFAULT 0, -- centavos
  paid_amount         INTEGER NOT NULL DEFAULT 0, -- centavos
  status              TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'cancelled')),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.receivable_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  invoice_id          UUID REFERENCES public.receivable_invoices(id) ON DELETE CASCADE NOT NULL,
  payment_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  amount              INTEGER NOT NULL DEFAULT 0, -- centavos
  payment_method      TEXT,
  reference_number    TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. Helper Functions ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.debug_get_counts()
RETURNS TABLE (table_name TEXT, total_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 'general_journal'::TEXT, COUNT(*) FROM public.general_journal
  UNION ALL
  SELECT 'bookkeeping'::TEXT, COUNT(*) FROM public.bookkeeping
  UNION ALL
  SELECT 'bookkeeping_accounts'::TEXT, COUNT(*) FROM public.bookkeeping_accounts;
END;
$$;

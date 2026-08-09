-- Consolidated Database Migration: 06_finance.sql
-- Generated on 2026-08-06T15:24:48.294Z


-- =========================================================================
-- SOURCE FILE: 06_finance_and_bookkeeping.sql
-- =========================================================================

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

ALTER TABLE public.general_journal ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'general_journal' AND policyname = 'Allow tenant members journal access'
  ) THEN
    CREATE POLICY "Allow tenant members journal access" ON public.general_journal
      FOR ALL TO authenticated
      USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

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


-- =========================================================================
-- SOURCE FILE: 34_finance_reporting_rpc.sql
-- =========================================================================

-- Finance reporting RPCs. Non-destructive and safe to rerun.
-- Summary totals are computed in PostgreSQL; detail rows are capped for UI safety.

CREATE OR REPLACE FUNCTION public.get_finance_cash_ledger_report(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH settings AS (
    SELECT COALESCE(value, '{}'::JSONB) AS value
    FROM public.global_settings
    WHERE company_id = p_company_id
      AND key = 'cash_starting_balances'
    LIMIT 1
  ),
  accounts AS (
    SELECT
      a.id,
      a.name,
      a.category,
      COALESCE(
        (s.value -> p_start_date::TEXT ->> a.id::TEXT)::NUMERIC,
        (s.value -> p_start_date::TEXT ->> a.name)::NUMERIC,
        0
      ) AS starting_balance,
      COALESCE(SUM(j.debit), 0)::NUMERIC AS total_debit,
      COALESCE(SUM(j.credit), 0)::NUMERIC AS total_credit
    FROM public.journal_accounts a
    CROSS JOIN LATERAL (SELECT COALESCE((SELECT value FROM settings), '{}'::JSONB) AS value) s
    LEFT JOIN public.general_journal j
      ON j.company_id = p_company_id
      AND j.date >= p_start_date
      AND j.date <= p_end_date
      AND (
        j.account_id = a.id
        OR (j.account_id IS NULL AND LOWER(TRIM(j.account)) = LOWER(TRIM(a.name)))
      )
    WHERE a.company_id = p_company_id
      AND a.category = 'Cash & Cash Equivalents'
    GROUP BY a.id, a.name, a.category, s.value
  ),
  detail AS (
    SELECT
      j.id,
      j.entry_number,
      j.date,
      j.account_id,
      j.account,
      j.debit,
      j.credit,
      j.description_1,
      j.description_2
    FROM public.general_journal j
    WHERE j.company_id = p_company_id
      AND j.date >= p_start_date
      AND j.date <= p_end_date
    ORDER BY j.date ASC, j.entry_number ASC, j.id ASC
    LIMIT 5000
  )
  SELECT jsonb_build_object(
    'accounts', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'name', a.name,
          'category', a.category,
          'starting_balance', a.starting_balance,
          'total_debit', a.total_debit,
          'total_credit', a.total_credit,
          'net_movement', a.total_debit - a.total_credit,
          'ending_balance', a.starting_balance + a.total_debit - a.total_credit
        ) ORDER BY a.name
      ) FROM accounts a
    ), '[]'::JSONB),
    'entries', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.date, d.entry_number, d.id) FROM detail d), '[]'::JSONB),
    'truncated', (
      SELECT COUNT(*) > 5000
      FROM public.general_journal j
      WHERE j.company_id = p_company_id
        AND j.date >= p_start_date
        AND j.date <= p_end_date
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_finance_cash_ledger_report(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_finance_cash_ledger_report(UUID, DATE, DATE) TO authenticated;


-- =========================================================================
-- SOURCE FILE: 58_receivable_payment_journal_links.sql
-- =========================================================================

-- Distinguish deposits from later payments and retain their optional General Journal link.
-- Non-destructive and rerunnable for existing receivable payment history.
ALTER TABLE public.receivable_payments
  ADD COLUMN IF NOT EXISTS transaction_type TEXT NOT NULL DEFAULT 'payment',
  ADD COLUMN IF NOT EXISTS journal_entry_id BIGINT,
  ADD COLUMN IF NOT EXISTS journal_entry_number INTEGER,
  ADD COLUMN IF NOT EXISTS debited_account TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receivable_payments_transaction_type_check'
  ) THEN
    ALTER TABLE public.receivable_payments
      ADD CONSTRAINT receivable_payments_transaction_type_check
      CHECK (transaction_type IN ('deposit', 'payment'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_receivable_payments_company_booking_date
  ON public.receivable_payments (company_id, booking_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_receivable_payments_company_journal_entry
  ON public.receivable_payments (company_id, journal_entry_number)
  WHERE journal_entry_number IS NOT NULL;


-- =========================================================================
-- SOURCE FILE: 59_save_receivable_entry_batch.sql
-- =========================================================================

-- Save a page-level receivables draft atomically without modifying General Journal rows.
CREATE OR REPLACE FUNCTION public.save_receivable_entry_batch(
  p_company_id UUID,
  p_entries JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry JSONB;
  v_booking_id UUID;
  v_amount BIGINT;
  v_saved INTEGER := 0;
BEGIN
  IF p_company_id IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'Invalid receivable entry batch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.companies c
    JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
    WHERE c.id = p_company_id
      AND tm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Company access denied' USING ERRCODE = '42501';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries)
  LOOP
    v_booking_id := (v_entry->>'booking_id')::UUID;
    v_amount := (v_entry->>'amount_cents')::BIGINT;

    IF v_amount <= 0
      OR NOT EXISTS (
        SELECT 1 FROM public.installation_bookings b
        WHERE b.id = v_booking_id AND b.company_id = p_company_id
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.general_journal j
        WHERE j.company_id = p_company_id
          AND j.entry_number = (v_entry->>'journal_entry_number')::INTEGER
          AND j.debit > 0
      )
    THEN
      RAISE EXCEPTION 'Invalid receivable draft entry';
    END IF;

    INSERT INTO public.receivable_payments (
      company_id, booking_id, amount_cents, payment_date, payment_method,
      reference_number, notes, transaction_type, journal_entry_id,
      journal_entry_number, debited_account
    ) VALUES (
      p_company_id,
      v_booking_id,
      v_amount,
      (v_entry->>'payment_date')::DATE,
      'General Journal',
      v_entry->>'reference_number',
      NULLIF(v_entry->>'notes', ''),
      v_entry->>'transaction_type',
      (v_entry->>'journal_entry_id')::BIGINT,
      (v_entry->>'journal_entry_number')::INTEGER,
      v_entry->>'debited_account'
    );

    UPDATE public.installation_bookings
    SET balance_due = GREATEST(0, COALESCE(balance_due, 0) - v_amount)
    WHERE id = v_booking_id AND company_id = p_company_id;

    v_saved := v_saved + 1;
  END LOOP;

  RETURN v_saved;
END;
$$;

REVOKE ALL ON FUNCTION public.save_receivable_entry_batch(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_receivable_entry_batch(UUID, JSONB) TO authenticated;


-- =========================================================================
-- SOURCE FILE: 60_edit_receivable_entry_batch.sql
-- =========================================================================

-- Extend the atomic receivables draft save to support company-scoped inserts,
-- edits, and deletes without modifying the linked General Journal entries.
CREATE OR REPLACE FUNCTION public.save_receivable_entry_batch(
  p_company_id UUID,
  p_entries JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry JSONB;
  v_operation TEXT;
  v_payment_id UUID;
  v_booking_id UUID;
  v_existing_booking_id UUID;
  v_existing_amount BIGINT;
  v_amount BIGINT;
  v_saved INTEGER := 0;
BEGIN
  IF p_company_id IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'Invalid receivable entry batch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.companies c
    JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
    WHERE c.id = p_company_id
      AND tm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Company access denied' USING ERRCODE = '42501';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries)
  LOOP
    v_operation := COALESCE(NULLIF(v_entry->>'operation', ''), 'insert');

    IF v_operation IN ('update', 'delete') THEN
      v_payment_id := (v_entry->>'id')::UUID;
      SELECT rp.booking_id, rp.amount_cents
      INTO v_existing_booking_id, v_existing_amount
      FROM public.receivable_payments rp
      WHERE rp.id = v_payment_id
        AND rp.company_id = p_company_id
        AND rp.journal_entry_number IS NOT NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Receivable entry was not found';
      END IF;

      IF v_operation = 'delete' THEN
        DELETE FROM public.receivable_payments
        WHERE id = v_payment_id AND company_id = p_company_id;

        UPDATE public.installation_bookings
        SET balance_due = GREATEST(0, COALESCE(balance_due, 0) + v_existing_amount)
        WHERE id = v_existing_booking_id AND company_id = p_company_id;

        v_saved := v_saved + 1;
        CONTINUE;
      END IF;
    END IF;

    v_booking_id := (v_entry->>'booking_id')::UUID;
    v_amount := (v_entry->>'amount_cents')::BIGINT;

    IF v_amount <= 0
      OR NOT EXISTS (
        SELECT 1 FROM public.installation_bookings b
        WHERE b.id = v_booking_id AND b.company_id = p_company_id
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.general_journal j
        WHERE j.company_id = p_company_id
          AND j.entry_number = (v_entry->>'journal_entry_number')::INTEGER
          AND j.debit > 0
      )
    THEN
      RAISE EXCEPTION 'Invalid receivable draft entry';
    END IF;

    IF v_operation = 'update' THEN
      IF v_booking_id <> v_existing_booking_id THEN
        RAISE EXCEPTION 'Receivable entry booking cannot be changed';
      END IF;

      UPDATE public.receivable_payments
      SET amount_cents = v_amount,
          payment_date = (v_entry->>'payment_date')::DATE,
          payment_method = 'General Journal',
          reference_number = v_entry->>'reference_number',
          notes = NULLIF(v_entry->>'notes', ''),
          transaction_type = v_entry->>'transaction_type',
          journal_entry_id = (v_entry->>'journal_entry_id')::BIGINT,
          journal_entry_number = (v_entry->>'journal_entry_number')::INTEGER,
          debited_account = v_entry->>'debited_account'
      WHERE id = v_payment_id AND company_id = p_company_id;

      UPDATE public.installation_bookings
      SET balance_due = GREATEST(0, COALESCE(balance_due, 0) + v_existing_amount - v_amount)
      WHERE id = v_existing_booking_id AND company_id = p_company_id;
    ELSIF v_operation = 'insert' THEN
      INSERT INTO public.receivable_payments (
        company_id, booking_id, amount_cents, payment_date, payment_method,
        reference_number, notes, transaction_type, journal_entry_id,
        journal_entry_number, debited_account
      ) VALUES (
        p_company_id,
        v_booking_id,
        v_amount,
        (v_entry->>'payment_date')::DATE,
        'General Journal',
        v_entry->>'reference_number',
        NULLIF(v_entry->>'notes', ''),
        v_entry->>'transaction_type',
        (v_entry->>'journal_entry_id')::BIGINT,
        (v_entry->>'journal_entry_number')::INTEGER,
        v_entry->>'debited_account'
      );

      UPDATE public.installation_bookings
      SET balance_due = GREATEST(0, COALESCE(balance_due, 0) - v_amount)
      WHERE id = v_booking_id AND company_id = p_company_id;
    ELSE
      RAISE EXCEPTION 'Unsupported receivable operation';
    END IF;

    v_saved := v_saved + 1;
  END LOOP;

  RETURN v_saved;
END;
$$;

REVOKE ALL ON FUNCTION public.save_receivable_entry_batch(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_receivable_entry_batch(UUID, JSONB) TO authenticated;

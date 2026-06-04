-- Migration 37: Add is_payment_account flag and ensure payment accounts exist

-- 1. Add is_payment_account column
ALTER TABLE public.bookkeeping_accounts
  ADD COLUMN IF NOT EXISTS is_payment_account BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Insert missing payment accounts scoped to BrightKey (inline subquery avoids DO-block RLS issues)
INSERT INTO public.bookkeeping_accounts (company_id, account_code, account_name, account_type, is_payment_account)
SELECT id, '1050', 'Warehouse Cash',       'Asset', TRUE FROM public.companies WHERE subdomain = 'brightkey' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.bookkeeping_accounts (company_id, account_code, account_name, account_type, is_payment_account)
SELECT id, '1060', 'Petty Cash - General', 'Asset', TRUE FROM public.companies WHERE subdomain = 'brightkey' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.bookkeeping_accounts (company_id, account_code, account_name, account_type, is_payment_account)
SELECT id, '1070', 'Petty Cash - John',    'Asset', TRUE FROM public.companies WHERE subdomain = 'brightkey' LIMIT 1
ON CONFLICT DO NOTHING;

-- 3. Flag existing payment accounts (seeded with company_id NULL in migration 31)
UPDATE public.bookkeeping_accounts
SET is_payment_account = TRUE
WHERE account_name IN (
  'CIMB Bank',
  'GCash',
  'Cash on Hand',
  'Savings Account',
  'PayMongo Clearing'
);

-- 4. Ensure all bookkeeping accounts have the BrightKey company ID (safely merging duplicates if they exist)
DO $$
DECLARE
  v_company_id UUID;
  r RECORD;
  v_dup_id UUID;
BEGIN
  -- Resolve BrightKey company ID
  SELECT id INTO v_company_id FROM public.companies WHERE subdomain = 'brightkey' LIMIT 1;
  
  IF v_company_id IS NOT NULL THEN
    -- Loop through all accounts with NULL company_id
    FOR r IN SELECT id, account_code FROM public.bookkeeping_accounts WHERE company_id IS NULL LOOP
      -- Check if there is already a duplicate account for BrightKey with this code
      SELECT id INTO v_dup_id 
      FROM public.bookkeeping_accounts 
      WHERE company_id = v_company_id AND account_code = r.account_code 
      LIMIT 1;

      IF v_dup_id IS NOT NULL THEN
        -- Re-link any transaction lines to the BrightKey-specific account
        UPDATE public.bookkeeping_lines 
        SET account_id = v_dup_id 
        WHERE account_id = r.id;

        -- Delete the duplicate NULL-company account
        DELETE FROM public.bookkeeping_accounts WHERE id = r.id;
      ELSE
        -- No duplicate exists, so we can safely assign the company_id
        UPDATE public.bookkeeping_accounts 
        SET company_id = v_company_id 
        WHERE id = r.id;
      END IF;
    END LOOP;

    -- Update any remaining NULL company_ids to BrightKey ID
    UPDATE public.bookkeeping_accounts
    SET company_id = v_company_id
    WHERE company_id IS NULL;
  END IF;
END $$;



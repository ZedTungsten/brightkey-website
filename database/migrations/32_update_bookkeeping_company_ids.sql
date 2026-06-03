-- Migration 32: Update bookkeeping transaction types and accounts to use BrightKey company ID
-- Sets all existing NULL company_id fields to the BrightKey company ID.

DO $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Resolve BrightKey company ID
  SELECT id INTO v_company_id FROM public.companies WHERE subdomain = 'brightkey' LIMIT 1;
  
  IF v_company_id IS NOT NULL THEN
    -- 1. Update bookkeeping transaction types
    UPDATE public.bookkeeping_transaction_types
    SET company_id = v_company_id
    WHERE company_id IS NULL;

    -- 2. Update bookkeeping accounts
    UPDATE public.bookkeeping_accounts
    SET company_id = v_company_id
    WHERE company_id IS NULL;
  END IF;
END $$;

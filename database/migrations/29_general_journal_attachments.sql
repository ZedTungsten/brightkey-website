-- Migration 29: Add company_id and attachments columns to general_journal and journal_accounts
-- Updates tables and sets up strict company-scoped RLS policies.

-- 1. Add company_id and attachments columns to public.general_journal
ALTER TABLE public.general_journal ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.general_journal ADD COLUMN IF NOT EXISTS attachments TEXT[] DEFAULT '{}';

-- 2. Add company_id column to public.journal_accounts
ALTER TABLE public.journal_accounts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- 2b. Add company_id column to public.journal_audit_log
ALTER TABLE public.journal_audit_log ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- 2c. Populate existing NULL values with the BrightKey company ID
DO $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT id INTO v_company_id FROM public.companies WHERE subdomain = 'brightkey' LIMIT 1;
  IF v_company_id IS NOT NULL THEN
    UPDATE public.general_journal SET company_id = v_company_id WHERE company_id IS NULL;
    UPDATE public.journal_accounts SET company_id = v_company_id WHERE company_id IS NULL;
    UPDATE public.journal_audit_log SET company_id = v_company_id WHERE company_id IS NULL;
  END IF;
END $$;

-- 3. Enable RLS on the tables (just in case they aren't already enabled)
ALTER TABLE public.general_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_audit_log ENABLE ROW LEVEL SECURITY;

-- 4. Re-create or define RLS Policies for general_journal (scoped by company_id)
DROP POLICY IF EXISTS "Company staff journal access" ON public.general_journal;
CREATE POLICY "Company staff journal access" ON public.general_journal
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- 5. Re-create or define RLS Policies for journal_accounts (scoped by company_id)
DROP POLICY IF EXISTS "Company staff accounts access" ON public.journal_accounts;
CREATE POLICY "Company staff accounts access" ON public.journal_accounts
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- 6. Re-create or define RLS Policies for journal_audit_log (scoped by company_id)
DROP POLICY IF EXISTS "Company staff audit log access" ON public.journal_audit_log;
CREATE POLICY "Company staff audit log access" ON public.journal_audit_log
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Migration 35: Harden General Journal RLS Policies
-- Explicitly restricts general_journal, journal_accounts, and journal_audit_log to authenticated users.

-- 1. Drop old policies
DROP POLICY IF EXISTS "Company staff journal access" ON public.general_journal;
DROP POLICY IF EXISTS "Company staff accounts access" ON public.journal_accounts;
DROP POLICY IF EXISTS "Company staff audit log access" ON public.journal_audit_log;

-- 2. Create new hardened policies checking auth.uid() IS NOT NULL
CREATE POLICY "Company staff journal access" ON public.general_journal
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Company staff accounts access" ON public.journal_accounts
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Company staff audit log access" ON public.journal_audit_log
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

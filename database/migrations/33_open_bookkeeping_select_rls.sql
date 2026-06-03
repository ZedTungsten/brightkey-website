-- Migration 33: Relax Bookkeeping Select RLS Policies
-- Allows any authenticated user to SELECT transaction types and accounts, while keeping write permissions strictly company-scoped.

-- 1. Drop old policies
DROP POLICY IF EXISTS "Bookkeeping transaction types access" ON public.bookkeeping_transaction_types;
DROP POLICY IF EXISTS "Bookkeeping accounts access" ON public.bookkeeping_accounts;

-- 2. Create relaxed SELECT policies for authenticated users
CREATE POLICY "Bookkeeping transaction types select" ON public.bookkeeping_transaction_types
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Bookkeeping accounts select" ON public.bookkeeping_accounts
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 3. Create strict write policies (INSERT, UPDATE, DELETE) for company staff
CREATE POLICY "Bookkeeping transaction types insert" ON public.bookkeeping_transaction_types
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Bookkeeping transaction types update" ON public.bookkeeping_transaction_types
  FOR UPDATE USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Bookkeeping transaction types delete" ON public.bookkeeping_transaction_types
  FOR DELETE USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Bookkeeping accounts insert" ON public.bookkeeping_accounts
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Bookkeeping accounts update" ON public.bookkeeping_accounts
  FOR UPDATE USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Bookkeeping accounts delete" ON public.bookkeeping_accounts
  FOR DELETE USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

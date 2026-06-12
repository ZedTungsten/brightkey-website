-- Migration 49: Add company_id to dashboard_roles and scope policies to tenant admins/owners

-- 1. Add company_id reference column
ALTER TABLE public.dashboard_roles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- 2. Drop the old global unique constraint on name
ALTER TABLE public.dashboard_roles DROP CONSTRAINT IF EXISTS dashboard_roles_name_key;

-- 3. Create unique indexes to allow duplicate name for custom roles across different companies, but unique per company, and unique globally for default/global roles
DROP INDEX IF EXISTS dashboard_roles_global_name_idx;
CREATE UNIQUE INDEX dashboard_roles_global_name_idx ON public.dashboard_roles (name) WHERE company_id IS NULL;

DROP INDEX IF EXISTS dashboard_roles_company_name_idx;
CREATE UNIQUE INDEX dashboard_roles_company_name_idx ON public.dashboard_roles (company_id, name) WHERE company_id IS NOT NULL;

-- 4. Enable RLS and define scoped policies
ALTER TABLE public.dashboard_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select dashboard_roles" ON public.dashboard_roles;
CREATE POLICY "Allow select dashboard_roles" ON public.dashboard_roles
  FOR SELECT USING (
    company_id IS NULL OR
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Allow manage dashboard_roles" ON public.dashboard_roles;
CREATE POLICY "Allow manage dashboard_roles" ON public.dashboard_roles
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
    )
  );

-- Drop old global management policies
DROP POLICY IF EXISTS "Allow johnzeustaller manage dashboard_roles" ON public.dashboard_roles;
DROP POLICY IF EXISTS "Allow public read dashboard_roles" ON public.dashboard_roles;

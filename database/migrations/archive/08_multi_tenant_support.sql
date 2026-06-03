-- Migration: Multi-Tenant SaaS DB Support
-- Creates Tenants, Companies, and Tenant Members tables,
-- and adds company_id constraints with RLS policies to all core tables.

-- 1. Create Tenants Table (Master SaaS Accounts)
CREATE TABLE IF NOT EXISTS public.tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email TEXT NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Companies Table (Multiple Companies under a Tenant)
CREATE TABLE IF NOT EXISTS public.companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  subdomain   TEXT UNIQUE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Tenant Members Table (Maps Auth Users to Tenants with Roles)
CREATE TABLE IF NOT EXISTS public.tenant_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role       TEXT NOT NULL DEFAULT 'admin', -- 'owner', 'admin', 'staff'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_user_tenant UNIQUE (user_id, tenant_id)
);

-- 4. Add company_id columns to existing operational tables
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.global_settings ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.email_marketing_audiences ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.email_marketing_audience_members ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.installations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- 5. Enable Row-Level Security (RLS) on new and altered tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

-- 6. Define multi-tenant RLS Policies

-- Policy helper view/subquery check: Checks if user belongs to the tenant that owns the company
-- Row level policies for Tenants
DROP POLICY IF EXISTS "Allow user to select their own tenants" ON public.tenants;
CREATE POLICY "Allow user to select their own tenants" ON public.tenants
  FOR SELECT USING (
    id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

-- Row level policies for Companies
DROP POLICY IF EXISTS "Allow users to view authorized companies" ON public.companies;
CREATE POLICY "Allow users to view authorized companies" ON public.companies
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Allow tenant members write access to companies" ON public.companies;
CREATE POLICY "Allow tenant members write access to companies" ON public.companies
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

-- Row level policies for products
DROP POLICY IF EXISTS "Allow company product select" ON public.products;
CREATE POLICY "Allow company product select" ON public.products
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Allow company product write" ON public.products;
CREATE POLICY "Allow company product write" ON public.products
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Row level policies for global_settings
DROP POLICY IF EXISTS "Allow company settings select" ON public.global_settings;
CREATE POLICY "Allow company settings select" ON public.global_settings
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Allow company settings write" ON public.global_settings;
CREATE POLICY "Allow company settings write" ON public.global_settings
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Row level policies for email_marketing_audiences
DROP POLICY IF EXISTS "Allow company audience select" ON public.email_marketing_audiences;
CREATE POLICY "Allow company audience select" ON public.email_marketing_audiences
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Allow company audience write" ON public.email_marketing_audiences;
CREATE POLICY "Allow company audience write" ON public.email_marketing_audiences
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

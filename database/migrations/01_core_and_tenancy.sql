-- =============================================================================
-- BrightKey Consolidated Core and Tenancy Schema (01_core_and_tenancy.sql)
-- Consolidates tenants, companies, tenant members, customer profiles, 
-- invitations, and RBAC dashboard roles.
-- Run this in your Supabase SQL Editor.
-- =============================================================================

-- Drop tables if they exist to start fresh
DROP TABLE IF EXISTS public.company_invitations CASCADE;
DROP TABLE IF EXISTS public.tenant_members CASCADE;
DROP TABLE IF EXISTS public.companies CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;
DROP TABLE IF EXISTS public.customer_profiles CASCADE;
DROP TABLE IF EXISTS public.dashboard_roles CASCADE;

-- ── 1. Tenants Table ──────────────────────────────────────────────────────────
CREATE TABLE public.tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email TEXT NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 2. Companies Table ────────────────────────────────────────────────────────
CREATE TABLE public.companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  subdomain   TEXT UNIQUE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 3. Tenant Members Table ──────────────────────────────────────────────────
CREATE TABLE public.tenant_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role       TEXT, -- Dynamic roles mapped to dashboard_roles
  user_email TEXT,
  full_name  TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_user_tenant UNIQUE (user_id, tenant_id)
);

-- ── 4. Company Invitations Table ──────────────────────────────────────────────
CREATE TABLE public.company_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  email       TEXT NOT NULL,
  full_name   TEXT,
  role        TEXT, -- Mapped to dashboard_roles
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_email_tenant UNIQUE (email, tenant_id)
);

-- ── 5. Customer Profiles Table ────────────────────────────────────────────────
CREATE TABLE public.customer_profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  full_name           TEXT,
  is_affiliate        BOOLEAN DEFAULT FALSE,
  affiliate_code      TEXT UNIQUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. Dashboard Roles Table ──────────────────────────────────────────────────
CREATE TABLE public.dashboard_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  accessible_modules TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 7. Helper Functions ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_tenants(usr_id UUID)
RETURNS TABLE (tenant_id UUID) SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = usr_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(usr_id UUID, t_id UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.tenant_members 
    WHERE user_id = usr_id AND tenant_id = t_id AND role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql;

-- ── 8. Row Level Security Policies ───────────────────────────────────────────

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_roles ENABLE ROW LEVEL SECURITY;

-- Tenants Policies
CREATE POLICY "Allow user to select their own tenants" ON public.tenants
  FOR SELECT USING (
    id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

-- Companies Policies
CREATE POLICY "Allow users to view authorized companies" ON public.companies
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Allow tenant members write access to companies" ON public.companies
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

-- Tenant Members Policies
CREATE POLICY "Allow members select membership" ON public.tenant_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR
    tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
  );

CREATE POLICY "Allow admins manage membership" ON public.tenant_members
  FOR ALL USING (
    public.is_tenant_admin(auth.uid(), tenant_id)
  );

-- Company Invitations Policies
CREATE POLICY "Allow tenant admin select invitations" ON public.company_invitations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.tenant_id = company_invitations.tenant_id
        AND tm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Allow tenant admin insert invitations" ON public.company_invitations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.tenant_id = company_invitations.tenant_id
        AND tm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Allow tenant admin delete invitations" ON public.company_invitations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.tenant_id = company_invitations.tenant_id
        AND tm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Allow user to read their invitations" ON public.company_invitations
  FOR SELECT USING (
    email = auth.email()
  );

-- Customer Profiles Policies
CREATE POLICY "Customers can view own profile." ON public.customer_profiles
  FOR SELECT USING (
    auth.uid() = id
  );

-- Dashboard Roles Policies
CREATE POLICY "Allow public read dashboard_roles" ON public.dashboard_roles
  FOR SELECT USING (true);

CREATE POLICY "Allow johnzeustaller manage dashboard_roles" ON public.dashboard_roles
  FOR ALL USING (
    auth.jwt() ->> 'email' = 'johnzeustaller@gmail.com'
  );

-- ── 9. Initial Seed Data ──────────────────────────────────────────────────────

DO $$
DECLARE
  v_user_id       UUID;
  v_tenant_id     UUID;
  v_company_id    UUID;
BEGIN
  -- Seed dynamic dashboard roles
  INSERT INTO public.dashboard_roles (name, accessible_modules) VALUES
    ('Customer Service', ARRAY['Customer Service']),
    ('Operations', ARRAY['Operations']),
    ('Marketing', ARRAY['Products', 'Marketing', 'Customer Service']),
    ('Accounting', ARRAY['Finance']),
    ('HR', ARRAY['HR', 'Customer Service']),
    ('Logistics', ARRAY['Products', 'Logistics'])
  ON CONFLICT (name) DO UPDATE
  SET accessible_modules = EXCLUDED.accessible_modules;

  -- Get auth.users UUID by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'johnzeustaller@gmail.com'
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    -- Insert tenant row
    INSERT INTO public.tenants (owner_email)
    VALUES ('johnzeustaller@gmail.com')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_tenant_id;

    IF v_tenant_id IS NULL THEN
      SELECT id INTO v_tenant_id
      FROM public.tenants
      WHERE owner_email = 'johnzeustaller@gmail.com'
      LIMIT 1;
    END IF;

    -- Insert BrightKey company row
    INSERT INTO public.companies (tenant_id, name, subdomain)
    VALUES (v_tenant_id, 'BrightKey', 'brightkey')
    ON CONFLICT (subdomain) DO NOTHING
    RETURNING id INTO v_company_id;

    IF v_company_id IS NULL THEN
      SELECT id INTO v_company_id
      FROM public.companies
      WHERE subdomain = 'brightkey'
      LIMIT 1;
    END IF;

    -- Register owner as tenant member
    INSERT INTO public.tenant_members (tenant_id, user_id, role, user_email, full_name)
    VALUES (v_tenant_id, v_user_id, 'owner', 'johnzeustaller@gmail.com', 'John Zeus Taller')
    ON CONFLICT (user_id, tenant_id) DO UPDATE
      SET role = 'owner';
  END IF;
END $$;

-- Migration: SaaS User Invitations and Role-Based Access Control (RBAC)
-- Enforces allowed roles and permits only owners/admins to manage invites and memberships.

-- 1. Apply role check constraint to tenant_members
ALTER TABLE public.tenant_members 
  DROP CONSTRAINT IF EXISTS check_tenant_member_role,
  ADD CONSTRAINT check_tenant_member_role 
  CHECK (role IN ('owner', 'admin', 'customer_service', 'operations', 'marketing', 'accounting', 'hr', 'logistics'));

ALTER TABLE public.tenant_members ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE public.tenant_members ADD COLUMN IF NOT EXISTS full_name TEXT;

-- 2. Create Company Invitations Table
CREATE TABLE IF NOT EXISTS public.company_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  email       TEXT NOT NULL,
  full_name   TEXT,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'customer_service', 'operations', 'marketing', 'accounting', 'hr', 'logistics')),
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_email_tenant UNIQUE (email, tenant_id)
);

-- Enable RLS
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

-- 3. Helper functions (Security Definer) to avoid infinite RLS recursion
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

-- 4. Define Policies for company_invitations
DROP POLICY IF EXISTS "Allow tenant admin manage invitations" ON public.company_invitations;
CREATE POLICY "Allow tenant admin manage invitations" ON public.company_invitations
  FOR ALL USING (
    public.is_tenant_admin(auth.uid(), tenant_id)
  );

DROP POLICY IF EXISTS "Allow user to read their invitations" ON public.company_invitations;
CREATE POLICY "Allow user to read their invitations" ON public.company_invitations
  FOR SELECT USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- 5. Define tenant_members policies (Only Owner/Admin can write, members can select)
DROP POLICY IF EXISTS "Allow members select membership" ON public.tenant_members;
CREATE POLICY "Allow members select membership" ON public.tenant_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR
    tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
  );

DROP POLICY IF EXISTS "Allow admins manage membership" ON public.tenant_members;
CREATE POLICY "Allow admins manage membership" ON public.tenant_members
  FOR ALL USING (
    public.is_tenant_admin(auth.uid(), tenant_id)
  );

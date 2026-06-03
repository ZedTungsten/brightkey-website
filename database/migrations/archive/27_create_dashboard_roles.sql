-- =============================================================================
-- Migration 27: Create Dynamic Dashboard Roles & Drop Static CHECK Constraints
-- Run this in your Supabase SQL Editor
-- =============================================================================

-- 1. Create the dashboard_roles table
CREATE TABLE IF NOT EXISTS public.dashboard_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  accessible_modules TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.dashboard_roles ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone can read roles
DROP POLICY IF EXISTS "Allow public read dashboard_roles" ON public.dashboard_roles;
CREATE POLICY "Allow public read dashboard_roles" ON public.dashboard_roles
  FOR SELECT USING (true);

-- ALL: only johnzeustaller@gmail.com can manage roles
DROP POLICY IF EXISTS "Allow johnzeustaller manage dashboard_roles" ON public.dashboard_roles;
CREATE POLICY "Allow johnzeustaller manage dashboard_roles" ON public.dashboard_roles
  FOR ALL USING (
    auth.jwt() ->> 'email' = 'johnzeustaller@gmail.com'
  );

-- 2. Drop the static role CHECK constraints on tenant_members & company_invitations
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find and drop constraint on tenant_members
    FOR r IN 
        SELECT constraint_name 
        FROM information_schema.constraint_column_usage 
        WHERE table_name = 'tenant_members' AND column_name = 'role'
    LOOP
        EXECUTE 'ALTER TABLE public.tenant_members DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name) || ' CASCADE;';
    END LOOP;

    -- Find and drop constraint on company_invitations
    FOR r IN 
        SELECT constraint_name 
        FROM information_schema.constraint_column_usage 
        WHERE table_name = 'company_invitations' AND column_name = 'role'
    LOOP
        EXECUTE 'ALTER TABLE public.company_invitations DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name) || ' CASCADE;';
    END LOOP;
END $$;

-- 3. Make role nullable on company_invitations and tenant_members
ALTER TABLE public.company_invitations ALTER COLUMN role DROP NOT NULL;
ALTER TABLE public.tenant_members ALTER COLUMN role DROP NOT NULL;

-- 4. Seed initial default roles
INSERT INTO public.dashboard_roles (name, accessible_modules) VALUES
  ('Customer Service', ARRAY['Customer Service']),
  ('Operations', ARRAY['Operations']),
  ('Marketing', ARRAY['Products', 'Marketing', 'Customer Service']),
  ('Accounting', ARRAY['Finance']),
  ('HR', ARRAY['HR', 'Customer Service']),
  ('Logistics', ARRAY['Products', 'Logistics'])
ON CONFLICT (name) DO UPDATE
SET accessible_modules = EXCLUDED.accessible_modules;

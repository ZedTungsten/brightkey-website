-- Migration: Ensure company_id exists on installation_bookings and RLS policies are applied
-- This column is required for multi-tenant isolation of installation bookings.

ALTER TABLE public.installation_bookings ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- Re-apply RLS policy for safety
ALTER TABLE public.installation_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company staff installation bookings access" ON public.installation_bookings;
CREATE POLICY "Company staff installation bookings access" ON public.installation_bookings
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

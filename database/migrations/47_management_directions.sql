-- ============================================================
-- Migration: 47_management_directions.sql
-- Creates management_directions table for Owner/Admin company roadmap.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.management_directions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  parent_id    UUID REFERENCES public.management_directions(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  VARCHAR(500),
  target_date  DATE,
  bucket       TEXT NOT NULL CHECK (bucket IN ('urgent_important', 'not_urgent_important')),
  completed_at TIMESTAMPTZ DEFAULT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.management_directions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Management directions access" ON public.management_directions;
CREATE POLICY "Management directions access" ON public.management_directions
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

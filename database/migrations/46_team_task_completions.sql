-- ============================================================
-- Migration: 46_team_task_completions.sql
-- Creates team_task_completions table to track task checked state.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.team_task_completions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  task_id      UUID REFERENCES public.team_tasks(id) ON DELETE CASCADE,
  employee_id  UUID REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.team_task_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team task completions access" ON public.team_task_completions;
CREATE POLICY "Team task completions access" ON public.team_task_completions
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

-- Create team_tasks table
CREATE TABLE IF NOT EXISTS public.team_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  assigned_to  UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  assigned_by  UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  title        TEXT NOT NULL,
  description  VARCHAR(500),
  kpi          TEXT,
  task_type    TEXT NOT NULL CHECK (task_type IN ('daily', 'weekly', 'monthly')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Create team_milestones table
CREATE TABLE IF NOT EXISTS public.team_milestones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  assigned_to  UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  assigned_by  UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  title        TEXT NOT NULL,
  description  VARCHAR(500),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.team_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_milestones ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to prevent errors
DROP POLICY IF EXISTS "Company team tasks access" ON public.team_tasks;
DROP POLICY IF EXISTS "Company team milestones access" ON public.team_milestones;

-- Scoped access policies
CREATE POLICY "Company team tasks access" ON public.team_tasks
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Company team milestones access" ON public.team_milestones
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Auto-update updated_at triggers
CREATE OR REPLACE FUNCTION update_team_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_team_tasks_updated_at
  BEFORE UPDATE ON public.team_tasks
  FOR EACH ROW EXECUTE FUNCTION update_team_tasks_updated_at();

CREATE OR REPLACE FUNCTION update_team_milestones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_team_milestones_updated_at
  BEFORE UPDATE ON public.team_milestones
  FOR EACH ROW EXECUTE FUNCTION update_team_milestones_updated_at();

-- =============================================================================
-- Migration 36: Team Projects and Project Members Tables & RLS Policies
-- =============================================================================

-- ── 0. Create Helper Function to Check Team Leader Status from Org Map ───────
CREATE OR REPLACE FUNCTION public.is_team_leader(
  p_user_id    UUID,
  p_company_id UUID
)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tenant_id UUID;
  v_role      TEXT;
  v_structure JSONB;
  v_is_leader BOOLEAN := FALSE;
BEGIN
  -- Resolve tenant from company
  SELECT tenant_id INTO v_tenant_id
  FROM public.companies WHERE id = p_company_id LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN FALSE; END IF;

  -- Load user's membership role
  SELECT role INTO v_role
  FROM public.tenant_members
  WHERE user_id = p_user_id AND tenant_id = v_tenant_id
  LIMIT 1;

  -- Owners and admins are always team leaders/supervisors
  IF v_role IS NOT NULL AND lower(v_role) IN ('owner', 'admin') THEN
    RETURN TRUE;
  END IF;

  -- Load company structure
  SELECT value INTO v_structure
  FROM public.global_settings
  WHERE key = 'company_structure' AND company_id = p_company_id
  LIMIT 1;

  IF v_structure IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if user is a department manager in the JSON
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(v_structure->'departments') AS dept(managerId TEXT)
    WHERE dept.managerId = p_user_id::TEXT
  ) INTO v_is_leader;

  IF v_is_leader THEN
    RETURN TRUE;
  END IF;

  -- Check if user is a subteam manager in the JSON
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(v_structure->'departments') AS dept(subteams JSONB),
         jsonb_to_recordset(dept.subteams) AS sub(managerId TEXT)
    WHERE sub.managerId = p_user_id::TEXT
  ) INTO v_is_leader;

  RETURN v_is_leader;
END;
$$;

-- ── 1. Create Team Projects Table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  assigned_by  UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title        TEXT NOT NULL,
  description  VARCHAR(500),
  completed_at TIMESTAMPTZ DEFAULT NULL,
  deadline     DATE DEFAULT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Create Project Members Join Table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_members (
  project_id   UUID REFERENCES public.team_projects(id) ON DELETE CASCADE,
  employee_id  UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, employee_id)
);

-- ── 3. Enable RLS on both tables ─────────────────────────────────────────────
ALTER TABLE public.team_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- ── 4. Set Up Triggers for team_projects updated_at ─────────────────────────
CREATE OR REPLACE TRIGGER trg_team_projects_updated_at
  BEFORE UPDATE ON public.team_projects
  FOR EACH ROW EXECUTE FUNCTION update_team_tasks_updated_at();

-- ── 5. RLS Policies for team_projects ────────────────────────────────────────
DROP POLICY IF EXISTS "Team projects select access" ON public.team_projects;
DROP POLICY IF EXISTS "Team projects write access" ON public.team_projects;
DROP POLICY IF EXISTS "Team projects update access" ON public.team_projects;

-- Read Access: Allow all company/tenant staff members
CREATE POLICY "Team projects select access" ON public.team_projects
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Insert/Delete Access: Only team leaders can create/delete projects
CREATE POLICY "Team projects write access" ON public.team_projects
  FOR ALL TO authenticated
  USING (
    public.is_team_leader(auth.uid(), company_id)
  )
  WITH CHECK (
    public.is_team_leader(auth.uid(), company_id)
  );

-- Update Access: Team leaders can update, OR any member of the project can update completion/fields
CREATE POLICY "Team projects update access" ON public.team_projects
  FOR UPDATE TO authenticated
  USING (
    public.is_team_leader(auth.uid(), company_id)
    OR EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = team_projects.id AND employee_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_team_leader(auth.uid(), company_id)
    OR EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = team_projects.id AND employee_id = auth.uid()
    )
  );

-- ── 6. RLS Policies for project_members ──────────────────────────────────────
DROP POLICY IF EXISTS "Project members select access" ON public.project_members;
DROP POLICY IF EXISTS "Project members write access" ON public.project_members;

-- Read Access: Allow all company/tenant staff members
CREATE POLICY "Project members select access" ON public.project_members
  FOR SELECT TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.team_projects
      WHERE company_id IN (
        SELECT id FROM public.companies
        WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
      )
    )
  );

-- Write Access: Only team leaders can modify project memberships
CREATE POLICY "Project members write access" ON public.project_members
  FOR ALL TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.team_projects
      WHERE public.is_team_leader(auth.uid(), company_id)
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.team_projects
      WHERE public.is_team_leader(auth.uid(), company_id)
    )
  );

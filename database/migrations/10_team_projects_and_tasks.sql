-- ==========================================
-- Source: 23_team_tasks_self_rls.sql
-- ==========================================

-- =============================================================================
-- Migration 23: Team Tasks and Milestones Org Map & Self-Access RLS Policies
-- =============================================================================

-- ── 1. Create Helper Function to Check Team Leader Status from Org Map ───────
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

COMMENT ON FUNCTION public.is_team_leader IS
  'Returns TRUE if user is an owner/admin of the tenant, or a department manager / subteam manager in company_structure settings.';


-- ── 2. Team Tasks (team_tasks) Policies ──────────────────────────────────────
DROP POLICY IF EXISTS "Operations module team_tasks" ON public.team_tasks;
DROP POLICY IF EXISTS "Team tasks select access" ON public.team_tasks;
DROP POLICY IF EXISTS "Team tasks write access" ON public.team_tasks;

-- Read Access: Allow all company/tenant staff members
CREATE POLICY "Team tasks select access" ON public.team_tasks
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Write Access: Only team leaders can write tasks
CREATE POLICY "Team tasks write access" ON public.team_tasks
  FOR ALL TO authenticated
  USING (
    public.is_team_leader(auth.uid(), company_id)
  )
  WITH CHECK (
    public.is_team_leader(auth.uid(), company_id)
  );


-- ── 3. Team Milestones (team_milestones) Policies ────────────────────────────
DROP POLICY IF EXISTS "Operations module team_milestones" ON public.team_milestones;
DROP POLICY IF EXISTS "Team milestones select access" ON public.team_milestones;
DROP POLICY IF EXISTS "Team milestones write access" ON public.team_milestones;
DROP POLICY IF EXISTS "Team milestones update access" ON public.team_milestones;

-- Read Access: Allow all company/tenant staff members
CREATE POLICY "Team milestones select access" ON public.team_milestones
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Insert/Delete Access: Only team leaders can create/delete milestones
CREATE POLICY "Team milestones write access" ON public.team_milestones
  FOR ALL TO authenticated
  USING (
    public.is_team_leader(auth.uid(), company_id)
  )
  WITH CHECK (
    public.is_team_leader(auth.uid(), company_id)
  );

-- Update Access: Team leaders can update milestones, OR assignee can update milestone completion
CREATE POLICY "Team milestones update access" ON public.team_milestones
  FOR UPDATE TO authenticated
  USING (
    public.is_team_leader(auth.uid(), company_id)
    OR assigned_to = auth.uid()
  )
  WITH CHECK (
    public.is_team_leader(auth.uid(), company_id)
    OR assigned_to = auth.uid()
  );


-- ==========================================
-- Source: 36_team_projects_schema.sql
-- ==========================================

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
  employee_id  UUID REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
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


-- ==========================================
-- Source: 37_qa_guides_schema.sql
-- ==========================================

-- Create QA Guides table
CREATE TABLE IF NOT EXISTS public.qa_guides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  product_id   UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL UNIQUE,
  general_notes TEXT,
  parts        JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of { image_url: text, quantity: integer, notes: text }
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_qa_guides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_qa_guides_updated_at
  BEFORE UPDATE ON public.qa_guides
  FOR EACH ROW EXECUTE FUNCTION update_qa_guides_updated_at();

-- Enable Row Level Security
ALTER TABLE public.qa_guides ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY "Allow company members to view qa_guides" ON public.qa_guides
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members to manage qa_guides" ON public.qa_guides
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );


-- ==========================================
-- Source: 46_team_task_completions.sql
-- ==========================================

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


-- ==========================================
-- Source: 47_management_directions.sql
-- ==========================================

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

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

-- =============================================================================
-- Migration 23: Team Tasks and Milestones Self-Access RLS Policies
-- =============================================================================

-- ── 1. Team Tasks (team_tasks) Self-Access ───────────────────────────────────
DROP POLICY IF EXISTS "Operations module team_tasks" ON public.team_tasks;

CREATE POLICY "Operations module team_tasks" ON public.team_tasks
  FOR ALL TO authenticated
  USING (
    public.has_module_access(auth.uid(), company_id, 'Operations')
    OR assigned_to = auth.uid()
  )
  WITH CHECK (
    public.has_module_access(auth.uid(), company_id, 'Operations')
    OR assigned_to = auth.uid()
  );

-- ── 2. Team Milestones (team_milestones) Self-Access ─────────────────────────
DROP POLICY IF EXISTS "Operations module team_milestones" ON public.team_milestones;

CREATE POLICY "Operations module team_milestones" ON public.team_milestones
  FOR ALL TO authenticated
  USING (
    public.has_module_access(auth.uid(), company_id, 'Operations')
    OR assigned_to = auth.uid()
  )
  WITH CHECK (
    public.has_module_access(auth.uid(), company_id, 'Operations')
    OR assigned_to = auth.uid()
  );

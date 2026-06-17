-- =============================================================================
-- Migration 21: Attendance and Employee Profile Self-Access RLS Policies
-- =============================================================================

-- ── 1. Employees Table Self-Access ───────────────────────────────────────────
DROP POLICY IF EXISTS "Employees can view their own profile" ON public.employees;
CREATE POLICY "Employees can view their own profile" ON public.employees
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Employees can update their own profile details" ON public.employees;
CREATE POLICY "Employees can update their own profile details" ON public.employees
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── 2. Attendance Logs Table Self-Access ─────────────────────────────────────
DROP POLICY IF EXISTS "Employees can view their own attendance logs" ON public.attendance_logs;
CREATE POLICY "Employees can view their own attendance logs" ON public.attendance_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = employee_id);

DROP POLICY IF EXISTS "Employees can insert their own attendance logs" ON public.attendance_logs;
CREATE POLICY "Employees can insert their own attendance logs" ON public.attendance_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = employee_id);

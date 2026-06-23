-- Drop the restrictive select policy on attendance_logs
DROP POLICY IF EXISTS "Employees can view their own attendance logs" ON public.attendance_logs;

-- Create a new select policy allowing company-wide selection for authenticated users in the same company
CREATE POLICY "Allow company members to view attendance logs" ON public.attendance_logs
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Optimize the sidebar's latest-attendance lookup:
--   WHERE employee_id = ?
--   ORDER BY created_at DESC
--   LIMIT 1
--
-- This is non-destructive and safe to rerun.
CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee_created_at
  ON public.attendance_logs (employee_id, created_at DESC);

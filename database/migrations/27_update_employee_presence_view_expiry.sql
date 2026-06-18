-- =============================================================================
-- Migration 27: Update employee_presence View with 12-Hour Expiry
-- =============================================================================

CREATE OR REPLACE VIEW public.employee_presence
WITH (security_invoker = true) AS
SELECT DISTINCT ON (employee_id)
  employee_id,
  CASE
    WHEN created_at < now() - INTERVAL '12 hours' THEN 'offline'
    ELSE status
  END as status,
  created_at
FROM public.attendance_logs
ORDER BY employee_id, created_at DESC;

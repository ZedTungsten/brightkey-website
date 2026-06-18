-- =============================================================================
-- Migration 27: Update employee_presence View with 12-Hour Expiry
-- =============================================================================

DROP VIEW IF EXISTS public.employee_presence;

CREATE OR REPLACE VIEW public.employee_presence
WITH (security_invoker = true) AS
SELECT DISTINCT ON (employee_id)
  employee_id,
  CASE
    WHEN created_at < now() - INTERVAL '12 hours' THEN 'offline'::character varying(20)
    ELSE status
  END::character varying(20) as status,
  created_at
FROM public.attendance_logs
ORDER BY employee_id, created_at DESC;

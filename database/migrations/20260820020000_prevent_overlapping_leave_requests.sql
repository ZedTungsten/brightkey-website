-- Prevent an employee from holding more than one pending or approved leave
-- request for the same calendar day. Existing duplicate rows remain available
-- for audit history; only the later active duplicate is rejected.

WITH ranked_active_requests AS (
  SELECT
    request.id,
    row_number() OVER (
      PARTITION BY request.company_id, request.employee_id, request.date_from, request.date_to
      ORDER BY
        CASE WHEN lower(request.status) = 'approved' THEN 0 ELSE 1 END,
        request.created_at,
        request.id
    ) AS duplicate_rank
  FROM public.leave_requests AS request
  WHERE lower(request.status) IN ('pending', 'approved')
)
UPDATE public.leave_requests AS request
SET
  status = 'rejected',
  rejected_reason = coalesce(
    nullif(request.rejected_reason, ''),
    'Automatically rejected because another active leave request covers the same dates.'
  ),
  updated_at = now()
FROM ranked_active_requests AS ranked
WHERE ranked.id = request.id
  AND ranked.duplicate_rank > 1;

CREATE OR REPLACE FUNCTION public.prevent_overlapping_active_leave_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF lower(coalesce(NEW.status, 'pending')) NOT IN ('pending', 'approved') THEN
    RETURN NEW;
  END IF;

  -- Serialize checks for the same tenant employee so concurrent submissions
  -- cannot both pass the overlap test before either transaction commits.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.company_id::text || ':' || NEW.employee_id::text, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.leave_requests AS existing
    WHERE existing.company_id = NEW.company_id
      AND existing.employee_id = NEW.employee_id
      AND existing.id <> NEW.id
      AND lower(coalesce(existing.status, '')) IN ('pending', 'approved')
      AND existing.date_from <= NEW.date_to
      AND existing.date_to >= NEW.date_from
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'An overlapping pending or approved leave request already exists.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_overlapping_active_leave_requests() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.leave_requests'::regclass
      AND tgname = 'prevent_overlapping_active_leave_requests'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER prevent_overlapping_active_leave_requests
      BEFORE INSERT OR UPDATE OF company_id, employee_id, date_from, date_to, status
      ON public.leave_requests
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_overlapping_active_leave_requests();
  END IF;
END;
$$;

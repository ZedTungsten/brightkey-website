-- Generate collision-safe employee numbers explicitly for server-side onboarding.
CREATE SEQUENCE IF NOT EXISTS public.employee_counter_seq START WITH 1;

CREATE OR REPLACE FUNCTION public.next_company_employee_number(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  employee_prefix TEXT;
  candidate TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Company not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT upper(regexp_replace(COALESCE(value ->> 'employee_prefix', 'BK'), '[^A-Za-z0-9]', '', 'g'))
    INTO employee_prefix
  FROM public.global_settings
  WHERE company_id = p_company_id AND key = 'hr_configuration'
  LIMIT 1;
  employee_prefix := left(COALESCE(NULLIF(employee_prefix, ''), 'BK'), 8);

  LOOP
    candidate := employee_prefix || '-' || lpad(nextval('public.employee_counter_seq')::TEXT, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.employees WHERE employee_number = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.next_company_employee_number(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_company_employee_number(UUID) TO service_role;

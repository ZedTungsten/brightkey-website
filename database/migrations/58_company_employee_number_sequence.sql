-- Continue each company's configured employee-number series during onboarding.
CREATE OR REPLACE FUNCTION public.next_company_employee_number(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  employee_prefix TEXT;
  next_suffix BIGINT;
  candidate TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Company not found' USING ERRCODE = 'P0002';
  END IF;

  -- Serialize number generation per company so concurrent registrations cannot
  -- calculate the same next suffix.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::TEXT, 0));

  SELECT upper(regexp_replace(COALESCE(value ->> 'employee_prefix', 'BK'), '[^A-Za-z0-9]', '', 'g'))
    INTO employee_prefix
  FROM public.global_settings
  WHERE company_id = p_company_id AND key = 'hr_config'
  LIMIT 1;
  employee_prefix := left(COALESCE(NULLIF(employee_prefix, ''), 'BK'), 3);

  SELECT COALESCE(MAX((regexp_match(employee_number, '^[A-Za-z0-9]+-([0-9]+)$'))[1]::BIGINT), 0) + 1
    INTO next_suffix
  FROM public.employees
  WHERE company_id = p_company_id
    AND employee_number ~ ('^' || employee_prefix || '-[0-9]+$');

  LOOP
    candidate := employee_prefix || '-' || lpad(next_suffix::TEXT, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.employees WHERE employee_number = candidate
    );
    next_suffix := next_suffix + 1;
  END LOOP;

  RETURN candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.next_company_employee_number(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_company_employee_number(UUID) TO service_role;

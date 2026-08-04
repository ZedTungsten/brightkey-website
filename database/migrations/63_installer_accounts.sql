-- =============================================================================
-- Tenant-scoped SmartLock Calendar installer access codes and login tracking.
-- These access codes are separate from Supabase dashboard user passwords.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.installer_accounts (
  employee_id UUID PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  password VARCHAR(10) NOT NULL CHECK (char_length(password) BETWEEN 4 AND 10),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, employee_id)
);

ALTER TABLE public.installer_accounts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_installer_accounts_company
  ON public.installer_accounts (company_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_installer_accounts_company_password
  ON public.installer_accounts (company_id, lower(password));

DROP POLICY IF EXISTS "Operations members can view installer accounts" ON public.installer_accounts;
CREATE POLICY "Operations members can view installer accounts"
  ON public.installer_accounts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.companies company
      JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
      WHERE company.id = installer_accounts.company_id
        AND member.user_id = (SELECT auth.uid())
        AND (
          lower(coalesce(member.role, '')) IN ('owner', 'admin')
          OR EXISTS (
            SELECT 1
            FROM unnest(coalesce(member.accessible_modules, ARRAY[]::TEXT[])) module
            WHERE split_part(lower(trim(module)), ':', 1) = 'operations'
          )
        )
    )
  );

DROP POLICY IF EXISTS "Operations members can manage installer accounts" ON public.installer_accounts;
CREATE POLICY "Operations members can manage installer accounts"
  ON public.installer_accounts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.companies company
      JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
      WHERE company.id = installer_accounts.company_id
        AND member.user_id = (SELECT auth.uid())
        AND (
          lower(coalesce(member.role, '')) IN ('owner', 'admin')
          OR EXISTS (
            SELECT 1
            FROM unnest(coalesce(member.accessible_modules, ARRAY[]::TEXT[])) module
            WHERE split_part(lower(trim(module)), ':', 1) = 'operations'
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.companies company
      JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
      WHERE company.id = installer_accounts.company_id
        AND member.user_id = (SELECT auth.uid())
        AND (
          lower(coalesce(member.role, '')) IN ('owner', 'admin')
          OR EXISTS (
            SELECT 1
            FROM unnest(coalesce(member.accessible_modules, ARRAY[]::TEXT[])) module
            WHERE split_part(lower(trim(module)), ':', 1) = 'operations'
          )
        )
    )
  );

INSERT INTO public.installer_accounts (employee_id, company_id, password)
SELECT
  employee.id,
  employee.company_id,
  left(
    lower(
      left(trim(coalesce(employee.first_name, '')), 1)
      || left(trim(coalesce(employee.last_name, '')), 1)
      || right(
        coalesce(
          nullif(regexp_replace(coalesce(employee.emergency_contact_number, ''), '[^0-9]', '', 'g'), ''),
          nullif(regexp_replace(coalesce(employee.employee_number, ''), '[^0-9]', '', 'g'), ''),
          '0000'
        ),
        4
      )
    ),
    10
  )
FROM public.employees employee
WHERE employee.company_id IS NOT NULL
  AND (
    lower(coalesce(employee.assignment, '')) ~ '(^|,\s*)installers?(\s*,|$)'
    OR lower(coalesce(employee.title, '')) LIKE '%installer%'
  )
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_installer_session(p_password TEXT)
RETURNS TABLE (
  session_token UUID,
  id UUID,
  first_name TEXT,
  last_name TEXT,
  contact_number TEXT,
  company_id UUID,
  assignment TEXT,
  email TEXT,
  department TEXT,
  title TEXT,
  employment_status TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_employee public.employees%ROWTYPE;
  new_token UUID;
BEGIN
  SELECT employee.*
  INTO matched_employee
  FROM public.employees employee
  JOIN public.installer_accounts account
    ON account.employee_id = employee.id
   AND account.company_id = employee.company_id
  WHERE lower(coalesce(employee.employment_status, '')) = 'active'
    AND (
      lower(coalesce(employee.assignment, '')) ~ '(^|,\s*)installers?(\s*,|$)'
      OR lower(coalesce(employee.title, '')) LIKE '%installer%'
    )
    AND lower(trim(account.password)) = lower(trim(p_password))
  LIMIT 1;

  IF matched_employee.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.installer_accounts
  SET last_login_at = now(), updated_at = now()
  WHERE employee_id = matched_employee.id
    AND company_id = matched_employee.company_id;

  DELETE FROM public.installer_sessions
  WHERE expires_at <= now()
     OR employee_id = matched_employee.id;

  INSERT INTO public.installer_sessions (employee_id, company_id)
  VALUES (matched_employee.id, matched_employee.company_id)
  RETURNING token INTO new_token;

  RETURN QUERY SELECT
    new_token,
    matched_employee.id,
    matched_employee.first_name::TEXT,
    matched_employee.last_name::TEXT,
    matched_employee.contact_number::TEXT,
    matched_employee.company_id,
    matched_employee.assignment::TEXT,
    matched_employee.email::TEXT,
    matched_employee.department::TEXT,
    matched_employee.title::TEXT,
    matched_employee.employment_status::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_installer_session(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_installer_session(TEXT) TO anon;

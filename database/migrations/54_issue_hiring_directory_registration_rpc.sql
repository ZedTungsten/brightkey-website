-- Allow an authenticated HR user to issue a one-time registration token without
-- granting direct access to the private token table.
CREATE OR REPLACE FUNCTION public.issue_hiring_directory_registration(
  p_company_id UUID,
  p_application_id UUID,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  v_role TEXT;
  v_modules JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_token_hash IS NULL OR length(p_token_hash) <> 64 THEN
    RAISE EXCEPTION 'Invalid registration token hash' USING ERRCODE = '22023';
  END IF;

  IF p_expires_at <= NOW() OR p_expires_at > NOW() + INTERVAL '8 days' THEN
    RAISE EXCEPTION 'Invalid registration expiry' USING ERRCODE = '22023';
  END IF;

  SELECT c.tenant_id, lower(tm.role), to_jsonb(tm.accessible_modules)
    INTO v_tenant_id, v_role, v_modules
  FROM public.companies c
  JOIN public.tenant_members tm
    ON tm.tenant_id = c.tenant_id
   AND tm.user_id = auth.uid()
  WHERE c.id = p_company_id;

  IF v_tenant_id IS NULL OR NOT (
    v_role IN ('owner', 'admin', 'hr')
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(v_modules, '[]'::jsonb)) module_name
      WHERE lower(trim(module_name)) = 'hr'
    )
  ) THEN
    RAISE EXCEPTION 'HR access required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.job_applications ja
    WHERE ja.id = p_application_id
      AND ja.company_id = p_company_id
      AND ja.status = 'approved'
      AND ja.hired_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The hired application was not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.hiring_directory_registrations (
    company_id, application_id, token_hash, expires_at, used_at
  ) VALUES (
    p_company_id, p_application_id, p_token_hash, p_expires_at, NULL
  )
  ON CONFLICT (application_id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    token_hash = EXCLUDED.token_hash,
    expires_at = EXCLUDED.expires_at,
    used_at = NULL,
    created_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.issue_hiring_directory_registration(UUID, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_hiring_directory_registration(UUID, UUID, TEXT, TIMESTAMPTZ) FROM anon;
GRANT EXECUTE ON FUNCTION public.issue_hiring_directory_registration(UUID, UUID, TEXT, TIMESTAMPTZ) TO authenticated;

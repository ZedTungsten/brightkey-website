-- Free-signup tenant owners are authoritative through tenants.owner_email and
-- do not require a duplicate tenant_members row. Team write authorization must
-- use the shared tenant-admin helper so those owners can create milestones.

CREATE OR REPLACE FUNCTION public.is_team_leader(
  p_user_id UUID,
  p_company_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tenant_id UUID;
  v_structure JSONB;
  v_is_leader BOOLEAN := FALSE;
BEGIN
  SELECT company.tenant_id
  INTO v_tenant_id
  FROM public.companies company
  WHERE company.id = p_company_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.is_tenant_admin(p_user_id, v_tenant_id) THEN
    RETURN TRUE;
  END IF;

  SELECT setting.value
  INTO v_structure
  FROM public.global_settings setting
  WHERE setting.key = 'company_structure'
    AND setting.company_id = p_company_id
  LIMIT 1;

  IF v_structure IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(v_structure->'departments') AS department("managerId" TEXT)
    WHERE department."managerId" = p_user_id::TEXT
  )
  INTO v_is_leader;

  IF v_is_leader THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(v_structure->'departments') AS department(subteams JSONB),
         jsonb_to_recordset(department.subteams) AS subteam("managerId" TEXT)
    WHERE subteam."managerId" = p_user_id::TEXT
  )
  INTO v_is_leader;

  RETURN v_is_leader;
END;
$$;

REVOKE ALL ON FUNCTION public.is_team_leader(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_leader(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.is_team_leader(UUID, UUID) IS
  'Returns true for authoritative tenant owners/admins or managers configured in the company structure.';

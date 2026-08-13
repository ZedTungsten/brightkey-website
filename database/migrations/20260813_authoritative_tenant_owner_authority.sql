-- Tenant ownership is authoritative in tenants.owner_email. Core authorization
-- helpers must grant the owner full authority without requiring a duplicate
-- tenant_members row.

CREATE OR REPLACE FUNCTION public.get_user_tenants(usr_id uuid)
RETURNS TABLE (tenant_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT member.tenant_id
  FROM public.tenant_members member
  WHERE member.user_id = usr_id
  UNION
  SELECT tenant.id
  FROM public.tenants tenant
  JOIN auth.users account ON account.id = usr_id
  WHERE lower(tenant.owner_email) = lower(account.email);
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(usr_id uuid, t_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.tenants tenant
      JOIN auth.users account ON account.id = usr_id
      WHERE tenant.id = t_id
        AND lower(tenant.owner_email) = lower(account.email)
    )
    OR EXISTS (
      SELECT 1
      FROM public.tenant_members member
      WHERE member.user_id = usr_id
        AND member.tenant_id = t_id
        AND lower(coalesce(member.role, '')) IN ('owner', 'admin', 'tenant owner')
    );
$$;

CREATE OR REPLACE FUNCTION public.has_module_access(
  p_user_id uuid,
  p_company_id uuid,
  p_module text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tenant_id uuid;
  v_role text;
  v_modules text[];
BEGIN
  SELECT company.tenant_id INTO v_tenant_id
  FROM public.companies company
  WHERE company.id = p_company_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN RETURN false; END IF;
  IF public.is_tenant_admin(p_user_id, v_tenant_id) THEN RETURN true; END IF;

  SELECT member.role, member.accessible_modules INTO v_role, v_modules
  FROM public.tenant_members member
  WHERE member.user_id = p_user_id
    AND member.tenant_id = v_tenant_id
  LIMIT 1;

  IF lower(coalesce(v_role, '')) IN ('owner', 'admin', 'tenant owner') THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1
    FROM unnest(coalesce(v_modules, ARRAY[]::text[])) AS module_row(module_name)
    WHERE lower(trim(module_name)) = lower(trim(p_module))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_tenants(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_tenant_admin(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_module_access(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_tenants(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_module_access(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_platform_tenant(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_email TEXT;
BEGIN
  IF LOWER(COALESCE(auth.jwt() ->> 'email', '')) <> 'johnzeustaller@gmail.com' THEN
    RAISE EXCEPTION 'Platform owner access required' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant is required' USING ERRCODE = '22004';
  END IF;

  SELECT owner_email INTO v_owner_email
  FROM public.tenants
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant was not found' USING ERRCODE = 'P0002';
  END IF;

  -- Protect the platform owner's active workspace while still allowing an
  -- unlinked duplicate/orphan tenant record to be removed.
  IF EXISTS (
    SELECT 1
    FROM public.tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
  ) OR (
    LOWER(TRIM(v_owner_email)) = 'johnzeustaller@gmail.com'
    AND EXISTS (SELECT 1 FROM public.companies WHERE tenant_id = p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'The tenant containing your active platform-owner account cannot be deleted.'
      USING ERRCODE = '42501';
  END IF;

  -- These rows otherwise retain a null tenant through ON DELETE SET NULL and
  -- would continue blocking the email from subscribing again.
  DELETE FROM public.subscription_requests
  WHERE tenant_id = p_tenant_id
     OR company_id IN (
       SELECT id FROM public.companies WHERE tenant_id = p_tenant_id
     );

  DELETE FROM public.tenants WHERE id = p_tenant_id;

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'owner_email', v_owner_email,
    'deleted', TRUE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_platform_tenant(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_platform_tenant(UUID) TO authenticated;

COMMENT ON FUNCTION public.delete_platform_tenant(UUID) IS
  'Allows only the BrightKey platform owner to delete a tenant by ID while protecting the platform owner active workspace.';

-- Ensure upload permissions follow assigned module access for every tenant
-- member, not only privileged roles. Module names are matched case-insensitively
-- to mirror the dashboard route gate.
--
-- NON-DESTRUCTIVE: this migration changes only a helper function and Storage
-- authorization policies. It does not delete or rewrite tables, rows, buckets,
-- or stored objects. The transaction ensures any failure restores every prior
-- function/policy definition.
BEGIN;

CREATE OR REPLACE FUNCTION public.has_module_access(
  p_user_id    UUID,
  p_company_id UUID,
  p_module     TEXT
)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_role      TEXT;
  v_modules   TEXT[];
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.companies
  WHERE id = p_company_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role, accessible_modules INTO v_role, v_modules
  FROM public.tenant_members
  WHERE user_id = p_user_id
    AND tenant_id = v_tenant_id
  LIMIT 1;

  IF v_role IS NULL AND v_modules IS NULL THEN
    RETURN FALSE;
  END IF;

  IF lower(COALESCE(v_role, '')) IN ('owner', 'admin') THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM unnest(COALESCE(v_modules, ARRAY[]::TEXT[])) AS module_row(module_name)
    WHERE lower(trim(module_name)) = lower(trim(p_module))
  );
END;
$$;

-- Remove the older bucket-wide policies. PostgreSQL combines permissive
-- policies with OR, so leaving these in place would bypass tenant isolation.
DROP POLICY IF EXISTS "Auth upload brightkey-assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete brightkey-assets" ON storage.objects;

-- Reassert company-scoped Storage policies for all authenticated tenant
-- members, including users whose access is provided only through modules.
DROP POLICY IF EXISTS "Tenant upload to brightkey-assets" ON storage.objects;
CREATE POLICY "Tenant upload to brightkey-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'brightkey-assets'
    AND (storage.foldername(name))[1] = 'companies'
    AND (storage.foldername(name))[2] IN (
      SELECT c.id::TEXT
      FROM public.companies c
      JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tenant delete from brightkey-assets" ON storage.objects;
CREATE POLICY "Tenant delete from brightkey-assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'brightkey-assets'
    AND (storage.foldername(name))[1] = 'companies'
    AND (storage.foldername(name))[2] IN (
      SELECT c.id::TEXT
      FROM public.companies c
      JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

COMMIT;

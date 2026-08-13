-- Tenant ownership is authoritative in tenants.owner_email. Owners must retain
-- access even when no duplicate tenant_members row exists.

CREATE OR REPLACE FUNCTION public.is_tenant_owner(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants tenant
    WHERE tenant.id = target_tenant_id
      AND lower(tenant.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

REVOKE ALL ON FUNCTION public.is_tenant_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_owner(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_company_owner(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies company
    JOIN public.tenants tenant ON tenant.id = company.tenant_id
    WHERE company.id = target_company_id
      AND lower(tenant.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

REVOKE ALL ON FUNCTION public.is_company_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_company_owner(uuid) TO authenticated;

DO $$
DECLARE
  target record;
  policy_name text;
  owner_expression text;
BEGIN
  FOR target IN
    SELECT
      table_schema,
      table_name,
      bool_or(column_name = 'tenant_id') AS has_tenant_id,
      bool_or(column_name = 'company_id') AS has_company_id
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('tenant_id', 'company_id')
      AND table_name IN (
        SELECT class.relname
        FROM pg_class class
        JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
        WHERE namespace.nspname = 'public'
          AND class.relkind = 'r'
          AND class.relrowsecurity
      )
    GROUP BY table_schema, table_name
  LOOP
    policy_name := 'Tenant owner access ' || substr(md5(target.table_name), 1, 12);
    owner_expression := CASE
      WHEN target.has_tenant_id AND target.has_company_id
        THEN '(public.is_tenant_owner(tenant_id) OR public.is_company_owner(company_id))'
      WHEN target.has_tenant_id
        THEN 'public.is_tenant_owner(tenant_id)'
      ELSE 'public.is_company_owner(company_id)'
    END;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = target.table_schema
        AND tablename = target.table_name
        AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
        policy_name,
        target.table_schema,
        target.table_name,
        owner_expression,
        owner_expression
      );
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenants'
      AND policyname = 'Owners can access their tenant profile'
  ) THEN
    CREATE POLICY "Owners can access their tenant profile"
      ON public.tenants
      FOR ALL
      TO authenticated
      USING (lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
      WITH CHECK (lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', '')));
  END IF;
END $$;

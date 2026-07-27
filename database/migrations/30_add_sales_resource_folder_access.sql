-- Module-based access controls for Resources folders and their descendants.
ALTER TABLE public.sales_resources
  ADD COLUMN IF NOT EXISTS restricted_access BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allowed_modules TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_resources_allowed_modules_valid'
      AND conrelid = 'public.sales_resources'::regclass
  ) THEN
    ALTER TABLE public.sales_resources
      ADD CONSTRAINT sales_resources_allowed_modules_valid
      CHECK (
        (
          restricted_access = FALSE
          AND cardinality(allowed_modules) = 0
        )
        OR (
          restricted_access = TRUE
          AND type = 'folder'
          AND file_url IS NULL
          AND cardinality(allowed_modules) > 0
          AND allowed_modules <@ ARRAY[
            'Business', 'Products', 'Operations', 'Marketing', 'Sales',
            'Customer Service', 'Logistics', 'HR', 'Finance'
          ]::TEXT[]
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sales_resources_company_parent_idx
  ON public.sales_resources (company_id, parent_id);

CREATE OR REPLACE FUNCTION public.can_access_sales_resource(
  p_user_id UUID,
  p_resource_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_role TEXT;
  v_modules TEXT[];
BEGIN
  SELECT company_id
  INTO v_company_id
  FROM public.sales_resources
  WHERE id = p_resource_id;

  IF v_company_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT tm.role, COALESCE(tm.accessible_modules, ARRAY[]::TEXT[])
  INTO v_role, v_modules
  FROM public.companies c
  JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
  WHERE c.id = v_company_id
    AND tm.user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF lower(v_role) IN ('owner', 'admin') THEN
    RETURN TRUE;
  END IF;

  RETURN NOT EXISTS (
    WITH RECURSIVE resource_chain AS (
      SELECT id, parent_id, type, file_url, restricted_access, allowed_modules
      FROM public.sales_resources
      WHERE id = p_resource_id
        AND company_id = v_company_id

      UNION

      SELECT related.id, related.parent_id, related.type, related.file_url,
        related.restricted_access, related.allowed_modules
      FROM public.sales_resources related
      JOIN resource_chain child
        ON related.id = child.parent_id
        OR (
          child.type = 'folder'
          AND child.file_url ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND related.id = child.file_url::UUID
        )
      WHERE related.company_id = v_company_id
    )
    SELECT 1
    FROM resource_chain resource
    WHERE resource.restricted_access
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(resource.allowed_modules) allowed(module_name)
        JOIN unnest(v_modules) member(module_name)
          ON lower(trim(member.module_name)) = lower(trim(allowed.module_name))
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_sales_resource_access_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.restricted_access OR cardinality(NEW.allowed_modules) > 0 THEN
      SELECT tenant_id INTO v_tenant_id FROM public.companies WHERE id = NEW.company_id;
      IF NOT public.is_tenant_admin(auth.uid(), v_tenant_id) THEN
        RAISE EXCEPTION 'Only owners and administrators can set folder access';
      END IF;
    END IF;
  ELSIF NEW.restricted_access IS DISTINCT FROM OLD.restricted_access
    OR NEW.allowed_modules IS DISTINCT FROM OLD.allowed_modules THEN
    SELECT tenant_id INTO v_tenant_id FROM public.companies WHERE id = NEW.company_id;
    IF NOT public.is_tenant_admin(auth.uid(), v_tenant_id) THEN
      RAISE EXCEPTION 'Only owners and administrators can change folder access';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'sales_resources_access_admin_only'
      AND tgrelid = 'public.sales_resources'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER sales_resources_access_admin_only
      BEFORE INSERT OR UPDATE OF restricted_access, allowed_modules
      ON public.sales_resources
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_sales_resource_access_admin();
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.can_access_sales_resource(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_sales_resource(UUID, UUID) TO authenticated;

ALTER POLICY "Allow company members select sales_resources"
  ON public.sales_resources
  USING (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = (SELECT auth.uid())
    )
    AND public.can_access_sales_resource((SELECT auth.uid()), id)
  );

ALTER POLICY "Allow company members write sales_resources"
  ON public.sales_resources
  USING (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = (SELECT auth.uid())
    )
    AND public.can_access_sales_resource((SELECT auth.uid()), id)
  )
  WITH CHECK (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = (SELECT auth.uid())
    )
    AND (
      parent_id IS NULL
      OR public.can_access_sales_resource((SELECT auth.uid()), parent_id)
    )
  );

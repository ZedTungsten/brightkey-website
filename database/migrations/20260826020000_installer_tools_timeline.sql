-- Tenant-scoped installer tool issuance, lifecycle history, and atomic stock updates.

CREATE TABLE IF NOT EXISTS public.installer_tool_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL,
  product_title TEXT NOT NULL,
  product_image_url TEXT,
  issued_on DATE NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'issued' CHECK (lifecycle_status IN (
    'issued', 'returned', 'lost', 'damaged', 'consumed', 'replaced', 'disposed', 'repaired'
  )),
  ended_on DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ended_on IS NULL OR ended_on >= issued_on)
);

CREATE TABLE IF NOT EXISTS public.installer_tool_issue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  issue_id UUID NOT NULL REFERENCES public.installer_tool_issues(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN (
    'issued', 'returned', 'lost', 'damaged', 'consumed', 'replaced', 'disposed', 'repaired'
  )),
  event_date DATE NOT NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.installer_tool_issues
  ADD COLUMN IF NOT EXISTS photo_proof_paths TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS installer_tool_issues_company_year_idx
  ON public.installer_tool_issues (company_id, issued_on, ended_on);
CREATE INDEX IF NOT EXISTS installer_tool_issues_company_employee_idx
  ON public.installer_tool_issues (company_id, employee_id, issued_on);
CREATE INDEX IF NOT EXISTS installer_tool_issue_events_issue_date_idx
  ON public.installer_tool_issue_events (issue_id, event_date, created_at);

ALTER TABLE public.installer_tool_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installer_tool_issue_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'installer_tool_issues'
      AND policyname = 'Company members can view installer tool issues'
  ) THEN
    CREATE POLICY "Company members can view installer tool issues"
      ON public.installer_tool_issues FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.companies company
        JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
        WHERE company.id = installer_tool_issues.company_id
          AND member.user_id = (SELECT auth.uid())
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'installer_tool_issue_events'
      AND policyname = 'Company members can view installer tool issue events'
  ) THEN
    CREATE POLICY "Company members can view installer tool issue events"
      ON public.installer_tool_issue_events FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.companies company
        JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
        WHERE company.id = installer_tool_issue_events.company_id
          AND member.user_id = (SELECT auth.uid())
      ));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.can_manage_installer_tools(p_company_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies company
    JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
    WHERE company.id = p_company_id
      AND member.user_id = p_user_id
      AND (
        LOWER(member.role) IN ('owner', 'admin')
        OR EXISTS (
          SELECT 1 FROM unnest(COALESCE(member.accessible_modules, ARRAY[]::TEXT[])) module_name
          WHERE LOWER(module_name) = 'operations'
        )
      )
  );
$$;

ALTER POLICY "Company members can view installer tool issues"
  ON public.installer_tool_issues
  USING (public.can_manage_installer_tools(company_id, (SELECT auth.uid())));
ALTER POLICY "Company members can view installer tool issue events"
  ON public.installer_tool_issue_events
  USING (public.can_manage_installer_tools(company_id, (SELECT auth.uid())));

DROP FUNCTION IF EXISTS public.issue_installer_tool(UUID, UUID, TEXT, DATE);
DROP FUNCTION IF EXISTS public.issue_installer_tool(UUID, UUID, UUID, TEXT, DATE);

CREATE OR REPLACE FUNCTION public.issue_installer_tool(
  p_company_id UUID,
  p_employee_id UUID,
  p_warehouse_id UUID,
  p_sku TEXT,
  p_issued_on DATE,
  p_photo_proof_paths TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor UUID := auth.uid();
  selected_product public.products%ROWTYPE;
  stock_row public.inventory%ROWTYPE;
  issue_id UUID := gen_random_uuid();
BEGIN
  IF actor IS NULL OR NOT public.can_manage_installer_tools(p_company_id, actor) THEN
    RAISE EXCEPTION 'You do not have permission to issue installer tools.' USING ERRCODE = '42501';
  END IF;
  IF p_issued_on IS NULL THEN
    RAISE EXCEPTION 'Select the date the tool was issued.' USING ERRCODE = '22004';
  END IF;
  IF COALESCE(cardinality(p_photo_proof_paths), 0) > 3 THEN
    RAISE EXCEPTION 'Attach no more than 3 photo proofs.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_photo_proof_paths, ARRAY[]::TEXT[])) proof_path
    WHERE proof_path IS NULL
      OR proof_path = ''
      OR proof_path NOT LIKE 'companies/' || p_company_id::TEXT || '/installer-tools/%'
  ) THEN
    RAISE EXCEPTION 'One or more photo proofs are invalid.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.employees employee
    WHERE employee.id = p_employee_id AND employee.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Select a valid installer.' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouses warehouse
    JOIN public.companies company ON company.tenant_id = warehouse.tenant_id
    WHERE warehouse.id = p_warehouse_id
      AND company.id = p_company_id
      AND warehouse.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Select a valid warehouse.' USING ERRCODE = '23503';
  END IF;

  SELECT * INTO selected_product
  FROM public.products product
  WHERE product.company_id = p_company_id
    AND UPPER(TRIM(product.sku)) = UPPER(TRIM(p_sku))
    AND product.count_inventory IS TRUE
    AND LOWER(TRIM(COALESCE(product.category, ''))) IN ('tools', 'supplies')
  LIMIT 1;
  IF selected_product.id IS NULL THEN
    RAISE EXCEPTION 'Select a valid inventory SKU.' USING ERRCODE = '23503';
  END IF;

  SELECT inventory_row.* INTO stock_row
  FROM public.inventory inventory_row
  JOIN public.warehouses warehouse ON warehouse.id = inventory_row.warehouse_id
  JOIN public.companies company ON company.tenant_id = warehouse.tenant_id
  WHERE inventory_row.company_id = p_company_id
    AND company.id = p_company_id
    AND inventory_row.warehouse_id = p_warehouse_id
    AND UPPER(TRIM(inventory_row.sku)) = UPPER(TRIM(selected_product.sku))
    AND inventory_row.available > 0
    AND warehouse.is_active IS TRUE
  FOR UPDATE OF inventory_row SKIP LOCKED
  LIMIT 1;
  IF stock_row.id IS NULL THEN
    RAISE EXCEPTION 'This SKU has no available inventory in the selected warehouse.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.inventory
  SET available = available - 1
  WHERE id = stock_row.id AND available > 0;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This SKU is no longer available. Refresh and try again.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.installer_tool_issues (
    id, company_id, employee_id, product_id, warehouse_id, sku,
    product_title, product_image_url, issued_on, photo_proof_paths, created_by
  ) VALUES (
    issue_id, p_company_id, p_employee_id, selected_product.id, stock_row.warehouse_id,
    selected_product.sku, selected_product.title, selected_product.image_main, p_issued_on,
    COALESCE(p_photo_proof_paths, ARRAY[]::TEXT[]), actor
  );

  INSERT INTO public.installer_tool_issue_events (
    company_id, issue_id, status, event_date, actor_user_id
  ) VALUES (p_company_id, issue_id, 'issued', p_issued_on, actor);

  RETURN issue_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_installer_tool_status(
  p_company_id UUID,
  p_issue_id UUID,
  p_status TEXT,
  p_event_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor UUID := auth.uid();
  normalized_status TEXT := LOWER(TRIM(p_status));
  tool_issue public.installer_tool_issues%ROWTYPE;
  is_terminal BOOLEAN;
BEGIN
  IF actor IS NULL OR NOT public.can_manage_installer_tools(p_company_id, actor) THEN
    RAISE EXCEPTION 'You do not have permission to update installer tools.' USING ERRCODE = '42501';
  END IF;
  IF normalized_status NOT IN ('returned', 'lost', 'damaged', 'consumed', 'replaced', 'disposed', 'repaired') THEN
    RAISE EXCEPTION 'Select a valid tool status.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO tool_issue
  FROM public.installer_tool_issues
  WHERE id = p_issue_id AND company_id = p_company_id
  FOR UPDATE;
  IF tool_issue.id IS NULL THEN
    RAISE EXCEPTION 'The issued tool could not be found.' USING ERRCODE = 'P0002';
  END IF;
  IF tool_issue.ended_on IS NOT NULL THEN
    RAISE EXCEPTION 'This tool issue has already ended.' USING ERRCODE = '23514';
  END IF;
  IF p_event_date IS NULL OR p_event_date < tool_issue.issued_on THEN
    RAISE EXCEPTION 'The status date cannot be before the issue date.' USING ERRCODE = '22008';
  END IF;

  is_terminal := normalized_status IN ('returned', 'lost', 'damaged', 'consumed', 'disposed');

  IF normalized_status = 'returned' THEN
    UPDATE public.inventory
    SET available = available + 1
    WHERE company_id = p_company_id
      AND warehouse_id = tool_issue.warehouse_id
      AND UPPER(TRIM(sku)) = UPPER(TRIM(tool_issue.sku));
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The original warehouse inventory row is unavailable.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  UPDATE public.installer_tool_issues
  SET lifecycle_status = normalized_status,
      ended_on = CASE WHEN is_terminal THEN p_event_date ELSE NULL END,
      updated_at = NOW()
  WHERE id = tool_issue.id;

  INSERT INTO public.installer_tool_issue_events (
    company_id, issue_id, status, event_date, actor_user_id
  ) VALUES (p_company_id, tool_issue.id, normalized_status, p_event_date, actor);

END;
$$;

CREATE OR REPLACE FUNCTION public.update_installer_tool_issue(
  p_company_id UUID,
  p_issue_id UUID,
  p_employee_id UUID,
  p_warehouse_id UUID,
  p_sku TEXT,
  p_issued_on DATE,
  p_photo_proof_paths TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor UUID := auth.uid();
  tool_issue public.installer_tool_issues%ROWTYPE;
  selected_product public.products%ROWTYPE;
  new_stock public.inventory%ROWTYPE;
  inventory_changed BOOLEAN;
BEGIN
  IF actor IS NULL OR NOT public.can_manage_installer_tools(p_company_id, actor) THEN
    RAISE EXCEPTION 'You do not have permission to edit installer tools.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO tool_issue
  FROM public.installer_tool_issues
  WHERE id = p_issue_id AND company_id = p_company_id
  FOR UPDATE;
  IF tool_issue.id IS NULL THEN
    RAISE EXCEPTION 'The issued tool could not be found.' USING ERRCODE = 'P0002';
  END IF;
  IF p_issued_on IS NULL THEN
    RAISE EXCEPTION 'Select the date the tool was issued.' USING ERRCODE = '22004';
  END IF;
  IF tool_issue.ended_on IS NOT NULL AND p_issued_on > tool_issue.ended_on THEN
    RAISE EXCEPTION 'The issue date cannot be after the ending status date.' USING ERRCODE = '22008';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.installer_tool_issue_events event
    WHERE event.issue_id = tool_issue.id
      AND event.status <> 'issued'
      AND event.event_date < p_issued_on
  ) THEN
    RAISE EXCEPTION 'The issue date cannot be after a recorded status date.' USING ERRCODE = '22008';
  END IF;
  IF COALESCE(cardinality(p_photo_proof_paths), 0) > 3 THEN
    RAISE EXCEPTION 'Attach no more than 3 photo proofs.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_photo_proof_paths, ARRAY[]::TEXT[])) proof_path
    WHERE proof_path IS NULL
      OR proof_path = ''
      OR proof_path NOT LIKE 'companies/' || p_company_id::TEXT || '/installer-tools/%'
  ) THEN
    RAISE EXCEPTION 'One or more photo proofs are invalid.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.employees employee
    WHERE employee.id = p_employee_id AND employee.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Select a valid installer.' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouses warehouse
    JOIN public.companies company ON company.tenant_id = warehouse.tenant_id
    WHERE warehouse.id = p_warehouse_id
      AND company.id = p_company_id
      AND warehouse.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Select a valid warehouse.' USING ERRCODE = '23503';
  END IF;

  SELECT * INTO selected_product
  FROM public.products product
  WHERE product.company_id = p_company_id
    AND UPPER(TRIM(product.sku)) = UPPER(TRIM(p_sku))
    AND product.count_inventory IS TRUE
    AND LOWER(TRIM(COALESCE(product.category, ''))) IN ('tools', 'supplies')
  LIMIT 1;
  IF selected_product.id IS NULL THEN
    RAISE EXCEPTION 'Select a valid inventory SKU.' USING ERRCODE = '23503';
  END IF;

  inventory_changed := tool_issue.ended_on IS NULL AND (
    tool_issue.warehouse_id IS DISTINCT FROM p_warehouse_id
    OR UPPER(TRIM(tool_issue.sku)) IS DISTINCT FROM UPPER(TRIM(selected_product.sku))
  );
  IF inventory_changed THEN
    UPDATE public.inventory
    SET available = available + 1
    WHERE company_id = p_company_id
      AND warehouse_id = tool_issue.warehouse_id
      AND UPPER(TRIM(sku)) = UPPER(TRIM(tool_issue.sku));
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The original warehouse inventory row is unavailable.' USING ERRCODE = 'P0002';
    END IF;

    SELECT inventory_row.* INTO new_stock
    FROM public.inventory inventory_row
    WHERE inventory_row.company_id = p_company_id
      AND inventory_row.warehouse_id = p_warehouse_id
      AND UPPER(TRIM(inventory_row.sku)) = UPPER(TRIM(selected_product.sku))
      AND inventory_row.available > 0
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
    IF new_stock.id IS NULL THEN
      RAISE EXCEPTION 'This SKU has no available inventory in the selected warehouse.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.inventory SET available = available - 1 WHERE id = new_stock.id AND available > 0;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'This SKU is no longer available. Refresh and try again.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.installer_tool_issues
  SET employee_id = p_employee_id,
      product_id = selected_product.id,
      warehouse_id = p_warehouse_id,
      sku = selected_product.sku,
      product_title = selected_product.title,
      product_image_url = selected_product.image_main,
      issued_on = p_issued_on,
      photo_proof_paths = COALESCE(p_photo_proof_paths, ARRAY[]::TEXT[]),
      updated_at = NOW()
  WHERE id = tool_issue.id;

  UPDATE public.installer_tool_issue_events
  SET event_date = p_issued_on
  WHERE issue_id = tool_issue.id AND status = 'issued';
END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_installer_tools(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_installer_tool(UUID, UUID, UUID, TEXT, DATE, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_installer_tool_issue(UUID, UUID, UUID, UUID, TEXT, DATE, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_installer_tool_status(UUID, UUID, TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_installer_tools(UUID, UUID) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_installer_tool(UUID, UUID, UUID, TEXT, DATE, TEXT[]) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.update_installer_tool_issue(UUID, UUID, UUID, UUID, TEXT, DATE, TEXT[]) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.update_installer_tool_status(UUID, UUID, TEXT, DATE) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_installer_tools(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_installer_tool(UUID, UUID, UUID, TEXT, DATE, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_installer_tool_issue(UUID, UUID, UUID, UUID, TEXT, DATE, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_installer_tool_status(UUID, UUID, TEXT, DATE) TO authenticated;
REVOKE ALL ON public.installer_tool_issues, public.installer_tool_issue_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.installer_tool_issues, public.installer_tool_issue_events FROM authenticated;
GRANT SELECT ON public.installer_tool_issues, public.installer_tool_issue_events TO authenticated;

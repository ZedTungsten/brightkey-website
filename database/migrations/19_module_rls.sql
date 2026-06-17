-- =============================================================================
-- Migration 19: Per-User Module Access RLS
-- =============================================================================
-- Replaces:
--   • Named role-based RLS ("any company staff") with has_module_access()
--   • dashboard_roles table (dropped — no more role presets)
-- Adds:
--   • tenant_members.accessible_modules TEXT[] — direct per-user module list
--   • has_module_access(user_id, company_id, module) SECURITY DEFINER function
-- =============================================================================

-- ── 0. Schema: add accessible_modules to tenant_members ──────────────────────
ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS accessible_modules TEXT[] DEFAULT '{}';

-- ── 1. Data migration: convert old named-role members to accessible_modules ──
--    Run before nullifying role so we can still read the current value.
UPDATE public.tenant_members SET accessible_modules = CASE
  WHEN lower(role) = 'hr'                THEN ARRAY['HR', 'Customer Service']
  WHEN lower(role) = 'accounting'        THEN ARRAY['Finance']
  WHEN lower(role) = 'operations'        THEN ARRAY['Operations']
  WHEN lower(role) = 'logistics'         THEN ARRAY['Products', 'Logistics']
  WHEN lower(role) = 'marketing'         THEN ARRAY['Products', 'Marketing', 'Customer Service']
  WHEN lower(role) = 'customer_service'  THEN ARRAY['Customer Service']
  WHEN lower(role) = 'products'          THEN ARRAY['Products']
  ELSE '{}'
END
WHERE lower(role) NOT IN ('owner', 'admin');

-- Normalise role for non-owner/admin members — the value is no longer semantic
UPDATE public.tenant_members
  SET role = NULL
  WHERE lower(role) NOT IN ('owner', 'admin');

-- ── 2. Drop dashboard_roles (no longer used for any enforcement) ──────────────
DROP TABLE IF EXISTS public.dashboard_roles CASCADE;

-- ── 3. Create has_module_access() helper ─────────────────────────────────────
--    Takes company_id (most sensitive tables use this column).
--    For tenant_id tables: pass (SELECT id FROM companies WHERE tenant_id = ... LIMIT 1).
CREATE OR REPLACE FUNCTION public.has_module_access(
  p_user_id    UUID,
  p_company_id UUID,
  p_module     TEXT
)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tenant_id UUID;
  v_role      TEXT;
  v_modules   TEXT[];
BEGIN
  -- Resolve tenant from company
  SELECT tenant_id INTO v_tenant_id
  FROM public.companies WHERE id = p_company_id LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN FALSE; END IF;

  -- Load user's membership
  SELECT role, accessible_modules INTO v_role, v_modules
  FROM public.tenant_members
  WHERE user_id = p_user_id AND tenant_id = v_tenant_id
  LIMIT 1;

  -- Not a member of this tenant
  IF v_role IS NULL AND v_modules IS NULL THEN RETURN FALSE; END IF;

  -- Owners and admins have full access to every module
  IF lower(v_role) IN ('owner', 'admin') THEN RETURN TRUE; END IF;

  -- Direct module check against per-user list
  RETURN p_module = ANY(COALESCE(v_modules, '{}'));
END;
$$;

COMMENT ON FUNCTION public.has_module_access IS
  'Returns TRUE if user has the given module in their accessible_modules list, '
  'or if their role is owner/admin. No dashboard_roles lookup — pure per-user list.';

-- ── 4. Finance module ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Company staff journal access"            ON public.general_journal;
DROP POLICY IF EXISTS "Finance module general_journal"          ON public.general_journal;
CREATE POLICY "Finance module general_journal" ON public.general_journal
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Finance'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Finance'));

DROP POLICY IF EXISTS "Company staff journal_accounts access"   ON public.journal_accounts;
DROP POLICY IF EXISTS "Finance module journal_accounts"         ON public.journal_accounts;
CREATE POLICY "Finance module journal_accounts" ON public.journal_accounts
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Finance'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Finance'));

DROP POLICY IF EXISTS "Company staff audit log access"          ON public.journal_audit_log;
DROP POLICY IF EXISTS "Finance module journal_audit_log"        ON public.journal_audit_log;
CREATE POLICY "Finance module journal_audit_log" ON public.journal_audit_log
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Finance'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Finance'));

-- bookkeeping_transaction_types: NULL company_id = system defaults; any Finance user can read
DROP POLICY IF EXISTS "Bookkeeping transaction types select"    ON public.bookkeeping_transaction_types;
DROP POLICY IF EXISTS "Bookkeeping transaction types insert"    ON public.bookkeeping_transaction_types;
DROP POLICY IF EXISTS "Bookkeeping transaction types update"    ON public.bookkeeping_transaction_types;
DROP POLICY IF EXISTS "Bookkeeping transaction types delete"    ON public.bookkeeping_transaction_types;
DROP POLICY IF EXISTS "Finance module bookkeeping_transaction_types" ON public.bookkeeping_transaction_types;
CREATE POLICY "Finance module bookkeeping_transaction_types" ON public.bookkeeping_transaction_types
  FOR ALL TO authenticated
  USING (
    company_id IS NULL  -- system-wide defaults readable by any Finance user
    OR public.has_module_access(auth.uid(), company_id, 'Finance')
  )
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Finance'));

-- bookkeeping_accounts: same NULL-company_id handling
DROP POLICY IF EXISTS "Bookkeeping accounts select"             ON public.bookkeeping_accounts;
DROP POLICY IF EXISTS "Bookkeeping accounts insert"             ON public.bookkeeping_accounts;
DROP POLICY IF EXISTS "Bookkeeping accounts update"             ON public.bookkeeping_accounts;
DROP POLICY IF EXISTS "Bookkeeping accounts delete"             ON public.bookkeeping_accounts;
DROP POLICY IF EXISTS "Finance module bookkeeping_accounts"     ON public.bookkeeping_accounts;
CREATE POLICY "Finance module bookkeeping_accounts" ON public.bookkeeping_accounts
  FOR ALL TO authenticated
  USING (
    company_id IS NULL
    OR public.has_module_access(auth.uid(), company_id, 'Finance')
  )
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Finance'));

DROP POLICY IF EXISTS "Bookkeeping access"                      ON public.bookkeeping;
DROP POLICY IF EXISTS "Finance module bookkeeping"              ON public.bookkeeping;
CREATE POLICY "Finance module bookkeeping" ON public.bookkeeping
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Finance'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Finance'));

-- bookkeeping_lines: no direct company_id — join through bookkeeping
DROP POLICY IF EXISTS "Bookkeeping lines access"                ON public.bookkeeping_lines;
DROP POLICY IF EXISTS "Finance module bookkeeping_lines"        ON public.bookkeeping_lines;
CREATE POLICY "Finance module bookkeeping_lines" ON public.bookkeeping_lines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookkeeping b
      WHERE b.id = bookkeeping_lines.bookkeeping_id
        AND public.has_module_access(auth.uid(), b.company_id, 'Finance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookkeeping b
      WHERE b.id = bookkeeping_lines.bookkeeping_id
        AND public.has_module_access(auth.uid(), b.company_id, 'Finance')
    )
  );

-- bookkeeping_attachments: same join pattern (was previously completely open!)
DROP POLICY IF EXISTS "Bookkeeping attachments access"          ON public.bookkeeping_attachments;
DROP POLICY IF EXISTS "Finance module bookkeeping_attachments"  ON public.bookkeeping_attachments;
CREATE POLICY "Finance module bookkeeping_attachments" ON public.bookkeeping_attachments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookkeeping b
      WHERE b.id = bookkeeping_attachments.bookkeeping_id
        AND public.has_module_access(auth.uid(), b.company_id, 'Finance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookkeeping b
      WHERE b.id = bookkeeping_attachments.bookkeeping_id
        AND public.has_module_access(auth.uid(), b.company_id, 'Finance')
    )
  );

-- ── 5. HR module ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Company staff employees access"          ON public.employees;
DROP POLICY IF EXISTS "HR module employees"                     ON public.employees;
CREATE POLICY "HR module employees" ON public.employees
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'HR'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'HR'));

DROP POLICY IF EXISTS "Company attendance logs access"          ON public.attendance_logs;
DROP POLICY IF EXISTS "HR module attendance_logs"               ON public.attendance_logs;
CREATE POLICY "HR module attendance_logs" ON public.attendance_logs
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'HR'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'HR'));

-- employee_update_requests uses tenant_id — resolve company via subquery.
-- Self-view policies from migration 10 are preserved; only staff management updated.
DROP POLICY IF EXISTS "HR/Admin/Owner can view all update requests for their tenant"  ON public.employee_update_requests;
DROP POLICY IF EXISTS "HR/Admin/Owner can manage update requests for their tenant"    ON public.employee_update_requests;
DROP POLICY IF EXISTS "HR module employee_update_requests read"   ON public.employee_update_requests;
DROP POLICY IF EXISTS "HR module employee_update_requests manage" ON public.employee_update_requests;
CREATE POLICY "HR module employee_update_requests read" ON public.employee_update_requests
  FOR SELECT TO authenticated
  USING (
    auth.uid() = employee_id   -- Employee can still view their own requests
    OR public.has_module_access(
      auth.uid(),
      (SELECT id FROM public.companies WHERE tenant_id = employee_update_requests.tenant_id LIMIT 1),
      'HR'
    )
  );
CREATE POLICY "HR module employee_update_requests manage" ON public.employee_update_requests
  FOR ALL TO authenticated
  USING (
    public.has_module_access(
      auth.uid(),
      (SELECT id FROM public.companies WHERE tenant_id = employee_update_requests.tenant_id LIMIT 1),
      'HR'
    )
  )
  WITH CHECK (
    public.has_module_access(
      auth.uid(),
      (SELECT id FROM public.companies WHERE tenant_id = employee_update_requests.tenant_id LIMIT 1),
      'HR'
    )
  );

-- ── 6. Operations module ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Company staff installations access"              ON public.installations;
DROP POLICY IF EXISTS "Operations module installations"                 ON public.installations;
CREATE POLICY "Operations module installations" ON public.installations
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Operations'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Operations'));

DROP POLICY IF EXISTS "Company staff installation bookings access"      ON public.installation_bookings;
DROP POLICY IF EXISTS "Operations module installation_bookings"         ON public.installation_bookings;
CREATE POLICY "Operations module installation_bookings" ON public.installation_bookings
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Operations'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Operations'));

-- inventory, inventory_logs, inventory_transactions: Operations OR Logistics
DROP POLICY IF EXISTS "Company staff inventory access"                  ON public.inventory;
DROP POLICY IF EXISTS "Operations module inventory"                     ON public.inventory;
CREATE POLICY "Operations or Logistics module inventory" ON public.inventory
  FOR ALL TO authenticated
  USING (
    public.has_module_access(auth.uid(), company_id, 'Operations')
    OR public.has_module_access(auth.uid(), company_id, 'Logistics')
  )
  WITH CHECK (
    public.has_module_access(auth.uid(), company_id, 'Operations')
    OR public.has_module_access(auth.uid(), company_id, 'Logistics')
  );

DROP POLICY IF EXISTS "Company staff inventory logs access"             ON public.inventory_logs;
DROP POLICY IF EXISTS "Operations module inventory_logs"                ON public.inventory_logs;
CREATE POLICY "Operations or Logistics module inventory_logs" ON public.inventory_logs
  FOR ALL TO authenticated
  USING (
    public.has_module_access(auth.uid(), company_id, 'Operations')
    OR public.has_module_access(auth.uid(), company_id, 'Logistics')
  )
  WITH CHECK (
    public.has_module_access(auth.uid(), company_id, 'Operations')
    OR public.has_module_access(auth.uid(), company_id, 'Logistics')
  );

DROP POLICY IF EXISTS "Company staff inventory transactions access"     ON public.inventory_transactions;
DROP POLICY IF EXISTS "Operations module inventory_transactions"        ON public.inventory_transactions;
CREATE POLICY "Operations or Logistics module inventory_transactions" ON public.inventory_transactions
  FOR ALL TO authenticated
  USING (
    public.has_module_access(auth.uid(), company_id, 'Operations')
    OR public.has_module_access(auth.uid(), company_id, 'Logistics')
  )
  WITH CHECK (
    public.has_module_access(auth.uid(), company_id, 'Operations')
    OR public.has_module_access(auth.uid(), company_id, 'Logistics')
  );

DROP POLICY IF EXISTS "Company team tasks access"                       ON public.team_tasks;
DROP POLICY IF EXISTS "Operations module team_tasks"                    ON public.team_tasks;
CREATE POLICY "Operations module team_tasks" ON public.team_tasks
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Operations'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Operations'));

DROP POLICY IF EXISTS "Company team milestones access"                  ON public.team_milestones;
DROP POLICY IF EXISTS "Operations module team_milestones"               ON public.team_milestones;
CREATE POLICY "Operations module team_milestones" ON public.team_milestones
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Operations'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Operations'));

-- ── 7. Customer Service module ────────────────────────────────────────────────
-- Public customer self-view/insert policies (from migration 04) are preserved.

DROP POLICY IF EXISTS "Company staff tickets access"                    ON public.support_tickets;
DROP POLICY IF EXISTS "Customer Service module support_tickets"         ON public.support_tickets;
CREATE POLICY "Customer Service module support_tickets" ON public.support_tickets
  FOR ALL TO authenticated
  USING (
    public.has_module_access(auth.uid(), company_id, 'Customer Service')
    OR public.has_module_access(auth.uid(), company_id, 'Operations')
  )
  WITH CHECK (
    public.has_module_access(auth.uid(), company_id, 'Customer Service')
    OR public.has_module_access(auth.uid(), company_id, 'Operations')
  );

DROP POLICY IF EXISTS "Company staff support messages access"           ON public.support_messages;
DROP POLICY IF EXISTS "Customer Service module support_messages"        ON public.support_messages;
CREATE POLICY "Customer Service module support_messages" ON public.support_messages
  FOR ALL TO authenticated
  USING (
    ticket_id IN (
      SELECT id FROM public.support_tickets st
      WHERE public.has_module_access(auth.uid(), st.company_id, 'Customer Service')
         OR public.has_module_access(auth.uid(), st.company_id, 'Operations')
    )
  )
  WITH CHECK (
    ticket_id IN (
      SELECT id FROM public.support_tickets st
      WHERE public.has_module_access(auth.uid(), st.company_id, 'Customer Service')
         OR public.has_module_access(auth.uid(), st.company_id, 'Operations')
    )
  );

-- ── 8. Logistics module ───────────────────────────────────────────────────────
-- warehouses uses tenant_id — resolve company via companies join.

DROP POLICY IF EXISTS "Tenant members can select warehouses"            ON public.warehouses;
DROP POLICY IF EXISTS "Owner/Admin can insert warehouses"               ON public.warehouses;
DROP POLICY IF EXISTS "Owner/Admin can update warehouses"               ON public.warehouses;
DROP POLICY IF EXISTS "Owner/Admin can delete warehouses"               ON public.warehouses;
DROP POLICY IF EXISTS "Logistics module warehouses"                     ON public.warehouses;
CREATE POLICY "Logistics module warehouses" ON public.warehouses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.tenant_id = warehouses.tenant_id
        AND public.has_module_access(auth.uid(), c.id, 'Logistics')
      LIMIT 1
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.tenant_id = warehouses.tenant_id
        AND public.has_module_access(auth.uid(), c.id, 'Logistics')
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Tenant members can select warehouse_managers"    ON public.warehouse_managers;
DROP POLICY IF EXISTS "Owner/Admin can insert warehouse_managers"       ON public.warehouse_managers;
DROP POLICY IF EXISTS "Owner/Admin can delete warehouse_managers"       ON public.warehouse_managers;
DROP POLICY IF EXISTS "Logistics module warehouse_managers"             ON public.warehouse_managers;
CREATE POLICY "Logistics module warehouse_managers" ON public.warehouse_managers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.warehouses w
      JOIN public.companies c ON c.tenant_id = w.tenant_id
      WHERE w.id = warehouse_managers.warehouse_id
        AND public.has_module_access(auth.uid(), c.id, 'Logistics')
      LIMIT 1
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.warehouses w
      JOIN public.companies c ON c.tenant_id = w.tenant_id
      WHERE w.id = warehouse_managers.warehouse_id
        AND public.has_module_access(auth.uid(), c.id, 'Logistics')
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Company members can access warehouse_transfers"  ON public.warehouse_transfers;
DROP POLICY IF EXISTS "Logistics module warehouse_transfers"            ON public.warehouse_transfers;
CREATE POLICY "Logistics module warehouse_transfers" ON public.warehouse_transfers
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Logistics'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Logistics'));

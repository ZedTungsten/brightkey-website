-- =============================================================================
-- Restore coworker visibility for authenticated users within the same tenant.
-- This supports profiles, chat, schedules, assignments, and performance views
-- without restoring anonymous or cross-tenant employee access.
-- =============================================================================

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employees'
      AND policyname = 'Tenant members can view company employees'
  ) THEN
    CREATE POLICY "Tenant members can view company employees"
      ON public.employees
      FOR SELECT
      TO authenticated
      USING (
        company_id IN (
          SELECT company.id
          FROM public.companies company
          JOIN public.tenant_members member
            ON member.tenant_id = company.tenant_id
          WHERE member.user_id = (SELECT auth.uid())
        )
      );
  END IF;
END;
$$;

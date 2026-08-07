-- Allow users assigned to AR/AP to read the tenant's booking transactions.
-- Booking mutations remain restricted to the existing Operations policy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'installation_bookings'
      AND policyname = 'AR AP can read company booking transactions'
  ) THEN
    CREATE POLICY "AR AP can read company booking transactions"
      ON public.installation_bookings
      FOR SELECT
      TO authenticated
      USING (
        public.has_module_access(
          (SELECT auth.uid()),
          company_id,
          'Finance'
        )
        OR public.has_module_access(
          (SELECT auth.uid()),
          company_id,
          'Finance:Receivables'
        )
      );
  END IF;
END
$$;

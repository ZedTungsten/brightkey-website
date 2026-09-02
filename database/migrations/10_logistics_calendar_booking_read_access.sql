-- Logistics Calendar reads pickup dates from installation bookings. Grant the
-- Logistics module tenant-scoped read access without broadening write access.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'installation_bookings'
      AND policyname = 'Logistics can read company installation bookings'
  ) THEN
    CREATE POLICY "Logistics can read company installation bookings"
      ON public.installation_bookings
      FOR SELECT
      TO authenticated
      USING (
        public.has_module_access(
          (SELECT auth.uid()),
          company_id,
          'Logistics'
        )
      );
  END IF;
END $$;

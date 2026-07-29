-- Allow signed-in HR users to generate short-lived links for application files.
-- Files remain private and company-scoped through their storage path.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'HR can read company job application files'
  ) THEN
    CREATE POLICY "HR can read company job application files"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'brightkey-internal'
        AND name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/job-applications/'
        AND public.has_module_access(
          (SELECT auth.uid()),
          ((storage.foldername(name))[2])::UUID,
          'HR'
        )
      );
  END IF;
END
$$;

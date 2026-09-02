-- Editable posting image projects. Media remains in company-scoped Storage;
-- Postgres stores only the bounded layer/setup manifest.
ALTER TABLE public.posting_image_canvases
  ADD COLUMN IF NOT EXISTS project_data JSONB;

ALTER TABLE public.posting_image_canvases
  DROP CONSTRAINT IF EXISTS posting_image_canvases_project_data_size;

ALTER TABLE public.posting_image_canvases
  ADD CONSTRAINT posting_image_canvases_project_data_size
  CHECK (project_data IS NULL OR octet_length(project_data::text) <= 262144);

GRANT UPDATE ON public.posting_image_canvases TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'posting_image_canvases'
      AND policyname = 'Company members can update posting canvases'
  ) THEN
    CREATE POLICY "Company members can update posting canvases"
      ON public.posting_image_canvases FOR UPDATE TO authenticated
      USING (company_id IN (
        SELECT company.id FROM public.companies AS company
        JOIN public.tenant_members AS member ON member.tenant_id = company.tenant_id
        WHERE member.user_id = (SELECT auth.uid())
      ))
      WITH CHECK (company_id IN (
        SELECT company.id FROM public.companies AS company
        JOIN public.tenant_members AS member ON member.tenant_id = company.tenant_id
        WHERE member.user_id = (SELECT auth.uid())
      ));
  END IF;
END
$$;

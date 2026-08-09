CREATE TABLE IF NOT EXISTS public.installer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  content_html TEXT NOT NULL CHECK (char_length(content_html) BETWEEN 1 AND 100000),
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.installer_notes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_installer_notes_company_updated
  ON public.installer_notes (company_id, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'installer_notes' AND policyname = 'Company members can read installer notes'
  ) THEN
    CREATE POLICY "Company members can read installer notes" ON public.installer_notes
      FOR SELECT USING (
        company_id IN (
          SELECT company.id
          FROM public.companies AS company
          JOIN public.tenant_members AS member ON member.tenant_id = company.tenant_id
          WHERE member.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'installer_notes' AND policyname = 'Company members can create installer notes'
  ) THEN
    CREATE POLICY "Company members can create installer notes" ON public.installer_notes
      FOR INSERT WITH CHECK (
        company_id IN (
          SELECT company.id
          FROM public.companies AS company
          JOIN public.tenant_members AS member ON member.tenant_id = company.tenant_id
          WHERE member.user_id = auth.uid()
        )
        AND created_by = auth.uid()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'installer_notes' AND policyname = 'Company members can update installer notes'
  ) THEN
    CREATE POLICY "Company members can update installer notes" ON public.installer_notes
      FOR UPDATE USING (
        company_id IN (
          SELECT company.id
          FROM public.companies AS company
          JOIN public.tenant_members AS member ON member.tenant_id = company.tenant_id
          WHERE member.user_id = auth.uid()
        )
      ) WITH CHECK (
        company_id IN (
          SELECT company.id
          FROM public.companies AS company
          JOIN public.tenant_members AS member ON member.tenant_id = company.tenant_id
          WHERE member.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'installer_notes' AND policyname = 'Company members can delete installer notes'
  ) THEN
    CREATE POLICY "Company members can delete installer notes" ON public.installer_notes
      FOR DELETE USING (
        company_id IN (
          SELECT company.id
          FROM public.companies AS company
          JOIN public.tenant_members AS member ON member.tenant_id = company.tenant_id
          WHERE member.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

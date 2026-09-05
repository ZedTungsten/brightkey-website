CREATE TABLE IF NOT EXISTS public.qa_component_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_name text NOT NULL CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 120),
  parts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(parts) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, file_name)
);

CREATE INDEX IF NOT EXISTS qa_component_groups_company_file_name_idx
  ON public.qa_component_groups (company_id, file_name);

ALTER TABLE public.qa_component_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qa_component_groups FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.qa_component_groups TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'qa_component_groups'
      AND policyname = 'Logistics can read QA component groups'
  ) THEN
    CREATE POLICY "Logistics can read QA component groups"
      ON public.qa_component_groups FOR SELECT TO authenticated
      USING (public.has_module_access((SELECT auth.uid()), company_id, 'Logistics'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'qa_component_groups'
      AND policyname = 'Logistics can create QA component groups'
  ) THEN
    CREATE POLICY "Logistics can create QA component groups"
      ON public.qa_component_groups FOR INSERT TO authenticated
      WITH CHECK (public.has_module_access((SELECT auth.uid()), company_id, 'Logistics'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'qa_component_groups'
      AND policyname = 'Logistics can update QA component groups'
  ) THEN
    CREATE POLICY "Logistics can update QA component groups"
      ON public.qa_component_groups FOR UPDATE TO authenticated
      USING (public.has_module_access((SELECT auth.uid()), company_id, 'Logistics'))
      WITH CHECK (public.has_module_access((SELECT auth.uid()), company_id, 'Logistics'));
  END IF;
END $$;

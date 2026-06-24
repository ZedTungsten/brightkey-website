-- Create QA Guides table
CREATE TABLE IF NOT EXISTS public.qa_guides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  product_id   UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL UNIQUE,
  general_notes TEXT,
  parts        JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of { image_url: text, quantity: integer, notes: text }
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_qa_guides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_qa_guides_updated_at
  BEFORE UPDATE ON public.qa_guides
  FOR EACH ROW EXECUTE FUNCTION update_qa_guides_updated_at();

-- Enable Row Level Security
ALTER TABLE public.qa_guides ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY "Allow company members to view qa_guides" ON public.qa_guides
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members to manage qa_guides" ON public.qa_guides
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- 24_add_sales_resources_table.sql
-- Create table for managing shared brochures, doc scripts, and slides folder hierarchy for company resources.

CREATE TABLE IF NOT EXISTS public.sales_resources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('folder', 'file')),
  file_url     TEXT, -- Direct upload or Google Drive Link
  file_type    TEXT, -- 'doc', 'slide', 'sheet', 'pdf', 'png', 'jpg', 'music', 'video' or 'folder'
  parent_id    UUID REFERENCES public.sales_resources(id) ON DELETE CASCADE,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing for fast folder traversal
CREATE INDEX IF NOT EXISTS idx_sales_resources_company ON public.sales_resources(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_resources_parent ON public.sales_resources(parent_id);

-- Enable RLS
ALTER TABLE public.sales_resources ENABLE ROW LEVEL SECURITY;

-- Enable SELECT/ALL policy based on company member role gating
CREATE POLICY "Allow company members select sales_resources" ON public.sales_resources
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members write sales_resources" ON public.sales_resources
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

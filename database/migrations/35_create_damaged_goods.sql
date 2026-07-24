CREATE TABLE IF NOT EXISTS public.damaged_goods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL,
  damage_description TEXT NOT NULL CHECK (char_length(trim(damage_description)) > 0),
  photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  video_url TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT damaged_goods_photo_urls_array CHECK (jsonb_typeof(photo_urls) = 'array'),
  CONSTRAINT damaged_goods_photo_limit CHECK (jsonb_array_length(photo_urls) <= 5)
);

CREATE INDEX IF NOT EXISTS damaged_goods_company_created_idx
  ON public.damaged_goods(company_id, created_at DESC);

ALTER TABLE public.damaged_goods ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'damaged_goods'
      AND policyname = 'Company members can read damaged goods'
  ) THEN
    CREATE POLICY "Company members can read damaged goods"
      ON public.damaged_goods FOR SELECT
      USING (
        company_id IN (
          SELECT c.id
          FROM public.companies c
          JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'damaged_goods'
      AND policyname = 'Company members can create damaged goods'
  ) THEN
    CREATE POLICY "Company members can create damaged goods"
      ON public.damaged_goods FOR INSERT
      WITH CHECK (
        company_id IN (
          SELECT c.id
          FROM public.companies c
          JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
          WHERE tm.user_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1
          FROM public.products p
          WHERE p.id = damaged_goods.product_id
            AND p.company_id = damaged_goods.company_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'damaged_goods'
      AND policyname = 'Company members can update damaged goods'
  ) THEN
    CREATE POLICY "Company members can update damaged goods"
      ON public.damaged_goods FOR UPDATE
      USING (
        company_id IN (
          SELECT c.id
          FROM public.companies c
          JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT c.id
          FROM public.companies c
          JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
          WHERE tm.user_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1
          FROM public.products p
          WHERE p.id = damaged_goods.product_id
            AND p.company_id = damaged_goods.company_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'damaged_goods'
      AND policyname = 'Company members can delete damaged goods'
  ) THEN
    CREATE POLICY "Company members can delete damaged goods"
      ON public.damaged_goods FOR DELETE
      USING (
        company_id IN (
          SELECT c.id
          FROM public.companies c
          JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

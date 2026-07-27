-- =============================================================================
-- Sales CRM customer profiles.
-- Non-destructive and rerunnable: no existing records or tables are removed.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.crm_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  social_handle TEXT,
  email TEXT,
  contact_number TEXT,
  address TEXT,
  document_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  source TEXT,
  assigned_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  objections TEXT[] NOT NULL DEFAULT '{}'::text[],
  recommendation_skus TEXT[] NOT NULL DEFAULT '{}'::text[],
  stage TEXT NOT NULL DEFAULT 'Inquiry',
  door_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  door_rating TEXT,
  last_customer_response_date DATE,
  followup_date DATE,
  purchase_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  additional_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  less_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  purchase_total INTEGER NOT NULL DEFAULT 0,
  deposit_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  receipt_ar_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  full_payment_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  lifetime_value INTEGER NOT NULL DEFAULT 0,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_customers_source_check CHECK (
    source IS NULL OR source IN (
      'Facebook Ads', 'Facebook Organic', 'Facebook Group',
      'Affiliate', 'Referral', 'Instagram'
    )
  ),
  CONSTRAINT crm_customers_stage_check CHECK (
    stage IN (
      'Inquiry', 'Assessment', 'Downpayment', 'Scheduled',
      'Installed', 'Rescheduled', 'Cancelled'
    )
  ),
  CONSTRAINT crm_customers_door_rating_check CHECK (
    door_rating IS NULL OR door_rating IN ('Regular', 'Difficult')
  ),
  CONSTRAINT crm_customers_purchase_total_check CHECK (purchase_total >= 0),
  CONSTRAINT crm_customers_lifetime_value_check CHECK (lifetime_value >= 0),
  CONSTRAINT crm_customers_document_urls_array_check CHECK (jsonb_typeof(document_urls) = 'array'),
  CONSTRAINT crm_customers_door_images_array_check CHECK (
    jsonb_typeof(door_image_urls) = 'array' AND jsonb_array_length(door_image_urls) <= 5
  ),
  CONSTRAINT crm_customers_deposit_images_array_check CHECK (jsonb_typeof(deposit_image_urls) = 'array'),
  CONSTRAINT crm_customers_receipt_ar_array_check CHECK (jsonb_typeof(receipt_ar_urls) = 'array'),
  CONSTRAINT crm_customers_full_payment_array_check CHECK (jsonb_typeof(full_payment_image_urls) = 'array')
);

ALTER TABLE public.crm_customers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_crm_customers_company_updated
  ON public.crm_customers(company_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_customers_company_stage
  ON public.crm_customers(company_id, stage);

CREATE INDEX IF NOT EXISTS idx_crm_customers_company_assignee
  ON public.crm_customers(company_id, assigned_employee_id);

CREATE OR REPLACE FUNCTION public.set_crm_customer_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_customers_updated_at ON public.crm_customers;
CREATE TRIGGER trg_crm_customers_updated_at
  BEFORE UPDATE ON public.crm_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_crm_customer_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_customers'
      AND policyname = 'Tenant members can view CRM customers'
  ) THEN
    CREATE POLICY "Tenant members can view CRM customers"
      ON public.crm_customers
      FOR SELECT
      TO authenticated
      USING (
        company_id IN (
          SELECT company.id
          FROM public.companies company
          JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
          WHERE member.user_id = (SELECT auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_customers'
      AND policyname = 'Sales members can create CRM customers'
  ) THEN
    CREATE POLICY "Sales members can create CRM customers"
      ON public.crm_customers
      FOR INSERT
      TO authenticated
      WITH CHECK (
        company_id IN (
          SELECT company.id
          FROM public.companies company
          JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
          WHERE member.user_id = (SELECT auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_customers'
      AND policyname = 'Sales members can update CRM customers'
  ) THEN
    CREATE POLICY "Sales members can update CRM customers"
      ON public.crm_customers
      FOR UPDATE
      TO authenticated
      USING (
        company_id IN (
          SELECT company.id
          FROM public.companies company
          JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
          WHERE member.user_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT company.id
          FROM public.companies company
          JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
          WHERE member.user_id = (SELECT auth.uid())
        )
      );
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.crm_customers TO authenticated;

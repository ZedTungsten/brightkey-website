-- Consolidated Database Migration: 05_marketing_and_sales.sql
-- Generated on 2026-08-06T15:24:48.294Z


-- =========================================================================
-- SOURCE FILE: 05_marketing_and_events.sql
-- =========================================================================

-- =============================================================================
-- BrightKey Consolidated Marketing & Events Migration (05_marketing_and_events.sql)
-- Consolidates marketing audiences, campaigns, templates, coupons, marketing logs,
-- sales resources, company events, event attendees, Meta Messenger, and functions.
-- All operations are safe and non-destructive.
-- =============================================================================

-- ── 1. Marketing Audiences & Contacts Tables ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_audience (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  email               TEXT UNIQUE NOT NULL,
  source              TEXT NOT NULL DEFAULT 'promo_popup',
  first_name          TEXT,
  last_name           TEXT,
  phone               TEXT,
  country             TEXT DEFAULT 'Philippines',
  address             TEXT,
  city                TEXT,
  zip_code            TEXT,
  audience            TEXT DEFAULT 'Customer',
  value               TEXT,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_marketing_audiences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_marketing_audience_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  audience_id   UUID REFERENCES public.email_marketing_audiences(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'promo_popup',
  first_name    TEXT,
  last_name     TEXT,
  phone         TEXT,
  city          TEXT,
  address       TEXT,
  zip_code      TEXT,
  country       TEXT DEFAULT 'Philippines',
  is_subscribed BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_audience_email UNIQUE (audience_id, email)
);

CREATE TABLE IF NOT EXISTS public.email_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name                TEXT NOT NULL,
  subject             TEXT NOT NULL,
  body_html           TEXT NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.coupons (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  code                TEXT NOT NULL,
  discount_type       TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value      INTEGER NOT NULL, -- percentage or centavos
  min_spend           INTEGER DEFAULT 0,
  max_discount        INTEGER,
  usage_limit         INTEGER,
  usage_count         INTEGER DEFAULT 0,
  is_active           BOOLEAN DEFAULT TRUE,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_coupon_code UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS public.marketing_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  action              TEXT NOT NULL,
  details             JSONB DEFAULT '{}'::JSONB,
  performed_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Sales Resources Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_resources (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  title               TEXT NOT NULL,
  category            TEXT,
  file_url            TEXT NOT NULL,
  file_size_bytes     BIGINT,
  thumbnail_url       TEXT,
  tags                TEXT[] DEFAULT '{}',
  uploaded_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sales_resources
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- ── 3. Company Events & Attendees Tables ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  event_type          TEXT DEFAULT 'general',
  start_time          TIMESTAMPTZ NOT NULL,
  end_time            TIMESTAMPTZ NOT NULL,
  location            TEXT,
  meeting_link        TEXT,
  organizer_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_all_day          BOOLEAN DEFAULT FALSE,
  color               TEXT DEFAULT '#06b6d4',
  target_departments  TEXT[] DEFAULT '{}',
  target_roles        TEXT[] DEFAULT '{}',
  recurrence_pattern  TEXT DEFAULT 'none',
  recurrence_interval INTEGER DEFAULT 1,
  recurrence_end_date DATE,
  recurring_source_id UUID REFERENCES public.company_events(id) ON DELETE SET NULL,
  send_email_invite   BOOLEAN DEFAULT FALSE,
  email_subject       TEXT,
  email_body_template TEXT,
  scheduled_email_at  TIMESTAMPTZ,
  email_status        TEXT DEFAULT 'draft',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.company_events
  ADD COLUMN IF NOT EXISTS target_departments TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_roles TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recurrence_pattern TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE,
  ADD COLUMN IF NOT EXISTS recurring_source_id UUID REFERENCES public.company_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS send_email_invite BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_subject TEXT,
  ADD COLUMN IF NOT EXISTS email_body_template TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_email_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_status TEXT DEFAULT 'draft';

CREATE TABLE IF NOT EXISTS public.company_event_attendees (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID REFERENCES public.company_events(id) ON DELETE CASCADE NOT NULL,
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  employee_id         UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  full_name           TEXT,
  rsvp_status         TEXT DEFAULT 'pending' CHECK (rsvp_status IN ('pending', 'accepted', 'declined', 'tentative')),
  opened_at           TIMESTAMPTZ,
  responded_via       TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.company_event_attendees
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS responded_via TEXT;

-- ── 4. Meta Messenger Tables ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meta_conversations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  sender_psid         TEXT NOT NULL,
  page_id             TEXT NOT NULL,
  customer_name       TEXT,
  customer_profile_pic TEXT,
  last_message        TEXT,
  last_message_at     TIMESTAMPTZ DEFAULT NOW(),
  unread_count        INTEGER DEFAULT 0,
  assigned_to         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_sender_page UNIQUE (company_id, sender_psid, page_id)
);

CREATE TABLE IF NOT EXISTS public.meta_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID REFERENCES public.meta_conversations(id) ON DELETE CASCADE NOT NULL,
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  mid                 TEXT UNIQUE,
  sender_type         TEXT NOT NULL CHECK (sender_type IN ('customer', 'agent', 'bot')),
  message_text        TEXT,
  attachments         JSONB DEFAULT '[]'::JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. Functions & Triggers ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_company_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_company_events_updated_at_trg ON public.company_events;
CREATE TRIGGER set_company_events_updated_at_trg
  BEFORE UPDATE ON public.company_events
  FOR EACH ROW EXECUTE FUNCTION public.set_company_events_updated_at();

CREATE OR REPLACE FUNCTION public.set_company_event_attendees_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_company_event_attendees_updated_at_trg ON public.company_event_attendees;
CREATE TRIGGER set_company_event_attendees_updated_at_trg
  BEFORE UPDATE ON public.company_event_attendees
  FOR EACH ROW EXECUTE FUNCTION public.set_company_event_attendees_updated_at();


-- =========================================================================
-- SOURCE FILE: 28_create_sales_crm_customers.sql
-- =========================================================================

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


-- =========================================================================
-- SOURCE FILE: 29_add_sales_resource_folder_codes.sql
-- =========================================================================

-- Shareable, tenant-protected URLs for native Resources folders.
ALTER TABLE public.sales_resources
  ADD COLUMN IF NOT EXISTS folder_code TEXT;

CREATE OR REPLACE FUNCTION public.generate_resource_folder_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  alphabet CONSTANT TEXT := '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';
  result TEXT := '';
  random_bytes BYTEA := gen_random_bytes(14);
  i INTEGER;
BEGIN
  FOR i IN 0..13 LOOP
    result := result || substr(alphabet, (get_byte(random_bytes, i) % length(alphabet)) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

DO $$
DECLARE
  folder RECORD;
  candidate TEXT;
BEGIN
  FOR folder IN
    SELECT id
    FROM public.sales_resources
    WHERE type = 'folder'
      AND file_url IS NULL
      AND folder_code IS NULL
  LOOP
    LOOP
      candidate := public.generate_resource_folder_code();
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.sales_resources WHERE folder_code = candidate
      );
    END LOOP;

    UPDATE public.sales_resources
    SET folder_code = candidate
    WHERE id = folder.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sales_resources_folder_code_unique
  ON public.sales_resources (folder_code)
  WHERE folder_code IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_resources_folder_code_format'
      AND conrelid = 'public.sales_resources'::regclass
  ) THEN
    ALTER TABLE public.sales_resources
      ADD CONSTRAINT sales_resources_folder_code_format
      CHECK (
        folder_code IS NULL
        OR (
          type = 'folder'
          AND file_url IS NULL
          AND folder_code ~ '^[A-Za-z0-9_-]{14}$'
        )
      );
  END IF;
END $$;


-- =========================================================================
-- SOURCE FILE: 30_add_sales_resource_folder_access.sql
-- =========================================================================

-- Module-based access controls for Resources folders and their descendants.
ALTER TABLE public.sales_resources
  ADD COLUMN IF NOT EXISTS restricted_access BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allowed_modules TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_resources_allowed_modules_valid'
      AND conrelid = 'public.sales_resources'::regclass
  ) THEN
    ALTER TABLE public.sales_resources
      ADD CONSTRAINT sales_resources_allowed_modules_valid
      CHECK (
        (
          restricted_access = FALSE
          AND cardinality(allowed_modules) = 0
        )
        OR (
          restricted_access = TRUE
          AND type = 'folder'
          AND file_url IS NULL
          AND cardinality(allowed_modules) > 0
          AND allowed_modules <@ ARRAY[
            'Business', 'Products', 'Operations', 'Marketing', 'Sales',
            'Customer Service', 'Logistics', 'HR', 'Finance'
          ]::TEXT[]
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sales_resources_company_parent_idx
  ON public.sales_resources (company_id, parent_id);

CREATE OR REPLACE FUNCTION public.can_access_sales_resource(
  p_user_id UUID,
  p_resource_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_role TEXT;
  v_modules TEXT[];
BEGIN
  SELECT company_id
  INTO v_company_id
  FROM public.sales_resources
  WHERE id = p_resource_id;

  IF v_company_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT tm.role, COALESCE(tm.accessible_modules, ARRAY[]::TEXT[])
  INTO v_role, v_modules
  FROM public.companies c
  JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
  WHERE c.id = v_company_id
    AND tm.user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF lower(v_role) IN ('owner', 'admin') THEN
    RETURN TRUE;
  END IF;

  RETURN NOT EXISTS (
    WITH RECURSIVE resource_chain AS (
      SELECT id, parent_id, type, file_url, restricted_access, allowed_modules
      FROM public.sales_resources
      WHERE id = p_resource_id
        AND company_id = v_company_id

      UNION

      SELECT related.id, related.parent_id, related.type, related.file_url,
        related.restricted_access, related.allowed_modules
      FROM public.sales_resources related
      JOIN resource_chain child
        ON related.id = child.parent_id
        OR related.id = (
          CASE
            WHEN child.type = 'folder'
              AND child.file_url ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN child.file_url::UUID
            ELSE NULL
          END
        )
      WHERE related.company_id = v_company_id
    )
    SELECT 1
    FROM resource_chain resource
    WHERE resource.restricted_access
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(resource.allowed_modules) allowed(module_name)
        JOIN unnest(v_modules) member(module_name)
          ON lower(trim(member.module_name)) = lower(trim(allowed.module_name))
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_sales_resource_access_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.restricted_access OR cardinality(NEW.allowed_modules) > 0 THEN
      SELECT tenant_id INTO v_tenant_id FROM public.companies WHERE id = NEW.company_id;
      IF NOT public.is_tenant_admin(auth.uid(), v_tenant_id) THEN
        RAISE EXCEPTION 'Only owners and administrators can set folder access';
      END IF;
    END IF;
  ELSIF NEW.restricted_access IS DISTINCT FROM OLD.restricted_access
    OR NEW.allowed_modules IS DISTINCT FROM OLD.allowed_modules THEN
    SELECT tenant_id INTO v_tenant_id FROM public.companies WHERE id = NEW.company_id;
    IF NOT public.is_tenant_admin(auth.uid(), v_tenant_id) THEN
      RAISE EXCEPTION 'Only owners and administrators can change folder access';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'sales_resources_access_admin_only'
      AND tgrelid = 'public.sales_resources'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER sales_resources_access_admin_only
      BEFORE INSERT OR UPDATE OF restricted_access, allowed_modules
      ON public.sales_resources
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_sales_resource_access_admin();
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.can_access_sales_resource(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_sales_resource(UUID, UUID) TO authenticated;

ALTER POLICY "Allow company members select sales_resources"
  ON public.sales_resources
  USING (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = (SELECT auth.uid())
    )
    AND public.can_access_sales_resource((SELECT auth.uid()), id)
  );

ALTER POLICY "Allow company members write sales_resources"
  ON public.sales_resources
  USING (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = (SELECT auth.uid())
    )
    AND public.can_access_sales_resource((SELECT auth.uid()), id)
  )
  WITH CHECK (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = (SELECT auth.uid())
    )
    AND (
      parent_id IS NULL
      OR public.can_access_sales_resource((SELECT auth.uid()), parent_id)
    )
  );


-- =========================================================================
-- SOURCE FILE: 31_add_sales_resource_folder_colors.sql
-- =========================================================================

-- Optional pastel color selection for Resources folders.
ALTER TABLE public.sales_resources
  ADD COLUMN IF NOT EXISTS folder_color TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_resources_folder_color_valid'
      AND conrelid = 'public.sales_resources'::regclass
  ) THEN
    ALTER TABLE public.sales_resources
      ADD CONSTRAINT sales_resources_folder_color_valid
      CHECK (
        folder_color IS NULL
        OR (
          type = 'folder'
          AND folder_color IN (
            'cyan', 'blue', 'lavender', 'rose',
            'peach', 'yellow', 'mint', 'gray'
          )
        )
      );
  END IF;
END $$;

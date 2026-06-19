-- =============================================================================
-- BrightKey Consolidated Core and Tenancy Schema (01_core_and_tenancy.sql)
-- Consolidates tenants, companies, tenant members, customer profiles,
-- integrations, tenant businesses/features, and RBAC module functions.
-- =============================================================================

DROP TABLE IF EXISTS public.company_invitations CASCADE;
DROP TABLE IF EXISTS public.tenant_members CASCADE;
DROP TABLE IF EXISTS public.companies CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;
DROP TABLE IF EXISTS public.customer_profiles CASCADE;
DROP TABLE IF EXISTS public.tenant_businesses CASCADE;
DROP TABLE IF EXISTS public.business_features CASCADE;
DROP TABLE IF EXISTS public.company_integrations CASCADE;

-- ── 1. Tenants Table ──────────────────────────────────────────────────────────
CREATE TABLE public.tenants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email       TEXT NOT NULL,
  storage_limit_mb  INTEGER NOT NULL DEFAULT 5120, -- default 5 GB
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 2. Companies Table ────────────────────────────────────────────────────────
CREATE TABLE public.companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  subdomain   TEXT UNIQUE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 3. Tenant Members Table ──────────────────────────────────────────────────
CREATE TABLE public.tenant_members (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  user_id            UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role               TEXT, -- NULL for staff, 'owner' or 'admin' for executives
  accessible_modules TEXT[] DEFAULT '{}',
  user_email         TEXT,
  full_name          TEXT,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_user_tenant UNIQUE (user_id, tenant_id)
);

-- ── 4. Company Invitations Table ──────────────────────────────────────────────
CREATE TABLE public.company_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  email       TEXT NOT NULL,
  full_name   TEXT,
  role        TEXT,
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_email_tenant UNIQUE (email, tenant_id)
);

-- ── 5. Customer Profiles Table ────────────────────────────────────────────────
CREATE TABLE public.customer_profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  full_name           TEXT,
  is_affiliate        BOOLEAN DEFAULT FALSE,
  affiliate_code      TEXT UNIQUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. Tenant Businesses Table ────────────────────────────────────────────────
CREATE TABLE public.tenant_businesses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL, -- e.g. 'Smart Lock', 'CCTV'
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_company_business UNIQUE (company_id, name)
);

-- ── 7. Business Features Table ─────────────────────────────────────────────────
CREATE TABLE public.business_features (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.tenant_businesses(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL, -- e.g. 'pin_unlock'
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_business_feature UNIQUE (business_id, name)
);

-- ── 8. Company Integrations Table ─────────────────────────────────────────────
CREATE TABLE public.company_integrations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  paymongo_public_key  TEXT,
  paymongo_secret_key  TEXT,
  stripe_public_key    TEXT,
  stripe_secret_key    TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 9. Helper Functions & Views ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_tenants(usr_id UUID)
RETURNS TABLE (tenant_id UUID) SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = usr_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(usr_id UUID, t_id UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.tenant_members 
    WHERE user_id = usr_id AND tenant_id = t_id AND role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.has_module_access(
  p_user_id    UUID,
  p_company_id UUID,
  p_module     TEXT
)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tenant_id UUID;
  v_role      TEXT;
  v_modules   TEXT[];
END;
$$;

-- Pre-define a shell function for has_module_access which we override below
CREATE OR REPLACE FUNCTION public.has_module_access(
  p_user_id    UUID,
  p_company_id UUID,
  p_module     TEXT
)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tenant_id UUID;
  v_role      TEXT;
  v_modules   TEXT[];
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.companies WHERE id = p_company_id LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN FALSE; END IF;

  SELECT role, accessible_modules INTO v_role, v_modules
  FROM public.tenant_members
  WHERE user_id = p_user_id AND tenant_id = v_tenant_id
  LIMIT 1;

  IF v_role IS NULL AND v_modules IS NULL THEN RETURN FALSE; END IF;
  IF lower(v_role) IN ('owner', 'admin') THEN RETURN TRUE; END IF;
  RETURN p_module = ANY(COALESCE(v_modules, '{}'));
END;
$$;

CREATE OR REPLACE VIEW public.view_public_integrations AS
SELECT 
  company_id, 
  (paymongo_public_key IS NOT NULL AND paymongo_secret_key IS NOT NULL) AS paymongo_configured, 
  (stripe_public_key IS NOT NULL AND stripe_secret_key IS NOT NULL) AS stripe_configured,
  paymongo_public_key,
  stripe_public_key
FROM public.company_integrations;

GRANT SELECT ON public.view_public_integrations TO anon, authenticated;

-- ── 10. Automatic Column Syncing Trigger ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_features_columns_fn()
RETURNS TRIGGER AS $$
DECLARE
  v_biz_name TEXT;
  v_table_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT name INTO v_biz_name FROM public.tenant_businesses WHERE id = NEW.business_id;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT name INTO v_biz_name FROM public.tenant_businesses WHERE id = OLD.business_id;
  END IF;

  CASE v_biz_name
    WHEN 'Smart Lock' THEN v_table_name := 'smartlock_features';
    WHEN 'Solar Power' THEN v_table_name := 'solarpower_features';
    WHEN 'CCTV' THEN v_table_name := 'cctv_features';
    WHEN 'Fire Extinguisher' THEN v_table_name := 'fireextinguisher_features';
    ELSE RETURN NULL;
  END CASE;

  IF TG_OP = 'INSERT' THEN
    EXECUTE 'ALTER TABLE public.' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS ' || quote_ident(NEW.name) || ' TEXT DEFAULT NULL';
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.name NOT IN ('id', 'product_id', 'created_at') THEN
      EXECUTE 'ALTER TABLE public.' || quote_ident(v_table_name) || ' DROP COLUMN IF EXISTS ' || quote_ident(OLD.name);
    END IF;
  END IF;

  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in sync_features_columns_fn: %', SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER sync_features_columns_trg
AFTER INSERT OR DELETE ON public.business_features
FOR EACH ROW EXECUTE FUNCTION public.sync_features_columns_fn();

-- ── 11. Row Level Security Policies ───────────────────────────────────────────

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_integrations ENABLE ROW LEVEL SECURITY;

-- Tenants Policies
CREATE POLICY "Allow user to select their own tenants" ON public.tenants
  FOR SELECT USING (
    id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Allow owner update own tenant" ON public.tenants
  FOR UPDATE USING (
    id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Companies Policies
CREATE POLICY "Allow users to view authorized companies" ON public.companies
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Allow tenant members write access to companies" ON public.companies
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

-- Tenant Members Policies
CREATE POLICY "Allow members select membership" ON public.tenant_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR
    tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
  );

CREATE POLICY "Allow admins manage membership" ON public.tenant_members
  FOR ALL USING (
    public.is_tenant_admin(auth.uid(), tenant_id)
  );

-- Company Invitations Policies
CREATE POLICY "Allow tenant admin select invitations" ON public.company_invitations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.tenant_id = company_invitations.tenant_id
        AND tm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Allow tenant admin insert invitations" ON public.company_invitations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.tenant_id = company_invitations.tenant_id
        AND tm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Allow tenant admin delete invitations" ON public.company_invitations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.tenant_id = company_invitations.tenant_id
        AND tm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Allow user to read their invitations" ON public.company_invitations
  FOR SELECT USING (
    email = auth.email()
  );

-- Customer Profiles Policies
CREATE POLICY "Customers can view own profile." ON public.customer_profiles
  FOR SELECT USING (
    auth.uid() = id
  );

-- Tenant Businesses Policies
CREATE POLICY "Allow select tenant_businesses" ON public.tenant_businesses
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      WHERE c.tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Allow manage tenant_businesses" ON public.tenant_businesses
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      WHERE c.tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Business Features Policies
CREATE POLICY "Allow select business_features" ON public.business_features
  FOR SELECT USING (
    business_id IN (
      SELECT tb.id FROM public.tenant_businesses tb
      JOIN public.companies c ON tb.company_id = c.id
      WHERE c.tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Allow manage business_features" ON public.business_features
  FOR ALL USING (
    business_id IN (
      SELECT tb.id FROM public.tenant_businesses tb
      JOIN public.companies c ON tb.company_id = c.id
      WHERE c.tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Integrations Policies
CREATE POLICY "Allow company members read integrations" ON public.company_integrations
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      WHERE c.tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Allow company members write integrations" ON public.company_integrations
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      WHERE c.tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- ── 12. Storage Buckets & Policies ──────────────────────────────────────────

-- Private internal bucket creation
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brightkey-internal',
  'brightkey-internal',
  false,       -- PRIVATE: no public read, requires signed URLs
  104857600,   -- 100 MB per file
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS for brightkey-internal uploads
DROP POLICY IF EXISTS "Tenant upload to brightkey-internal" ON storage.objects;
CREATE POLICY "Tenant upload to brightkey-internal"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'brightkey-internal'
    AND (storage.foldername(name))[1] = 'companies'
    AND (storage.foldername(name))[2] IN (
      SELECT c.id::text FROM public.companies c
      WHERE c.tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- RLS for brightkey-internal selects (generating signed URLs)
DROP POLICY IF EXISTS "Tenant read own files from brightkey-internal" ON storage.objects;
CREATE POLICY "Tenant read own files from brightkey-internal"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'brightkey-internal'
    AND (storage.foldername(name))[1] = 'companies'
    AND (storage.foldername(name))[2] IN (
      SELECT c.id::text FROM public.companies c
      WHERE c.tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- RLS for brightkey-internal deletes
DROP POLICY IF EXISTS "Tenant delete from brightkey-internal" ON storage.objects;
CREATE POLICY "Tenant delete from brightkey-internal"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'brightkey-internal'
    AND (storage.foldername(name))[1] = 'companies'
    AND (storage.foldername(name))[2] IN (
      SELECT c.id::text FROM public.companies c
      WHERE c.tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- RLS for brightkey-assets uploads scoped to own company
DROP POLICY IF EXISTS "Tenant upload to brightkey-assets" ON storage.objects;
CREATE POLICY "Tenant upload to brightkey-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'brightkey-assets'
    AND (storage.foldername(name))[1] = 'companies'
    AND (storage.foldername(name))[2] IN (
      SELECT c.id::text FROM public.companies c
      WHERE c.tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- RLS for brightkey-assets deletes scoped to own company
DROP POLICY IF EXISTS "Tenant delete from brightkey-assets" ON storage.objects;
CREATE POLICY "Tenant delete from brightkey-assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'brightkey-assets'
    AND (storage.foldername(name))[1] = 'companies'
    AND (storage.foldername(name))[2] IN (
      SELECT c.id::text FROM public.companies c
      WHERE c.tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- RLS: Allow anonymous uploads to brightkey-assets under companies/*/reviews/ (for installer review uploads)
DROP POLICY IF EXISTS "Anon upload reviews to brightkey-assets" ON storage.objects;
CREATE POLICY "Anon upload reviews to brightkey-assets"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'brightkey-assets'
    AND name LIKE 'companies/%/reviews/%'
  );

-- ── 13. Seed Data ──────────────────────────────────────────────────────

DO $$
DECLARE
  v_user_id       UUID;
  v_tenant_id     UUID;
  v_company_id    UUID;
BEGIN
  -- Get auth.users UUID by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'johnzeustaller@gmail.com'
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    -- Insert tenant row
    INSERT INTO public.tenants (owner_email)
    VALUES ('johnzeustaller@gmail.com')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_tenant_id;

    IF v_tenant_id IS NULL THEN
      SELECT id INTO v_tenant_id
      FROM public.tenants
      WHERE owner_email = 'johnzeustaller@gmail.com'
      LIMIT 1;
    END IF;

    -- Insert BrightKey company row
    INSERT INTO public.companies (tenant_id, name, subdomain)
    VALUES (v_tenant_id, 'BrightKey', 'brightkey')
    ON CONFLICT (subdomain) DO NOTHING
    RETURNING id INTO v_company_id;

    IF v_company_id IS NULL THEN
      SELECT id INTO v_company_id
      FROM public.companies
      WHERE subdomain = 'brightkey'
      LIMIT 1;
    END IF;

    -- Register owner as tenant member
    INSERT INTO public.tenant_members (tenant_id, user_id, role, user_email, full_name, accessible_modules)
    VALUES (v_tenant_id, v_user_id, 'owner', 'johnzeustaller@gmail.com', 'John Zeus Taller', ARRAY['HR', 'Customer Service', 'Finance', 'Operations', 'Products', 'Marketing', 'Logistics'])
    ON CONFLICT (user_id, tenant_id) DO UPDATE
      SET role = 'owner',
          accessible_modules = ARRAY['HR', 'Customer Service', 'Finance', 'Operations', 'Products', 'Marketing', 'Logistics'];

    -- Seed tenant businesses
    INSERT INTO public.tenant_businesses (company_id, name) VALUES
      (v_company_id, 'Smart Lock'),
      (v_company_id, 'CCTV'),
      (v_company_id, 'Solar Power'),
      (v_company_id, 'Fire Extinguisher')
    ON CONFLICT (company_id, name) DO NOTHING;

    -- Seed Smart Lock features
    INSERT INTO public.business_features (business_id, name)
    SELECT id, unnest(ARRAY[
      'pin_unlock', 'rfid_unlock', 'fingerprint_unlock',
      'face_recognition_3d', 'palm_vein_unlock', 'mechanical_key',
      'emergency_usb', 'app_control', 'bluetooth',
      'wifi', 'temporary_pin', 'doorbell',
      'intercom', 'monitoring', 'dual_cameras',
      'waterproof', 'fireproof', 'scratchproof',
      'sunproof', 'moisture_proof', 'splash_proof'
    ]) FROM public.tenant_businesses WHERE company_id = v_company_id AND name = 'Smart Lock'
    ON CONFLICT DO NOTHING;

    -- Seed Solar Power features
    INSERT INTO public.business_features (business_id, name)
    SELECT id, unnest(ARRAY[
      'grid_tie', 'off_grid', 'hybrid',
      'mppt_controller', 'monitoring_app', 'battery_backup',
      'auto_switching', 'weather_resistant', 'wifi_connect',
      'mobile_alerts'
    ]) FROM public.tenant_businesses WHERE company_id = v_company_id AND name = 'Solar Power'
    ON CONFLICT DO NOTHING;

    -- Seed CCTV features
    INSERT INTO public.business_features (business_id, name)
    SELECT id, unnest(ARRAY[
      'night_vision', 'resolution', 'pan_tilt_zoom',
      'motion_detection', 'two_way_audio', 'cloud_storage',
      'local_storage', 'weatherproof', 'wide_angle',
      'ai_detection', 'mobile_app', 'poe_support'
    ]) FROM public.tenant_businesses WHERE company_id = v_company_id AND name = 'CCTV'
    ON CONFLICT DO NOTHING;

    -- Seed Fire Extinguisher features
    INSERT INTO public.business_features (business_id, name)
    SELECT id, unnest(ARRAY[
      'type_abc', 'type_co2', 'type_dry_chemical',
      'type_foam', 'wall_mountable', 'vehicle_mountable',
      'refillable', 'pressure_gauge', 'with_bracket',
      'with_hose'
    ]) FROM public.tenant_businesses WHERE company_id = v_company_id AND name = 'Fire Extinguisher'
    ON CONFLICT DO NOTHING;

  END IF;
END $$;

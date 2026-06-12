-- =============================================================================
-- BrightKey Consolidated Tenant Features Schema (07_tenant_features.sql)
-- Consolidates tenant_businesses, business_features, column syncing function/triggers, and initial seed data.
-- =============================================================================

DROP TRIGGER IF EXISTS sync_features_columns_trg ON public.business_features;
DROP FUNCTION IF EXISTS public.sync_features_columns_fn();
DROP TABLE IF EXISTS public.business_features CASCADE;
DROP TABLE IF EXISTS public.tenant_businesses CASCADE;

-- ── 1. Tenant Businesses Table ────────────────────────────────────────────────
CREATE TABLE public.tenant_businesses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL, -- e.g. 'Smart Lock', 'CCTV', 'Solar Power', 'Fire Extinguisher'
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_company_business UNIQUE (company_id, name)
);

-- ── 2. Business Features Table ─────────────────────────────────────────────────
CREATE TABLE public.business_features (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.tenant_businesses(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL, -- e.g. 'pin_unlock', 'night_vision'
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_business_feature UNIQUE (business_id, name)
);

-- Enable RLS
ALTER TABLE public.tenant_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_features ENABLE ROW LEVEL SECURITY;

-- ── 3. Row Level Security Policies ───────────────────────────────────────────

CREATE POLICY "Allow select tenant_businesses" ON public.tenant_businesses
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow select business_features" ON public.business_features
  FOR SELECT USING (
    business_id IN (
      SELECT tb.id FROM public.tenant_businesses tb
      JOIN public.companies c ON tb.company_id = c.id
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow manage tenant_businesses" ON public.tenant_businesses
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow manage business_features" ON public.business_features
  FOR ALL USING (
    business_id IN (
      SELECT tb.id FROM public.tenant_businesses tb
      JOIN public.companies c ON tb.company_id = c.id
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- ── 4. Automatic Column Syncing Trigger ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_features_columns_fn()
RETURNS TRIGGER AS $$
DECLARE
  v_biz_name TEXT;
  v_table_name TEXT;
  v_column_exists BOOLEAN;
BEGIN
  -- 1. Find business name
  IF TG_OP = 'INSERT' THEN
    SELECT name INTO v_biz_name FROM public.tenant_businesses WHERE id = NEW.business_id;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT name INTO v_biz_name FROM public.tenant_businesses WHERE id = OLD.business_id;
  END IF;

  -- 2. Map business name to features table
  CASE v_biz_name
    WHEN 'Smart Lock' THEN v_table_name := 'smartlock_features';
    WHEN 'Solar Power' THEN v_table_name := 'solarpower_features';
    WHEN 'CCTV' THEN v_table_name := 'cctv_features';
    WHEN 'Fire Extinguisher' THEN v_table_name := 'fireextinguisher_features';
    ELSE RETURN NULL;
  END CASE;

  -- 3. Execute ALTER TABLE
  IF TG_OP = 'INSERT' THEN
    -- Add column if not exists
    EXECUTE 'ALTER TABLE public.' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS ' || quote_ident(NEW.name) || ' TEXT DEFAULT NULL';
  ELSIF TG_OP = 'DELETE' THEN
    -- Drop column if exists (safety check to not delete core metadata columns)
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

CREATE TRIGGER sync_features_columns_trg
AFTER INSERT OR DELETE ON public.business_features
FOR EACH ROW EXECUTE FUNCTION public.sync_features_columns_fn();

-- ── 5. Seed Initial Businesses & Features for BrightKey ───────────────────────

DO $$
DECLARE
  v_company_id UUID;
  v_smartlock_id UUID;
  v_cctv_id UUID;
  v_solar_id UUID;
  v_fire_id UUID;
BEGIN
  -- Find BrightKey company id
  SELECT id INTO v_company_id FROM public.companies WHERE subdomain = 'brightkey' LIMIT 1;
  
  IF v_company_id IS NOT NULL THEN
    -- Smart Lock
    INSERT INTO public.tenant_businesses (company_id, name)
    VALUES (v_company_id, 'Smart Lock')
    ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_smartlock_id;

    -- CCTV
    INSERT INTO public.tenant_businesses (company_id, name)
    VALUES (v_company_id, 'CCTV')
    ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_cctv_id;

    -- Solar Power
    INSERT INTO public.tenant_businesses (company_id, name)
    VALUES (v_company_id, 'Solar Power')
    ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_solar_id;

    -- Fire Extinguisher
    INSERT INTO public.tenant_businesses (company_id, name)
    VALUES (v_company_id, 'Fire Extinguisher')
    ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_fire_id;

    -- Seed Smart Lock features
    INSERT INTO public.business_features (business_id, name) VALUES
      (v_smartlock_id, 'pin_unlock'), (v_smartlock_id, 'rfid_unlock'), (v_smartlock_id, 'fingerprint_unlock'),
      (v_smartlock_id, 'face_recognition_3d'), (v_smartlock_id, 'palm_vein_unlock'), (v_smartlock_id, 'mechanical_key'),
      (v_smartlock_id, 'emergency_usb'), (v_smartlock_id, 'app_control'), (v_smartlock_id, 'bluetooth'),
      (v_smartlock_id, 'wifi'), (v_smartlock_id, 'temporary_pin'), (v_smartlock_id, 'doorbell'),
      (v_smartlock_id, 'intercom'), (v_smartlock_id, 'monitoring'), (v_smartlock_id, 'dual_cameras'),
      (v_smartlock_id, 'waterproof'), (v_smartlock_id, 'fireproof'), (v_smartlock_id, 'scratchproof'),
      (v_smartlock_id, 'sunproof'), (v_smartlock_id, 'moisture_proof'), (v_smartlock_id, 'splash_proof')
    ON CONFLICT DO NOTHING;

    -- Seed Solar Power features
    INSERT INTO public.business_features (business_id, name) VALUES
      (v_solar_id, 'grid_tie'), (v_solar_id, 'off_grid'), (v_solar_id, 'hybrid'),
      (v_solar_id, 'mppt_controller'), (v_solar_id, 'monitoring_app'), (v_solar_id, 'battery_backup'),
      (v_solar_id, 'auto_switching'), (v_solar_id, 'weather_resistant'), (v_solar_id, 'wifi_connect'),
      (v_solar_id, 'mobile_alerts')
    ON CONFLICT DO NOTHING;

    -- Seed CCTV features
    INSERT INTO public.business_features (business_id, name) VALUES
      (v_cctv_id, 'night_vision'), (v_cctv_id, 'resolution'), (v_cctv_id, 'pan_tilt_zoom'),
      (v_cctv_id, 'motion_detection'), (v_cctv_id, 'two_way_audio'), (v_cctv_id, 'cloud_storage'),
      (v_cctv_id, 'local_storage'), (v_cctv_id, 'weatherproof'), (v_cctv_id, 'wide_angle'),
      (v_cctv_id, 'ai_detection'), (v_cctv_id, 'mobile_app'), (v_cctv_id, 'poe_support')
    ON CONFLICT DO NOTHING;

    -- Seed Fire Extinguisher features
    INSERT INTO public.business_features (business_id, name) VALUES
      (v_fire_id, 'type_abc'), (v_fire_id, 'type_co2'), (v_fire_id, 'type_dry_chemical'),
      (v_fire_id, 'type_foam'), (v_fire_id, 'wall_mountable'), (v_fire_id, 'vehicle_mountable'),
      (v_fire_id, 'refillable'), (v_fire_id, 'pressure_gauge'), (v_fire_id, 'with_bracket'),
      (v_fire_id, 'with_hose')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

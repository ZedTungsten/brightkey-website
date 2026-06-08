-- Migration 42: Automatically sync business_features modifications with target table columns

CREATE OR REPLACE FUNCTION public.sync_features_columns_fn()
RETURNS TRIGGER AS $$
DECLARE
  v_biz_name TEXT;
  v_table_name TEXT;
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

-- Bind trigger to business_features
DROP TRIGGER IF EXISTS sync_features_columns_trg ON public.business_features;
CREATE TRIGGER sync_features_columns_trg
AFTER INSERT OR DELETE ON public.business_features
FOR EACH ROW EXECUTE FUNCTION public.sync_features_columns_fn();

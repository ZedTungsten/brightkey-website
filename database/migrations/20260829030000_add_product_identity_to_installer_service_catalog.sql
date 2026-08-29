-- Add stable product identity to the installer-facing Service catalog without
-- changing or removing the existing SKU-only RPC used by older deployments.
CREATE OR REPLACE FUNCTION public.get_installer_service_catalog_v2(p_token UUID)
RETURNS TABLE (
  product_id UUID,
  sku TEXT,
  title TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    product.id,
    product.sku::TEXT,
    product.title::TEXT
  FROM public.installer_sessions AS session
  JOIN public.products AS product
    ON product.company_id = session.company_id
  WHERE session.token = p_token
    AND session.expires_at > now()
    AND lower(trim(product.category)) = 'service'
    AND product.sku IS NOT NULL
    AND trim(product.sku) <> ''
  ORDER BY product.sku
  LIMIT 250;
$$;

REVOKE ALL ON FUNCTION public.get_installer_service_catalog_v2(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_installer_service_catalog_v2(UUID) TO anon;

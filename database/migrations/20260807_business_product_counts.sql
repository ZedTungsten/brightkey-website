-- Return bounded product totals for the Businesses settings page without
-- loading the tenant's complete product collection into the browser.

CREATE OR REPLACE FUNCTION public.get_business_product_counts(p_company_id UUID)
RETURNS TABLE (
  business_key TEXT,
  product_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT product.business, COUNT(*)
  FROM public.products AS product
  JOIN public.companies AS company
    ON company.id = product.company_id
  JOIN public.tenant_members AS member
    ON member.tenant_id = company.tenant_id
  WHERE product.company_id = p_company_id
    AND member.user_id = (SELECT auth.uid())
  GROUP BY product.business;
$$;

REVOKE ALL ON FUNCTION public.get_business_product_counts(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_business_product_counts(UUID) TO authenticated;

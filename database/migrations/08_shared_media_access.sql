-- Shared Media is intentionally available to Marketing and Sales without
-- granting those modules direct access to the complete booking record.
CREATE OR REPLACE FUNCTION public.get_shared_media_bookings(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_offset INTEGER DEFAULT 0,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  order_no TEXT,
  customer_name TEXT,
  customer_first_name TEXT,
  customer_last_name TEXT,
  customer_is_company BOOLEAN,
  customer_company_name TEXT,
  scheduled_date DATE,
  doors JSONB,
  products JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT (
    public.has_module_access((SELECT auth.uid()), p_company_id, 'Marketing')
    OR public.has_module_access((SELECT auth.uid()), p_company_id, 'Sales')
  ) THEN
    RAISE EXCEPTION 'Shared media access denied' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date >= p_end_date THEN
    RAISE EXCEPTION 'Invalid shared media date range' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    booking.id,
    booking.order_no,
    booking.customer_name,
    booking.customer_first_name,
    booking.customer_last_name,
    booking.customer_is_company,
    booking.customer_company_name,
    booking.scheduled_date,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'completed_at', door.value -> 'completed_at',
        'products', door.value -> 'products',
        'media_urls', door.value -> 'media_urls',
        'required_media', door.value -> 'required_media',
        'other_media', door.value -> 'other_media',
        'photos', door.value -> 'photos'
      ) ORDER BY door.ordinality)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(booking.doors) = 'array' THEN booking.doors ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS door(value, ordinality)
    ), '[]'::jsonb) AS doors,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sku', product.value -> 'sku',
        'name', product.value -> 'name',
        'title', product.value -> 'title'
      ) ORDER BY product.ordinality)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(booking.products) = 'array' THEN booking.products ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS product(value, ordinality)
    ), '[]'::jsonb) AS products
  FROM public.installation_bookings AS booking
  WHERE booking.company_id = p_company_id
    AND booking.scheduled_date >= p_start_date
    AND booking.scheduled_date < p_end_date
    AND booking.status <> 'cancelled'
  ORDER BY booking.scheduled_date DESC, booking.id DESC
  OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_media_bookings(UUID, DATE, DATE, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shared_media_bookings(UUID, DATE, DATE, INTEGER, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_shared_media_earliest_date(p_company_id UUID)
RETURNS DATE
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  earliest_date DATE;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT (
    public.has_module_access((SELECT auth.uid()), p_company_id, 'Marketing')
    OR public.has_module_access((SELECT auth.uid()), p_company_id, 'Sales')
  ) THEN
    RAISE EXCEPTION 'Shared media access denied' USING ERRCODE = '42501';
  END IF;

  SELECT min(booking.scheduled_date)
  INTO earliest_date
  FROM public.installation_bookings AS booking
  WHERE booking.company_id = p_company_id
    AND booking.status <> 'cancelled';

  RETURN earliest_date;
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_media_earliest_date(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shared_media_earliest_date(UUID) TO authenticated;

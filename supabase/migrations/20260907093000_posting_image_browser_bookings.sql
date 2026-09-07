CREATE OR REPLACE FUNCTION public.get_posting_image_browser_bookings(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_search TEXT DEFAULT '',
  p_offset INTEGER DEFAULT 0,
  p_limit INTEGER DEFAULT 11
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
  doors JSONB
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
    RAISE EXCEPTION 'Posting image browser access denied' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date >= p_end_date THEN
    RAISE EXCEPTION 'Invalid posting image browser date range' USING ERRCODE = '22023';
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
    booking.doors
  FROM public.installation_bookings AS booking
  WHERE booking.company_id = p_company_id
    AND booking.scheduled_date >= p_start_date
    AND booking.scheduled_date < p_end_date
    AND booking.status <> 'cancelled'
    AND (
      COALESCE(BTRIM(p_search), '') = ''
      OR booking.order_no ILIKE '%' || BTRIM(p_search) || '%'
      OR booking.customer_name ILIKE '%' || BTRIM(p_search) || '%'
      OR booking.customer_company_name ILIKE '%' || BTRIM(p_search) || '%'
      OR CONCAT_WS(' ', booking.customer_first_name, booking.customer_last_name) ILIKE '%' || BTRIM(p_search) || '%'
    )
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(booking.doors) = 'array' THEN booking.doors ELSE '[]'::jsonb END
      ) AS door(value)
      CROSS JOIN LATERAL (
        SELECT media.value
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(door.value -> 'media_urls') = 'array' THEN door.value -> 'media_urls' ELSE '[]'::jsonb END
        ) AS media(value)
        UNION ALL
        SELECT required.value
        FROM jsonb_each_text(
          CASE WHEN jsonb_typeof(door.value -> 'required_media') = 'object' THEN door.value -> 'required_media' ELSE '{}'::jsonb END
        ) AS required(key, value)
        UNION ALL
        SELECT other_media.value
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(door.value -> 'other_media') = 'array' THEN door.value -> 'other_media' ELSE '[]'::jsonb END
        ) AS other_media(value)
      ) AS upload
      WHERE upload.value ~* '^(https?://|data:image/(png|jpeg|webp);base64,)'
        AND upload.value !~* '\.(mp4|mov|webm|m4v)(\?|$)'
    )
  ORDER BY booking.scheduled_date DESC, booking.id DESC
  OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 11), 1), 50);
END;
$$;

REVOKE ALL ON FUNCTION public.get_posting_image_browser_bookings(UUID, DATE, DATE, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_posting_image_browser_bookings(UUID, DATE, DATE, TEXT, INTEGER, INTEGER) TO authenticated;

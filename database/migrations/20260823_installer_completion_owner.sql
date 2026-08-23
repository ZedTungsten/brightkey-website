-- Only the job completion owner may persist checklist, signature, or media state.
-- Lead takes precedence. Service is the fallback only when no Lead is assigned.
CREATE OR REPLACE FUNCTION public.installer_can_complete_booking(
  p_token UUID,
  p_booking_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH session_employee AS (
    SELECT session.employee_id::text AS employee_id
    FROM public.installer_sessions session
    WHERE session.token = p_token
      AND session.expires_at > now()
  ), booking_record AS (
    SELECT booking.installers, booking.doors
    FROM public.installation_bookings booking
    JOIN public.installer_sessions session
      ON session.company_id = booking.company_id
    WHERE booking.id = p_booking_id
      AND session.token = p_token
      AND session.expires_at > now()
  ), assigned AS (
    SELECT installer.value ->> 'id' AS employee_id,
      lower(coalesce(installer.value ->> 'role', CASE WHEN installer.ordinality = 1 THEN 'lead' ELSE 'assist' END)) AS role
    FROM booking_record booking
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(booking.installers, '[]'::jsonb)) WITH ORDINALITY installer(value, ordinality)
    UNION ALL
    SELECT installer.value ->> 'id' AS employee_id,
      lower(coalesce(installer.value ->> 'role', CASE WHEN installer.ordinality = 1 THEN 'lead' ELSE 'assist' END)) AS role
    FROM booking_record booking
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(booking.doors, '[]'::jsonb)) door
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(door -> 'installers', '[]'::jsonb)) WITH ORDINALITY installer(value, ordinality)
  ), precedence AS (
    SELECT EXISTS (SELECT 1 FROM assigned WHERE role = 'lead') AS has_lead
  )
  SELECT EXISTS (
    SELECT 1
    FROM assigned
    CROSS JOIN session_employee
    CROSS JOIN precedence
    WHERE assigned.employee_id = session_employee.employee_id
      AND (
        (precedence.has_lead AND assigned.role = 'lead')
        OR (NOT precedence.has_lead AND assigned.role = 'service')
      )
  );
$$;

REVOKE ALL ON FUNCTION public.installer_can_complete_booking(UUID, UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.update_installer_booking(
  p_token UUID,
  p_booking_id UUID,
  p_changes JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_keys CONSTANT TEXT[] := ARRAY[
    'doors', 'status', 'products', 'product_skus', 'product_names',
    'product_qtys', 'product_unit_prices', 'product_totals',
    'subtotal', 'grand_total', 'balance_due'
  ];
  supplied_key TEXT;
BEGIN
  IF NOT public.installer_can_access_booking(p_token, p_booking_id) THEN
    RETURN FALSE;
  END IF;

  IF p_changes ? 'doors'
     AND NOT public.installer_can_complete_booking(p_token, p_booking_id) THEN
    RETURN FALSE;
  END IF;

  FOR supplied_key IN SELECT jsonb_object_keys(p_changes)
  LOOP
    IF NOT supplied_key = ANY (allowed_keys) THEN
      RAISE EXCEPTION 'Unsupported installer booking field';
    END IF;
  END LOOP;

  UPDATE public.installation_bookings booking
  SET
    doors = CASE WHEN p_changes ? 'doors' THEN p_changes -> 'doors' ELSE booking.doors END,
    status = CASE WHEN p_changes ? 'status' THEN p_changes ->> 'status' ELSE booking.status END,
    products = CASE WHEN p_changes ? 'products' THEN p_changes -> 'products' ELSE booking.products END,
    product_skus = CASE WHEN p_changes ? 'product_skus' THEN p_changes ->> 'product_skus' ELSE booking.product_skus END,
    product_names = CASE WHEN p_changes ? 'product_names' THEN p_changes ->> 'product_names' ELSE booking.product_names END,
    product_qtys = CASE WHEN p_changes ? 'product_qtys' THEN p_changes ->> 'product_qtys' ELSE booking.product_qtys END,
    product_unit_prices = CASE WHEN p_changes ? 'product_unit_prices' THEN p_changes ->> 'product_unit_prices' ELSE booking.product_unit_prices END,
    product_totals = CASE WHEN p_changes ? 'product_totals' THEN p_changes ->> 'product_totals' ELSE booking.product_totals END,
    subtotal = CASE WHEN p_changes ? 'subtotal' THEN (p_changes ->> 'subtotal')::INTEGER ELSE booking.subtotal END,
    grand_total = CASE WHEN p_changes ? 'grand_total' THEN (p_changes ->> 'grand_total')::INTEGER ELSE booking.grand_total END,
    balance_due = CASE WHEN p_changes ? 'balance_due' THEN (p_changes ->> 'balance_due')::INTEGER ELSE booking.balance_due END,
    updated_at = now()
  WHERE booking.id = p_booking_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.update_installer_booking(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_installer_booking(UUID, UUID, JSONB) TO anon;

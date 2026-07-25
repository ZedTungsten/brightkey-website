-- =============================================================================
-- Replace anonymous installation-booking table access with short-lived,
-- installer-scoped RPC sessions.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.installer_sessions (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '12 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.installer_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_installer_sessions_expiry
  ON public.installer_sessions (expires_at);

CREATE OR REPLACE FUNCTION public.create_installer_session(p_password TEXT)
RETURNS TABLE (
  session_token UUID,
  id UUID,
  first_name TEXT,
  last_name TEXT,
  contact_number TEXT,
  company_id UUID,
  assignment TEXT,
  email TEXT,
  department TEXT,
  title TEXT,
  employment_status TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_employee public.employees%ROWTYPE;
  new_token UUID;
BEGIN
  SELECT employee.*
  INTO matched_employee
  FROM public.employees employee
  WHERE employee.employment_status = 'Active'
    AND 'installer' = ANY (
      regexp_split_to_array(lower(coalesce(employee.assignment, '')), '\s*,\s*')
    )
    AND lower(trim(p_password)) =
      lower(
        left(trim(coalesce(employee.first_name, '')), 1)
        || left(trim(coalesce(employee.last_name, '')), 1)
        || right(
          regexp_replace(
            coalesce(employee.emergency_contact_number, ''),
            '[^0-9]',
            '',
            'g'
          ),
          4
        )
      )
  LIMIT 1;

  IF matched_employee.id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.installer_sessions
  WHERE expires_at <= now()
     OR employee_id = matched_employee.id;

  INSERT INTO public.installer_sessions (employee_id, company_id)
  VALUES (matched_employee.id, matched_employee.company_id)
  RETURNING token INTO new_token;

  RETURN QUERY SELECT
    new_token,
    matched_employee.id,
    matched_employee.first_name,
    matched_employee.last_name,
    matched_employee.contact_number,
    matched_employee.company_id,
    matched_employee.assignment,
    matched_employee.email,
    matched_employee.department,
    matched_employee.title,
    matched_employee.employment_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.installer_can_access_booking(
  p_token UUID,
  p_booking_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.installer_sessions session
    JOIN public.installation_bookings booking
      ON booking.id = p_booking_id
     AND booking.company_id = session.company_id
    WHERE session.token = p_token
      AND session.expires_at > now()
      AND (
        session.employee_id::text = ANY (
          string_to_array(coalesce(booking.installer_id, ''), ' | ')
        )
        OR coalesce(booking.installers, '[]'::jsonb) @>
          jsonb_build_array(
            jsonb_build_object('id', session.employee_id::text)
          )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            coalesce(booking.doors, '[]'::jsonb)
          ) door
          CROSS JOIN LATERAL jsonb_array_elements(
            coalesce(door -> 'installers', '[]'::jsonb)
          ) door_installer
          WHERE door_installer ->> 'id' = session.employee_id::text
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_installer_bookings(p_token UUID)
RETURNS SETOF public.installation_bookings
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT booking.*
  FROM public.installation_bookings booking
  JOIN public.installer_sessions session
    ON session.company_id = booking.company_id
  WHERE session.token = p_token
    AND session.expires_at > now()
    AND booking.status <> 'cancelled'
    AND public.installer_can_access_booking(p_token, booking.id)
  ORDER BY booking.scheduled_date, booking.scheduled_time
  LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.get_installer_delivery_statuses(p_token UUID)
RETURNS TABLE (reference_id TEXT, status TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT delivery.reference_id, delivery.status
  FROM public.delivery_bookings delivery
  JOIN public.installer_sessions session
    ON session.company_id = delivery.company_id
  WHERE session.token = p_token
    AND session.expires_at > now()
    AND EXISTS (
      SELECT 1
      FROM public.installation_bookings booking
      WHERE booking.company_id = session.company_id
        AND booking.order_no = delivery.reference_id
        AND public.installer_can_access_booking(p_token, booking.id)
    )
  LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.get_installer_booking_doors(
  p_token UUID,
  p_booking_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT booking.doors
  FROM public.installation_bookings booking
  WHERE booking.id = p_booking_id
    AND public.installer_can_access_booking(p_token, booking.id);
$$;

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

  FOR supplied_key IN SELECT jsonb_object_keys(p_changes)
  LOOP
    IF NOT supplied_key = ANY (allowed_keys) THEN
      RAISE EXCEPTION 'Unsupported installer booking field';
    END IF;
  END LOOP;

  UPDATE public.installation_bookings booking
  SET
    doors = CASE
      WHEN p_changes ? 'doors' THEN p_changes -> 'doors'
      ELSE booking.doors
    END,
    status = CASE
      WHEN p_changes ? 'status' THEN p_changes ->> 'status'
      ELSE booking.status
    END,
    products = CASE
      WHEN p_changes ? 'products' THEN p_changes -> 'products'
      ELSE booking.products
    END,
    product_skus = CASE
      WHEN p_changes ? 'product_skus' THEN p_changes ->> 'product_skus'
      ELSE booking.product_skus
    END,
    product_names = CASE
      WHEN p_changes ? 'product_names' THEN p_changes ->> 'product_names'
      ELSE booking.product_names
    END,
    product_qtys = CASE
      WHEN p_changes ? 'product_qtys' THEN p_changes ->> 'product_qtys'
      ELSE booking.product_qtys
    END,
    product_unit_prices = CASE
      WHEN p_changes ? 'product_unit_prices'
        THEN p_changes ->> 'product_unit_prices'
      ELSE booking.product_unit_prices
    END,
    product_totals = CASE
      WHEN p_changes ? 'product_totals' THEN p_changes ->> 'product_totals'
      ELSE booking.product_totals
    END,
    subtotal = CASE
      WHEN p_changes ? 'subtotal' THEN (p_changes ->> 'subtotal')::INTEGER
      ELSE booking.subtotal
    END,
    grand_total = CASE
      WHEN p_changes ? 'grand_total'
        THEN (p_changes ->> 'grand_total')::INTEGER
      ELSE booking.grand_total
    END,
    balance_due = CASE
      WHEN p_changes ? 'balance_due'
        THEN (p_changes ->> 'balance_due')::INTEGER
      ELSE booking.balance_due
    END,
    updated_at = now()
  WHERE booking.id = p_booking_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.create_installer_session(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.installer_can_access_booking(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_installer_bookings(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_installer_delivery_statuses(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_installer_booking_doors(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_installer_booking(UUID, UUID, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_installer_session(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_installer_bookings(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_installer_delivery_statuses(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_installer_booking_doors(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.update_installer_booking(UUID, UUID, JSONB) TO anon;

-- Session issuance supersedes the legacy password lookup. Retain the function
-- for rollback compatibility, but prevent clients from calling it directly.
REVOKE ALL ON FUNCTION public.authenticate_installer(TEXT)
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Allow public insert installation_bookings"
  ON public.installation_bookings;
DROP POLICY IF EXISTS "Allow public read installation_bookings"
  ON public.installation_bookings;
DROP POLICY IF EXISTS "Allow public update installation_bookings"
  ON public.installation_bookings;

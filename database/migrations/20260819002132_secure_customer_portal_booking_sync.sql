-- Portal account rows are internal synchronization state. Keep their RLS
-- policies customer-read-only and perform booking-triggered writes through a
-- guarded trigger function instead of granting dashboard users direct access.

CREATE OR REPLACE FUNCTION public.sync_customer_portal_account_from_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_user_id UUID := (SELECT auth.uid());
  request_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
  normalized_phone TEXT;
  resolved_first TEXT;
  resolved_last TEXT;
  generated_username TEXT;
  resolved_account_id UUID;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'installation_bookings' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Customer portal synchronization is restricted to bookings.';
  END IF;

  IF caller_user_id IS NOT NULL THEN
    IF NOT public.has_module_access(caller_user_id, NEW.company_id, 'Operations') THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Operations access is required to synchronize this customer account.';
    END IF;
  ELSIF request_role <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authenticated access is required to synchronize this customer account.';
  END IF;

  normalized_phone := regexp_replace(COALESCE(NEW.customer_phone, ''), '[^0-9]', '', 'g');
  IF NEW.company_id IS NULL OR length(normalized_phone) < 7 OR length(normalized_phone) > 15 THEN
    RETURN NEW;
  END IF;

  resolved_first := COALESCE(
    NULLIF(btrim(NEW.customer_first_name), ''),
    split_part(btrim(COALESCE(NEW.customer_name, '')), ' ', 1)
  );
  resolved_last := COALESCE(
    NULLIF(btrim(NEW.customer_last_name), ''),
    regexp_replace(btrim(COALESCE(NEW.customer_name, '')), '^.*\s', '')
  );
  generated_username := lower(regexp_replace(
    split_part(COALESCE(resolved_first, ''), ' ', 1)
      || regexp_replace(COALESCE(resolved_last, ''), '^.*\s', ''),
    '[^a-zA-Z0-9]',
    '',
    'g'
  ));
  IF generated_username = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.customer_portal_accounts (
    company_id,
    username,
    phone_normalized,
    customer_first_name,
    customer_last_name,
    updated_at
  ) VALUES (
    NEW.company_id,
    generated_username,
    normalized_phone,
    resolved_first,
    resolved_last,
    NOW()
  )
  ON CONFLICT (company_id, phone_normalized) DO UPDATE SET
    username = EXCLUDED.username,
    customer_first_name = EXCLUDED.customer_first_name,
    customer_last_name = EXCLUDED.customer_last_name,
    updated_at = NOW()
  RETURNING id INTO resolved_account_id;

  DELETE FROM public.customer_portal_orders
  WHERE booking_id = NEW.id;

  INSERT INTO public.customer_portal_orders (
    account_id,
    booking_id,
    company_id,
    created_at
  ) VALUES (
    resolved_account_id,
    NEW.id,
    NEW.company_id,
    COALESCE(NEW.created_at, NOW())
  )
  ON CONFLICT (account_id, booking_id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    created_at = EXCLUDED.created_at;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_customer_portal_account_from_booking() FROM PUBLIC;

COMMENT ON FUNCTION public.sync_customer_portal_account_from_booking() IS
  'Synchronizes customer portal state from authorized booking writes without exposing portal account mutations through the Data API.';

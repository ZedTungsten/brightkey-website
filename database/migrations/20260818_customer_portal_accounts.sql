CREATE TABLE IF NOT EXISTS public.customer_portal_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  username TEXT NOT NULL CHECK (username = lower(username) AND username ~ '^[a-z0-9]+$'),
  phone_normalized TEXT NOT NULL CHECK (phone_normalized ~ '^[0-9]{7,15}$'),
  customer_first_name TEXT,
  customer_last_name TEXT,
  affiliate_code TEXT NOT NULL DEFAULT ('BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, phone_normalized),
  UNIQUE (affiliate_code)
);

ALTER TABLE public.customer_portal_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_portal_accounts'
      AND policyname = 'Customers read own portal account'
  ) THEN
    CREATE POLICY "Customers read own portal account"
      ON public.customer_portal_accounts
      FOR SELECT
      TO authenticated
      USING ((SELECT auth.uid()) = auth_user_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS customer_portal_accounts_login_idx
  ON public.customer_portal_accounts (username, phone_normalized);
CREATE INDEX IF NOT EXISTS customer_portal_accounts_company_phone_idx
  ON public.customer_portal_accounts (company_id, phone_normalized);

GRANT SELECT ON public.customer_portal_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_portal_accounts TO service_role;
REVOKE ALL ON public.customer_portal_accounts FROM anon;

CREATE TABLE IF NOT EXISTS public.customer_portal_orders (
  account_id UUID NOT NULL REFERENCES public.customer_portal_accounts(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.installation_bookings(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, booking_id)
);

ALTER TABLE public.customer_portal_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_portal_orders'
      AND policyname = 'Customers read own portal order links'
  ) THEN
    CREATE POLICY "Customers read own portal order links"
      ON public.customer_portal_orders
      FOR SELECT
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.customer_portal_accounts AS account
        WHERE account.id = customer_portal_orders.account_id
          AND account.auth_user_id = (SELECT auth.uid())
      ));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS customer_portal_orders_account_created_idx
  ON public.customer_portal_orders (account_id, created_at DESC);
GRANT SELECT ON public.customer_portal_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_portal_orders TO service_role;
REVOKE ALL ON public.customer_portal_orders FROM anon;

CREATE OR REPLACE FUNCTION public.sync_customer_portal_account_from_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  normalized_phone TEXT;
  resolved_first TEXT;
  resolved_last TEXT;
  generated_username TEXT;
  resolved_account_id UUID;
BEGIN
  normalized_phone := regexp_replace(COALESCE(NEW.customer_phone, ''), '[^0-9]', '', 'g');
  IF NEW.company_id IS NULL OR length(normalized_phone) < 7 OR length(normalized_phone) > 15 THEN
    RETURN NEW;
  END IF;

  resolved_first := COALESCE(NULLIF(btrim(NEW.customer_first_name), ''), split_part(btrim(COALESCE(NEW.customer_name, '')), ' ', 1));
  resolved_last := COALESCE(NULLIF(btrim(NEW.customer_last_name), ''), regexp_replace(btrim(COALESCE(NEW.customer_name, '')), '^.*\s', ''));
  generated_username := lower(regexp_replace(
    split_part(COALESCE(resolved_first, ''), ' ', 1)
    || regexp_replace(COALESCE(resolved_last, ''), '^.*\s', ''),
    '[^a-zA-Z0-9]', '', 'g'
  ));
  IF generated_username = '' THEN RETURN NEW; END IF;

  INSERT INTO public.customer_portal_accounts (
    company_id, username, phone_normalized, customer_first_name, customer_last_name, updated_at
  ) VALUES (
    NEW.company_id, generated_username, normalized_phone, resolved_first, resolved_last, NOW()
  )
  ON CONFLICT (company_id, phone_normalized) DO UPDATE SET
    username = EXCLUDED.username,
    customer_first_name = EXCLUDED.customer_first_name,
    customer_last_name = EXCLUDED.customer_last_name,
    updated_at = NOW()
  RETURNING id INTO resolved_account_id;

  DELETE FROM public.customer_portal_orders WHERE booking_id = NEW.id;
  INSERT INTO public.customer_portal_orders (account_id, booking_id, company_id, created_at)
  VALUES (resolved_account_id, NEW.id, NEW.company_id, COALESCE(NEW.created_at, NOW()))
  ON CONFLICT (account_id, booking_id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    created_at = EXCLUDED.created_at;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_customer_portal_account_from_booking() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sync_customer_portal_account_after_booking') THEN
    CREATE TRIGGER sync_customer_portal_account_after_booking
      AFTER INSERT OR UPDATE OF company_id, customer_name, customer_first_name, customer_last_name, customer_phone
      ON public.installation_bookings
      FOR EACH ROW EXECUTE FUNCTION public.sync_customer_portal_account_from_booking();
  END IF;
END
$$;

INSERT INTO public.customer_portal_accounts (
  company_id, username, phone_normalized, customer_first_name, customer_last_name
)
SELECT DISTINCT ON (booking.company_id, normalized.phone)
  booking.company_id,
  lower(regexp_replace(
    split_part(COALESCE(NULLIF(btrim(booking.customer_first_name), ''), split_part(btrim(COALESCE(booking.customer_name, '')), ' ', 1)), ' ', 1)
    || regexp_replace(COALESCE(NULLIF(btrim(booking.customer_last_name), ''), regexp_replace(btrim(COALESCE(booking.customer_name, '')), '^.*\s', '')), '^.*\s', ''),
    '[^a-zA-Z0-9]', '', 'g'
  )),
  normalized.phone,
  COALESCE(NULLIF(btrim(booking.customer_first_name), ''), split_part(btrim(COALESCE(booking.customer_name, '')), ' ', 1)),
  COALESCE(NULLIF(btrim(booking.customer_last_name), ''), regexp_replace(btrim(COALESCE(booking.customer_name, '')), '^.*\s', ''))
FROM public.installation_bookings AS booking
CROSS JOIN LATERAL (
  SELECT regexp_replace(COALESCE(booking.customer_phone, ''), '[^0-9]', '', 'g') AS phone
) AS normalized
WHERE booking.company_id IS NOT NULL
  AND length(normalized.phone) BETWEEN 7 AND 15
  AND lower(regexp_replace(
    split_part(COALESCE(NULLIF(btrim(booking.customer_first_name), ''), split_part(btrim(COALESCE(booking.customer_name, '')), ' ', 1)), ' ', 1)
    || regexp_replace(COALESCE(NULLIF(btrim(booking.customer_last_name), ''), regexp_replace(btrim(COALESCE(booking.customer_name, '')), '^.*\s', '')), '^.*\s', ''),
    '[^a-zA-Z0-9]', '', 'g'
  )) <> ''
ORDER BY booking.company_id, normalized.phone, booking.created_at DESC
ON CONFLICT (company_id, phone_normalized) DO UPDATE SET
  username = EXCLUDED.username,
  customer_first_name = EXCLUDED.customer_first_name,
  customer_last_name = EXCLUDED.customer_last_name,
  updated_at = NOW();

INSERT INTO public.customer_portal_orders (account_id, booking_id, company_id, created_at)
SELECT account.id, booking.id, booking.company_id, COALESCE(booking.created_at, NOW())
FROM public.installation_bookings AS booking
JOIN public.customer_portal_accounts AS account
  ON account.company_id = booking.company_id
 AND account.phone_normalized = regexp_replace(COALESCE(booking.customer_phone, ''), '[^0-9]', '', 'g')
ON CONFLICT (account_id, booking_id) DO UPDATE SET
  company_id = EXCLUDED.company_id,
  created_at = EXCLUDED.created_at;

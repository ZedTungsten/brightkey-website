-- Generate readable customer affiliate codes without changing manually edited codes.

CREATE OR REPLACE FUNCTION public.set_generated_customer_affiliate_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  base_code TEXT;
  candidate_code TEXT;
  suffix_number INTEGER := 0;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'customer_portal_accounts' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Affiliate code generation is restricted to customer portal accounts.';
  END IF;

  IF NEW.affiliate_code IS NOT NULL
     AND NEW.affiliate_code !~ '^BK-[A-F0-9]{8}$' THEN
    RETURN NEW;
  END IF;

  base_code := 'LOOCK'
    || upper(regexp_replace(COALESCE(NEW.customer_first_name, ''), '[^a-zA-Z0-9]', '', 'g'))
    || upper(left(regexp_replace(COALESCE(NEW.customer_last_name, ''), '[^a-zA-Z0-9]', '', 'g'), 1));
  IF base_code = 'LOOCK' THEN
    base_code := 'LOOCKCUSTOMER';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(base_code, 0));
  candidate_code := base_code;
  WHILE EXISTS (
    SELECT 1
    FROM public.customer_portal_accounts AS account
    WHERE account.affiliate_code = candidate_code
      AND account.id IS DISTINCT FROM NEW.id
  ) LOOP
    suffix_number := suffix_number + 1;
    candidate_code := base_code || suffix_number::TEXT;
  END LOOP;

  NEW.affiliate_code := candidate_code;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_generated_customer_affiliate_code() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_generated_customer_affiliate_code_before_insert'
      AND tgrelid = 'public.customer_portal_accounts'::regclass
  ) THEN
    CREATE TRIGGER set_generated_customer_affiliate_code_before_insert
      BEFORE INSERT ON public.customer_portal_accounts
      FOR EACH ROW EXECUTE FUNCTION public.set_generated_customer_affiliate_code();
  END IF;
END
$$;

DO $$
DECLARE
  account_row RECORD;
  base_code TEXT;
  candidate_code TEXT;
  suffix_number INTEGER;
BEGIN
  FOR account_row IN
    SELECT id, customer_first_name, customer_last_name
    FROM public.customer_portal_accounts
    WHERE affiliate_code ~ '^BK-[A-F0-9]{8}$'
    ORDER BY created_at, id
  LOOP
    base_code := 'LOOCK'
      || upper(regexp_replace(COALESCE(account_row.customer_first_name, ''), '[^a-zA-Z0-9]', '', 'g'))
      || upper(left(regexp_replace(COALESCE(account_row.customer_last_name, ''), '[^a-zA-Z0-9]', '', 'g'), 1));
    IF base_code = 'LOOCK' THEN base_code := 'LOOCKCUSTOMER'; END IF;
    candidate_code := base_code;
    suffix_number := 0;
    WHILE EXISTS (
      SELECT 1 FROM public.customer_portal_accounts AS existing
      WHERE existing.affiliate_code = candidate_code
        AND existing.id <> account_row.id
    ) LOOP
      suffix_number := suffix_number + 1;
      candidate_code := base_code || suffix_number::TEXT;
    END LOOP;
    UPDATE public.customer_portal_accounts
    SET affiliate_code = candidate_code, updated_at = NOW()
    WHERE id = account_row.id;
  END LOOP;
END
$$;

COMMENT ON FUNCTION public.set_generated_customer_affiliate_code() IS
  'Assigns LOOCK{FIRSTNAME}{LASTINITIAL} affiliate codes, adding a numeric suffix only for duplicates.';

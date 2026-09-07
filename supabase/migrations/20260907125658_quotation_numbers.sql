ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS quotation_number text;

-- Preserve existing quotations by assigning company/day sequences in save order.
WITH numbered AS (
  SELECT
    id,
    to_char(created_at AT TIME ZONE 'Asia/Manila', 'MMDDYY')
      || '-'
      || lpad((row_number() OVER (
        PARTITION BY company_id, (created_at AT TIME ZONE 'Asia/Manila')::date
        ORDER BY created_at, id
      ) - 1)::text, 4, '0') AS quotation_number
  FROM public.quotations
  WHERE quotation_number IS NULL
)
UPDATE public.quotations AS quotation
SET quotation_number = numbered.quotation_number
FROM numbered
WHERE quotation.id = numbered.id;

CREATE OR REPLACE FUNCTION public.assign_quotation_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  save_date date := (statement_timestamp() AT TIME ZONE 'Asia/Manila')::date;
  number_prefix text;
  next_sequence integer;
BEGIN
  number_prefix := to_char(save_date, 'MMDDYY');
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.company_id::text || ':' || save_date::text, 0));

  SELECT COALESCE(MAX(right(quotation_number, 4)::integer), -1) + 1
  INTO next_sequence
  FROM public.quotations
  WHERE company_id = NEW.company_id
    AND quotation_number ~ ('^' || number_prefix || '-[0-9]{4}$');

  IF next_sequence > 9999 THEN
    RAISE EXCEPTION 'Daily quotation number limit reached';
  END IF;

  NEW.quotation_number := number_prefix || '-' || lpad(next_sequence::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotations_assign_number ON public.quotations;
CREATE TRIGGER quotations_assign_number
  BEFORE INSERT ON public.quotations
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_quotation_number();

ALTER TABLE public.quotations
  ALTER COLUMN quotation_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.quotations'::regclass
      AND conname = 'quotations_number_format_check'
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_number_format_check
      CHECK (quotation_number ~ '^[0-9]{6}-[0-9]{4}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS quotations_company_number_idx
  ON public.quotations (company_id, quotation_number);

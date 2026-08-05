-- Save a page-level receivables draft atomically without modifying General Journal rows.
CREATE OR REPLACE FUNCTION public.save_receivable_entry_batch(
  p_company_id UUID,
  p_entries JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry JSONB;
  v_booking_id UUID;
  v_amount BIGINT;
  v_saved INTEGER := 0;
BEGIN
  IF p_company_id IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'Invalid receivable entry batch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.companies c
    JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
    WHERE c.id = p_company_id
      AND tm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Company access denied' USING ERRCODE = '42501';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries)
  LOOP
    v_booking_id := (v_entry->>'booking_id')::UUID;
    v_amount := (v_entry->>'amount_cents')::BIGINT;

    IF v_amount <= 0
      OR NOT EXISTS (
        SELECT 1 FROM public.installation_bookings b
        WHERE b.id = v_booking_id AND b.company_id = p_company_id
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.general_journal j
        WHERE j.company_id = p_company_id
          AND j.entry_number = (v_entry->>'journal_entry_number')::INTEGER
          AND j.debit > 0
      )
    THEN
      RAISE EXCEPTION 'Invalid receivable draft entry';
    END IF;

    INSERT INTO public.receivable_payments (
      company_id, booking_id, amount_cents, payment_date, payment_method,
      reference_number, notes, transaction_type, journal_entry_id,
      journal_entry_number, debited_account
    ) VALUES (
      p_company_id,
      v_booking_id,
      v_amount,
      (v_entry->>'payment_date')::DATE,
      'General Journal',
      v_entry->>'reference_number',
      NULLIF(v_entry->>'notes', ''),
      v_entry->>'transaction_type',
      (v_entry->>'journal_entry_id')::BIGINT,
      (v_entry->>'journal_entry_number')::INTEGER,
      v_entry->>'debited_account'
    );

    UPDATE public.installation_bookings
    SET balance_due = GREATEST(0, COALESCE(balance_due, 0) - v_amount)
    WHERE id = v_booking_id AND company_id = p_company_id;

    v_saved := v_saved + 1;
  END LOOP;

  RETURN v_saved;
END;
$$;

REVOKE ALL ON FUNCTION public.save_receivable_entry_batch(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_receivable_entry_batch(UUID, JSONB) TO authenticated;

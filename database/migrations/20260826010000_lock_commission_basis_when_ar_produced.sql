-- Preserve the commission price basis at the moment an acknowledgment receipt
-- is produced. The source booking may still be corrected later, but the
-- historical commission basis is immutable.

ALTER TABLE public.installation_bookings
  ADD COLUMN IF NOT EXISTS commission_basis_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS commission_basis_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commission_basis_locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.commission_basis_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.installation_bookings(id) ON DELETE CASCADE,
  order_no TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('locked')),
  basis_snapshot JSONB NOT NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS commission_basis_history_company_booking_created_idx
  ON public.commission_basis_history (company_id, booking_id, created_at DESC);

ALTER TABLE public.commission_basis_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'commission_basis_history'
      AND policyname = 'Company members can view commission basis history'
  ) THEN
    CREATE POLICY "Company members can view commission basis history"
      ON public.commission_basis_history
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.companies company
          JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
          WHERE company.id = commission_basis_history.company_id
            AND member.user_id = auth.uid()
            AND member.role IN ('owner', 'admin')
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_commission_basis_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.commission_basis_locked_at IS NOT NULL AND (
    NEW.commission_basis_snapshot IS DISTINCT FROM OLD.commission_basis_snapshot OR
    NEW.commission_basis_locked_at IS DISTINCT FROM OLD.commission_basis_locked_at OR
    NEW.commission_basis_locked_by IS DISTINCT FROM OLD.commission_basis_locked_by
  ) THEN
    RAISE EXCEPTION 'The AR commission basis is locked and cannot be changed.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_locked_commission_basis ON public.installation_bookings;
CREATE TRIGGER guard_locked_commission_basis
  BEFORE UPDATE ON public.installation_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_commission_basis_mutation();

CREATE OR REPLACE FUNCTION public.prevent_commission_basis_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Commission basis history is immutable.'
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS guard_commission_basis_history_mutation ON public.commission_basis_history;
CREATE TRIGGER guard_commission_basis_history_mutation
  BEFORE UPDATE OR DELETE ON public.commission_basis_history
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_commission_basis_history_mutation();

CREATE OR REPLACE FUNCTION public.lock_commission_basis_for_ar(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  booking public.installation_bookings%ROWTYPE;
  snapshot JSONB;
  actor UUID := auth.uid();
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO booking
  FROM public.installation_bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF booking.id IS NULL OR booking.company_id IS NULL THEN
    RAISE EXCEPTION 'The order could not be found.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.companies company
    JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
    WHERE company.id = booking.company_id
      AND member.user_id = actor
  ) THEN
    RAISE EXCEPTION 'You do not have access to this order.' USING ERRCODE = '42501';
  END IF;

  IF booking.commission_basis_locked_at IS NOT NULL THEN
    RETURN booking.commission_basis_snapshot;
  END IF;

  snapshot := jsonb_build_object(
    'product_skus', booking.product_skus,
    'product_names', booking.product_names,
    'product_qtys', booking.product_qtys,
    'product_unit_prices', booking.product_unit_prices,
    'product_totals', booking.product_totals,
    'charge_labels', booking.charge_labels,
    'charge_values', booking.charge_values,
    'deduction_labels', booking.deduction_labels,
    'deduction_values', booking.deduction_values,
    'deposit_amount', booking.deposit_amount,
    'subtotal', booking.subtotal,
    'charges', booking.charges,
    'deductions', booking.deductions,
    'grand_total', booking.grand_total,
    'captured_at', NOW()
  );

  UPDATE public.installation_bookings
  SET commission_basis_snapshot = snapshot,
      commission_basis_locked_at = NOW(),
      commission_basis_locked_by = actor
  WHERE id = booking.id;

  INSERT INTO public.commission_basis_history (
    company_id, booking_id, order_no, action, basis_snapshot, actor_user_id
  ) VALUES (
    booking.company_id, booking.id, booking.order_no, 'locked', snapshot, actor
  );

  RETURN snapshot;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_commission_basis_for_ar(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_commission_basis_for_ar(UUID) TO authenticated;
GRANT SELECT ON public.commission_basis_history TO authenticated;

-- Existing ORD bookings were created together with an AR before this lock was
-- introduced. Backfill from their saved receipt fields, never from the mutable
-- product catalog. The null guard makes this rerunnable and preserves any basis
-- already captured through the RPC.
WITH existing_ar AS (
  SELECT
    booking.id,
    booking.company_id,
    booking.order_no,
    jsonb_build_object(
      'product_skus', booking.product_skus,
      'product_names', booking.product_names,
      'product_qtys', booking.product_qtys,
      'product_unit_prices', booking.product_unit_prices,
      'product_totals', booking.product_totals,
      'charge_labels', booking.charge_labels,
      'charge_values', booking.charge_values,
      'deduction_labels', booking.deduction_labels,
      'deduction_values', booking.deduction_values,
      'deposit_amount', booking.deposit_amount,
      'subtotal', booking.subtotal,
      'charges', booking.charges,
      'deductions', booking.deductions,
      'grand_total', booking.grand_total,
      'captured_at', NOW(),
      'capture_source', 'migration_existing_ar'
    ) AS snapshot
  FROM public.installation_bookings booking
  WHERE booking.commission_basis_locked_at IS NULL
    AND booking.company_id IS NOT NULL
    AND booking.order_no LIKE 'ORD-%'
), locked AS (
  UPDATE public.installation_bookings booking
  SET commission_basis_snapshot = existing_ar.snapshot,
      commission_basis_locked_at = NOW(),
      commission_basis_locked_by = NULL
  FROM existing_ar
  WHERE booking.id = existing_ar.id
  RETURNING booking.id, booking.company_id, booking.order_no, booking.commission_basis_snapshot
)
INSERT INTO public.commission_basis_history (
  company_id, booking_id, order_no, action, basis_snapshot, actor_user_id
)
SELECT company_id, id, order_no, 'locked', commission_basis_snapshot, NULL
FROM locked;

COMMENT ON COLUMN public.installation_bookings.commission_basis_snapshot IS
  'Immutable order pricing and adjustment inputs captured when the AR is first produced.';
COMMENT ON TABLE public.commission_basis_history IS
  'Immutable audit history for AR-time commission basis locks.';

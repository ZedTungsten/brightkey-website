-- ============================================================
-- Migration: 28_add_delivery_bookings_table.sql
-- Creates delivery_bookings table to track delivery details.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.delivery_bookings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  reference_id        TEXT NOT NULL,
  customer_name       TEXT,
  customer_city       TEXT,
  delivery_photo_url  TEXT,
  base_fee            INTEGER DEFAULT 0, -- stored in centavos
  tip_1               INTEGER DEFAULT 0, -- stored in centavos
  tip_2               INTEGER DEFAULT 0, -- stored in centavos
  toll                INTEGER DEFAULT 0, -- stored in centavos
  status              TEXT DEFAULT 'booked' CHECK (status IN ('booked', 'picked_up', 'delivered')),
  pickup_photos       TEXT[] DEFAULT '{}'::TEXT[],
  picked_up_at        TIMESTAMPTZ,
  received_photo_url  TEXT,
  delivered_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.delivery_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company delivery bookings access" ON public.delivery_bookings;

CREATE POLICY "Company delivery bookings access" ON public.delivery_bookings
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

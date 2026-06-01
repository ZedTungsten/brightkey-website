-- =============================================================================
-- Migration 24: BrightKey Tenant Setup & RLS Hardening
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)
--
-- What this does:
--   1. Creates the BrightKey tenant row (linked to johnzeustaller@gmail.com)
--   2. Creates the BrightKey company row
--   3. Registers you (johnzeustaller@gmail.com) as 'owner' in tenant_members
--   4. Backfills ALL existing NULL company_id rows to BrightKey
--   5. Hardens RLS on employees, orders, order_items, inventory, installations
--      so no other company's staff can ever see BrightKey data
-- =============================================================================


-- ── PRE-STEP: Add missing company_id columns to tables that may not have them ──
-- (These must run BEFORE the DO block so the backfill UPDATEs succeed)

ALTER TABLE public.inventory          ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_logs     ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.installations      ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.employees          ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.orders             ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.order_items        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.product_reviews    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.coupons            ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.vouchers           ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.global_settings    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.email_marketing_audiences        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.email_marketing_audience_members ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.installation_bookings            ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;


-- ── PART 1: Register BrightKey Tenant & Company ─────────────────────────────

DO $$
DECLARE
  v_user_id       UUID;
  v_tenant_id     UUID;
  v_company_id    UUID;
BEGIN

  -- Get your auth.users UUID by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'johnzeustaller@gmail.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User johnzeustaller@gmail.com not found in auth.users. Make sure you have signed up first.';
  END IF;

  -- Insert tenant row (idempotent: skip if owner already has one)
  INSERT INTO public.tenants (owner_email)
  VALUES ('johnzeustaller@gmail.com')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_tenant_id;

  -- If already existed, fetch it
  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id
    FROM public.tenants
    WHERE owner_email = 'johnzeustaller@gmail.com'
    LIMIT 1;
  END IF;

  -- Insert BrightKey company row (idempotent)
  INSERT INTO public.companies (tenant_id, name, subdomain)
  VALUES (v_tenant_id, 'BrightKey', 'brightkey')
  ON CONFLICT (subdomain) DO NOTHING
  RETURNING id INTO v_company_id;

  -- If already existed, fetch it
  IF v_company_id IS NULL THEN
    SELECT id INTO v_company_id
    FROM public.companies
    WHERE subdomain = 'brightkey'
    LIMIT 1;
  END IF;

  -- Register owner as tenant member
  INSERT INTO public.tenant_members (tenant_id, user_id, role, user_email, full_name)
  VALUES (v_tenant_id, v_user_id, 'owner', 'johnzeustaller@gmail.com', 'John Zeus Taller')
  ON CONFLICT (user_id, tenant_id) DO UPDATE
    SET role = 'owner';

  RAISE NOTICE 'BrightKey tenant_id: %', v_tenant_id;
  RAISE NOTICE 'BrightKey company_id: %', v_company_id;
  RAISE NOTICE 'Owner user_id: %', v_user_id;

  -- ── PART 2: Backfill all NULL company_ids to BrightKey ─────────────────

  UPDATE public.products SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.employees SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.orders SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.order_items SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.inventory SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.inventory_logs SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.inventory_transactions SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.installation_bookings SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.installations SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.coupons SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.vouchers SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.product_reviews SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.global_settings SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.email_marketing_audiences SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.email_marketing_audience_members SET company_id = v_company_id WHERE company_id IS NULL;

  RAISE NOTICE 'All existing data backfilled to BrightKey company_id: %', v_company_id;

END $$;


-- ── PART 4: Harden RLS on Employees ─────────────────────────────────────────
-- Remove the weak "public insert" and "any authenticated" policies

DROP POLICY IF EXISTS "Allow public insert" ON public.employees;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.employees;
DROP POLICY IF EXISTS "Allow authenticated update" ON public.employees;
DROP POLICY IF EXISTS "Allow public delete" ON public.employees;

-- Company-scoped: only tenant members of BrightKey can read/write employees
CREATE POLICY "Company staff employees access"
  ON public.employees FOR ALL
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );


-- ── PART 5: Harden RLS on Inventory ─────────────────────────────────────────
-- Remove the "public viewable by everyone" policy

DROP POLICY IF EXISTS "Public inventory viewable by everyone." ON public.inventory;

-- Company-scoped: only BrightKey staff can see BrightKey inventory
CREATE POLICY "Company staff inventory access"
  ON public.inventory FOR ALL
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );


-- ── PART 6: Harden RLS on Orders ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can insert orders." ON public.orders;
DROP POLICY IF EXISTS "Company staff orders access" ON public.orders;

-- Allow public (ecommerce customers) to still insert orders
CREATE POLICY "Public can insert orders"
  ON public.orders FOR INSERT
  WITH CHECK (true);

-- Only company staff can read, update, delete orders
CREATE POLICY "Company staff orders access"
  ON public.orders FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Company staff orders write"
  ON public.orders FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Company staff orders delete"
  ON public.orders FOR DELETE
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );


-- ── PART 7: Harden RLS on Order Items ────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can insert order items." ON public.order_items;
DROP POLICY IF EXISTS "Company staff order_items access" ON public.order_items;

-- Allow public inserts (ecommerce checkout still needs this)
CREATE POLICY "Public can insert order items"
  ON public.order_items FOR INSERT
  WITH CHECK (true);

-- Only company staff can read, update, delete order items
CREATE POLICY "Company staff order_items access"
  ON public.order_items FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Company staff order_items write"
  ON public.order_items FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Company staff order_items delete"
  ON public.order_items FOR DELETE
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );


-- ── PART 8: Harden RLS on Installations ──────────────────────────────────────

DROP POLICY IF EXISTS "Public read installations." ON public.installations;
DROP POLICY IF EXISTS "Company staff installations access" ON public.installations;

CREATE POLICY "Company staff installations access"
  ON public.installations FOR ALL
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );


-- ── PART 9: Remove the old "Auth full access" on product_reviews if still present ──

DROP POLICY IF EXISTS "Auth full access" ON public.product_reviews;

-- Ensure company-scoped staff policy is in place (migration 14 already adds this,
-- but we re-apply it in case the old "Auth full access" was overriding it)
DROP POLICY IF EXISTS "Company staff reviews access" ON public.product_reviews;
CREATE POLICY "Company staff reviews access" ON public.product_reviews
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

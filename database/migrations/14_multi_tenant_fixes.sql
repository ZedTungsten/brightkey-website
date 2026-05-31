-- Migration: Saas Multi-Tenant Schema Fixes & Table Deprecations (14_multi_tenant_fixes.sql)
-- Drops deprecated features tables and enforces robust company_id level RLS isolation.

-- 1. Remove Deprecated Reference Tables
DROP TABLE IF EXISTS public.solarpower_features CASCADE;
DROP TABLE IF EXISTS public.cctv_features CASCADE;
DROP TABLE IF EXISTS public.fireextinguisher_features CASCADE;

-- 2. Add company_id Scoping Columns to Unsecured Tables
ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.shipping_rates ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.installation_bookings ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- 3. Adjust Shipping Rates Unique Constraint to Support Multi-Tenancy (Unique per City per Company)
ALTER TABLE public.shipping_rates DROP CONSTRAINT IF EXISTS shipping_rates_city_key;
ALTER TABLE public.shipping_rates ADD CONSTRAINT unique_city_company UNIQUE (city, company_id);

-- 4. Enable Row Level Security (RLS) on all target tables
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- 5. Define Secure Tenant-isolated RLS Policies

-- Row level policies for product_reviews
DROP POLICY IF EXISTS "Public read approved" ON public.product_reviews;
CREATE POLICY "Public read approved" ON public.product_reviews
  FOR SELECT USING (is_approved = true AND is_hidden = false);

DROP POLICY IF EXISTS "Public insert pending" ON public.product_reviews;
CREATE POLICY "Public insert pending" ON public.product_reviews
  FOR INSERT WITH CHECK (is_approved = false);

DROP POLICY IF EXISTS "Auth full access" ON public.product_reviews;
DROP POLICY IF EXISTS "Company staff reviews access" ON public.product_reviews;
CREATE POLICY "Company staff reviews access" ON public.product_reviews
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Row level policies for shipping_rates
DROP POLICY IF EXISTS "Public shipping rates viewable by everyone." ON public.shipping_rates;
CREATE POLICY "Public shipping rates viewable by everyone." ON public.shipping_rates
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Company staff shipping access" ON public.shipping_rates;
CREATE POLICY "Company staff shipping access" ON public.shipping_rates
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Row level policies for inventory_logs
DROP POLICY IF EXISTS "Public read inventory logs." ON public.inventory_logs;
DROP POLICY IF EXISTS "Company staff inventory logs access" ON public.inventory_logs;
CREATE POLICY "Company staff inventory logs access" ON public.inventory_logs
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Row level policies for inventory_transactions
DROP POLICY IF EXISTS "Allow public select" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Allow public insert" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Allow public update" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Allow public delete" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Company staff inventory transactions access" ON public.inventory_transactions;
CREATE POLICY "Company staff inventory transactions access" ON public.inventory_transactions
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Row level policies for installation_bookings
DROP POLICY IF EXISTS "Allow public insert installation_bookings" ON public.installation_bookings;
DROP POLICY IF EXISTS "Allow public read installation_bookings" ON public.installation_bookings;
DROP POLICY IF EXISTS "Allow public update installation_bookings" ON public.installation_bookings;
DROP POLICY IF EXISTS "Company staff installation bookings access" ON public.installation_bookings;
CREATE POLICY "Company staff installation bookings access" ON public.installation_bookings
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Row level policies for vouchers
DROP POLICY IF EXISTS "Customers can view own vouchers." ON public.vouchers;
CREATE POLICY "Customers can view own vouchers." ON public.vouchers
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Company staff vouchers access" ON public.vouchers;
CREATE POLICY "Company staff vouchers access" ON public.vouchers
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Row level policies for support_messages
DROP POLICY IF EXISTS "Customers can view own messages." ON public.support_messages;
CREATE POLICY "Customers can view own messages." ON public.support_messages
  FOR SELECT USING (
    ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Customers can insert own messages." ON public.support_messages;
CREATE POLICY "Customers can insert own messages." ON public.support_messages
  FOR INSERT WITH CHECK (
    ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid())
    AND sender_type = 'customer'
  );

DROP POLICY IF EXISTS "Company staff support messages access" ON public.support_messages;
CREATE POLICY "Company staff support messages access" ON public.support_messages
  FOR ALL USING (
    ticket_id IN (
      SELECT id FROM public.support_tickets 
      WHERE company_id IN (
        SELECT id FROM public.companies 
        WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
      )
    )
  );

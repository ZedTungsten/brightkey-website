-- =============================================================================
-- BrightKey Ecommerce Schema Update (v8)
-- RLS Policy configuration for products, inventory, and product_images tables.
-- Run this in your Supabase SQL Editor to allow public read/write operations
-- on these tables in staging/development.
-- =============================================================================

-- 1. DROP RESTRICTIVE POLICIES
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.products;
DROP POLICY IF EXISTS "Public inventory viewable by everyone." ON public.inventory;
DROP POLICY IF EXISTS "Public product images viewable by everyone." ON public.product_images;

-- Drop any other conflicting public policies if they exist
DROP POLICY IF EXISTS "Allow public select" ON public.products;
DROP POLICY IF EXISTS "Allow public insert" ON public.products;
DROP POLICY IF EXISTS "Allow public update" ON public.products;
DROP POLICY IF EXISTS "Allow public delete" ON public.products;

DROP POLICY IF EXISTS "Allow public select" ON public.inventory;
DROP POLICY IF EXISTS "Allow public insert" ON public.inventory;
DROP POLICY IF EXISTS "Allow public update" ON public.inventory;
DROP POLICY IF EXISTS "Allow public delete" ON public.inventory;

DROP POLICY IF EXISTS "Allow public select" ON public.product_images;
DROP POLICY IF EXISTS "Allow public insert" ON public.product_images;
DROP POLICY IF EXISTS "Allow public update" ON public.product_images;
DROP POLICY IF EXISTS "Allow public delete" ON public.product_images;

-- 2. CREATE PRODUCTS POLICIES
CREATE POLICY "Allow public select" ON public.products FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.products FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.products FOR DELETE USING (true);

-- 3. CREATE INVENTORY POLICIES
CREATE POLICY "Allow public select" ON public.inventory FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.inventory FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.inventory FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.inventory FOR DELETE USING (true);

-- 4. CREATE PRODUCT IMAGES POLICIES
CREATE POLICY "Allow public select" ON public.product_images FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.product_images FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.product_images FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.product_images FOR DELETE USING (true);

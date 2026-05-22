-- =============================================================================
-- BrightKey Ecommerce Schema Update (v9)
-- Update reviews table: support reviewer email, parent replies, nullable ratings
-- and clean up RLS policies.
-- =============================================================================

-- 1. Alter Columns
ALTER TABLE public.reviews
ALTER COLUMN rating DROP NOT NULL;

-- 2. Add New Columns
ALTER TABLE public.reviews
ADD COLUMN IF NOT EXISTS reviewer_email text,
ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.reviews(id) ON DELETE CASCADE;

-- 3. Create Indexes
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_parent_id ON public.reviews(parent_id);

-- 4. Re-configure RLS Policies
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved reviews viewable by everyone." ON public.reviews;
DROP POLICY IF EXISTS "Allow public select approved reviews" ON public.reviews;
DROP POLICY IF EXISTS "Allow public select" ON public.reviews;
DROP POLICY IF EXISTS "Allow public insert reviews" ON public.reviews;
DROP POLICY IF EXISTS "Allow public insert" ON public.reviews;
DROP POLICY IF EXISTS "Allow authenticated full access to reviews" ON public.reviews;
DROP POLICY IF EXISTS "Allow authenticated update" ON public.reviews;
DROP POLICY IF EXISTS "Allow authenticated delete" ON public.reviews;

-- Anyone (including guests) can read approved reviews
CREATE POLICY "Allow public select approved reviews" 
  ON public.reviews FOR SELECT 
  USING (is_approved = true);

-- Anyone can submit a review, but it defaults/forces is_approved to false
CREATE POLICY "Allow public insert reviews" 
  ON public.reviews FOR INSERT 
  WITH CHECK (is_approved = false);

-- Authenticated employees/admins have full access (approve, reply, delete)
CREATE POLICY "Allow authenticated full access to reviews" 
  ON public.reviews FOR ALL 
  TO authenticated 
  USING (true) 
  WITH CHECK (true);

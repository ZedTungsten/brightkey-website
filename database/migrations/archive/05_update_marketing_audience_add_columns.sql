-- Migration: Add contact, shipping, and audience preference columns to public.marketing_audience
ALTER TABLE public.marketing_audience
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Philippines',
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS zip_code TEXT,
ADD COLUMN IF NOT EXISTS audience TEXT DEFAULT 'Customer',
ADD COLUMN IF NOT EXISTS value TEXT;

-- Drop existing public policies if any
DROP POLICY IF EXISTS "Allow public insert" ON public.marketing_audience;
DROP POLICY IF EXISTS "Allow public update" ON public.marketing_audience;
DROP POLICY IF EXISTS "Allow public select" ON public.marketing_audience;

-- Create RLS policies to allow public (anon) inserts, updates (upserts) and selects
CREATE POLICY "Allow public insert" ON public.marketing_audience FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.marketing_audience FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public select" ON public.marketing_audience FOR SELECT USING (true);

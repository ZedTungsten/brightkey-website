-- Create marketing_audience table for storing promotional popup signups
CREATE TABLE IF NOT EXISTS public.marketing_audience (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  source      TEXT NOT NULL DEFAULT 'promo_popup',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.marketing_audience ENABLE ROW LEVEL SECURITY;

-- Allow public anonymous inserts (so customers can subscribe on frontend pages)
DROP POLICY IF EXISTS "Allow public insert to marketing_audience" ON public.marketing_audience;
CREATE POLICY "Allow public insert to marketing_audience"
  ON public.marketing_audience
  FOR INSERT
  WITH CHECK (true);

-- Allow authenticated admins to view/delete audience rows
DROP POLICY IF EXISTS "Allow auth select/delete to marketing_audience" ON public.marketing_audience;
CREATE POLICY "Allow auth select/delete to marketing_audience"
  ON public.marketing_audience
  FOR ALL
  TO authenticated
  USING (true);

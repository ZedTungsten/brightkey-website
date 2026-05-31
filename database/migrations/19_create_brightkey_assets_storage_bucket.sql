-- Migration: Create brightkey-assets storage bucket for public assets, invoices, site photos, and employee docs
-- Supabase Storage brightkey-assets bucket

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brightkey-assets',
  'brightkey-assets',
  true,
  52428800, -- 50MB limit
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for public read
CREATE POLICY "Public read brightkey-assets"
  ON storage.objects FOR SELECT USING (bucket_id = 'brightkey-assets');

-- RLS Policies for authenticated uploads (just in case frontend uploads directly)
CREATE POLICY "Auth upload brightkey-assets"
  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'brightkey-assets');

CREATE POLICY "Auth delete brightkey-assets"
  ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'brightkey-assets');

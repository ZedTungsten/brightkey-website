-- Create helper function to calculate tenant storage usage
CREATE OR REPLACE FUNCTION public.get_all_tenants_storage_usage()
RETURNS TABLE (tenant_id UUID, company_id UUID, bytes_used BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.tenant_id,
    c.id AS company_id,
    COALESCE(
      (
        SELECT SUM((metadata->>'size')::BIGINT)
        FROM storage.objects
        WHERE bucket_id IN ('brightkey-assets', 'brightkey-internal')
          AND name LIKE 'companies/' || c.id || '/%'
      ), 
      0
    )::BIGINT AS bytes_used
  FROM public.companies c;
END;
$$;

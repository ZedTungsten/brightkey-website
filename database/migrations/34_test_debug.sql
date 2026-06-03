-- Migration 34: Debug DB Counts (Temporary Helper)
CREATE OR REPLACE FUNCTION public.debug_get_counts()
RETURNS JSONB SECURITY DEFINER AS $$
DECLARE
  v_comp_count INT;
  v_type_count INT;
  v_acct_count INT;
  v_companies JSONB;
BEGIN
  SELECT count(*) INTO v_comp_count FROM public.companies;
  SELECT count(*) INTO v_type_count FROM public.bookkeeping_transaction_types;
  SELECT count(*) INTO v_acct_count FROM public.bookkeeping_accounts;
  
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'subdomain', subdomain)), '[]'::jsonb)
  INTO v_companies 
  FROM public.companies;
  
  RETURN jsonb_build_object(
    'companies_count', v_comp_count,
    'types_count', v_type_count,
    'accounts_count', v_acct_count,
    'companies', v_companies
  );
END;
$$ LANGUAGE plpgsql;

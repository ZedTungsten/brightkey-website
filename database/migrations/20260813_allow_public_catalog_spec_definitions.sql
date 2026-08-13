-- Product cards need the company-scoped specification labels and preview-card
-- selections. No other company setting is exposed by this policy change.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'global_settings'
      AND policyname = 'Allow public storefront settings read'
  ) THEN
    ALTER POLICY "Allow public storefront settings read"
      ON public.global_settings
      TO anon
      USING (key IN (
        'free_shipping',
        'free_gifts',
        'upsell_cross_sell',
        'delivery_lead_time',
        'promo_popup',
        'invoice_template',
        'catalog_spec_definitions'
      ));
  ELSE
    CREATE POLICY "Allow public storefront settings read"
      ON public.global_settings
      FOR SELECT
      TO anon
      USING (key IN (
        'free_shipping',
        'free_gifts',
        'upsell_cross_sell',
        'delivery_lead_time',
        'promo_popup',
        'invoice_template',
        'catalog_spec_definitions'
      ));
  END IF;
END
$$;

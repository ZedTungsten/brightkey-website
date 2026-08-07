-- Restore the legacy BrightKey catalog specifications after specification
-- definitions became company-scoped. Other tenants intentionally remain empty.

DO $$
DECLARE
  brightkey_company_id CONSTANT UUID := 'e6cf43ed-1f42-4aad-a6ed-470147a0489f';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.companies
    WHERE id = brightkey_company_id
      AND name = 'BrightKey'
  ) THEN
    RAISE EXCEPTION 'Expected BrightKey company was not found; catalog specifications were not restored.';
  END IF;

  INSERT INTO public.global_settings (company_id, key, value, updated_at)
  VALUES (
    brightkey_company_id,
    'catalog_spec_definitions',
    jsonb_build_object(
      'definitions',
      jsonb_build_array(
        jsonb_build_object('id', 'model', 'label', 'Model', 'field', 'spec_model', 'source', 'column', 'placeholder', 'e.g. A04-TT'),
        jsonb_build_object('id', 'color', 'label', 'Color', 'field', 'spec_color', 'source', 'column', 'placeholder', 'e.g. Matte Black, Silver'),
        jsonb_build_object('id', 'weight', 'label', 'Weight', 'field', 'spec_weight', 'source', 'column', 'placeholder', 'e.g. 2.5 kg'),
        jsonb_build_object('id', 'operating_temperature', 'label', 'Operating Temperature', 'field', 'spec_operating_temperature', 'source', 'column', 'placeholder', 'e.g. -20°C to 60°C'),
        jsonb_build_object('id', 'warranty', 'label', 'Warranty', 'field', 'spec_warranty', 'source', 'column', 'placeholder', 'e.g. 1 Year'),
        jsonb_build_object('id', 'support', 'label', 'Technical Support', 'field', 'spec_support', 'source', 'column', 'placeholder', 'e.g. Lifetime, 2 Years'),
        jsonb_build_object('id', 'material', 'label', 'Material', 'field', 'spec_material', 'source', 'column', 'placeholder', 'e.g. Aluminum Alloy'),
        jsonb_build_object('id', 'voltage', 'label', 'Voltage', 'field', 'spec_voltage', 'source', 'column', 'placeholder', 'e.g. DC 6V'),
        jsonb_build_object('id', 'dimension', 'label', 'Dimension', 'field', 'spec_dimension', 'source', 'column', 'placeholder', 'e.g. 350 x 75 x 30 mm')
      )
    ),
    NOW()
  )
  ON CONFLICT (key, company_id) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = NOW()
  WHERE COALESCE(
    jsonb_array_length(
      CASE
        WHEN jsonb_typeof(public.global_settings.value->'definitions') = 'array'
          THEN public.global_settings.value->'definitions'
        ELSE '[]'::jsonb
      END
    ),
    0
  ) = 0;
END
$$;

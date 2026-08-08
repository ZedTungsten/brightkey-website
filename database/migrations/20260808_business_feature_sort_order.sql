-- Tenant-controlled product feature ordering.
ALTER TABLE public.business_features
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

WITH ranked_features AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY business_id
      ORDER BY sort_order, created_at, name, id
    ) - 1 AS ordered_position
  FROM public.business_features
)
UPDATE public.business_features AS feature
SET sort_order = ranked.ordered_position
FROM ranked_features AS ranked
WHERE feature.id = ranked.id;

CREATE INDEX IF NOT EXISTS business_features_business_sort_idx
  ON public.business_features (business_id, sort_order, id);

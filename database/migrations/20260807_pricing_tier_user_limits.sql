ALTER TABLE public.pricing_tiers
  ADD COLUMN IF NOT EXISTS user_limit INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pricing_tiers_user_limit_positive'
      AND conrelid = 'public.pricing_tiers'::regclass
  ) THEN
    ALTER TABLE public.pricing_tiers
      ADD CONSTRAINT pricing_tiers_user_limit_positive
      CHECK (user_limit IS NULL OR user_limit > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.pricing_tiers.user_limit IS
  'Maximum number of tenant member accounts allowed while subscribed to this pricing tier.';

-- Custom specification values are keyed by the company-level catalog registry.
-- Existing dedicated spec_* columns remain intact for backward compatibility.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS specifications JSONB NOT NULL DEFAULT '{}'::JSONB;

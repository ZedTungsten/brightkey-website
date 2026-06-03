-- Migration: Drop old shipping_rates table (16_drop_shipping_rates.sql)
-- Cleans up the old shipping_rates table since shipping_zones and shipping_areas are used instead.

DROP TABLE IF EXISTS public.shipping_rates CASCADE;

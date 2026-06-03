-- Migration: Fix coupons unique constraint for multi-tenancy
-- Drops the global unique constraint on coupon code and replaces it with a composite unique constraint (code, company_id)

-- 1. Drop the existing single-column unique constraint
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_code_key;

-- 2. Add composite unique constraint so different companies can use the same coupon code
ALTER TABLE public.coupons ADD CONSTRAINT coupons_code_company_id_key UNIQUE (code, company_id);

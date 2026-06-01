-- Migration: Fix global_settings primary key for multi-tenancy
-- Associates existing NULL company_id settings with a company, drops key-only primary key,
-- and makes (key, company_id) the composite primary key.

-- 1. Associate any existing settings with a valid company if company_id is NULL
UPDATE public.global_settings 
SET company_id = (SELECT id FROM public.companies LIMIT 1) 
WHERE company_id IS NULL AND (SELECT COUNT(*) FROM public.companies) > 0;

-- 2. Drop the single-column primary key constraint
ALTER TABLE public.global_settings DROP CONSTRAINT IF EXISTS global_settings_pkey;

-- 3. Make company_id NOT NULL for future scoping (tenant settings must be scoped)
ALTER TABLE public.global_settings ALTER COLUMN company_id SET NOT NULL;

-- 4. Add the new composite primary key constraint
ALTER TABLE public.global_settings ADD PRIMARY KEY (key, company_id);

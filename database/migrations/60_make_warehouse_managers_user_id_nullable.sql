-- Make user_id nullable and add employee_email column to warehouse_managers
ALTER TABLE public.warehouse_managers ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.warehouse_managers ADD COLUMN IF NOT EXISTS employee_email TEXT;

-- 11_employee_shifts.sql
-- Add shift scheduling columns to employees table
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS shift_days VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS shift_time_1 VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS shift_time_2 VARCHAR(50) DEFAULT NULL;

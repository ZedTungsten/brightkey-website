-- Alter warehouse_managers table to add can_manage_all_orders column
ALTER TABLE public.warehouse_managers
  ADD COLUMN IF NOT EXISTS can_manage_all_orders boolean NOT NULL DEFAULT true;

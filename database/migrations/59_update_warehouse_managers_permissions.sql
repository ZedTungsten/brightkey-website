-- Update warehouse_managers table to support additional permissions
ALTER TABLE public.warehouse_managers ADD COLUMN IF NOT EXISTS can_inspect BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.warehouse_managers ADD COLUMN IF NOT EXISTS can_transfer BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.warehouse_managers ADD COLUMN IF NOT EXISTS can_order BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.warehouse_managers ADD COLUMN IF NOT EXISTS can_edit_stocks BOOLEAN NOT NULL DEFAULT true;

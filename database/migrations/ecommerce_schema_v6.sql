-- =============================================================================
-- BrightKey Ecommerce Schema Update (v6)
-- Unified Inventory Snapshot, Ledger, Order Channels, and Installations
-- Run this in your Supabase SQL Editor.
-- =============================================================================

-- 1. Modify public.inventory table
-- Remove old non-negative constraint if present (to allow negative available backorders)
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS check_non_negative;

-- Add incoming column to track supplier orders
ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS incoming integer DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS returned integer DEFAULT 0 NOT NULL;

-- 2. Setup Ledger Enum and Table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_event_type') THEN
    CREATE TYPE public.inventory_event_type AS ENUM (
      'supplier_ordered', 
      'received',         
      'order_reserved',  
      'packed',           
      'dispatch',         
      'return',           
      'cancellation'      
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.inventory_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  event_type public.inventory_event_type NOT NULL,
  quantity_change integer NOT NULL, -- positive for increments, positive count of delta
  reference_id uuid, -- Link to order_id or supplier PO batch ID
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- 3. Modify orders table to support channels and fulfillment status
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS channel text DEFAULT 'ecommerce' CHECK (channel IN ('ecommerce', 'installation')),
ADD COLUMN IF NOT EXISTS fulfillment_status text DEFAULT 'pending' CHECK (fulfillment_status IN ('pending', 'packed', 'dispatched', 'delivered', 'cancelled', 'returned'));

-- 4. Installations Table for manual order flows
CREATE TABLE IF NOT EXISTS public.installations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  door_material text,
  door_picture_url text,
  map_link text,
  scheduled_date date,
  installer_notes text,
  proof_picture_urls jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'completed')),
  created_at timestamp with time zone DEFAULT now()
);

-- 5. Enable Row Level Security
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read inventory logs." ON public.inventory_logs FOR SELECT USING (true);
CREATE POLICY "Public read installations." ON public.installations FOR SELECT USING (true);

-- 6. Trigger Function to Automate Inventory Summarization
CREATE OR REPLACE FUNCTION public.process_inventory_log_entry()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure snapshot row exists
  INSERT INTO public.inventory (product_id, available, incoming, reserved, dispatched, returned)
  VALUES (NEW.product_id, 0, 0, 0, 0, 0)
  ON CONFLICT (product_id) DO NOTHING;

  -- Apply aggregates based on event type
  CASE NEW.event_type
    WHEN 'supplier_ordered' THEN
      UPDATE public.inventory
      SET incoming = incoming + NEW.quantity_change,
          last_updated = now()
      WHERE product_id = NEW.product_id;

    WHEN 'received' THEN
      UPDATE public.inventory
      SET incoming = incoming - NEW.quantity_change,
          available = available + NEW.quantity_change,
          last_updated = now()
      WHERE product_id = NEW.product_id;

    WHEN 'order_reserved' THEN
      UPDATE public.inventory
      SET available = available - NEW.quantity_change,
          reserved = reserved + NEW.quantity_change,
          last_updated = now()
      WHERE product_id = NEW.product_id;

    WHEN 'dispatch' THEN
      UPDATE public.inventory
      SET reserved = reserved - NEW.quantity_change,
          dispatched = dispatched + NEW.quantity_change,
          last_updated = now()
      WHERE product_id = NEW.product_id;

    WHEN 'cancellation' THEN
      UPDATE public.inventory
      SET reserved = reserved - NEW.quantity_change,
          available = available + NEW.quantity_change,
          last_updated = now()
      WHERE product_id = NEW.product_id;

    WHEN 'return' THEN
      UPDATE public.inventory
      SET available = available + NEW.quantity_change,
          dispatched = dispatched - NEW.quantity_change,
          returned = returned + NEW.quantity_change,
          last_updated = now()
      WHERE product_id = NEW.product_id;

    ELSE
      -- 'packed' does not alter physical counts, just status flags
      NULL;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Bind the trigger to inventory_logs
DROP TRIGGER IF EXISTS trg_process_inventory_log ON public.inventory_logs;
CREATE TRIGGER trg_process_inventory_log
AFTER INSERT ON public.inventory_logs
FOR EACH ROW
EXECUTE FUNCTION public.process_inventory_log_entry();

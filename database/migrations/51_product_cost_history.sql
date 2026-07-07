-- Create product_cost_history table
CREATE TABLE public.product_cost_history (
  id          SERIAL PRIMARY KEY,
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES public.products(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL,
  cost        INTEGER NOT NULL DEFAULT 0, -- stored in centavos (PHP * 100)
  start_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date    TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.product_cost_history ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Finance module product_cost_history" ON public.product_cost_history
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Finance'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Finance'));

-- Trigger function to track products cost history
CREATE OR REPLACE FUNCTION public.track_product_cost_history()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    -- Insert initial cost history record
    INSERT INTO public.product_cost_history (company_id, product_id, sku, cost, start_date, end_date)
    VALUES (NEW.company_id, NEW.id, NEW.sku, COALESCE(NEW.dealer_price, 0), NOW(), NULL);
  ELSIF (TG_OP = 'UPDATE') THEN
    -- If dealer_price or sku changed, end current cost history and insert new one
    IF (OLD.dealer_price IS DISTINCT FROM NEW.dealer_price OR OLD.sku IS DISTINCT FROM NEW.sku) THEN
      UPDATE public.product_cost_history
      SET end_date = NOW()
      WHERE product_id = NEW.id AND end_date IS NULL;
      
      INSERT INTO public.product_cost_history (company_id, product_id, sku, cost, start_date, end_date)
      VALUES (NEW.company_id, NEW.id, NEW.sku, COALESCE(NEW.dealer_price, 0), NOW(), NULL);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
CREATE OR REPLACE TRIGGER trg_track_product_cost_history
  AFTER INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.track_product_cost_history();

-- Backfill existing products
INSERT INTO public.product_cost_history (company_id, product_id, sku, cost, start_date, end_date)
SELECT company_id, id, sku, COALESCE(dealer_price, 0), created_at, NULL
FROM public.products;

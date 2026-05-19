-- =============================================================================
-- BrightKey Ecommerce Schema
-- Run this in your Supabase SQL Editor to create the necessary tables.
-- =============================================================================

-- 1. Products Table
CREATE TABLE public.products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  price integer NOT NULL, -- Stored in centavos/cents
  compare_at_price integer,
  sku text UNIQUE,
  category text NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('published', 'draft')),
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Inventory Table (Internal System Hook)
CREATE TABLE public.inventory (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  available integer DEFAULT 0 NOT NULL,
  ordered_past_month integer DEFAULT 0 NOT NULL,
  last_updated timestamp with time zone DEFAULT now()
);

-- 3. Product Images
CREATE TABLE public.product_images (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  cdn_url text NOT NULL,
  alt_text text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- 4. Shipping Rates (Based on Philippine Cities)
CREATE TABLE public.shipping_rates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  city text UNIQUE NOT NULL,
  fee integer, -- 0 = Free, Integer = fee in centavos/cents, NULL = N/A (Not serviceble)
  created_at timestamp with time zone DEFAULT now()
);

-- 5. Reviews
CREATE TABLE public.reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  reviewer_name text NOT NULL,
  comment text,
  is_approved boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- 6. Orders
CREATE TABLE public.orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  shipping_city text,
  shipping_address text,
  total_amount integer NOT NULL,
  shipping_fee integer,
  payment_intent_id text, -- From PayMongo
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'fulfilled', 'cancelled')),
  created_at timestamp with time zone DEFAULT now()
);

-- 7. Order Items
CREATE TABLE public.order_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1,
  price_at_purchase integer NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- =============================================================================
-- RLS (Row Level Security) Policies
-- =============================================================================

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Allow public read access to active catalog items
CREATE POLICY "Public profiles are viewable by everyone." ON public.products
  FOR SELECT USING (status = 'published');

CREATE POLICY "Public inventory viewable by everyone." ON public.inventory
  FOR SELECT USING (true);

CREATE POLICY "Public product images viewable by everyone." ON public.product_images
  FOR SELECT USING (true);

CREATE POLICY "Public shipping rates viewable by everyone." ON public.shipping_rates
  FOR SELECT USING (true);

CREATE POLICY "Approved reviews viewable by everyone." ON public.reviews
  FOR SELECT USING (is_approved = true);

-- Allow public to INSERT into orders and order_items (Guest Checkout)
CREATE POLICY "Anyone can insert orders." ON public.orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can insert order items." ON public.order_items
  FOR INSERT WITH CHECK (true);

-- Note: We only allow INSERT for orders, so guests can't query all orders without auth.

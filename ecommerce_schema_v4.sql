-- =============================================================================
-- BrightKey Ecommerce Schema Update (v4)
-- VIP Customer Portal Requirements
-- Run this in your Supabase SQL Editor.
-- =============================================================================

-- 1. Extend Users (We don't modify auth.users directly, we create a profile table)
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  is_affiliate boolean DEFAULT false,
  affiliate_code text UNIQUE,
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Link Orders to Users
-- We alter the orders table to optionally link to a registered user
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.customer_profiles(id) ON DELETE SET NULL;

-- 3. Vouchers / Rewards
CREATE TABLE IF NOT EXISTS public.vouchers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
  code text UNIQUE NOT NULL,
  discount_value numeric(10,2) NOT NULL, -- Fixed amount in PHP (cents) or percentage depending on type
  discount_type text CHECK (discount_type IN ('fixed', 'percentage')),
  is_used boolean DEFAULT false,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- 4. Support Tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
  subject text NOT NULL,
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 5. Support Messages (Threaded chat inside a ticket)
CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('customer', 'admin')),
  sender_id uuid, -- Can be auth.user ID
  message text NOT NULL,
  attachment_urls jsonb DEFAULT '[]'::jsonb, -- Array of strings (Supabase Storage URLs)
  created_at timestamp with time zone DEFAULT now()
);

-- Ensure RLS is enabled on new tables
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- 6. Setup Basic Policies
-- Customers can read their own profiles and update certain fields
CREATE POLICY "Customers can view own profile." ON public.customer_profiles
  FOR SELECT USING (auth.uid() = id);

-- Customers can view their own vouchers
CREATE POLICY "Customers can view own vouchers." ON public.vouchers
  FOR SELECT USING (auth.uid() = user_id);

-- Customers can view and insert their own tickets
CREATE POLICY "Customers can view own tickets." ON public.support_tickets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Customers can insert own tickets." ON public.support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Customers can view and insert messages in their tickets
CREATE POLICY "Customers can view own messages." ON public.support_messages
  FOR SELECT USING (
    ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid())
  );
CREATE POLICY "Customers can insert own messages." ON public.support_messages
  FOR INSERT WITH CHECK (
    ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid())
    AND sender_type = 'customer'
  );

-- Admins (authenticated via the dashboard) need separate policies to view everything.
-- This usually depends on an `is_admin` claim, but for now we assume anyone in the admin app
-- is using the service_role key or we add an admin policy later.

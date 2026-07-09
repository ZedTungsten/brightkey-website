-- 1. Create software_subscriptions table if not exists
CREATE TABLE IF NOT EXISTS public.software_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    mode TEXT NOT NULL CHECK (mode IN ('pay_as_you_go', 'monthly', 'annual')),
    cost_centavos INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed')),
    subscribed_date DATE NOT NULL DEFAULT CURRENT_DATE,
    unsubscribed_date DATE,
    billing_url TEXT,
    account_email TEXT,
    card_last_four TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add columns if they do not exist
ALTER TABLE public.software_subscriptions ADD COLUMN IF NOT EXISTS billing_url TEXT;
ALTER TABLE public.software_subscriptions ADD COLUMN IF NOT EXISTS account_email TEXT;
ALTER TABLE public.software_subscriptions ADD COLUMN IF NOT EXISTS card_last_four TEXT;

-- 3. Enable RLS
ALTER TABLE public.software_subscriptions ENABLE ROW LEVEL SECURITY;

-- 4. Create policies conditionally
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'software_subscriptions' AND policyname = 'Allow company members read software_subscriptions'
    ) THEN
        CREATE POLICY "Allow company members read software_subscriptions" ON public.software_subscriptions
            FOR SELECT USING (
                company_id IN (
                    SELECT c.id FROM public.companies c
                    JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
                    WHERE tm.user_id = auth.uid()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'software_subscriptions' AND policyname = 'Allow company members write software_subscriptions'
    ) THEN
        CREATE POLICY "Allow company members write software_subscriptions" ON public.software_subscriptions
            FOR ALL USING (
                company_id IN (
                    SELECT c.id FROM public.companies c
                    JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
                    WHERE tm.user_id = auth.uid()
                )
            );
    END IF;
END $$;

-- 5. Create software_subscription_billing table if not exists
CREATE TABLE IF NOT EXISTS public.software_subscription_billing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES public.software_subscriptions(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    billing_month DATE NOT NULL, -- First of the month, e.g. '2026-07-01'
    cost_centavos INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('pay_as_you_go', 'monthly', 'annual', 'unsubscribed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (subscription_id, billing_month)
);

-- 6. Enable RLS
ALTER TABLE public.software_subscription_billing ENABLE ROW LEVEL SECURITY;

-- 7. Create policies conditionally for billing table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'software_subscription_billing' AND policyname = 'Allow company members read software_subscription_billing'
    ) THEN
        CREATE POLICY "Allow company members read software_subscription_billing" ON public.software_subscription_billing
            FOR SELECT USING (
                company_id IN (
                    SELECT c.id FROM public.companies c
                    JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
                    WHERE tm.user_id = auth.uid()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'software_subscription_billing' AND policyname = 'Allow company members write software_subscription_billing'
    ) THEN
        CREATE POLICY "Allow company members write software_subscription_billing" ON public.software_subscription_billing
            FOR ALL USING (
                company_id IN (
                    SELECT c.id FROM public.companies c
                    JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
                    WHERE tm.user_id = auth.uid()
                )
            );
    END IF;
END $$;

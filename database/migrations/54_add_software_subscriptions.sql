-- Create software_subscriptions table
CREATE TABLE public.software_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    mode TEXT NOT NULL CHECK (mode IN ('pay_as_you_go', 'monthly', 'annual')),
    cost_centavos INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed')),
    subscribed_date DATE NOT NULL DEFAULT CURRENT_DATE,
    unsubscribed_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.software_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow company members read software_subscriptions" ON public.software_subscriptions
    FOR SELECT USING (
        company_id IN (
            SELECT c.id FROM public.companies c
            JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
            WHERE tm.user_id = auth.uid()
        )
    );

CREATE POLICY "Allow company members write software_subscriptions" ON public.software_subscriptions
    FOR ALL USING (
        company_id IN (
            SELECT c.id FROM public.companies c
            JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
            WHERE tm.user_id = auth.uid()
        )
    );

-- Create software_subscription_billing table (for monthly snapshots / overrides)
CREATE TABLE public.software_subscription_billing (
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

-- Enable RLS
ALTER TABLE public.software_subscription_billing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow company members read software_subscription_billing" ON public.software_subscription_billing
    FOR SELECT USING (
        company_id IN (
            SELECT c.id FROM public.companies c
            JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
            WHERE tm.user_id = auth.uid()
        )
    );

CREATE POLICY "Allow company members write software_subscription_billing" ON public.software_subscription_billing
    FOR ALL USING (
        company_id IN (
            SELECT c.id FROM public.companies c
            JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
            WHERE tm.user_id = auth.uid()
        )
    );

-- Phase 1: tenant-isolated Meta Messenger backend foundation.
-- Page access tokens must be encrypted by the application before storage.

CREATE TABLE IF NOT EXISTS public.meta_messenger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL UNIQUE,
  page_name TEXT,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.meta_messenger_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  messenger_account_id UUID NOT NULL UNIQUE REFERENCES public.meta_messenger_accounts(id) ON DELETE CASCADE,
  page_access_token_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.meta_messenger_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  messenger_account_id UUID NOT NULL REFERENCES public.meta_messenger_accounts(id) ON DELETE CASCADE,
  psid TEXT NOT NULL,
  display_name TEXT,
  profile_picture_url TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (messenger_account_id, psid)
);

CREATE TABLE IF NOT EXISTS public.meta_messenger_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  messenger_account_id UUID NOT NULL REFERENCES public.meta_messenger_accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.meta_messenger_contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (messenger_account_id, contact_id)
);

CREATE TABLE IF NOT EXISTS public.meta_messenger_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  messenger_account_id UUID NOT NULL REFERENCES public.meta_messenger_accounts(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.meta_messenger_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.meta_messenger_conversations(id) ON DELETE CASCADE,
  webhook_event_id UUID REFERENCES public.meta_messenger_webhook_events(id) ON DELETE SET NULL,
  meta_message_id TEXT UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT NOT NULL DEFAULT 'text',
  text TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::JSONB,
  sent_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_accounts_company ON public.meta_messenger_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_meta_contacts_company ON public.meta_messenger_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_meta_conversations_company_updated ON public.meta_messenger_conversations(company_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_events_account_received ON public.meta_messenger_webhook_events(messenger_account_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_messages_conversation_sent ON public.meta_messenger_messages(conversation_id, sent_at DESC);

ALTER TABLE public.meta_messenger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_messenger_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_messenger_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_messenger_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_messenger_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_messenger_messages ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name TEXT;
  policy_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'meta_messenger_accounts',
    'meta_messenger_contacts',
    'meta_messenger_conversations',
    'meta_messenger_webhook_events',
    'meta_messenger_messages'
  ]
  LOOP
    policy_name := 'Company members can access ' || table_name;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (
          company_id IN (
            SELECT c.id FROM public.companies c
            JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
            WHERE tm.user_id = auth.uid()
          )
        ) WITH CHECK (
          company_id IN (
            SELECT c.id FROM public.companies c
            JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
            WHERE tm.user_id = auth.uid()
          )
        )',
        policy_name,
        table_name
      );
    END IF;
  END LOOP;
END $$;

-- Intentionally no authenticated policy on credentials. Only the backend service
-- role may read or write encrypted Page access tokens.

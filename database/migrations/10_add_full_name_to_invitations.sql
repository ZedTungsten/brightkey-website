-- Migration 10: Add full_name to company_invitations if missing
-- Safely adds full_name column to company_invitations (in case migration 09 was
-- partially applied or the schema cache needs to be refreshed via a DDL change).

ALTER TABLE public.company_invitations
  ADD COLUMN IF NOT EXISTS full_name TEXT;

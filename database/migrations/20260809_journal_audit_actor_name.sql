ALTER TABLE public.journal_audit_log
  ADD COLUMN IF NOT EXISTS actor_name TEXT;

COMMENT ON COLUMN public.journal_audit_log.actor_name IS
  'Full name of the authenticated user who performed the journal action.';

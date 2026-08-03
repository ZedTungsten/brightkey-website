-- Persist successful hire-email delivery so the Hired-stage action can show its state.
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS hire_email_sent_at TIMESTAMPTZ;

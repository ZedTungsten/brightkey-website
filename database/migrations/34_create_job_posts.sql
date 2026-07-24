-- =============================================================================
-- 34_create_job_posts.sql
-- Tenant-scoped Hiring job posts for regular and project-based engagements.
--
-- NON-DESTRUCTIVE: creates a new table, indexes, trigger, and RLS policies only.
-- Existing tables and records are not deleted or rewritten.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.job_posts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employment_type       TEXT NOT NULL CHECK (employment_type IN ('regular', 'project_based')),
  position              TEXT,
  department_name       TEXT,
  team_name             TEXT,
  assignee_id           UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  position_type         TEXT CHECK (position_type IS NULL OR position_type IN ('member', 'manager')),
  visibility_level      INTEGER CHECK (visibility_level BETWEEN 1 AND 4),
  job_title             VARCHAR(100) NOT NULL,
  job_description       VARCHAR(500) NOT NULL,
  qualifications        JSONB NOT NULL DEFAULT '[]'::JSONB,
  responsibilities      JSONB NOT NULL DEFAULT '{"daily":[],"weekly":[],"monthly":[]}'::JSONB,
  milestones            JSONB NOT NULL DEFAULT '[]'::JSONB,
  project_length        TEXT CHECK (project_length IS NULL OR project_length IN ('short', 'intermediate', 'long')),
  fixed_price           NUMERIC(14,2) CHECK (fixed_price IS NULL OR fixed_price >= 0),
  monthly_salary        NUMERIC(14,2) CHECK (monthly_salary IS NULL OR monthly_salary >= 0),
  salary_confidential   BOOLEAN NOT NULL DEFAULT FALSE,
  salary_negotiable     BOOLEAN NOT NULL DEFAULT FALSE,
  compensation_extras   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  benefits              TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  reporting_days        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  reporting_time_start  TIME,
  reporting_time_end    TIME,
  free_hours            BOOLEAN NOT NULL DEFAULT FALSE,
  reporting_mode        TEXT CHECK (reporting_mode IS NULL OR reporting_mode IN ('remote', 'hybrid', 'on_site', 'online', 'office')),
  location_scope        TEXT NOT NULL DEFAULT 'everywhere' CHECK (location_scope IN ('everywhere', 'specific')),
  location_country      TEXT,
  location_city         TEXT,
  applicant_type        TEXT CHECK (applicant_type IS NULL OR applicant_type IN ('agency', 'team', 'individual')),
  expertise_level       TEXT CHECK (expertise_level IS NULL OR expertise_level IN ('entry_level', 'intermediate', 'expert')),
  vacancy_count         INTEGER NOT NULL DEFAULT 1 CHECK (vacancy_count > 0),
  expected_start_date   DATE,
  tags                  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status                TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'closed')),
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT job_posts_regular_fields_check CHECK (
    employment_type <> 'regular'
    OR ((monthly_salary IS NOT NULL OR salary_confidential) AND fixed_price IS NULL AND project_length IS NULL)
  ),
  CONSTRAINT job_posts_project_fields_check CHECK (
    employment_type <> 'project_based'
    OR (fixed_price IS NOT NULL AND project_length IS NOT NULL AND monthly_salary IS NULL)
  ),
  CONSTRAINT job_posts_reporting_time_check CHECK (
    free_hours
    OR reporting_time_start IS NULL
    OR reporting_time_end IS NULL
    OR reporting_time_start < reporting_time_end
  )
);

ALTER TABLE public.job_posts ADD COLUMN IF NOT EXISTS salary_confidential BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.job_posts ADD COLUMN IF NOT EXISTS salary_negotiable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.job_posts ADD COLUMN IF NOT EXISTS compensation_extras TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.job_posts ADD COLUMN IF NOT EXISTS benefits TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.job_posts ADD COLUMN IF NOT EXISTS vacancy_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.job_posts ADD COLUMN IF NOT EXISTS expected_start_date DATE;
ALTER TABLE public.job_posts ADD COLUMN IF NOT EXISTS position_type TEXT;

ALTER TABLE public.job_posts DROP CONSTRAINT IF EXISTS job_posts_regular_fields_check;
ALTER TABLE public.job_posts ADD CONSTRAINT job_posts_regular_fields_check CHECK (
  employment_type <> 'regular'
  OR ((monthly_salary IS NOT NULL OR salary_confidential) AND fixed_price IS NULL AND project_length IS NULL)
);

ALTER TABLE public.job_posts DROP CONSTRAINT IF EXISTS job_posts_reporting_mode_check;
ALTER TABLE public.job_posts ADD CONSTRAINT job_posts_reporting_mode_check CHECK (
  reporting_mode IS NULL OR reporting_mode IN ('remote', 'hybrid', 'on_site', 'online', 'office')
);

ALTER TABLE public.job_posts DROP CONSTRAINT IF EXISTS job_posts_vacancy_count_check;
ALTER TABLE public.job_posts ADD CONSTRAINT job_posts_vacancy_count_check CHECK (vacancy_count > 0);

ALTER TABLE public.job_posts DROP CONSTRAINT IF EXISTS job_posts_position_type_check;
ALTER TABLE public.job_posts ADD CONSTRAINT job_posts_position_type_check CHECK (
  position_type IS NULL OR position_type IN ('member', 'manager')
);

CREATE INDEX IF NOT EXISTS idx_job_posts_company_id ON public.job_posts(company_id);
CREATE INDEX IF NOT EXISTS idx_job_posts_company_status ON public.job_posts(company_id, status);
CREATE INDEX IF NOT EXISTS idx_job_posts_created_at ON public.job_posts(created_at DESC);

CREATE OR REPLACE FUNCTION public.set_job_posts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_posts_updated_at ON public.job_posts;
CREATE TRIGGER trg_job_posts_updated_at
  BEFORE UPDATE ON public.job_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_job_posts_updated_at();

ALTER TABLE public.job_posts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'job_posts'
      AND policyname = 'Company members can read job posts'
  ) THEN
    CREATE POLICY "Company members can read job posts"
      ON public.job_posts FOR SELECT
      USING (
        company_id IN (
          SELECT c.id
          FROM public.companies c
          JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'job_posts'
      AND policyname = 'HR members can insert job posts'
  ) THEN
    CREATE POLICY "HR members can insert job posts"
      ON public.job_posts FOR INSERT
      WITH CHECK (
        company_id IN (
          SELECT c.id
          FROM public.companies c
          JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
          WHERE tm.user_id = auth.uid()
            AND (
              lower(COALESCE(tm.role, '')) IN ('owner', 'admin')
              OR EXISTS (
                SELECT 1
                FROM unnest(COALESCE(tm.accessible_modules, ARRAY[]::TEXT[])) AS module_row(module_name)
                WHERE lower(trim(module_name)) = 'hr'
              )
            )
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'job_posts'
      AND policyname = 'HR members can update job posts'
  ) THEN
    CREATE POLICY "HR members can update job posts"
      ON public.job_posts FOR UPDATE
      USING (
        company_id IN (
          SELECT c.id
          FROM public.companies c
          JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
          WHERE tm.user_id = auth.uid()
            AND (
              lower(COALESCE(tm.role, '')) IN ('owner', 'admin')
              OR EXISTS (
                SELECT 1
                FROM unnest(COALESCE(tm.accessible_modules, ARRAY[]::TEXT[])) AS module_row(module_name)
                WHERE lower(trim(module_name)) = 'hr'
              )
            )
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT c.id
          FROM public.companies c
          JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'job_posts'
      AND policyname = 'HR members can delete job posts'
  ) THEN
    CREATE POLICY "HR members can delete job posts"
      ON public.job_posts FOR DELETE
      USING (
        company_id IN (
          SELECT c.id
          FROM public.companies c
          JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
          WHERE tm.user_id = auth.uid()
            AND (
              lower(COALESCE(tm.role, '')) IN ('owner', 'admin')
              OR EXISTS (
                SELECT 1
                FROM unnest(COALESCE(tm.accessible_modules, ARRAY[]::TEXT[])) AS module_row(module_name)
                WHERE lower(trim(module_name)) = 'hr'
              )
            )
        )
      );
  END IF;
END $$;

COMMIT;

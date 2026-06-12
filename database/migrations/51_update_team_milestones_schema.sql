-- Migration 51: Update team_milestones schema to support deadlines, parent grouping, and completion.

ALTER TABLE public.team_milestones
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deadline DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.team_milestones(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT FALSE;

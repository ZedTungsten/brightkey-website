-- Alter assigned_by foreign key constraint in team_tasks and team_milestones
-- to reference auth.users(id) instead of public.employees(id).
-- This ensures owners/admins can assign tasks even if they aren't registered in the employees directory.

ALTER TABLE public.team_tasks DROP CONSTRAINT IF EXISTS team_tasks_assigned_by_fkey;
ALTER TABLE public.team_tasks 
  ADD CONSTRAINT team_tasks_assigned_by_fkey 
  FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.team_milestones DROP CONSTRAINT IF EXISTS team_milestones_assigned_by_fkey;
ALTER TABLE public.team_milestones 
  ADD CONSTRAINT team_milestones_assigned_by_fkey 
  FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE CASCADE;

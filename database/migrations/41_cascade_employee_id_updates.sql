-- Migration 41: Cascade Employee ID Updates
-- Drops existing foreign key constraints referencing public.employees(id) and recreates them with ON UPDATE CASCADE.
-- This prevents foreign key violations when register-employee.js updates an employee's ID to match their auth.users UUID.

-- 1. employee_adjustments
ALTER TABLE public.employee_adjustments 
  DROP CONSTRAINT IF EXISTS employee_adjustments_employee_id_fkey,
  ADD CONSTRAINT employee_adjustments_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. employee_reimbursements
ALTER TABLE public.employee_reimbursements 
  DROP CONSTRAINT IF EXISTS employee_reimbursements_employee_id_fkey,
  ADD CONSTRAINT employee_reimbursements_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. project_members
ALTER TABLE public.project_members 
  DROP CONSTRAINT IF EXISTS project_members_employee_id_fkey,
  ADD CONSTRAINT project_members_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. sales_schedules
ALTER TABLE public.sales_schedules 
  DROP CONSTRAINT IF EXISTS sales_schedules_employee_id_fkey,
  ADD CONSTRAINT sales_schedules_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. payslip_records
ALTER TABLE public.payslip_records 
  DROP CONSTRAINT IF EXISTS payslip_records_employee_id_fkey,
  ADD CONSTRAINT payslip_records_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. team_tasks
ALTER TABLE public.team_tasks 
  DROP CONSTRAINT IF EXISTS team_tasks_assigned_to_fkey,
  ADD CONSTRAINT team_tasks_assigned_to_fkey 
    FOREIGN KEY (assigned_to) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. team_milestones
ALTER TABLE public.team_milestones 
  DROP CONSTRAINT IF EXISTS team_milestones_assigned_to_fkey,
  ADD CONSTRAINT team_milestones_assigned_to_fkey 
    FOREIGN KEY (assigned_to) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. commission_assignments
ALTER TABLE public.commission_assignments 
  DROP CONSTRAINT IF EXISTS commission_assignments_employee_id_fkey,
  ADD CONSTRAINT commission_assignments_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 9. attendance_logs
ALTER TABLE public.attendance_logs 
  DROP CONSTRAINT IF EXISTS attendance_logs_employee_id_fkey,
  ADD CONSTRAINT attendance_logs_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 10. employee_update_requests
ALTER TABLE public.employee_update_requests 
  DROP CONSTRAINT IF EXISTS employee_update_requests_employee_id_fkey,
  ADD CONSTRAINT employee_update_requests_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 11. leave_requests
ALTER TABLE public.leave_requests 
  DROP CONSTRAINT IF EXISTS leave_requests_employee_id_fkey,
  ADD CONSTRAINT leave_requests_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 12. employee_chats (sender_id)
ALTER TABLE public.employee_chats 
  DROP CONSTRAINT IF EXISTS employee_chats_sender_id_fkey,
  ADD CONSTRAINT employee_chats_sender_id_fkey 
    FOREIGN KEY (sender_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 13. employee_chats (receiver_id)
ALTER TABLE public.employee_chats 
  DROP CONSTRAINT IF EXISTS employee_chats_receiver_id_fkey,
  ADD CONSTRAINT employee_chats_receiver_id_fkey 
    FOREIGN KEY (receiver_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

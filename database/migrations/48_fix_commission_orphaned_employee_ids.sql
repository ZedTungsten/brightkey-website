-- =============================================================================
-- Migration 48: Fix commission_assignments orphaned employee_ids
-- =============================================================================
-- Root Cause: register-employee.js queried employees with .eq('email', ...)
-- but the employees table column is 'email_address'. So when an existing
-- HR-created employee registered, the lookup failed (returned null), causing
-- a SECOND employee record to be inserted with a brand-new UUID.
--
-- Result: commission_assignments.employee_id still points to the OLD UUID
-- (original HR record) but employees table now has a NEW UUID for that person.
-- This makes the leaderboard show "Unknown Employee" because no match is found.
--
-- Fix: Re-point orphaned commission_assignments to the newer (auth-linked)
-- employee record by matching on email_address + company_id.
-- =============================================================================

UPDATE public.commission_assignments ca
SET employee_id = newer_emp.id
FROM
  public.employees older_emp
  JOIN public.employees newer_emp
    ON older_emp.email_address = newer_emp.email_address
    AND older_emp.company_id = newer_emp.company_id
    AND older_emp.id != newer_emp.id
    AND newer_emp.created_at > older_emp.created_at
WHERE
  ca.employee_id = older_emp.id;

-- After running and verifying, you can optionally delete the orphaned old records:
-- DELETE FROM public.employees e
-- WHERE NOT EXISTS (
--   SELECT 1 FROM public.commission_assignments ca WHERE ca.employee_id = e.id
-- )
-- AND NOT EXISTS (
--   SELECT 1 FROM public.tenant_members tm WHERE tm.user_id = e.id
-- )
-- AND e.created_at < (NOW() - INTERVAL '1 day');

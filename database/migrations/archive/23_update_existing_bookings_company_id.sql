-- Migration: Associate existing NULL company_id bookings with the first company
-- This enables RLS compliance for legacy bookings so they are visible to company staff.

UPDATE public.installation_bookings 
SET company_id = (SELECT id FROM public.companies LIMIT 1) 
WHERE company_id IS NULL AND (SELECT COUNT(*) FROM public.companies) > 0;

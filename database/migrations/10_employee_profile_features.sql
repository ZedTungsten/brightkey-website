-- 10_employee_profile_features.sql
-- Add profile customization columns to employees
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS status_text VARCHAR(150) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS cover_photo_link TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS cover_text_color VARCHAR(10) DEFAULT 'white';

-- Create employee update requests table
CREATE TABLE IF NOT EXISTS public.employee_update_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
    tenant_id UUID NOT NULL,
    requested_data JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    rejected_reason VARCHAR(150) DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on the new table
ALTER TABLE public.employee_update_requests ENABLE ROW LEVEL SECURITY;

-- Create Policies for employee_update_requests

-- 1. Members can view their own requests
CREATE POLICY "Users can view their own update requests" ON public.employee_update_requests
    FOR SELECT
    USING (
        auth.uid() = employee_id
    );

-- 2. Members can insert their own requests
CREATE POLICY "Users can submit their own update requests" ON public.employee_update_requests
    FOR INSERT
    WITH CHECK (
        auth.uid() = employee_id
    );

-- 3. HR, Admin, Owner can view all requests for the tenant
CREATE POLICY "HR/Admin/Owner can view all update requests for their tenant" ON public.employee_update_requests
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_members
            WHERE tenant_members.tenant_id = employee_update_requests.tenant_id
              AND tenant_members.user_id = auth.uid()
              AND tenant_members.role IN ('owner', 'admin', 'hr')
        )
    );

-- 4. HR, Admin, Owner can update requests for their tenant
CREATE POLICY "HR/Admin/Owner can manage update requests for their tenant" ON public.employee_update_requests
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_members
            WHERE tenant_members.tenant_id = employee_update_requests.tenant_id
              AND tenant_members.user_id = auth.uid()
              AND tenant_members.role IN ('owner', 'admin', 'hr')
        )
    );

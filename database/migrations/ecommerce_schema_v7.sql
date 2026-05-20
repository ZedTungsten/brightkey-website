-- =============================================================================
-- BrightKey Ecommerce Schema Update (v7)
-- Employee Directory Table Schema
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_number varchar UNIQUE NOT NULL,
  type varchar NOT NULL CHECK (type IN ('Full-time', 'Part-time', 'Contractor', 'Partner')),
  department varchar NOT NULL,
  title varchar NOT NULL,
  reporting_to uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  level integer CHECK (level IN (1, 2, 3, 4)),
  job_description text,
  date_hired date NOT NULL,
  first_name varchar NOT NULL,
  middle_name varchar,
  last_name varchar NOT NULL,
  date_of_birth date NOT NULL,
  address text NOT NULL,
  contact_number varchar NOT NULL,
  emergency_contact_number varchar NOT NULL,
  email varchar UNIQUE NOT NULL,
  picture_link text,
  tin varchar,
  sss varchar,
  pagibig varchar,
  philhealth varchar,
  cv_link text,
  id_link text,
  vacation_leave_load integer DEFAULT 0,
  sick_leave_load integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Drop existing select policy if it exists and recreate
DROP POLICY IF EXISTS "Public read employees." ON public.employees;
CREATE POLICY "Public read employees." ON public.employees FOR SELECT USING (true);

-- Insert mock installers for early testing
INSERT INTO public.employees (
  employee_number, type, department, title, date_hired, first_name, last_name, date_of_birth, address, contact_number, emergency_contact_number, email
) VALUES 
('BK-0001', 'Full-time', 'Operations', 'Installer', '2026-01-15', 'Juan', 'dela Cruz', '1995-05-10', '123 Rizal St, Pasig', '09171234567', '09177654321', 'juan.dc@brightkey.com'),
('BK-0002', 'Full-time', 'Operations', 'Installer', '2026-02-01', 'Pedro', 'Penduko', '1998-08-20', '456 Bonifacio St, Manila', '09181234567', '09187654321', 'pedro.p@brightkey.com'),
('BK-0003', 'Contractor', 'Operations', 'Installer', '2026-03-10', 'Carlos', 'Yulo', '2000-02-12', '789 Olympic Ave, Quezon City', '09191234567', '09197654321', 'carlos.y@brightkey.com')
ON CONFLICT (employee_number) DO NOTHING;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function test() {
  console.log('--- One Employee Row ---');
  const { data: emp, error: empErr } = await sb.from('employees').select('*').limit(1);
  if (emp && emp.length > 0) {
    console.log(emp[0]);
  } else {
    console.log('No employees found or error:', empErr);
  }

  console.log('--- Employee Assignments ---');
  const { data: assign, error: assignErr } = await sb.from('employee_assignments').select('*');
  console.log(assign, assignErr);
}

test();

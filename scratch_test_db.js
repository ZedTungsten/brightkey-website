import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function test() {
  console.log('--- Columns in employees ---');
  // We can select a single row to inspect columns or query pg_attribute (we can query one row with select('*') first)
  const { data: emp, error: empErr } = await sb.from('employees').select('*').limit(1);
  if (emp && emp.length > 0) {
    console.log('Employee columns:', Object.keys(emp[0]));
  } else {
    console.log('No employees found or error:', empErr);
  }

  console.log('--- Checking for update requests tables ---');
  // Let's see if we can query list of tables or try query on employee_update_requests
  const { data: reqs, error: reqsErr } = await sb.from('employee_update_requests').select('*').limit(1);
  console.log('employee_update_requests test query:', reqs, reqsErr);
}

test();

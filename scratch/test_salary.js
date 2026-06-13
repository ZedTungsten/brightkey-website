import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function test() {
  // 1. Fetch a sample employee
  const { data: employees, error: fetchErr } = await sb.from('employees').select('id, first_name, last_name, salary').limit(1);
  if (fetchErr || !employees || employees.length === 0) {
    console.error('Fetch error:', fetchErr);
    return;
  }
  const emp = employees[0];
  console.log('Original employee:', emp.first_name, emp.last_name, 'salary:', emp.salary);

  // 2. Update salary to 1.00
  console.log('Updating salary to 1.00...');
  const { error: updateErr } = await sb.from('employees').update({ salary: 1.00 }).eq('id', emp.id);
  if (updateErr) {
    console.error('Update error:', updateErr);
    return;
  }

  // 3. Fetch back
  const { data: updatedEmployees, error: fetchBackErr } = await sb.from('employees').select('id, salary').eq('id', emp.id);
  if (fetchBackErr || !updatedEmployees) {
    console.error('Fetch back error:', fetchBackErr);
    return;
  }
  console.log('Fetched back salary:', updatedEmployees[0].salary);
}

test();

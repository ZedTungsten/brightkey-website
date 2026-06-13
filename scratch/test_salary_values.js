import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function test() {
  const { data: employees, error: fetchErr } = await sb.from('employees').select('id, first_name, last_name, salary').limit(1);
  if (fetchErr || !employees || employees.length === 0) {
    console.error('Fetch error:', fetchErr);
    return;
  }
  const emp = employees[0];
  console.log('Original employee:', emp.first_name, emp.last_name, 'salary:', emp.salary);

  const testValues = [1, 100, 1000, 50];
  for (const val of testValues) {
    console.log(`Updating salary to ${val}...`);
    const { error: updateErr } = await sb.from('employees').update({ salary: val }).eq('id', emp.id);
    if (updateErr) {
      console.error(`Update error for ${val}:`, updateErr);
    }
    const { data: updated, error: readErr } = await sb.from('employees').select('salary').eq('id', emp.id);
    if (readErr) {
      console.error(`Read error for ${val}:`, readErr);
    } else {
      console.log(`Saved: ${val} -> Read back: ${updated[0].salary}`);
    }
  }
}

test();

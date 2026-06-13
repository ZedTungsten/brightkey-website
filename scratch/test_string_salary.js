import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function test() {
  const { data: employees } = await sb.from('employees').select('id, salary').limit(1);
  const emp = employees[0];
  console.log('Original salary:', emp.salary);

  console.log('Updating salary to string "1"...');
  await sb.from('employees').update({ salary: '1' }).eq('id', emp.id);

  const { data: updated } = await sb.from('employees').select('id, salary').eq('id', emp.id);
  console.log('After update to string "1":', updated[0].salary);
}

test();

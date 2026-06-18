import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function check() {
  const tables = ['leaves', 'employee_leaves', 'leave_requests', 'attendance', 'attendance_logs'];
  for (const t of tables) {
    const { data, error } = await sb.from(t).select('*').limit(1);
    console.log(`Table "${t}":`, error ? `Error: ${error.message}` : `Success (${data.length} rows)`);
  }
}

check();

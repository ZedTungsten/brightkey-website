import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await sb.from('pg_trigger').select('*');
  if (error) {
    console.error('Error querying pg_trigger:', error.message);
  } else {
    console.log('Triggers:', data);
  }
}

test();

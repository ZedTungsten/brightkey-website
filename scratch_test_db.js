import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await sb.from('employees').select('date_of_birth, address, contact_number, emergency_contact_number, email').limit(5);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Sample rows:', data);
  }
}

test();

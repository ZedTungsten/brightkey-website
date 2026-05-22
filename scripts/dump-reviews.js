import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Error: SUPABASE_URL / SUPABASE_ANON_KEY not set.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function dump() {
  const { data, error } = await supabase
    .from('products')
    .select('id, slug, status, title, sku');
  
  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }
  
  console.log(`Total products: ${data.length}`);
  for (const p of data) {
    console.log(`${p.sku} | ${p.slug} | ${p.title} (${p.status})`);
  }
}

dump();

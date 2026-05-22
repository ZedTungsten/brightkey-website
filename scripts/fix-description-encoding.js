import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Unicode replacement character (shown as ◆? in browser)
const REPLACEMENT_CHAR = '\uFFFD';
const EM_DASH = '\u2014'; // —

async function fixDescriptions() {
  console.log('Fetching all products from Supabase...');

  const { data: products, error } = await supabase
    .from('products')
    .select('id, slug, title, description');

  if (error) {
    console.error('Failed to fetch products:', error.message);
    process.exit(1);
  }

  const affected = products.filter(p => p.description && p.description.includes(REPLACEMENT_CHAR));
  console.log(`Found ${affected.length} products with corrupted characters:\n`);

  if (affected.length === 0) {
    console.log('Nothing to fix. All descriptions are clean!');
    return;
  }

  for (const product of affected) {
    const fixed = product.description.replaceAll(REPLACEMENT_CHAR, EM_DASH);

    console.log(`  [${product.slug}] ${product.title}`);
    console.log(`    Before: ${product.description.substring(0, 120).replace(/\n/g, ' ')}`);
    console.log(`    After:  ${fixed.substring(0, 120).replace(/\n/g, ' ')}\n`);

    const { error: updateError } = await supabase
      .from('products')
      .update({ description: fixed })
      .eq('id', product.id);

    if (updateError) {
      console.error(`  ✗ Failed to update [${product.slug}]:`, updateError.message);
    } else {
      console.log(`  ✓ Updated [${product.slug}]`);
    }
  }

  console.log('\nDone! Run "npm run build" to regenerate product pages.');
}

fixDescriptions();

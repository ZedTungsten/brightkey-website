import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Error: Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const tableName = process.argv[2];
if (!tableName) {
  console.error("Usage: node scripts/db-inspect.js <table_name>");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectTable() {
  try {
    const { data, error } = await supabase.from(tableName).select('*').limit(1);
    
    if (error) {
      throw new Error(error.message);
    }

    console.log(`\nTable: ${tableName}`);
    console.log("=".repeat(tableName.length + 7));
    
    if (!data || data.length === 0) {
      console.log("\nNote: The table is empty. Could not inspect columns using row-keys lookup.");
      return;
    }

    console.log("\nColumns (from live row sample):");
    const columns = Object.keys(data[0]);
    columns.sort().forEach(col => {
      const val = data[0][col];
      const type = typeof val;
      console.log(`  - ${col.padEnd(25)} (type: ${type === 'object' && val !== null ? (Array.isArray(val) ? 'array' : 'json') : type})`);
    });
    console.log("");
    
  } catch (err) {
    console.error("Inspection failed:", err.message);
  }
}

inspectTable();

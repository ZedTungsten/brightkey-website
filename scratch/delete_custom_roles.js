import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ymjlosnxuhsybkzkoofq.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is not defined in environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function cleanCustomRoles() {
  console.log("Fetching roles that start with custom_...");
  const { data, error } = await supabase
    .from('dashboard_roles')
    .select('id, name')
    .like('name', 'custom_%');

  if (error) {
    console.error("Error fetching custom roles:", error);
    return;
  }

  console.log(`Found ${data.length} custom roles:`, data.map(r => r.name));

  if (data.length > 0) {
    const ids = data.map(r => r.id);
    console.log("Deleting custom roles...");
    const { error: delError } = await supabase
      .from('dashboard_roles')
      .delete()
      .in('id', ids);

    if (delError) {
      console.error("Error deleting custom roles:", delError);
    } else {
      console.log("Successfully deleted custom roles!");
    }
  } else {
    console.log("No custom roles to delete.");
  }
}

cleanCustomRoles();

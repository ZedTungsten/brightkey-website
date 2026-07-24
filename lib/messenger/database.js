import { createClient } from '@supabase/supabase-js';

export function createMessengerDatabase(env = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function checkMessengerDatabase(database) {
  if (!database) return { connected: false, status: 'not_configured' };

  try {
    const { error } = await database.from('meta_messenger_accounts').select('id').limit(1);
    return error
      ? { connected: false, status: 'unavailable' }
      : { connected: true, status: 'connected' };
  } catch {
    return { connected: false, status: 'unavailable' };
  }
}

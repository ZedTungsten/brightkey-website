import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { setApiCors } from '../lib/api/security.js';
import { enforceRateLimit } from '../lib/api/rate-limit.js';

export default async function handler(req, res) {
  setApiCors(req, res, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { tenant, company, role, email, sig } = req.query;

  if (!tenant || !company || !email || !sig) {
    return res.status(400).json({ valid: false, reason: 'missing_params' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase configuration is missing on server.' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    if (!await enforceRateLimit({
      supabase, req, res, scope: 'verify-invitation', identifier: email.toLowerCase().trim(), limit: 60, windowSeconds: 3600
    })) return;

    const tokenHash = createHash('sha256').update(sig).digest('hex');
    const { data: invite, error } = await supabase
      .from('company_invitations')
      .select('expires_at, used_at')
      .eq('tenant_id', tenant)
      .eq('company_id', company)
      .eq('email', email.toLowerCase().trim())
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (error || !invite) {
      return res.status(200).json({ valid: false, reason: 'not_found' });
    }

    if (invite.used_at) {
      return res.status(200).json({ valid: false, reason: 'used' });
    }
    if (!invite.expires_at || new Date(invite.expires_at).getTime() <= Date.now()) {
      return res.status(200).json({ valid: false, reason: 'expired' });
    }

    return res.status(200).json({ valid: true });

  } catch (err) {
    console.error('Verify invitation crash:', err);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
}

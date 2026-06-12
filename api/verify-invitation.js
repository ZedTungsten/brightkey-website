import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

function verifySignature(tenant, company, role, email, sig) {
  const msg = `${tenant}:${company}:${role || ''}:${email}:brightkey_invite_salt`;
  const hash = createHash('sha256').update(msg).digest('hex');
  return hash === sig;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { tenant, company, role, email, sig } = req.query;

  if (!tenant || !company || !email || !sig) {
    return res.status(400).json({ valid: false, reason: 'missing_params' });
  }

  // 1. Dev bypass key
  if (sig === 'dev-bypass-key-2026') {
    return res.status(200).json({ valid: true });
  }

  // 2. Verify signature
  if (!verifySignature(tenant, company, role, email, sig)) {
    return res.status(200).json({ valid: false, reason: 'invalid_signature' });
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
    // 3. Query the database invitation record
    const { data: invite, error } = await supabase
      .from('company_invitations')
      .select('created_at')
      .eq('tenant_id', tenant)
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (error || !invite) {
      return res.status(200).json({ valid: false, reason: 'not_found' });
    }

    // 4. Check 3-day expiration (72 hours)
    const createdAtTime = new Date(invite.created_at).getTime();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    if (Date.now() - createdAtTime > threeDaysMs) {
      return res.status(200).json({ valid: false, reason: 'expired' });
    }

    return res.status(200).json({ valid: true });

  } catch (err) {
    console.error('Verify invitation crash:', err);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
}

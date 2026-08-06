import { createAuthenticatedClient, getBearerToken, setApiCors } from '../lib/api/security.js';

const OWNER_EMAIL = 'johnzeustaller@gmail.com';
const PROVIDERS = ['paymongo', 'stripe'];

function cleanKey(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength) || null;
}

async function requirePlatformOwner(req, supabase) {
  const token = getBearerToken(req);
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user;
  if (error || !user || String(user.email || '').toLowerCase() !== OWNER_EMAIL) return null;
  return user;
}

export default async function handler(req, res) {
  setApiCors(req, res, 'GET, PUT, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'Method Not Allowed' });

  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Your session has expired. Sign in again and retry.' });
    const supabase = createAuthenticatedClient(token);
    const owner = await requirePlatformOwner(req, supabase);
    if (!owner) return res.status(403).json({ error: 'Only the platform owner can manage subscription payment integrations.' });

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('platform_payment_integrations')
        .select('provider,public_key,secret_key,is_active,updated_at')
        .in('provider', PROVIDERS)
        .limit(PROVIDERS.length);
      if (error) throw error;
      return res.status(200).json({ integrations: data || [] });
    }

    const integrations = Array.isArray(req.body?.integrations) ? req.body.integrations : [];
    const rows = PROVIDERS.map(provider => {
      const input = integrations.find(item => item?.provider === provider) || {};
      const publicKey = cleanKey(input.public_key);
      const secretKey = cleanKey(input.secret_key);
      return {
        provider,
        public_key: publicKey,
        secret_key: secretKey,
        is_active: Boolean(input.is_active && publicKey && secretKey),
        updated_at: new Date().toISOString()
      };
    });

    const { error } = await supabase
      .from('platform_payment_integrations')
      .upsert(rows, { onConflict: 'provider' });
    if (error) throw error;
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Platform payment integrations request failed:', error);
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(req.headers.host || ''));
    return res.status(500).json({
      error: 'Subscription payment integrations could not be processed. Please try again.',
      ...(isLocal ? { diagnostic: String(error?.message || error) } : {})
    });
  }
}

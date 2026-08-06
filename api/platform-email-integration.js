import { createAuthenticatedClient, getBearerToken, setApiCors } from '../lib/api/security.js';

const OWNER_EMAIL = 'johnzeustaller@gmail.com';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanValue(value, maxLength) {
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
    if (!owner) return res.status(403).json({ error: 'Only the platform owner can manage tenant signup email settings.' });

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('platform_email_integrations')
        .select('sender_name,api_key,integration_email,updated_at')
        .eq('provider', 'resend')
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ integration: data || null });
    }

    const senderName = cleanValue(req.body?.sender_name, 120);
    const apiKey = cleanValue(req.body?.api_key, 500);
    const integrationEmail = cleanValue(req.body?.integration_email, 180)?.toLowerCase() || null;
    if (!senderName || !apiKey || !integrationEmail) {
      return res.status(400).json({ error: 'Complete the sender name, Resend API key, and integration email.' });
    }
    if (!EMAIL_PATTERN.test(integrationEmail)) {
      return res.status(400).json({ error: 'Enter a valid integration email address.' });
    }

    const { error } = await supabase.from('platform_email_integrations').upsert({
      provider: 'resend',
      sender_name: senderName,
      api_key: apiKey,
      integration_email: integrationEmail,
      updated_at: new Date().toISOString()
    }, { onConflict: 'provider' });
    if (error) throw error;
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Platform email integration request failed:', error);
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(req.headers.host || ''));
    return res.status(500).json({
      error: 'Tenant signup email settings could not be processed. Please try again.',
      ...(isLocal ? { diagnostic: String(error?.message || error) } : {})
    });
  }
}

import { createClient } from '@supabase/supabase-js';

const PRODUCTION_ORIGINS = new Set([
  'https://brightkeysolutions.com',
  'https://www.brightkeysolutions.com'
]);

export function setApiCors(req, res, methods = 'POST, OPTIONS') {
  const origin = req.headers.origin;
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin || '');
  if (origin && (PRODUCTION_ORIGINS.has(origin) || isLocal)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function createServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Server database configuration is unavailable.');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export function getBearerToken(req) {
  const header = String(req.headers.authorization || '');
  return header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}

export async function requireCompanyAccess(req, supabase, companyId, options = {}) {
  const token = getBearerToken(req);
  if (!token) return { error: 'unauthorized' };

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return { error: 'unauthorized' };

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, tenant_id')
    .eq('id', companyId)
    .maybeSingle();
  if (companyError || !company) return { error: 'forbidden' };

  const { data: member, error: memberError } = await supabase
    .from('tenant_members')
    .select('role, accessible_modules')
    .eq('tenant_id', company.tenant_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (memberError || !member) return { error: 'forbidden' };

  const role = String(member.role || '').toLowerCase();
  const allowedRoles = (options.roles || []).map(value => String(value).toLowerCase());
  const allowedModules = (options.modules || []).map(value => String(value).toLowerCase());
  const memberModules = (member.accessible_modules || []).map(value => String(value).trim().toLowerCase());
  const isAdmin = role === 'owner' || role === 'admin';
  const roleAllowed = allowedRoles.length === 0 || allowedRoles.includes(role);
  const moduleAllowed = allowedModules.length === 0 || allowedModules.some(module => memberModules.includes(module));

  if (!isAdmin && !roleAllowed && !moduleAllowed) return { error: 'forbidden' };
  return { user, company, member };
}

export function sendAccessError(res, result) {
  if (result?.error === 'unauthorized') {
    return res.status(401).json({ error: 'Your session has expired. Sign in again and retry.' });
  }
  return res.status(403).json({ error: 'You do not have permission to perform this action.' });
}

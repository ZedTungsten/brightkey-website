import {
  createAuthenticatedClient,
  getBearerToken,
  setApiCors
} from '../lib/api/security.js';

const OWNER_EMAIL = 'johnzeustaller@gmail.com';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  setApiCors(req, res, 'GET, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method Not Allowed' });

  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Your session has expired. Sign in again and retry.' });

    const authClient = createAuthenticatedClient(token);
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return res.status(401).json({ error: 'Your session has expired. Sign in again and retry.' });
    if (String(user.email || '').toLowerCase() !== OWNER_EMAIL) {
      return res.status(403).json({
        error: req.method === 'DELETE'
          ? 'Only the platform owner can delete tenants.'
          : 'Only the platform owner can view registered tenants.'
      });
    }

    if (req.method === 'DELETE') {
      const tenantId = String(req.body?.tenant_id || '').trim();
      if (!UUID_PATTERN.test(tenantId)) {
        return res.status(400).json({ error: 'Select a valid tenant to delete.' });
      }
      const { data, error } = await authClient.rpc('delete_platform_tenant', { p_tenant_id: tenantId });
      if (error) {
        if (String(error.code || '') === '42501') {
          return res.status(403).json({ error: error.message || 'This tenant is protected and cannot be deleted.' });
        }
        if (String(error.code || '') === 'P0002') {
          return res.status(404).json({ error: 'This tenant no longer exists.' });
        }
        throw error;
      }
      return res.status(200).json({ success: true, tenant: data });
    }

    const { data, error } = await authClient.rpc('get_platform_tenants');
    if (error) throw error;
    return res.status(200).json({
      tenants: data?.tenants || [],
      companies: data?.companies || [],
      plans: data?.plans || []
    });
  } catch (error) {
    const isDelete = req.method === 'DELETE';
    console.error(isDelete ? 'Platform tenant delete request failed:' : 'Platform tenant list request failed:', error);
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(req.headers.host || ''));
    return res.status(500).json({
      error: isDelete
        ? 'Tenant could not be deleted. Please refresh and try again.'
        : 'Tenant records could not be loaded. Please refresh and try again.',
      ...(isLocal ? { diagnostic: String(error?.message || error) } : {})
    });
  }
}

import { createAuthenticatedClient, getBearerToken, setApiCors } from '../lib/api/security.js';

export default async function handler(req, res) {
  setApiCors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const accessToken = getBearerToken(req);
    if (!accessToken) return res.status(401).json({ error: 'Your session has expired. Sign in again.' });

    const supabase = createAuthenticatedClient(accessToken);
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    const user = userData?.user;
    const email = String(user?.email || '').trim().toLowerCase();
    if (userError || !user || !email) return res.status(401).json({ error: 'Your session has expired. Sign in again.' });

    const ownerRowsRequest = (async () => {
      const exactResult = await supabase.from('tenants').select('id, owner_email').eq('owner_email', email).limit(50);
      if (exactResult.error || exactResult.data?.length) return exactResult;
      return supabase.from('tenants').select('id, owner_email').limit(50);
    })();
    const [{ data: memberRows, error: memberError }, { data: ownerRows, error: ownerError }] = await Promise.all([
      supabase.from('tenant_members').select('tenant_id, role, accessible_modules, created_at')
        .eq('user_id', user.id).order('created_at', { ascending: true }).limit(50),
      ownerRowsRequest
    ]);
    if (memberError || ownerError) throw memberError || ownerError;

    const byTenant = new Map();
    for (const row of memberRows || []) {
      if (!row.tenant_id) continue;
      byTenant.set(row.tenant_id, {
        tenantId: row.tenant_id,
        role: row.role,
        modules: row.accessible_modules || [],
        createdAt: row.created_at || null
      });
    }
    for (const row of ownerRows || []) {
      if (!row.id || String(row.owner_email || '').trim().toLowerCase() !== email) continue;
      byTenant.set(row.id, { tenantId: row.id, role: 'owner', modules: [], createdAt: byTenant.get(row.id)?.createdAt || null });
    }

    const memberships = [...byTenant.values()];
    const tenantIds = memberships.map(row => row.tenantId);
    const { data: companies, error: companyError } = tenantIds.length
      ? await supabase.from('companies').select('id, tenant_id, name').in('tenant_id', tenantIds).limit(50)
      : { data: [], error: null };
    if (companyError) throw companyError;

    const companiesByTenant = new Map((companies || []).map(company => [company.tenant_id, company]));
    return res.status(200).json({ memberships: memberships.map(row => ({
      role: row.role,
      tenantId: row.tenantId,
      modules: row.modules,
      companyId: companiesByTenant.get(row.tenantId)?.id || null,
      companyName: companiesByTenant.get(row.tenantId)?.name || 'Company'
    })) });
  } catch (error) {
    console.error('Account workspace lookup failed:', error);
    return res.status(503).json({ error: 'Your workspace access could not be loaded. Please try again.' });
  }
}

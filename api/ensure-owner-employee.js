import { createServiceClient, setApiCors } from '../lib/api/security.js';

function splitName(value, email) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  const lastName = parts.length > 1 ? parts.pop() : 'Owner';
  return {
    firstName: parts.join(' ') || String(email || '').split('@')[0] || 'Workspace',
    lastName
  };
}

export async function ensureOwnerEmployeeProfile({ supabase, user, tenantId, companyId }) {
  const [{ data: tenant }, { data: company }] = await Promise.all([
    supabase.from('tenants').select('id,owner_email').eq('id', tenantId).maybeSingle(),
    supabase.from('companies').select('id,tenant_id').eq('id', companyId).eq('tenant_id', tenantId).maybeSingle()
  ]);
  const email = String(user.email).trim().toLowerCase();
  const isOwner = tenant && String(tenant.owner_email || '').trim().toLowerCase() === email;
  if (!isOwner || !company) {
    const error = new Error('Only the workspace owner can create this profile.');
    error.status = 403;
    throw error;
  }

  const { data: existing, error: existingError } = await supabase.from('employees')
    .select('id,title').eq('company_id', companyId).ilike('email', email).limit(1).maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    if (!String(existing.title || '').trim()) {
      const { data: updated, error: updateError } = await supabase.from('employees')
        .update({ title: 'Tenant Owner' }).eq('id', existing.id).eq('company_id', companyId)
        .select('id,title').single();
      if (updateError) throw updateError;
      return { employee: updated, created: false };
    }
    return { employee: existing, created: false };
  }

  const [{ data: request }, { data: employeeNumber, error: numberError }] = await Promise.all([
    supabase.from('subscription_requests')
      .select('first_name,last_name,mobile_number,street_address,city,province')
      .eq('tenant_id', tenantId).eq('company_id', companyId).eq('business_email', email)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc('next_company_employee_number', { p_company_id: companyId })
  ]);
  if (numberError || !employeeNumber) throw numberError || new Error('Employee number unavailable');

  const fallbackName = splitName(user.user_metadata?.full_name, email);
  const address = [request?.street_address, request?.city, request?.province].filter(Boolean).join(', ');
  const payload = {
    id: user.id, company_id: companyId, employee_number: employeeNumber, email,
    first_name: request?.first_name || fallbackName.firstName,
    last_name: request?.last_name || fallbackName.lastName,
    contact_number: request?.mobile_number || 'N/A', date_of_birth: '1970-01-01',
    address: address || 'N/A', emergency_contact_number: 'N/A',
    employment_status: 'Active', assignment: 'Owner', title: 'Tenant Owner'
  };
  const { data: created, error: insertError } = await supabase.from('employees')
    .insert(payload).select('id').single();
  if (insertError) throw insertError;
  return { employee: created, created: true };
}

export default async function handler(req, res) {
  setApiCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const tenantId = String(req.body?.tenant_id || '').trim();
  const companyId = String(req.body?.company_id || '').trim();
  if (!token || !tenantId || !companyId) {
    return res.status(400).json({ error: 'Workspace information is incomplete.' });
  }

  try {
    const supabase = createServiceClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user?.id || !user.email) {
      return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
    }

    const result = await ensureOwnerEmployeeProfile({ supabase, user, tenantId, companyId });
    return res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    if (error?.status === 403) return res.status(403).json({ error: error.message });
    console.error('Owner employee provisioning failed:', error);
    return res.status(500).json({ error: 'Your owner profile could not be prepared. Try again shortly.' });
  }
}

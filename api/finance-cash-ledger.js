import { createClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthBounds(period) {
  const [year, month] = period.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${period}-01`,
    end: `${period}-${String(lastDay).padStart(2, '0')}`
  };
}

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'This report endpoint accepts POST requests only.');

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonError(res, 401, 'Your session is missing. Please sign in again.');
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const publishableKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !serviceKey || !publishableKey) {
    return jsonError(res, 500, 'Finance reporting is temporarily unavailable.');
  }

  const token = authHeader.slice('Bearer '.length);
  const { company_id: companyId, period } = req.body || {};
  if (!UUID_RE.test(String(companyId || '')) || !MONTH_RE.test(String(period || ''))) {
    return jsonError(res, 400, 'Select a valid company and reporting month.');
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    });
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) return jsonError(res, 401, 'Your session has expired. Please sign in again.');

    const { data: company, error: companyError } = await admin
      .from('companies')
      .select('id, tenant_id')
      .eq('id', companyId)
      .maybeSingle();
    if (companyError || !company) return jsonError(res, 403, 'The selected company is unavailable.');

    const { data: member, error: memberError } = await admin
      .from('tenant_members')
      .select('user_id')
      .eq('tenant_id', company.tenant_id)
      .eq('user_id', userData.user.id)
      .limit(1)
      .maybeSingle();
    if (memberError || !member) return jsonError(res, 403, 'You do not have access to this company report.');

    const { start, end } = monthBounds(period);
    const caller = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data, error } = await caller.rpc('get_finance_cash_ledger_report', {
      p_company_id: companyId,
      p_start_date: start,
      p_end_date: end
    });
    if (error) {
      console.error('Finance cash ledger RPC failed:', error);
      return jsonError(res, 502, 'The finance report could not be calculated.');
    }

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(data || { accounts: [], entries: [], truncated: false });
  } catch (error) {
    console.error('Finance cash ledger endpoint failed:', error);
    return jsonError(res, 500, 'The finance report could not be loaded.');
  }
}

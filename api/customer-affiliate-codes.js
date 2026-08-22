import {
  createServiceClient,
  requireCompanyAccess,
  sendAccessError,
  setApiCors,
  writeSecurityAudit
} from '../lib/api/security.js';

const MAX_PHONE_LOOKUPS = 100;
const CODE_PATTERN = /^[A-Z0-9]{4,40}$/;

function normalizedPhones(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || '').replace(/\D/g, ''))
    .filter(value => value.length >= 7 && value.length <= 15))]
    .slice(0, MAX_PHONE_LOOKUPS);
}

export default async function handler(req, res) {
  setApiCors(req, res, 'POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['POST', 'PATCH'].includes(req.method)) return res.status(405).json({ error: 'Method Not Allowed' });

  const companyId = String(req.body?.company_id || '').trim();
  if (!companyId) return res.status(400).json({ error: 'A company is required.' });

  try {
    const supabase = createServiceClient();
    const access = await requireCompanyAccess(req, supabase, companyId, {
      modules: ['Customer Service']
    });
    if (access.error) return sendAccessError(res, access);

    if (req.method === 'POST') {
      const phones = normalizedPhones(req.body?.phones);
      if (!phones.length) return res.status(200).json({ accounts: [] });
      const { data, error } = await supabase
        .from('customer_portal_accounts')
        .select('id,phone_normalized,affiliate_code')
        .eq('company_id', companyId)
        .in('phone_normalized', phones)
        .limit(MAX_PHONE_LOOKUPS);
      if (error) throw error;
      return res.status(200).json({ accounts: data || [] });
    }

    const accountId = String(req.body?.account_id || '').trim();
    const affiliateCode = String(req.body?.affiliate_code || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!accountId || !CODE_PATTERN.test(affiliateCode)) {
      return res.status(400).json({ error: 'Use 4–40 uppercase letters or numbers for the affiliate code.' });
    }

    const { data: account, error } = await supabase
      .from('customer_portal_accounts')
      .update({ affiliate_code: affiliateCode, updated_at: new Date().toISOString() })
      .eq('id', accountId)
      .eq('company_id', companyId)
      .select('id,phone_normalized,affiliate_code')
      .maybeSingle();
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'That affiliate code is already in use. Choose another code.' });
    }
    if (error) throw error;
    if (!account) return res.status(404).json({ error: 'The customer account could not be found.' });

    await writeSecurityAudit(supabase, {
      companyId,
      actorUserId: access.user.id,
      action: 'customer_affiliate_code_updated',
      targetType: 'customer_portal_account',
      targetId: account.id,
      metadata: { affiliate_code: account.affiliate_code }
    });
    return res.status(200).json({ account });
  } catch (error) {
    console.error('Customer affiliate code request failed:', error);
    return res.status(503).json({ error: 'Affiliate codes could not be updated right now. Please try again.' });
  }
}

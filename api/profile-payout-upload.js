import { createHash } from 'crypto';
import { createServiceClient, getBearerToken, setApiCors } from '../lib/api/security.js';

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 3 * 1024 * 1024;

export default async function handler(req, res) {
  setApiCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Your session has expired. Sign in again and retry.' });

  try {
    const supabase = createServiceClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Sign in again and retry.' });

    const companyId = String(req.body?.company_id || '').trim();
    const fileName = String(req.body?.file_name || '').trim();
    const match = String(req.body?.file_base64 || '').match(/^data:([^;]+);base64,(.+)$/s);
    if (!companyId || !fileName || !match || !ALLOWED_MIMES.has(match[1])) {
      return res.status(400).json({ error: 'Choose a JPG, PNG, or WebP payout QR image.' });
    }
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > MAX_BYTES) {
      return res.status(400).json({ error: 'The payout QR image must be smaller than 3 MB.' });
    }

    const { data: employee, error: employeeError } = await supabase.from('employees')
      .select('id, email').eq('company_id', companyId).ilike('email', user.email).maybeSingle();
    if (employeeError || !employee || employee.email?.toLowerCase().trim() !== user.email?.toLowerCase().trim()) {
      return res.status(403).json({ error: 'Your Employee Directory record could not be verified.' });
    }

    const { data: quotaRows, error: quotaError } = await supabase.rpc('check_company_storage_quota', {
      p_company_id: companyId,
      p_incoming_bytes: buffer.length
    });
    if (quotaError) return res.status(503).json({ error: 'Storage availability could not be verified. Please try again.' });
    if (!quotaRows?.[0]?.allowed) return res.status(413).json({ error: 'Your company storage limit has been reached. Contact an administrator.' });

    const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
    const digest = createHash('sha256').update(buffer).digest('hex').slice(0, 12);
    const path = `companies/${companyId}/employees/${employee.id}/payout/${Date.now()}_${digest}_${safeName}`;
    const { error: uploadError } = await supabase.storage.from('brightkey-internal').upload(path, buffer, {
      contentType: match[1],
      upsert: false
    });
    if (uploadError) throw uploadError;

    const { data: signed, error: signedError } = await supabase.storage
      .from('brightkey-internal').createSignedUrl(path, 315360000);
    if (signedError || !signed?.signedUrl) throw signedError || new Error('Signed URL unavailable');
    return res.status(200).json({ url: signed.signedUrl });
  } catch (error) {
    console.error('Profile payout upload failed:', error);
    return res.status(500).json({ error: 'The payout QR image could not be uploaded. Please try again.' });
  }
}

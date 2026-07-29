import { createServiceClient, requireCompanyAccess, sendAccessError, setApiCors } from '../lib/api/security.js';

const APPLICATION_BUCKET = 'brightkey-internal';

export default async function handler(req, res) {
  setApiCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'This file endpoint only accepts secure link requests.' });
  }

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (error) {
    console.error('Application file configuration error:', error);
    return res.status(503).json({ error: 'The file service is temporarily unavailable.' });
  }

  const companyId = String(req.body?.companyId || '').trim();
  const applicationId = String(req.body?.applicationId || '').trim();
  const filePath = String(req.body?.filePath || '').trim();
  const access = await requireCompanyAccess(req, supabase, companyId, { modules: ['HR'] });
  if (access.error) return sendAccessError(res, access);

  try {
    const { data: application, error: applicationError } = await supabase
      .from('job_applications')
      .select('id, answers')
      .eq('id', applicationId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (applicationError) throw applicationError;
    if (!application) return res.status(404).json({ error: 'This application could not be found.' });

    const isAttached = (application.answers || []).some(answer => answer?.file?.path === filePath);
    if (!isAttached) {
      return res.status(403).json({ error: 'This file is not attached to the selected application.' });
    }

    const { data, error } = await supabase.storage
      .from(APPLICATION_BUCKET)
      .createSignedUrl(filePath, 300);
    if (error) throw error;
    return res.status(200).json({ url: data.signedUrl });
  } catch (error) {
    console.error('Application file link error:', error);
    return res.status(500).json({ error: 'The application file could not be opened. Please try again.' });
  }
}


import { createServiceClient, requireCompanyAccess, sendAccessError, setApiCors } from '../lib/api/security.js';

export default async function handler(req, res) {
  setApiCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const companyId = String(req.body?.company_id || '').trim();
  if (!companyId) return res.status(400).json({ error: 'A company is required before creating an employee number.' });

  try {
    const supabase = createServiceClient();
    const access = await requireCompanyAccess(req, supabase, companyId, {
      roles: ['owner', 'admin'],
      modules: ['HR', 'HR:Directory']
    });
    if (access.error) return sendAccessError(res, access);

    const { data: employeeNumber, error } = await supabase.rpc('next_company_employee_number', {
      p_company_id: companyId
    });
    if (error || !employeeNumber) {
      console.error('Employee number generation failed:', error);
      return res.status(503).json({ error: 'The next employee number could not be generated. Please try again.' });
    }
    return res.status(200).json({ employee_number: employeeNumber });
  } catch (error) {
    console.error('Employee number endpoint failed:', error);
    return res.status(503).json({ error: 'The next employee number could not be generated. Please try again.' });
  }
}

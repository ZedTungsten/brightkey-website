(function () {
  'use strict';

  async function loadEmployee(sb, companyId, email) {
    const { data } = await sb.from('employees').select('*')
      .eq('company_id', companyId).eq('email', email).limit(1).maybeSingle();
    return data || null;
  }

  async function resolve({ sb, companyId, tenantId, user, role }) {
    let employee = await loadEmployee(sb, companyId, user.email);
    if (employee || role !== 'owner') return employee;

    const { data: { session } } = await sb.auth.getSession();
    const response = await fetch('/api/ensure-owner-employee', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`
      },
      body: JSON.stringify({ tenant_id: tenantId, company_id: companyId })
    });
    if (!response.ok) return null;
    return loadEmployee(sb, companyId, user.email);
  }

  window.BKTeamOwnerProfile = { resolve };
})();

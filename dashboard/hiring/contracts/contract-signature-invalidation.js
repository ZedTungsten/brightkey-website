(() => {
  'use strict';

  async function persist(app, contracts, jobPostId, changed, previous, settingsKey) {
    const save = () => app.sb.from('global_settings').upsert({ company_id: app.companyId, key: settingsKey, value: contracts }, { onConflict: 'company_id,key' });
    const { error } = await save();
    if (error || !changed || !previous) return { error, signatureError: null };
    const { error: signatureError } = await app.sb.from('employee_contract_signatures').delete().eq('company_id', app.companyId).eq('job_post_id', jobPostId);
    if (!signatureError) return { error: null, signatureError: null };
    contracts[jobPostId] = previous;
    await save();
    return { error: null, signatureError };
  }

  window.BKHiringContractSignatures = Object.freeze({ persist });
})();

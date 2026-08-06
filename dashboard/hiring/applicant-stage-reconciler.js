'use strict';

window.BKApplicantStageReconciler = Object.freeze({
  async reconcile({ sb, companyId, jobPostId, applications, stageCount }) {
    const displaced = applications.filter(application => (
      !application.hired_at && Number(application.current_stage || 1) > stageCount
    ));
    if (!displaced.length) return;

    displaced.forEach(application => { application.current_stage = stageCount; });
    const { error } = await sb
      .from('job_applications')
      .update({ current_stage: stageCount })
      .eq('company_id', companyId)
      .eq('job_post_id', jobPostId)
      .in('id', displaced.map(application => application.id));
    if (error) console.warn('Applicant stages could not be reconciled after the job stages changed:', error);
  }
});

const HiringApp = {
  sb: null,
  authInfo: null,
  companyId: null,
  employees: [],
  organizationTeams: [],
  organizationDepartments: [],
  jobPosts: [],
  companyProfile: {},
  companyLogoDataUrl: '',
  jobTemplateSettings: {},
  templateImageDataUrls: {},
  templateHeaderTextMode: 'white',
  applicationForms: {},
  selectedApplicationFormId: '',
  applicationFormSaveTimer: null,
  hiringEmailTemplates: {},
  selectedHiringEmailType: 'next_step',
  hiringEmailEditing: false,
  hiringEmailSaveTimer: null,
  hiringEmailEditSnapshot: null,
  hiringEmailPlaceholderTarget: null,
  hiringEmailPreviewEmployee: {},
  applicationSummaries: [],
  applications: [],
  selectedApplicantJobCode: '',
  selectedApplicantStage: 1,
  selectedApplicantJob: null,
  pendingApplicantAction: null,
  applicantHashListenerBound: false,
  draggedApplicationFieldIndex: null,
  hiringInformation: {
    email: '',
    contactNumber: '',
    hiringPageWebsite: ''
  },
  editingId: null,
  deletingId: null,
  previewingId: null,
  draggedQualificationRow: null,
  selectedDays: new Set(),
  tagValues: [],
  applicationStages: [],
  jobPostColumns: 'id, company_id, employment_type, position, department_name, team_name, assignee_id, position_type, visibility_level, job_title, job_description, qualifications, responsibilities, milestones, project_length, fixed_price, monthly_salary, monthly_salary_max, salary_mode, salary_confidential, salary_negotiable, compensation_extras, benefits, reporting_days, reporting_time_start, reporting_time_end, free_hours, reporting_mode, location_scope, location_country, location_city, applicant_type, expertise_level, vacancy_count, expected_start_date, tags, application_stages, status, public_code, created_at',
  esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },
  showToast(message, isError = false) {
    if (window.Toast) {
      window.Toast.show(message, isError ? 'error' : 'success');
    } else {
      console[isError ? 'error' : 'log'](message);
    }
  },
  async init() {
    this.authInfo = await window.BKAuth.checkRoleGate(['HR'], '/admin.html');
    if (!this.authInfo) return;
    this.sb = window.BKAuth.sb;
    const company = await window.BKAuth.getCompany(this.authInfo.tenantId);
    this.companyId = company?.id || null;
    if (!this.companyId) {
      this.showToast('Your company could not be identified. Refresh the page or contact an administrator.', true);
      return;
    }
    const path = window.location.pathname.replace(/\/+$/, '');
    let activeTab = 'job-post';
    if (path.endsWith('/applicants')) activeTab = 'applicants'; else if (path.endsWith('/templates')) activeTab = 'templates';
    else if (path.endsWith('/forms')) activeTab = 'forms'; else if (path.endsWith('/settings')) activeTab = 'settings';
    if (activeTab === 'templates' && window.location.hash === '#forms') return window.location.replace('/dashboard/hiring/forms');
    this.setActiveTab(activeTab);
    if (activeTab === 'job-post') {
      this.renderJobPostPage();
      this.renderModals();
      await Promise.all([this.loadEmployees(), this.loadJobPosts(), window.BKHiringJobApplicationForm?.init(this)]);
    } else if (activeTab === 'applicants') {
      this.renderApplicantsPage();
      await this.loadApplicationSummaries();
      if (!this.applicantHashListenerBound) {
        window.addEventListener('hashchange', () => this.handleApplicantHashChange());
        this.applicantHashListenerBound = true;
      }
    } else if (activeTab === 'templates') {
      const templateTab = window.location.hash === '#email' ? 'email' : window.location.hash === '#contract' ? 'contract' : 'posting';
      this.renderTemplateSubtabs(templateTab);
      this.renderTemplatesPage(templateTab);
      if (templateTab === 'posting') await this.loadTemplateData();
      if (templateTab === 'email') await this.loadHiringEmailTemplates();
      if (templateTab === 'contract') await window.BKHiringContractTemplate?.init(this);
    } else if (activeTab === 'forms') {
      this.renderTemplatesPage('forms'); await this.loadApplicationForms();
    } else if (activeTab === 'settings') {
      this.renderSettingsPage(); await this.loadHiringInformation(); await window.BKHiringSignatureSettings?.init(this);
    }
  },
  setActiveTab(activeTab) {
    document.querySelectorAll('[data-hiring-tab]').forEach((tab) => {
      const isActive = tab.dataset.hiringTab === activeTab;
      tab.classList.toggle('active', isActive);
      if (isActive) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
  },
  renderJobPostPage() {
    const content = document.querySelector('.hiring-content');
    if (!content) return;
    content.innerHTML = `
      <div class="hiring-page">
        <div class="hiring-page-header">
          <h2>Job Posts</h2>
          <button class="btn btn-primary" type="button" onclick="HiringApp.openCreateModal()">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Create Job Post
          </button>
        </div>
        <div class="hiring-panel">
          <div class="hiring-table-responsive">
            <table class="hiring-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Job Title</th>
                  <th>Department / Team</th>
                  <th>Level</th>
                  <th>Compensation</th>
                  <th>Reporting</th>
                  <th>Date Posted</th>
                  <th>Job Code</th>
                  <th>Visibility</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="job-posts-body">
                <tr><td colspan="10"><div class="loading-wrapper"><span class="spinner-cyan"></span><span>Loading job posts</span></div></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  },
  renderApplicantsPage() {
    const content = document.querySelector('.hiring-content');
    if (!content) return;
    content.innerHTML = `
      <div class="hiring-page applicants-page">
        <div class="hiring-page-header">
          <div>
            <h2>Applicants</h2>
            <p class="hiring-page-description">Review applications grouped by job post.</p>
          </div>
        </div>
        <div id="applicant-summary-view">
          <div class="loading-wrapper"><span class="spinner-cyan"></span><span>Loading applications</span></div>
        </div>
        <div id="applicant-detail-view" hidden></div>
        <div class="hiring-modal-overlay applicant-confirm-overlay" id="applicant-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="applicant-confirm-title">
          <div class="hiring-modal-card applicant-confirm-card">
            <div class="hiring-modal-header">
              <h3 id="applicant-confirm-title">Confirm applicant action</h3>
              <button class="hiring-icon-btn" type="button" aria-label="Close" onclick="HiringApp.closeApplicantConfirmation()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
              </button>
            </div>
            <div class="applicant-confirm-body">
              <p id="applicant-confirm-message"></p>
            </div>
            <div class="hiring-modal-footer">
              <button class="btn btn-outline" type="button" onclick="HiringApp.closeApplicantConfirmation()">Cancel</button>
              <button class="btn applicant-confirm-submit" id="applicant-confirm-submit" type="button" onclick="HiringApp.confirmApplicantAction()">Confirm</button>
            </div>
          </div>
        </div>
      </div>`;
  },
  async loadApplicationSummaries() {
    const summaryView = document.getElementById('applicant-summary-view');
    const { data, error } = await this.sb.rpc('get_job_application_summary', {
      p_company_id: this.companyId
    });
    if (error) {
      console.error('Failed to load application summaries:', error);
      if (summaryView) {
        summaryView.innerHTML = '<div class="hiring-empty">Applications could not be loaded. Refresh the page and try again.</div>';
      }
      return;
    }
    this.applicationSummaries = data || [];
    this.renderApplicationSummaryCards();
    await this.handleApplicantHashChange();
  },
  renderApplicationSummaryCards() {
    const summaryView = document.getElementById('applicant-summary-view');
    if (!summaryView) return;
    if (!this.applicationSummaries.length) {
      summaryView.innerHTML = '<div class="hiring-empty">Create a job post to begin receiving applications.</div>';
      return;
    }
    summaryView.innerHTML = `<div class="applicant-card-grid">${this.applicationSummaries.map(job => `
      <a class="applicant-job-card" href="#${encodeURIComponent(job.job_public_code)}" aria-label="View applications for ${this.esc(job.job_title)}">
        <div class="applicant-job-card-heading">
          <h3>${this.esc(job.job_title)} <span>– ${this.esc(job.job_public_code)}</span></h3>
          <strong>${Number(job.total_count || 0)}</strong>
        </div>
        <div class="applicant-job-card-counts">
          <span class="approved"><b>${Number(job.approved_count || 0)}</b> Approved</span>
          <span class="rejected"><b>${Number(job.rejected_count || 0)}</b> Rejected</span>
          <span class="pending"><b>${Number(job.pending_count || 0)}</b> Pending actions</span>
        </div>
      </a>`).join('')}</div>`;
  },
  async handleApplicantHashChange() {
    const code = decodeURIComponent(window.location.hash.replace(/^#/, '')).trim();
    const summaryView = document.getElementById('applicant-summary-view');
    const detailView = document.getElementById('applicant-detail-view');
    if (!summaryView || !detailView) return;
    if (!code) {
      this.selectedApplicantJobCode = '';
      summaryView.hidden = false;
      detailView.hidden = true;
      return;
    }
    const selectedJob = this.applicationSummaries.find(job => job.job_public_code === code);
    if (!selectedJob) {
      window.history.replaceState(null, '', window.location.pathname);
      this.showToast('The selected job post could not be found.', true);
      summaryView.hidden = false;
      detailView.hidden = true;
      return;
    }
    if (this.selectedApplicantJobCode !== code) this.selectedApplicantStage = 1;
    this.selectedApplicantJobCode = code;
    summaryView.hidden = true;
    detailView.hidden = false;
    detailView.innerHTML = '<div class="loading-wrapper"><span class="spinner-cyan"></span><span>Loading applicants</span></div>';
    await this.loadApplicationsForJob(selectedJob);
  },
  async loadApplicationsForJob(job) {
    const [postResult, applicationResult] = await Promise.all([
      this.sb
        .from('job_posts')
        .select('id, application_stages')
        .eq('company_id', this.companyId)
        .eq('id', job.job_post_id)
        .maybeSingle(),
      this.sb
        .from('job_applications')
        .select('id, submitted_at, first_name, last_name, contact_number, email, address, answers, status, current_stage, stage_history, hired_at, hire_email_sent_at')
        .eq('company_id', this.companyId)
        .eq('job_post_id', job.job_post_id)
        .order('submitted_at', { ascending: false })
        .range(0, 99)
    ]);
    if (postResult.error || applicationResult.error) {
      const error = postResult.error || applicationResult.error;
      console.error('Failed to load job applications:', error);
      const detailView = document.getElementById('applicant-detail-view');
      if (detailView) {
        detailView.innerHTML = '<div class="hiring-empty">Applicants could not be loaded. Refresh the page and try again.</div>';
      }
      return;
    }
    this.selectedApplicantJob = {
      ...job,
      application_stages: this.normalizeApplicationStages(postResult.data?.application_stages)
    };
    this.applications = applicationResult.data || []; await window.BKApplicantStageReconciler.reconcile({ sb: this.sb, companyId: this.companyId, jobPostId: job.job_post_id, applications: this.applications, stageCount: this.selectedApplicantJob.application_stages.length });
    this.renderApplicationsTable(this.selectedApplicantJob);
  },
  renderApplicationsTable(job) {
    const detailView = document.getElementById('applicant-detail-view');
    if (!detailView) return;
    const stages = this.normalizeApplicationStages(job.application_stages);
    const hiredStage = stages.length + 1;
    const activeStage = Math.min(Math.max(1, this.selectedApplicantStage), hiredStage);
    this.selectedApplicantStage = activeStage;
    const isHiredStage = activeStage === hiredStage;
    const stageApplications = this.applications.filter(application => isHiredStage
      ? Boolean(application.hired_at) && application.status === 'approved'
      : !application.hired_at && application.status !== 'rejected' && Math.min(Number(application.current_stage || 1), stages.length) === activeStage);
    const rejectedApplications = this.applications.filter(application => !application.hired_at && application.status === 'rejected');
    const questionCount = stageApplications.reduce((maximum, application) => Math.max(maximum, Array.isArray(application.answers) ? application.answers.length : 0), 0);
    const questionHeaders = Array.from({ length: questionCount }, (_, index) => `<th>Q${index + 1}</th>`).join('');
    const stage = isHiredStage ? { name: 'Hired', actions: [] } : stages[activeStage - 1];
    const tasks = stage.actions.slice(0, 5);
    detailView.innerHTML = `
      <div class="applicant-detail-header">
        <button class="btn btn-outline btn-sm" type="button" onclick="HiringApp.showApplicantCards()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
          All Job Posts
        </button>
        <div>
          <h2>${this.esc(job.job_title)} <span>– ${this.esc(job.job_public_code)}</span></h2>
          <p>${Number(job.total_count || 0)} total applications</p>
        </div>
      </div>
      <nav class="applicant-stage-navigator" aria-label="Application stages">
        <button type="button" aria-label="Previous stage" onclick="HiringApp.changeApplicantStage(-1)" ${activeStage <= 1 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <strong>${this.esc(stage.name)}</strong>
        <button type="button" aria-label="Next stage" onclick="HiringApp.changeApplicantStage(1)" ${activeStage >= hiredStage ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </nav>
      ${isHiredStage ? '' : `<div class="applicant-stage-tasks" aria-label="${this.esc(stage.name)} tasks">
        ${tasks.map((task, index) => `
          <div class="applicant-stage-task">
            <span>Task ${index + 1}</span>
            <p>${this.esc(String(task || '').trim() || this.getApplicationStagePlaceholder(activeStage - 1, index))}</p>
          </div>`).join('')}
      </div>`}
      <div class="hiring-panel applicant-table-panel">
        <div class="hiring-table-responsive">
          <table class="hiring-table applicant-table">
            <thead><tr>
              <th>Date submitted</th>
              <th>First Name</th>
              <th>Last Name</th>
              <th>Contact Number</th>
              <th>Email</th>
              <th>Address</th>
              ${questionHeaders}
              <th>Actions</th>
            </tr></thead>
            <tbody>
              ${stageApplications.length
                ? stageApplications.map(application => this.renderApplicationRow(application, questionCount, stages.length)).join('')
                : `<tr><td colspan="${7 + questionCount}"><div class="hiring-empty">No applicants are currently in ${this.esc(stage.name)}.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
      ${window.BKRejectedApplicantsTable.render(this, rejectedApplications, stages.length)}
      ${this.applications.length >= 100 ? '<p class="applicant-result-note">Showing the 100 most recent applications.</p>' : ''}`;
  },
  renderApplicationRow(application, questionCount, stageCount) {
    const answers = Array.isArray(application.answers) ? application.answers : [];
    const isFinalStage = Number(application.current_stage || 1) >= stageCount;
    const answerCells = Array.from({ length: questionCount }, (_, index) => {
      const answer = answers[index];
      if (answer?.file?.path) {
        return `<td><button class="applicant-file-link" type="button" onclick="HiringApp.openApplicationFile('${this.esc(application.id)}', '${this.esc(answer.file.path)}')">${this.esc(answer.file.name || 'Open file')}</button></td>`;
      }
      if (Array.isArray(answer?.answer)) {
        const values = answer.answer.filter(Boolean);
        return `<td>${values.length ? `<div class="applicant-answer-list">${values.map(value => `<span>${this.esc(value)}</span>`).join('')}</div>` : '—'}</td>`;
      }
      const value = answer?.answer;
      return `<td>${value ? this.esc(value) : '—'}</td>`;
    }).join('');
    return `<tr>
      <td>${this.formatLongDate(application.submitted_at)}</td>
      <td>${this.esc(application.first_name)}</td>
      <td>${this.esc(application.last_name)}</td>
      <td>${this.esc(application.contact_number)}</td>
      <td><a class="applicant-email-link" href="mailto:${this.esc(application.email)}">${this.esc(application.email)}</a></td>
      <td>${this.esc(application.address)}</td>
      ${answerCells}
      <td>
        ${application.hired_at && application.status === 'approved' ? `<div class="applicant-actions"><button class="applicant-action edit" type="button" aria-label="Edit ${this.esc(application.first_name)} ${this.esc(application.last_name)}" title="Edit Applicant" onclick="BKApplicantEditor.open('${this.esc(application.id)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button><button class="applicant-send-email ${application.hire_email_sent_at ? 'sent' : ''}" type="button" aria-label="${application.hire_email_sent_at ? 'Resend' : 'Send'} hire email to ${this.esc(application.first_name)} ${this.esc(application.last_name)}" title="${application.hire_email_sent_at ? 'Resend Hire Email' : 'Send Hire Email'}" onclick="HiringApp.sendHireEmail('${this.esc(application.id)}', this)">${application.hire_email_sent_at ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 6L2 7"/></svg>'}<span>${application.hire_email_sent_at ? 'Email Sent' : 'Send Email'}</span></button></div>` : `<div class="applicant-actions"><button class="applicant-action edit" type="button" aria-label="Edit ${this.esc(application.first_name)} ${this.esc(application.last_name)}" title="Edit Applicant" onclick="BKApplicantEditor.open('${this.esc(application.id)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
          <button class="applicant-action approve ${application.hired_at ? 'active' : ''}" type="button" aria-label="${isFinalStage ? 'Hire' : 'Move'} ${this.esc(application.first_name)} ${this.esc(application.last_name)}" title="${isFinalStage ? 'Hire Applicant' : 'Move to Next Stage'}" onclick="HiringApp.openApplicantConfirmation('${this.esc(application.id)}')" ${application.status === 'rejected' || application.hired_at ? 'disabled' : ''}>
            ${isFinalStage
              ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 22V4"/><path d="M5 4c5-3 9 3 14 0v10c-5 3-9-3-14 0"/></svg>'
              : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>'}
          </button>
          <button class="applicant-action reject ${application.status === 'rejected' ? 'active' : ''}" type="button" aria-label="Reject ${this.esc(application.first_name)} ${this.esc(application.last_name)}" title="Reject" onclick="HiringApp.updateApplicationStatus('${this.esc(application.id)}', 'rejected')" ${application.status === 'rejected' || application.hired_at ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>`}
      </td>
    </tr>`;
  },
  formatLongDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  showApplicantCards() {
    window.history.pushState(null, '', window.location.pathname);
    this.handleApplicantHashChange();
  },
  changeApplicantStage(change) {
    if (!this.selectedApplicantJob) return;
    const stageCount = this.normalizeApplicationStages(this.selectedApplicantJob.application_stages).length + 1;
    this.selectedApplicantStage = Math.min(stageCount, Math.max(1, this.selectedApplicantStage + change));
    this.renderApplicationsTable(this.selectedApplicantJob);
  },
  openApplicantConfirmation(applicationId) {
    const application = this.applications.find(item => item.id === applicationId);
    if (!application || !this.selectedApplicantJob) return;
    const stages = this.normalizeApplicationStages(this.selectedApplicantJob.application_stages);
    const isHire = Number(application.current_stage || 1) >= stages.length;
    const fullName = `${application.first_name} ${application.last_name}`.trim();
    this.pendingApplicantAction = { applicationId, isHire, fullName };
    const title = document.getElementById('applicant-confirm-title');
    const message = document.getElementById('applicant-confirm-message');
    const submit = document.getElementById('applicant-confirm-submit');
    if (title) title.textContent = isHire ? 'Confirm Hire' : 'Confirm Stage Change';
    if (message) {
      message.textContent = isHire
        ? `Hire ${fullName} as ${this.selectedApplicantJob.job_title}?`
        : `Move ${fullName} to ${stages[Number(application.current_stage || 1)]?.name || 'the next stage'}?`;
    }
    if (submit) submit.textContent = isHire ? 'Hire' : 'Move';
    this.openModal('applicant-confirm-modal');
  },
  closeApplicantConfirmation() {
    this.pendingApplicantAction = null;
    this.closeModal('applicant-confirm-modal');
  },
  async confirmApplicantAction() {
    const pending = this.pendingApplicantAction;
    if (pending?.isEmailResend) {
      const sent = await this.sendHireEmail(pending.applicationId, document.getElementById('applicant-confirm-submit'), true);
      if (sent) this.closeApplicantConfirmation(); return;
    }
    const application = this.applications.find(item => item.id === pending?.applicationId);
    if (!pending || !application || !this.selectedApplicantJob) return;
    const submit = document.getElementById('applicant-confirm-submit');
    if (submit) submit.disabled = true;
    const { data: userData } = await this.sb.auth.getUser();
    const now = new Date().toISOString();
    const currentStage = Number(application.current_stage || 1);
    const history = Array.isArray(application.stage_history) ? [...application.stage_history] : [];
    history.push({
      stage: currentStage,
      action: pending.isHire ? 'hired' : 'advanced',
      completed_at: now,
      completed_by: userData?.user?.id || null
    });
    const update = pending.isHire
      ? {
        status: 'approved',
        hired_at: now,
        reviewed_at: now,
        reviewed_by: userData?.user?.id || null,
        stage_history: history
      }
      : {
        status: 'pending',
        current_stage: currentStage + 1,
        reviewed_at: now,
        reviewed_by: userData?.user?.id || null,
        stage_history: history
      };
    const { error } = await this.sb
      .from('job_applications')
      .update(update)
      .eq('id', application.id)
      .eq('company_id', this.companyId);
    if (error) {
      if (submit) submit.disabled = false;
      console.error('Failed to update application status:', error);
      this.showToast('The applicant could not be moved. Please try again.', true);
      return;
    }
    const emailType = pending.isHire ? 'hire' : 'next_step';
    let statusEmailFailed = false;
    try {
      const response = await window.BKAuth.authenticatedFetch('/api/send-hiring-test-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: this.companyId, applicationId: application.id, emailType })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The applicant email could not be sent.');
    } catch (emailError) {
      statusEmailFailed = true;
      console.error('Applicant status email failed:', emailError);
    }
    if (submit) submit.disabled = false;
    this.closeApplicantConfirmation();
    const successMessage = pending.isHire ? `${pending.fullName} was hired.` : `${pending.fullName} moved to the next stage.`;
    const failureMessage = pending.isHire ? `${pending.fullName} was hired, but the hire email could not be sent.` : `${pending.fullName} moved, but the next-step email could not be sent.`;
    this.showToast(statusEmailFailed ? failureMessage : successMessage, statusEmailFailed);
    if (pending.isHire) this.selectedApplicantStage = this.normalizeApplicationStages(this.selectedApplicantJob.application_stages).length + 1;
    await this.loadApplicationSummaries();
  },
  async updateApplicationStatus(applicationId, status) {
    if (status !== 'rejected') return;
    const { data: userData } = await this.sb.auth.getUser();
    const { error } = await this.sb
      .from('job_applications')
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userData?.user?.id || null
      })
      .eq('id', applicationId)
      .eq('company_id', this.companyId);
    if (error) {
      console.error('Failed to reject application:', error);
      this.showToast('The application could not be rejected. Please try again.', true);
      return;
    }
    let rejectionEmailFailed = false;
    try {
      const response = await window.BKAuth.authenticatedFetch('/api/send-hiring-test-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: this.companyId, applicationId, emailType: 'rejection' })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The rejection email could not be sent.');
    } catch (emailError) {
      rejectionEmailFailed = true;
      console.error('Rejection email failed:', emailError);
    }
    this.showToast(rejectionEmailFailed ? 'Application rejected, but the rejection email could not be sent.' : 'Application rejected.', rejectionEmailFailed);
    await this.loadApplicationSummaries();
  },
  async sendHireEmail(applicationId, button, confirmed = false) {
    if (!this.companyId || !applicationId || button?.disabled) return;
    const application = this.applications.find(item => item.id === applicationId);
    if (!application) return false;
    if (application.hire_email_sent_at && !confirmed) {
      const fullName = `${application.first_name} ${application.last_name}`.trim();
      this.pendingApplicantAction = { applicationId, isEmailResend: true, fullName };
      document.getElementById('applicant-confirm-title').textContent = 'Send Hire Email Again?'; document.getElementById('applicant-confirm-message').textContent = `Are you sure you want to send the hire email to ${fullName} again?`;
      document.getElementById('applicant-confirm-submit').textContent = 'Send Again'; this.openModal('applicant-confirm-modal');
      return false;
    }
    const originalHtml = button.innerHTML; button.disabled = true; button.textContent = 'Sending…';
    try {
      const response = await window.BKAuth.authenticatedFetch('/api/send-hiring-test-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: this.companyId, applicationId, emailType: 'hire' }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The hire email could not be sent.');
      if (result.skipped === 'inactive') return this.showToast('The Hire email template is off. Turn it on before sending.', true);
      application.hire_email_sent_at = result.hireEmailSentAt || new Date().toISOString();
      this.showToast('Hire email sent. A fresh one-time registration link was included.');
      this.renderApplicationsTable(this.selectedApplicantJob);
      return true;
    } catch (error) { console.error('Hire email resend failed:', error); this.showToast(error.message || 'The hire email could not be sent.', true); }
    finally { button.disabled = false; button.innerHTML = originalHtml; }
  },
  async openApplicationFile(applicationId, filePath) {
    const { data: sessionData } = await this.sb.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      this.showToast('Your session has expired. Sign in again to open this file.', true);
      return;
    }
    try {
      const response = await fetch('/api/job-application-file', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          companyId: this.companyId,
          applicationId,
          filePath
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.url) throw new Error(result.error);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      this.showToast(error.message || 'The application file could not be opened. Please try again.', true);
    }
  },
  renderSettingsPage() {
    const content = document.querySelector('.hiring-content');
    if (!content) return;
    content.innerHTML = `
      <div class="hiring-page settings-page">
        <div class="hiring-page-header">
          <div>
            <h2>Settings</h2>
            <p class="hiring-page-description">Manage hiring contact details and employment contract signatures.</p>
          </div>
        </div>
        <div class="hiring-panel settings-panel">
          <div id="hiring-settings-content" class="settings-loading" aria-label="Loading hiring settings">
            <div class="settings-skeleton settings-skeleton-title"></div>
            <div class="settings-skeleton settings-skeleton-label"></div>
            <div class="settings-skeleton settings-skeleton-input"></div>
            <div class="settings-skeleton settings-skeleton-label"></div>
            <div class="settings-skeleton settings-skeleton-input"></div>
            <div class="settings-skeleton settings-skeleton-label"></div>
            <div class="settings-skeleton settings-skeleton-input"></div>
          </div>
        </div>
      </div>`;
  },
  renderHiringInformationForm() {
    const container = document.getElementById('hiring-settings-content');
    if (!container) return;
    container.className = 'settings-form-wrap';
    container.removeAttribute('aria-label');
    container.innerHTML = `
      <form id="hiring-information-form" onsubmit="HiringApp.saveHiringInformation(event)" novalidate>
        <section class="hiring-form-section">
          <h3 class="hiring-section-title">Hiring Information</h3>
          <div class="hiring-form-grid">
            <div class="hiring-field">
              <label for="hiring-email">Email</label>
              <input id="hiring-email" name="email" type="email" autocomplete="email" maxlength="254"
                placeholder="hiring@company.com" required />
            </div>
            <div class="hiring-field">
              <label for="hiring-contact-number">Contact Number</label>
              <input id="hiring-contact-number" name="contactNumber" type="tel" autocomplete="tel" maxlength="30"
                placeholder="+63 912 345 6789" required />
            </div>
            <div class="hiring-field full">
              <label for="hiring-page-website">Hiring Page (Website)</label>
              <input id="hiring-page-website" name="hiringPageWebsite" type="url" autocomplete="url" maxlength="2048"
                placeholder="https://company.com/careers" required />
            </div>
          </div>
        </section>
        <div class="settings-actions">
          <button class="btn btn-primary" id="save-hiring-information" type="submit">Save Changes</button>
        </div>
      </form><div id="hiring-signature-settings"></div>`;
    document.getElementById('hiring-email').value = this.hiringInformation.email;
    document.getElementById('hiring-contact-number').value = this.hiringInformation.contactNumber;
    document.getElementById('hiring-page-website').value = this.hiringInformation.hiringPageWebsite;
  },
  async loadHiringInformation() {
    const { data, error } = await this.sb
      .from('global_settings')
      .select('value')
      .eq('company_id', this.companyId)
      .eq('key', 'hiring_information')
      .maybeSingle();
    if (error) {
      console.error('Hiring information load failed:', error);
      this.showToast('Hiring information could not be loaded. Refresh the page and try again.', true);
    }
    const value = data?.value && typeof data.value === 'object' ? data.value : {};
    this.hiringInformation = {
      email: typeof value.email === 'string' ? value.email : '',
      contactNumber: typeof value.contactNumber === 'string' ? value.contactNumber : '',
      hiringPageWebsite: typeof value.hiringPageWebsite === 'string' ? value.hiringPageWebsite : ''
    };
    this.renderHiringInformationForm();
  },
  async saveHiringInformation(event) {
    event.preventDefault();
    const emailInput = document.getElementById('hiring-email');
    const contactInput = document.getElementById('hiring-contact-number');
    const websiteInput = document.getElementById('hiring-page-website');
    const saveButton = document.getElementById('save-hiring-information');
    if (!emailInput || !contactInput || !websiteInput || !saveButton) return;
    [emailInput, contactInput, websiteInput].forEach((input) => input.classList.remove('invalid'));
    const email = emailInput.value.trim();
    const contactNumber = contactInput.value.trim();
    const hiringPageWebsite = websiteInput.value.trim();
    const invalidInputs = [];
    if (!email || !emailInput.checkValidity()) invalidInputs.push(emailInput);
    if (!contactNumber) invalidInputs.push(contactInput);
    if (!hiringPageWebsite || !websiteInput.checkValidity()) invalidInputs.push(websiteInput);
    if (invalidInputs.length) {
      invalidInputs.forEach((input) => input.classList.add('invalid'));
      invalidInputs[0].focus();
      this.showToast('Enter a valid email address, contact number, and hiring page URL.', true);
      return;
    }
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    const { error } = await this.sb.from('global_settings').upsert({
      company_id: this.companyId,
      key: 'hiring_information',
      value: { email, contactNumber, hiringPageWebsite }
    }, { onConflict: 'company_id,key' });
    saveButton.disabled = false;
    saveButton.textContent = 'Save Changes';
    if (error) {
      console.error('Hiring information save failed:', error);
      this.showToast('Hiring information could not be saved. Check your entries and try again.', true);
      return;
    }
    this.hiringInformation = { email, contactNumber, hiringPageWebsite };
    this.showToast('Hiring information saved.');
  },
  async switchTemplateSubtab(tab) {
    const nextTab = ['email', 'contract'].includes(tab) ? tab : 'posting';
    const nextHash = nextTab === 'posting' ? window.location.pathname : `#${nextTab}`;
    history.replaceState(null, '', nextHash);
    this.renderTemplateSubtabs(nextTab);
    this.renderTemplatesPage(nextTab);
    if (nextTab === 'posting') await this.loadTemplateData();
    if (nextTab === 'email') await this.loadHiringEmailTemplates();
    if (nextTab === 'contract') await window.BKHiringContractTemplate?.init(this);
  },
  renderTemplateSubtabs(templateTab = 'posting') {
    document.querySelector('.hiring-template-subtabs')?.remove();
    const primaryTabs = document.querySelector('.hiring-tabs');
    if (!primaryTabs) return;
    const subtabBar = document.createElement('nav');
    subtabBar.className = 'hiring-template-subtabs';
    subtabBar.setAttribute('aria-label', 'Template sections');
    ['posting', 'email', 'contract'].forEach((tab) => {
      const button = document.createElement('button');
      button.className = `template-subtab${templateTab === tab ? ' active' : ''}`;
      button.type = 'button';
      button.textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
      button.addEventListener('click', () => this.switchTemplateSubtab(tab));
      subtabBar.appendChild(button);
    });
    primaryTabs.insertAdjacentElement('afterend', subtabBar);
  },
  renderTemplatesPage(templateTab = 'posting') {
    const content = document.querySelector('.hiring-content');
    if (!content) return;
    const isForms = templateTab === 'forms';
    const isEmail = templateTab === 'email';
    if (templateTab === 'contract') return window.BKHiringContractTemplate?.render(this);
    if (isEmail) {
      content.innerHTML = `
        <div class="hiring-page template-page hiring-email-page">
          <div class="hiring-page-header hiring-email-page-header">
            <div>
              <h2>Email Templates</h2>
              <p>Build the messages applicants receive as they move through hiring.</p>
            </div>
            <div class="hiring-email-actions">
              <button class="btn btn-outline hiring-email-cancel-btn" id="hiring-email-cancel-btn" type="button" onclick="HiringApp.cancelHiringEmailEditor()" hidden>
                Cancel
              </button>
              <button class="btn btn-outline hiring-email-test-btn" id="hiring-email-test-btn" type="button" onclick="HiringApp.openHiringEmailTestModal()" hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                Send Test
              </button>
              <label class="hiring-email-active-control" for="hiring-email-active-toggle">
                <span>Active</span>
                <input id="hiring-email-active-toggle" type="checkbox" onchange="HiringApp.toggleHiringEmailActive(this.checked)" />
                <span class="hiring-email-active-pill" aria-hidden="true"></span>
              </label>
              <button class="btn btn-outline hiring-email-edit-btn" id="hiring-email-edit-btn" type="button" onclick="HiringApp.toggleHiringEmailEditor()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
                Edit
              </button>
              <label class="template-select-wrap hiring-email-select-wrap" for="hiring-email-type-select">
                <span>Email type</span>
                <select id="hiring-email-type-select" onchange="HiringApp.selectHiringEmailType(this.value)">
                  <option value="after_submission">After Sending Application</option>
                  <option value="next_step">Next Step Approval</option>
                  <option value="requirements">Further Requirements</option>
                  <option value="hire">Hire</option>
                  <option value="rejection">Rejection</option>
                </select>
              </label>
            </div>
          </div>
          <div id="hiring-email-workspace" class="hiring-email-workspace">
            <div class="template-loading"><span class="spinner-cyan"></span><span>Loading email template</span></div>
          </div>
          <div class="hiring-modal-overlay" id="hiring-email-test-modal" role="dialog" aria-modal="true" aria-labelledby="hiring-email-test-title">
            <div class="hiring-modal-card compact">
              <div class="hiring-modal-header">
                <h3 id="hiring-email-test-title">Send Test Email</h3>
                <button class="hiring-icon-btn" type="button" aria-label="Close" onclick="HiringApp.closeModal('hiring-email-test-modal')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
                </button>
              </div>
              <div class="hiring-modal-body">
                <label class="hiring-email-test-field" for="hiring-email-test-recipient">
                  <span>Insert email to send</span>
                  <input id="hiring-email-test-recipient" type="email" autocomplete="email" maxlength="254" placeholder="name@example.com" onkeydown="if(event.key === 'Enter'){event.preventDefault(); HiringApp.sendHiringEmailTest();}" />
                </label>
              </div>
              <div class="hiring-modal-footer">
                <button class="btn btn-outline" type="button" onclick="HiringApp.closeModal('hiring-email-test-modal')">Cancel</button>
                <button class="btn btn-primary" id="hiring-email-test-send-btn" type="button" onclick="HiringApp.sendHiringEmailTest()">Send Test</button>
              </div>
            </div>
          </div>
        </div>`;
      return;
    }
    if (isForms) {
      content.innerHTML = `
        <div class="hiring-page template-page application-form-page">
          <div class="hiring-page-header application-form-page-header">
            <div>
              <h2>Form Instructions</h2>
              <p>Set the instructions applicants see before completing a job application.</p>
            </div>
            <div class="application-form-actions">
              <button class="btn btn-outline application-view-form-btn" type="button" onclick="HiringApp.viewApplicationForm()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/></svg>Preview Form</button>
              <label class="template-select-wrap application-form-select" for="application-form-job-select">
                <span>Job Post — Code</span>
                <select id="application-form-job-select" disabled onchange="HiringApp.selectApplicationForm(this.value)">
                  <option value="">Loading job posts…</option>
                </select>
              </label>
            </div>
          </div>
          <div id="application-form-builder" class="application-form-builder" aria-live="polite">
            <div class="template-loading"><span class="spinner-cyan"></span><span>Loading form builder</span></div>
          </div>
        </div>`;
      return;
    }
    content.innerHTML = `
      <div class="hiring-page template-page">
        <div class="hiring-page-header template-page-header">
          <div>
            <h2>Job Post Template</h2>
          </div>
          <div class="template-actions">
            <label class="template-select-wrap" for="template-job-select">
              <span>Job post</span>
              <select id="template-job-select" disabled onchange="HiringApp.selectTemplateJob(this.value)">
                <option value="">Loading job posts…</option>
              </select>
            </label>
            <label class="template-select-wrap compact" for="template-header-text">
              <span>Header text</span>
              <select id="template-header-text" onchange="HiringApp.setTemplateHeaderText(this.value)">
                <option value="white">White</option>
                <option value="theme">Theme Color</option>
              </select>
            </label>
            <button class="btn btn-primary" id="download-job-template" type="button" disabled onclick="HiringApp.exportJobTemplatePDF()">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>
              Download PDF
            </button>
          </div>
        </div>
        <div class="template-image-toolbar">
          <div class="template-upload-control">
            <input id="template-header-image-input" type="file" accept="image/jpeg,image/jpg,image/png,image/webp" hidden
              onchange="HiringApp.uploadTemplateHeaderImage(event)" />
            <button class="btn btn-outline" type="button" onclick="document.getElementById('template-header-image-input').click()">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 16V4m0 0 4 4m-4-4L8 8M4 20h16"/></svg>
              Upload Header Image
            </button>
            <span>Recommended: 2400 × 900 px (8:3). Keep the main subject toward the right or center-right.</span>
          </div>
          <div class="template-image-adjustments" id="template-image-adjustments" hidden>
            <label>
              <span>Move up / down</span>
              <input id="template-image-position" type="range" min="0" max="100" step="1" value="50"
                oninput="HiringApp.updateTemplateImageSetting('positionY', this.value); HiringApp.syncTemplateRangeProgress(this)"
                onchange="HiringApp.saveJobTemplateSettings()" />
            </label>
            <label>
              <span>Zoom</span>
              <input id="template-image-zoom" type="range" min="100" max="200" step="1" value="100"
                oninput="HiringApp.updateTemplateImageSetting('zoom', this.value); HiringApp.syncTemplateRangeProgress(this)"
                onchange="HiringApp.saveJobTemplateSettings()" />
            </label>
            <button class="template-remove-image" type="button" aria-label="Remove header image" title="Remove header image"
              onclick="HiringApp.removeTemplateHeaderImage()">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M6 7h12M9 7V4h6v3M8 7l1 13h6l1-13"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="template-workspace">
          <div class="template-preview-shell" id="template-preview-shell">
            <div class="template-loading">
              <span class="spinner-cyan"></span>
              <span>Preparing job post template</span>
            </div>
          </div>
        </div>
      </div>`;
  },

  getDefaultHiringEmailTemplates() {
    return {
      after_submission: {
        active: true,
        subject: 'We received your BrightKey application',
        preheader: 'Thank you for applying. Your application has been received.',
        blocks: [
          { type: 'header', value: 'Application received' },
          { type: 'body', value: 'Hi {{first_name}},\n\nThank you for applying for the {{job_title}} position at BrightKey.' },
          { type: 'body', value: 'Our hiring team has received your application and will review your qualifications. We will contact you if your application moves forward.' },
          { type: 'signature', value: 'Best regards,\nBrightKey Hiring Team' }
        ]
      },
      next_step: {
        active: true,
        subject: 'Your application is moving to the next step',
        preheader: 'We would like to continue with your application.',
        blocks: [
          { type: 'header', value: 'Your application is moving forward' },
          { type: 'body', value: 'Hi {{first_name}},\n\nThank you for your application for {{job_title}}. We are pleased to move you to the next stage of our hiring process.' },
          { type: 'body', value: 'Our hiring team will contact you with the schedule and next steps.' },
          { type: 'signature', value: 'Best regards,\nBrightKey Hiring Team' }
        ]
      },
      requirements: {
        active: true,
        subject: 'Further requirements for your application',
        preheader: 'Please review the additional requirements for your application.',
        blocks: [
          { type: 'header', value: 'Further requirements' },
          { type: 'body', value: 'Hi {{first_name}},\n\nWe need a few more details to continue reviewing your application for {{job_title}}.' },
          { type: 'bullet-list', value: 'Reply with the requested information\nComplete any assigned assessment\nConfirm your availability' },
          { type: 'signature', value: 'Best regards,\nBrightKey Hiring Team' }
        ]
      },
      hire: {
        active: true,
        subject: 'Welcome to BrightKey',
        preheader: 'We are pleased to offer you the position.',
        blocks: [
          { type: 'header', value: 'Congratulations, {{first_name}}' },
          { type: 'body', value: 'We are pleased to offer you the {{job_title}} position at BrightKey.' },
          { type: 'body', value: 'Our HR team will contact you with your offer details and onboarding requirements.' },
          { type: 'signature', value: 'Welcome to the team,\nBrightKey Hiring Team' }
        ]
      },
      rejection: {
        active: true,
        subject: 'Update on your BrightKey application',
        preheader: 'Thank you for your interest in BrightKey.',
        blocks: [
          { type: 'header', value: 'Application update' },
          { type: 'body', value: 'Hi {{first_name}},\n\nThank you for the time and effort you invested in applying for {{job_title}}.' },
          { type: 'body', value: 'After careful review, we will not be moving forward with your application at this time. We appreciate your interest and wish you success in your job search.' },
          { type: 'signature', value: 'Sincerely,\nBrightKey Hiring Team' }
        ]
      }
    };
  },

  normalizeHiringEmailTemplate(template, fallback) {
    const allowedTypes = new Set(['header', 'subheader', 'body', 'bullet-list', 'number-list', 'signature', 'spacer', 'hr']);
    const blocks = Array.isArray(template?.blocks)
      ? template.blocks.slice(0, 30).filter(block => allowedTypes.has(block?.type)).map(block => ({
        type: block.type,
        value: String(block.value || '').slice(0, 5000)
      }))
      : fallback.blocks;
    return {
      active: typeof template?.active === 'boolean' ? template.active : fallback.active !== false,
      subject: String(template?.subject || fallback.subject).slice(0, 100),
      preheader: String(template?.preheader || fallback.preheader).slice(0, 150),
      blocks: blocks.length ? blocks : fallback.blocks
    };
  },
  getActiveHiringEmailTemplate() {
    const defaults = this.getDefaultHiringEmailTemplates();
    return this.normalizeHiringEmailTemplate(
      this.hiringEmailTemplates[this.selectedHiringEmailType],
      defaults[this.selectedHiringEmailType]
    );
  },
  async loadHiringEmailTemplates() {
    const workspace = document.getElementById('hiring-email-workspace');
    if (!workspace) return;
    const [templatesResult, profileResult, employeeResult] = await Promise.all([
      this.sb
        .from('global_settings')
        .select('value')
        .eq('company_id', this.companyId)
        .eq('key', 'hiring_email_templates')
        .maybeSingle(),
      this.sb
        .from('global_settings')
        .select('value')
        .eq('company_id', this.companyId)
        .eq('key', 'company_profile_config')
        .maybeSingle(),
      this.sb.from('employees').select('first_name, last_name, email, contact_number, title').eq('company_id', this.companyId).ilike('email', this.authInfo.user.email).limit(1).maybeSingle()
    ]);
    const { data, error } = templatesResult;
    if (error) {
      console.error('Hiring email templates load failed:', error);
      workspace.innerHTML = '<div class="hiring-empty">Email templates could not be loaded. Refresh the page and try again.</div>';
      return;
    }
    if (profileResult.error) console.error('Hiring email company profile load failed:', profileResult.error);
    if (employeeResult.error) console.error('Hiring email employee preview load failed:', employeeResult.error);
    this.companyProfile = profileResult.data?.value || {};
    this.hiringEmailPreviewEmployee = employeeResult.data || {};
    const defaults = this.getDefaultHiringEmailTemplates();
    const saved = data?.value && typeof data.value === 'object' ? data.value : {};
    this.hiringEmailTemplates = Object.fromEntries(
      Object.keys(defaults).map(key => [key, this.normalizeHiringEmailTemplate(saved[key], defaults[key])])
    );
    this.hiringEmailEditing = false;
    this.renderHiringEmailWorkspace();
  },
  selectHiringEmailType(type) {
    if (!Object.hasOwn(this.getDefaultHiringEmailTemplates(), type)) return;
    this.selectedHiringEmailType = type;
    const select = document.getElementById('hiring-email-type-select');
    if (select) select.value = type;
    this.renderHiringEmailWorkspace();
  },
  toggleHiringEmailEditor() {
    if (this.hiringEmailEditing) {
      this.hiringEmailEditing = false;
      this.hiringEmailEditSnapshot = null;
    } else {
      this.hiringEmailEditSnapshot = JSON.parse(JSON.stringify(this.hiringEmailTemplates));
      this.hiringEmailEditing = true;
    }
    this.renderHiringEmailWorkspace();
  },
  async cancelHiringEmailEditor() {
    if (!this.hiringEmailEditing) return;
    clearTimeout(this.hiringEmailSaveTimer);
    this.hiringEmailSaveTimer = null;
    if (this.hiringEmailEditSnapshot) {
      this.hiringEmailTemplates = JSON.parse(JSON.stringify(this.hiringEmailEditSnapshot));
    }
    this.hiringEmailEditSnapshot = null;
    this.hiringEmailEditing = false;
    this.renderHiringEmailWorkspace();
    const restored = await this.saveHiringEmailTemplates();
    if (restored) this.showToast('Email template changes discarded.');
  },
  renderHiringEmailWorkspace() {
    const workspace = document.getElementById('hiring-email-workspace');
    const select = document.getElementById('hiring-email-type-select');
    if (!workspace) return;
    if (select) select.value = this.selectedHiringEmailType;
    const template = this.getActiveHiringEmailTemplate();
    this.hiringEmailTemplates[this.selectedHiringEmailType] = template;
    const editButton = document.getElementById('hiring-email-edit-btn');
    const cancelButton = document.getElementById('hiring-email-cancel-btn');
    const testButton = document.getElementById('hiring-email-test-btn');
    const activeToggle = document.getElementById('hiring-email-active-toggle');
    if (activeToggle) activeToggle.checked = template.active !== false;
    if (cancelButton) cancelButton.hidden = !this.hiringEmailEditing;
    if (testButton) testButton.hidden = !this.hiringEmailEditing;
    if (editButton) {
      editButton.classList.toggle('active', this.hiringEmailEditing);
      editButton.lastChild.textContent = this.hiringEmailEditing ? ' Save' : ' Edit';
    }
    workspace.classList.toggle('editing', this.hiringEmailEditing);
    const brandingPreview = this.renderHiringEmailBrandingPreview();
    workspace.innerHTML = `
      ${this.hiringEmailEditing ? `
        <aside class="hiring-email-builder">
          <div class="hiring-email-builder-fields">
            <label><span>Subject Line</span><small>${template.subject.length} / 100</small><input maxlength="100" value="${this.esc(template.subject)}" oninput="HiringApp.handleHiringEmailInput('meta', 'subject', this)" /></label>
            <label><span>Email Preview (Preheader)</span><small>${template.preheader.length} / 150</small><input maxlength="150" value="${this.esc(template.preheader)}" oninput="HiringApp.handleHiringEmailInput('meta', 'preheader', this)" /></label>
          </div>
          <div class="hiring-email-insert-blocks">
            <strong>Insert Blocks</strong>
            <div>
              ${[
                ['header', 'Header'],
                ['subheader', 'Subheader'],
                ['body', 'Body Text'],
                ['bullet-list', 'Bullet List'],
                ['number-list', 'Numbered List'],
                ['signature', 'Signature'],
                ['spacer', 'Spacer'],
                ['hr', 'Horizontal Line']
              ].map(([type, label]) => `<button class="btn btn-outline btn-sm" type="button" onclick="HiringApp.addHiringEmailBlock('${type}')">+ ${label}</button>`).join('')}
            </div>
          </div>
          <div class="hiring-email-block-list">
            <strong>Email Content Order</strong>
            ${template.blocks.map((block, index) => this.renderHiringEmailBlock(block, index)).join('')}
            ${this.selectedHiringEmailType === 'hire' ? '<div class="hiring-email-fixed-action"><span>Fixed module</span><button type="button" disabled>Register to Directory</button><small>Secure one-time link is generated when the hire email sends.</small></div>' : ''}
          </div>
          <p class="hiring-email-save-status" id="hiring-email-save-status">${this.hiringEmailSaveTimer ? 'Saving…' : 'Saved automatically'}</p>
        </aside>` : ''}
      <section class="hiring-email-viewer" aria-label="Rendered email preview">
        <div class="hiring-email-envelope" id="hiring-email-envelope">
          <div><span>Subject</span><strong>${this.esc(this.resolveHiringEmailPlaceholders(template.subject))}</strong></div>
          <div><span>Preview</span><p>${this.esc(this.resolveHiringEmailPlaceholders(template.preheader))}</p></div>
        </div>
        <div class="hiring-email-canvas">
          ${brandingPreview}
          <div class="hiring-email-rendered-blocks" id="hiring-email-rendered-blocks">${template.blocks.map(block => this.renderHiringEmailPreviewBlock(block)).join('')}</div>
          ${this.selectedHiringEmailType === 'hire' ? '<div class="hiring-email-preview-action">Register to Directory</div>' : ''}
          ${this.renderHiringEmailFooterPreview()}
        </div>
      </section>
      <div class="hiring-email-placeholder-menu" id="hiring-email-placeholder-menu" role="listbox" aria-label="Applicant placeholders">
        ${[
          ['first_name', 'First Name'],
          ['last_name', 'Last Name'],
          ['email', 'Email'],
          ['contact_number', 'Contact Number'],
          ['job_title', 'Job Title']
        ].map(([value, label]) => `<button type="button" role="option" onmousedown="event.preventDefault()" onclick="HiringApp.insertHiringEmailPlaceholder('${value}')"><span>${label}</span><code>{{${value}}}</code></button>`).join('')}
      </div>`;
  },
  renderHiringEmailBrandingPreview() {
    const companyName = String(this.companyProfile?.companyName || 'BrightKey').trim().slice(0, 120);
    const configuredLogo = String(this.companyProfile?.logoDark || this.companyProfile?.logoLight || '').trim();
    const supportedDataImage = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(configuredLogo);
    const supportedRemoteImage = /^https:\/\/[^\s]+$/i.test(configuredLogo);
    if (supportedDataImage || supportedRemoteImage) {
      return `<div class="hiring-email-logo"><img src="${this.esc(configuredLogo)}" alt="${this.esc(companyName)}" /></div>`;
    }
    return `<div class="hiring-email-logo-fallback">${this.esc(companyName)}</div>`;
  },
  renderHiringEmailFooterPreview() {
    const profile = this.companyProfile || {};
    const icons = {
      Facebook: ['0 0 24 24', 'M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c4.56-.93 8-4.96 8-9.75z'],
      Messenger: ['0 0 24 24', 'M12 2C6.48 2 2 6.14 2 11.25c0 2.91 1.45 5.51 3.73 7.15V22l3.41-1.87c.88.24 1.8.37 2.86.37 5.52 0 10-4.14 10-9.25S17.52 2 12 2zm1.14 12.03-2.58-2.75-5.04 2.75 5.54-5.89 2.63 2.75 4.99-2.75-5.54 5.89z'],
      Instagram: ['0 0 24 24', 'M12 2.16c3.2 0 3.58.02 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.67 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.64-.07-4.85s.01-3.58.07-4.85c.15-3.23 1.67-4.77 4.92-4.92 1.27-.05 1.65-.07 4.85-.07zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0zm0 5.84A6.16 6.16 0 1 0 12 18.16 6.16 6.16 0 0 0 12 5.84zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.41-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z'],
      X: ['0 0 24 24', 'M18.24 2.25h3.31l-7.23 8.26 8.51 11.24h-6.66l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.84L7.08 4.13H5.12z'],
      LinkedIn: ['0 0 24 24', 'M19 0H5a5 5 0 0 0-5 5v14a5 5 0 0 0 5 5h14a5 5 0 0 0 5-5V5a5 5 0 0 0-5-5zM8 19H5V8h3zm-1.5-12.27A1.76 1.76 0 1 1 6.5 3.2a1.76 1.76 0 0 1 0 3.53zM20 19h-3v-5.6c0-3.37-4-3.11-4 0V19h-3V8h3v1.77c1.4-2.59 7-2.78 7 2.47z'],
      Tiktok: ['0 0 16 16', 'M9 0h1.98c.14.72.54 1.62 1.24 2.51C12.9 3.39 13.8 4 15 4v2c-1.75 0-3.07-.81-4-1.83V11a5 5 0 1 1-5-5v2a3 3 0 1 0 3 3z'],
      YouTube: ['0 0 24 24', 'M23.5 6.16a3 3 0 0 0-2.11-2.11C19.52 3.55 12 3.55 12 3.55s-7.52 0-9.39.5A3 3 0 0 0 .5 6.16C0 8.03 0 12 0 12s0 3.97.5 5.84a3 3 0 0 0 2.11 2.11c1.87.51 9.39.51 9.39.51s7.52 0 9.39-.51a3 3 0 0 0 2.11-2.11C24 15.97 24 12 24 12s0-3.97-.5-5.84zM9.55 15.57V8.43L15.82 12z'],
      Pinterest: ['0 0 24 24', 'M12 0a12 12 0 0 0-4.37 23.17c-.11-.95-.2-2.4.04-3.44l1.41-5.96s-.36-.72-.36-1.78c0-1.67.97-2.92 2.17-2.92 1.02 0 1.52.77 1.52 1.69 0 1.03-.66 2.57-1 4-.28 1.19.6 2.17 1.78 2.17 2.13 0 3.77-2.25 3.77-5.5 0-2.87-2.06-4.88-5.01-4.88-3.41 0-5.42 2.56-5.42 5.21 0 1.03.4 2.14.9 2.74.1.12.11.22.08.34l-.33 1.36c-.05.22-.17.27-.4.16-1.5-.7-2.44-2.89-2.44-4.65 0-3.78 2.75-7.26 7.93-7.26 4.16 0 7.4 2.97 7.4 6.93 0 4.14-2.61 7.46-6.23 7.46-1.22 0-2.36-.63-2.75-1.38l-.75 2.86a13 13 0 0 1-1.49 3.14A12 12 0 1 0 12 0z']
    };
    const socialHtml = (Array.isArray(profile.socialLinks) ? profile.socialLinks : []).slice(0, 12).map(item => {
      const platform = Object.keys(icons).find(key => key.toLowerCase() === String(item?.platform || '').trim().toLowerCase()) || '';
      const icon = icons[platform];
      const rawUrl = String(item?.url || '').trim();
      const url = /^https?:\/\/[^\s]+$/i.test(rawUrl)
        ? rawUrl
        : (/^(?:www\.)?(?:m\.me|messenger\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|linkedin\.com|tiktok\.com|youtube\.com|youtu\.be|pinterest\.[a-z.]+)\/[^\s]+$/i.test(rawUrl) ? `https://${rawUrl}` : '');
      if (!icon || !url) return '';
      return `<a href="${this.esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${this.esc(platform)}"><svg viewBox="${icon[0]}" aria-hidden="true"><path d="${icon[1]}"></path></svg></a>`;
    }).join('');
    const name = String(profile.companyName || 'BrightKey Solutions').trim();
    const address1 = String(profile.companyAddressLine1 || '').trim();
    const address2 = String(profile.companyAddressLine2 || '').trim();
    const phone = String(profile.phone || '').trim();
    const email = String(profile.email || '').trim();
    return `<footer class="hiring-email-footer">
      ${socialHtml ? `<div class="hiring-email-footer-socials">${socialHtml}</div>` : ''}
      <strong>${this.esc(name)}</strong>
      ${address1 ? `<span>${this.esc(address1)}</span>` : ''}
      ${address2 ? `<span>${this.esc(address2)}</span>` : ''}
      ${(phone || email) ? `<span>${this.esc(phone)}${phone && email ? ' | ' : ''}${this.esc(email)}</span>` : ''}
    </footer>`;
  },
  toggleHiringEmailActive(isActive) {
    const template = this.getActiveHiringEmailTemplate();
    template.active = Boolean(isActive);
    this.hiringEmailTemplates[this.selectedHiringEmailType] = template;
    this.scheduleHiringEmailSave();
  },
  openHiringEmailTestModal() {
    const input = document.getElementById('hiring-email-test-recipient');
    if (input) {
      input.value = '';
      input.classList.remove('invalid');
    }
    this.openModal('hiring-email-test-modal');
    setTimeout(() => input?.focus(), 50);
  },
  async sendHiringEmailTest() {
    const input = document.getElementById('hiring-email-test-recipient');
    const button = document.getElementById('hiring-email-test-send-btn');
    const recipient = input?.value.trim() || '';
    if (!input || !input.checkValidity() || !recipient) {
      input?.classList.add('invalid');
      input?.focus();
      this.showToast('Enter a valid email address.', true);
      return;
    }
    input.classList.remove('invalid');
    const template = this.getActiveHiringEmailTemplate();
    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      const response = await window.BKAuth.authenticatedFetch('/api/send-hiring-test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: this.companyId,
          recipient,
          emailType: this.selectedHiringEmailType,
          subject: template.subject,
          preheader: template.preheader,
          blocks: template.blocks
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The test email could not be sent.');
      this.closeModal('hiring-email-test-modal');
      this.showToast(`Test email sent to ${recipient}.`);
    } catch (error) {
      console.error('Hiring test email failed:', error);
      this.showToast(error.message || 'The test email could not be sent.', true);
    } finally {
      button.disabled = false;
      button.textContent = 'Send Test';
    }
  },
  renderHiringEmailBlock(block, index) {
    const textTypes = !['spacer', 'hr'].includes(block.type);
    const supportsFormatting = ['body', 'signature'].includes(block.type);
    const label = block.type.replace('-', ' ');
    return `<article class="hiring-email-block-card">
      <div class="hiring-email-block-heading">
        <div class="hiring-email-block-title">
          <span>${this.esc(label)}</span>
          ${supportsFormatting ? `
            <div class="hiring-email-format-controls" aria-label="Text formatting">
              <button type="button" aria-label="Bold" title="Bold" onclick="HiringApp.applyHiringEmailFormat(${index}, 'bold')"><strong>B</strong></button>
              <button type="button" aria-label="Italic" title="Italic" onclick="HiringApp.applyHiringEmailFormat(${index}, 'italic')"><em>I</em></button>
              <button type="button" aria-label="Underline" title="Underline" onclick="HiringApp.applyHiringEmailFormat(${index}, 'underline')"><u>U</u></button>
            </div>` : ''}
        </div>
        <div>
          <button type="button" aria-label="Move block up" onclick="HiringApp.moveHiringEmailBlock(${index}, -1)" ${index === 0 ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 15 6-6 6 6"/></svg></button>
          <button type="button" aria-label="Move block down" onclick="HiringApp.moveHiringEmailBlock(${index}, 1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></button>
          <button class="danger" type="button" aria-label="Remove block" onclick="HiringApp.removeHiringEmailBlock(${index})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg></button>
        </div>
      </div>
      ${textTypes ? `<textarea id="hiring-email-block-${index}" rows="${['body', 'signature', 'bullet-list', 'number-list'].includes(block.type) ? 3 : 1}" maxlength="5000" oninput="HiringApp.handleHiringEmailInput('block', ${index}, this)">${this.esc(block.value)}</textarea>` : `<div class="hiring-email-structural-block">${block.type === 'spacer' ? 'Vertical spacing' : 'Horizontal divider'}</div>`}
    </article>`;
  },
  renderHiringEmailPreviewBlock(block) {
    const value = this.renderHiringEmailRichText(block.value);
    if (block.type === 'header') return `<h1>${value || 'Email heading'}</h1>`;
    if (block.type === 'subheader') return `<h2>${value || 'Email subheading'}</h2>`;
    if (block.type === 'body') return `<p>${value}</p>`;
    if (block.type === 'signature') return `<p class="signature">${value}</p>`;
    if (block.type === 'bullet-list' || block.type === 'number-list') {
      const tag = block.type === 'bullet-list' ? 'ul' : 'ol';
      const items = String(block.value || '').split('\n').map(item => item.trim()).filter(Boolean);
      return `<${tag}>${items.map(item => `<li>${this.renderHiringEmailRichText(item)}</li>`).join('')}</${tag}>`;
    }
    if (block.type === 'spacer') return '<div class="email-spacer"></div>';
    if (block.type === 'hr') return '<hr>';
    return '';
  },
  renderHiringEmailRichText(value) {
    return this.esc(this.resolveHiringEmailPlaceholders(value))
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/_([^_\n]+)_/g, '<em>$1</em>')
      .replace(/&lt;u&gt;([\s\S]+?)&lt;\/u&gt;/g, '<u>$1</u>')
      .replace(/\n/g, '<br>');
  },
  resolveHiringEmailPlaceholders(value) {
    const employee = this.hiringEmailPreviewEmployee || {};
    const user = this.authInfo?.user || {};
    const metadata = user.user_metadata || {};
    const values = { first_name: employee.first_name || String(metadata.full_name || metadata.name || '').split(/\s+/)[0] || 'Employee', last_name: employee.last_name || String(metadata.full_name || metadata.name || '').split(/\s+/).slice(1).join(' '), email: employee.email || user.email || '', contact_number: employee.contact_number || metadata.phone || '', job_title: employee.title || metadata.title || this.authInfo?.role || 'Employee' };
    return String(value || '').replace(/\{\{(first_name|last_name|email|contact_number|job_title)\}\}/g, (_match, key) => values[key] || '—');
  },
  handleHiringEmailInput(kind, field, input) {
    if (kind === 'meta') this.updateHiringEmailMeta(field, input.value, input);
    else this.updateHiringEmailBlock(Number(field), input.value);
    this.updateHiringEmailPlaceholderMenu(kind, field, input);
  },

  updateHiringEmailPlaceholderMenu(kind, field, input) {
    const menu = document.getElementById('hiring-email-placeholder-menu');
    if (!menu || !input) return;
    const cursor = input.selectionStart ?? input.value.length;
    const beforeCursor = input.value.slice(0, cursor);
    const match = beforeCursor.match(/\{\{[a-z_]*$/i);
    if (!match) {
      this.closeHiringEmailPlaceholderMenu();
      return;
    }
    const query = match[0].slice(2).toLowerCase();
    let visibleCount = 0;
    menu.querySelectorAll('button').forEach(button => {
      const matches = button.textContent.toLowerCase().includes(query);
      button.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    if (!visibleCount) {
      this.closeHiringEmailPlaceholderMenu();
      return;
    }
    this.hiringEmailPlaceholderTarget = {
      kind,
      field,
      input,
      start: cursor - match[0].length,
      end: cursor
    };
    const rect = input.getBoundingClientRect();
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
    menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 250)}px`;
    menu.classList.add('open');
  },

  closeHiringEmailPlaceholderMenu() {
    document.getElementById('hiring-email-placeholder-menu')?.classList.remove('open');
    this.hiringEmailPlaceholderTarget = null;
  },

  insertHiringEmailPlaceholder(name) {
    const target = this.hiringEmailPlaceholderTarget;
    if (!target?.input) return;
    const token = `{{${name}}}`;
    const input = target.input;
    input.value = input.value.slice(0, target.start) + token + input.value.slice(target.end);
    const nextCursor = target.start + token.length;
    input.focus();
    input.setSelectionRange(nextCursor, nextCursor);
    if (target.kind === 'meta') this.updateHiringEmailMeta(target.field, input.value, input);
    else this.updateHiringEmailBlock(Number(target.field), input.value);
    this.closeHiringEmailPlaceholderMenu();
  },

  applyHiringEmailFormat(index, format) {
    const input = document.getElementById(`hiring-email-block-${index}`);
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = input.value.slice(start, end);
    const wrappers = {
      bold: ['**', '**'],
      italic: ['_', '_'],
      underline: ['<u>', '</u>']
    };
    const wrapper = wrappers[format];
    if (!wrapper) return;
    const formatted = `${wrapper[0]}${selected}${wrapper[1]}`;
    input.value = input.value.slice(0, start) + formatted + input.value.slice(end);
    input.focus();
    input.setSelectionRange(start + wrapper[0].length, start + wrapper[0].length + selected.length);
    this.updateHiringEmailBlock(index, input.value);
  },

  updateHiringEmailMeta(field, value, input) {
    const template = this.getActiveHiringEmailTemplate();
    template[field] = String(value || '').slice(0, field === 'subject' ? 100 : 150);
    this.hiringEmailTemplates[this.selectedHiringEmailType] = template;
    this.scheduleHiringEmailSave();
    const counter = input?.closest('label')?.querySelector('small');
    if (counter) counter.textContent = `${template[field].length} / ${field === 'subject' ? 100 : 150}`;
    this.refreshHiringEmailPreview();
  },

  updateHiringEmailBlock(index, value) {
    const template = this.getActiveHiringEmailTemplate();
    if (!template.blocks[index]) return;
    template.blocks[index].value = String(value || '').slice(0, 5000);
    this.hiringEmailTemplates[this.selectedHiringEmailType] = template;
    this.scheduleHiringEmailSave();
    this.refreshHiringEmailPreview();
  },

  refreshHiringEmailPreview() {
    const template = this.getActiveHiringEmailTemplate();
    const envelope = document.getElementById('hiring-email-envelope');
    const blocks = document.getElementById('hiring-email-rendered-blocks');
    if (envelope) {
      envelope.innerHTML = `<div><span>Subject</span><strong>${this.esc(template.subject)}</strong></div><div><span>Preview</span><p>${this.esc(template.preheader)}</p></div>`;
    }
    if (blocks) blocks.innerHTML = template.blocks.map(block => this.renderHiringEmailPreviewBlock(block)).join('');
  },

  addHiringEmailBlock(type) {
    const template = this.getActiveHiringEmailTemplate();
    if (template.blocks.length >= 30) return;
    const defaults = {
      header: 'New Header',
      subheader: 'New Subheader',
      body: 'Enter email body text.',
      'bullet-list': 'First item\nSecond item',
      'number-list': 'First item\nSecond item',
      signature: 'Best regards,\nBrightKey Hiring Team',
      spacer: '',
      hr: ''
    };
    template.blocks.push({ type, value: defaults[type] || '' });
    this.hiringEmailTemplates[this.selectedHiringEmailType] = template;
    this.scheduleHiringEmailSave();
    this.renderHiringEmailWorkspace();
  },

  removeHiringEmailBlock(index) {
    const template = this.getActiveHiringEmailTemplate();
    if (template.blocks.length <= 1) return;
    template.blocks.splice(index, 1);
    this.hiringEmailTemplates[this.selectedHiringEmailType] = template;
    this.scheduleHiringEmailSave();
    this.renderHiringEmailWorkspace();
  },
  moveHiringEmailBlock(index, direction) {
    const template = this.getActiveHiringEmailTemplate();
    const target = index + direction;
    if (target < 0 || target >= template.blocks.length) return;
    [template.blocks[index], template.blocks[target]] = [template.blocks[target], template.blocks[index]];
    this.hiringEmailTemplates[this.selectedHiringEmailType] = template;
    this.scheduleHiringEmailSave();
    this.renderHiringEmailWorkspace();
  },
  scheduleHiringEmailSave() {
    const status = document.getElementById('hiring-email-save-status');
    if (status) status.textContent = 'Saving…';
    clearTimeout(this.hiringEmailSaveTimer);
    this.hiringEmailSaveTimer = setTimeout(() => this.saveHiringEmailTemplates(), 500);
  },

  async saveHiringEmailTemplates() {
    const { error } = await this.sb.from('global_settings').upsert({
      company_id: this.companyId,
      key: 'hiring_email_templates',
      value: this.hiringEmailTemplates
    }, { onConflict: 'company_id,key' });
    const status = document.getElementById('hiring-email-save-status');
    if (error) {
      console.error('Hiring email templates save failed:', error);
      this.hiringEmailSaveTimer = null;
      if (status) status.textContent = 'Could not save';
      this.showToast('The email template could not be saved. Please try again.', true);
      return false;
    }
    this.hiringEmailSaveTimer = null;
    if (status) status.textContent = 'Saved automatically';
    return true;
  },

  getDefaultApplicationForm() {
    return {
      instructions: '',
      requiredQualifications: [],
      customFields: []
    };
  },

  getActiveApplicationForm() {
    if (!this.selectedApplicationFormId) return null;
    if (!this.applicationForms[this.selectedApplicationFormId]) {
      this.applicationForms[this.selectedApplicationFormId] = this.getDefaultApplicationForm();
    }
    const form = this.applicationForms[this.selectedApplicationFormId];
    form.customFields = Array.isArray(form.customFields) ? form.customFields : [];
    form.requiredQualifications = Array.isArray(form.requiredQualifications) ? form.requiredQualifications : [];
    form.instructions = String(form.instructions || '');
    return form;
  },

  async loadApplicationForms() {
    const builder = document.getElementById('application-form-builder');
    const select = document.getElementById('application-form-job-select');
    if (!builder || !select) return;

    const [postsResult, formsResult] = await Promise.all([
      this.sb.from('job_posts')
        .select('id, public_code, job_title, job_description, qualifications')
        .eq('company_id', this.companyId)
        .order('created_at', { ascending: false }),
      this.sb.from('global_settings')
        .select('value')
        .eq('company_id', this.companyId)
        .eq('key', 'job_application_forms')
        .maybeSingle()
    ]);

    if (postsResult.error || formsResult.error) {
      console.error('Applicant form builder load failed:', postsResult.error || formsResult.error);
      builder.innerHTML = '<div class="hiring-empty">Applicant forms could not be loaded. Please refresh and try again.</div>';
      return;
    }

    this.jobPosts = postsResult.data || [];
    this.applicationForms = formsResult.data?.value || {};
    if (!this.jobPosts.length) {
      select.innerHTML = '<option value="">No job posts available</option>';
      select.disabled = true;
      builder.innerHTML = '<div class="hiring-empty">Create a job post before building an applicant form.</div>';
      return;
    }

    select.disabled = false;
    select.innerHTML = this.jobPosts.map(post =>
      `<option value="${this.esc(post.id)}">${this.esc(post.job_title)} — ${this.esc(post.public_code || 'No code')}</option>`
    ).join('');
    const selected = this.jobPosts.some(post => post.id === this.selectedApplicationFormId)
      ? this.selectedApplicationFormId
      : this.jobPosts[0].id;
    this.selectApplicationForm(selected);
  },

  selectApplicationForm(jobId) {
    this.selectedApplicationFormId = jobId || '';
    const select = document.getElementById('application-form-job-select');
    if (select && jobId) select.value = jobId;
    this.renderApplicationFormBuilder();
  },

  renderApplicationFormBuilder() {
    const builder = document.getElementById('application-form-builder');
    const form = this.getActiveApplicationForm();
    const post = this.jobPosts.find(item => item.id === this.selectedApplicationFormId);
    if (!builder || !form || !post) return;
    builder.innerHTML = `
      <section class="application-form-section">
        <div class="application-form-section-heading">
          <div><h3>Instructions</h3></div>
          <span class="application-form-save-status" id="application-form-save-status">Saved</span>
        </div>
        <label class="application-instructions-field" for="application-form-instructions">
          <span>Instructions</span>
          <textarea id="application-form-instructions" rows="3" placeholder="Please complete this application truthfully and accurately. Inaccurate or false information may affect the evaluation of your application or result in disqualification." oninput="HiringApp.updateApplicationInstructions(this.value)">${this.esc(form.instructions)}</textarea>
        </label>
      </section>
      `;
  },

  renderApplicationQualification(qualification, index, isRequired) {
    return `<label class="application-qualification-row"><input type="checkbox" ${isRequired ? 'checked' : ''} onchange="HiringApp.toggleApplicationQualification(${index}, this.checked)" /><span>${this.esc(qualification)}</span>${isRequired ? '<strong>Required</strong>' : ''}</label>`;
  },

  renderApplicationCustomField(field, index) {
    const typeLabels = { short: 'Short Answer', long: 'Long Answer', date: 'Date Picker', upload: 'Upload File', checkboxes: 'Checkboxes', radio: 'Radio Button', slider: 'Slider' };
    return `<article class="application-custom-field" ondragover="event.preventDefault()" ondrop="HiringApp.dropApplicationField(${index})">
      <button class="application-drag-handle" type="button" draggable="true" aria-label="Drag question" title="Drag to reorder" ondragstart="HiringApp.startApplicationFieldDrag(event, ${index})" ondragend="HiringApp.endApplicationFieldDrag()"><svg viewBox="0 0 12 20" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.3"/><circle cx="9" cy="3" r="1.3"/><circle cx="3" cy="10" r="1.3"/><circle cx="9" cy="10" r="1.3"/><circle cx="3" cy="17" r="1.3"/><circle cx="9" cy="17" r="1.3"/></svg></button>
      <div class="application-field-main">
        <label><span>Question ${index + 1}</span><input value="${this.esc(field.question)}" placeholder="Enter a question" onchange="HiringApp.updateApplicationField(${index}, 'question', this.value)" /></label>
        <label><span>Type of Answer</span><select onchange="HiringApp.updateApplicationFieldType(${index}, this.value)">${Object.entries(typeLabels).map(([value, label]) => `<option value="${value}" ${field.type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        ${this.renderApplicationFieldOptions(field, index)}
      </div>
      <div class="application-field-actions"><button class="application-duplicate-field" type="button" aria-label="Duplicate question" title="Duplicate question" onclick="HiringApp.duplicateApplicationField(${index})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></button><button class="application-remove-field" type="button" aria-label="Delete question" title="Delete question" onclick="HiringApp.removeApplicationField(${index})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg></button></div>
    </article>`;
  },

  renderApplicationFieldOptions(field, index) {
    if (!['checkboxes', 'radio', 'slider'].includes(field.type)) {
      const placeholder = field.type === 'long'
        ? 'Long answer (two lines)'
        : field.type === 'date'
          ? 'Date picker'
          : field.type === 'upload'
            ? 'One file · JPG, JPEG, PNG, PDF, HEIC or GIF · max 15 MB'
            : 'Short answer';
      return `<div class="application-answer-preview ${field.type}">${placeholder}</div>`;
    }
    const options = field.options || [];
    const isSlider = field.type === 'slider';
    return `<div class="application-field-options">
      ${options.map((option, optionIndex) => `<div class="application-option-row"><input value="${this.esc(option)}" onchange="HiringApp.updateApplicationOption(${index}, ${optionIndex}, this.value)" />${isSlider && options.length === 5 && optionIndex === 2 ? '<span class="application-neutral-label">Neutral</span>' : ''}${!isSlider && optionIndex === options.length - 1 ? `<label class="application-option-specify-toggle" title="Add a “Please Specify” short field"><input type="checkbox" ${field.allowSpecify ? 'checked' : ''} onchange="HiringApp.updateApplicationField(${index}, 'allowSpecify', this.checked); HiringApp.renderApplicationFormBuilder()" /><span>Add “Please Specify” field</span></label>` : ''}<button type="button" aria-label="Remove option" ${options.length <= 2 ? 'disabled' : ''} onclick="HiringApp.removeApplicationOption(${index}, ${optionIndex})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg></button></div>`).join('')}
      <button class="application-add-option" type="button" ${options.length >= 10 ? 'disabled' : ''} onclick="HiringApp.addApplicationOption(${index})">Add option${options.length >= 10 ? ' (max 10)' : ''}</button>
    </div>`;
  },

  toggleApplicationQualification(index, required) {
    const form = this.getActiveApplicationForm();
    const post = this.jobPosts.find(item => item.id === this.selectedApplicationFormId);
    const qualifications = Array.isArray(post?.qualifications)
      ? post.qualifications.map(item => typeof item === 'string' ? item : item?.item).filter(Boolean)
      : [];
    const qualification = qualifications[index];
    if (!form || !qualification) return;
    form.requiredQualifications = required
      ? [...new Set([...form.requiredQualifications, qualification])]
      : form.requiredQualifications.filter(item => item !== qualification);
    this.renderApplicationFormBuilder();
    this.scheduleApplicationFormSave();
  },

  renderApplicationPreviewField(field, index) {
    const question = `${index + 1}. ${this.esc(field.question || 'Untitled question')}`;
    const type = field.type || 'short';
    if (type === 'long') {
      return `<label class="application-preview-field"><span>${question}</span><textarea rows="2" maxlength="500" oninput="this.nextElementSibling.textContent = this.value.length + ' of 500'"></textarea><small class="application-preview-character-count" aria-live="polite">0 of 500</small></label>`;
    }
    if (type === 'date') {
      return `<label class="application-preview-field"><span>${question}</span><input type="date" /></label>`;
    }
    if (type === 'upload') {
      return `<label class="application-preview-field"><span>${question}</span><input type="file" accept=".jpg,.jpeg,.png,.pdf,.heic,.gif" onchange="HiringApp.validateApplicationPreviewFile(this)" /><small class="application-preview-file-help">One file only · JPG, JPEG, PNG, PDF, HEIC or GIF · max 15 MB</small></label>`;
    }
    if (type === 'slider') {
      const options = field.options?.length ? field.options : ['Option 1', 'Option 2', 'Option 3', 'Option 4'];
      const selectedIndex = Math.floor((options.length - 1) / 2);
      const progress = options.length > 1 ? (selectedIndex / (options.length - 1)) * 100 : 0;
      return `<fieldset class="application-preview-field"><legend>${question}</legend><div class="application-preview-slider"><input type="range" min="0" max="${options.length - 1}" step="1" value="${selectedIndex}" aria-label="${question}" style="--slider-progress: ${progress}%" oninput="this.style.setProperty('--slider-progress', (this.value / this.max * 100) + '%')" /><div class="application-preview-slider-labels">${options.map(option => `<span>${this.esc(option)}</span>`).join('')}</div></div></fieldset>`;
    }
    if (['checkboxes', 'radio'].includes(type)) {
      const inputType = type === 'checkboxes' ? 'checkbox' : 'radio';
      const fieldOptions = field.options || [];
      const options = fieldOptions.map((option, optionIndex) => `<label><input type="${inputType}" name="application-preview-field-${index}" value="${this.esc(option)}" ${field.allowSpecify && optionIndex === fieldOptions.length - 1 ? 'data-specify-trigger' : ''} onchange="HiringApp.updateApplicationPreviewSpecifyState(this)" /><span>${this.esc(option || `Option ${optionIndex + 1}`)}</span></label>`).join('');
      const specify = field.allowSpecify
        ? '<div class="application-preview-specify" data-specify-field hidden><input type="text" data-specify-input placeholder="Please specify" disabled /></div>'
        : '';
      return `<fieldset class="application-preview-field"><legend>${question}</legend><div class="application-preview-options ${type}">${options}${specify}</div></fieldset>`;
    }
    return `<label class="application-preview-field"><span>${question}</span><input type="text" /></label>`;
  },

  validateApplicationPreviewFile(input) {
    const file = input?.files?.[0];
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = new Set(['jpg', 'jpeg', 'png', 'pdf', 'heic', 'gif']);
    if (!allowedExtensions.has(extension)) {
      input.value = '';
      this.showToast('Choose a JPG, JPEG, PNG, PDF, HEIC, or GIF file.', true);
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      input.value = '';
      this.showToast('The file is too large. Choose a file that is 15 MB or smaller.', true);
    }
  },

  updateApplicationPreviewSpecifyState(input) {
    const options = input?.closest('.application-preview-options');
    const specifyTrigger = options?.querySelector('[data-specify-trigger]');
    const specifyField = options?.querySelector('[data-specify-field]');
    const specifyInput = options?.querySelector('[data-specify-input]');
    if (!specifyTrigger || !specifyField || !specifyInput) return;
    const isSelected = specifyTrigger.checked;
    specifyField.hidden = !isSelected;
    specifyInput.disabled = !isSelected;
    specifyInput.required = isSelected;
    if (!isSelected) specifyInput.value = '';
    if (input === specifyTrigger && isSelected) specifyInput.focus();
  },

  viewApplicationForm() {
    const post = this.jobPosts.find(item => item.id === this.selectedApplicationFormId);
    const form = this.getActiveApplicationForm();
    if (!post || !form) {
      this.showToast('Select a job post first.', true);
      return;
    }
    document.getElementById('application-form-preview')?.remove();
    const requiredQualifications = Array.isArray(post.qualifications)
      ? post.qualifications.map(item => typeof item === 'string' ? item : item?.item)
        .filter(item => form.requiredQualifications.includes(item))
      : [];
    const customFields = form.customFields.map((field, index) => this.renderApplicationPreviewField(field, index)).join('');
    const overlay = document.createElement('div');
    overlay.className = 'hiring-modal-overlay application-form-preview-overlay';
    overlay.id = 'application-form-preview';
    const applicantFields = [
      ['First Name', 'text', ''],
      ['Last Name', 'text', ''],
      ['Address', 'text', ''],
      ['Contact Number', 'tel', 'inputmode="numeric" pattern="[0-9]*" oninput="this.value = this.value.replace(/[^0-9]/g, \'\')"'],
      ['Email', 'email', '']
    ].map(([label, type, attributes]) => `<label><span>${label}</span><input type="${type}" ${attributes} /></label>`).join('');
    const defaultInstructions = 'Please complete this application truthfully and accurately. Inaccurate or false information may affect the evaluation of your application or result in disqualification.';
    const applicationInstructions = form.instructions?.trim() || defaultInstructions;
    const certification = 'I certify that the information I have provided is true, accurate, and complete. I consent to the collection and processing of my personal information for recruitment purposes, including consideration for future job opportunities.';
    overlay.innerHTML = `<div class="hiring-modal-card application-form-preview-card" role="dialog" aria-modal="true" aria-labelledby="application-form-preview-title"><div class="hiring-modal-header"><h3 id="application-form-preview-title">${this.esc(post.job_title)}</h3><button class="hiring-icon-btn" type="button" aria-label="Close preview" onclick="HiringApp.closeApplicationFormPreview()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><form class="application-form-preview-body" onsubmit="event.preventDefault(); HiringApp.showToast('This is a preview. Responses were not submitted.');">${post.job_description ? `<p class="application-preview-job-description">${this.esc(post.job_description)}</p>` : ''}${requiredQualifications.length ? `<section class="application-preview-required-qualifications"><h4>Required Qualifications</h4><ul>${requiredQualifications.map(item => `<li>${this.esc(item)}</li>`).join('')}</ul></section>` : ''}<p class="application-preview-instructions">${this.esc(applicationInstructions)}</p><section><h4>Applicant Information</h4><div class="application-preview-standard-fields">${applicantFields}</div></section>${customFields ? `<section><h4>Additional Questions</h4><div class="application-preview-custom-fields">${customFields}</div></section>` : ''}<label class="application-preview-certification"><input type="checkbox" required /><span>${certification}</span></label><button class="btn application-preview-submit" type="submit">Submit</button></form></div>`;
    document.body.appendChild(overlay);
    overlay.style.display = 'flex';
    overlay.offsetHeight;
    overlay.classList.add('open');
  },

  closeApplicationFormPreview() {
    const overlay = document.getElementById('application-form-preview');
    if (!overlay) return;
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 150);
  },

  updateApplicationInstructions(value) {
    const form = this.getActiveApplicationForm();
    if (!form) return;
    form.instructions = value;
    this.scheduleApplicationFormSave();
  },

  addApplicationField(type = 'short') {
    const form = this.getActiveApplicationForm();
    if (!form) return;
    form.customFields.push({ question: '', type, options: ['Option 1', 'Option 2', ...(type === 'slider' ? ['Option 3', 'Option 4'] : [])] });
    this.renderApplicationFormBuilder(); this.scheduleApplicationFormSave();
  },

  duplicateApplicationField(index) {
    const form = this.getActiveApplicationForm(); const field = form?.customFields[index];
    if (!field) return;
    form.customFields.splice(index + 1, 0, { ...field, options: Array.isArray(field.options) ? [...field.options] : field.options });
    this.renderApplicationFormBuilder(); this.scheduleApplicationFormSave();
  },

  updateApplicationField(index, key, value) {
    const field = this.getActiveApplicationForm()?.customFields[index];
    if (!field) return;
    field[key] = value;
    this.scheduleApplicationFormSave();
  },

  updateApplicationFieldType(index, type) {
    const field = this.getActiveApplicationForm()?.customFields[index];
    if (!field) return;
    field.type = type;
    if (['checkboxes', 'radio'].includes(type) && !field.options?.length) field.options = ['Option 1', 'Option 2'];
    if (type === 'slider' && field.options?.length < 4) field.options = ['Option 1', 'Option 2', 'Option 3', 'Option 4'];
    this.renderApplicationFormBuilder();
    this.scheduleApplicationFormSave();
  },

  updateApplicationOption(fieldIndex, optionIndex, value) {
    const field = this.getActiveApplicationForm()?.customFields[fieldIndex];
    if (!field?.options) return;
    field.options[optionIndex] = value;
    this.scheduleApplicationFormSave();
  },

  addApplicationOption(index) {
    const field = this.getActiveApplicationForm()?.customFields[index];
    if (!field || field.options.length >= 10) return;
    field.options.push(`Option ${field.options.length + 1}`);
    this.renderApplicationFormBuilder();
    this.scheduleApplicationFormSave();
  },

  removeApplicationOption(fieldIndex, optionIndex) {
    const field = this.getActiveApplicationForm()?.customFields[fieldIndex];
    if (!field || field.options.length <= 2) return;
    field.options.splice(optionIndex, 1);
    this.renderApplicationFormBuilder();
    this.scheduleApplicationFormSave();
  },

  removeApplicationField(index) {
    const form = this.getActiveApplicationForm();
    if (!form) return;
    form.customFields.splice(index, 1);
    this.renderApplicationFormBuilder(); this.scheduleApplicationFormSave();
  },

  startApplicationFieldDrag(event, index) {
    this.draggedApplicationFieldIndex = index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  },

  endApplicationFieldDrag() { this.draggedApplicationFieldIndex = null; },

  dropApplicationField(targetIndex) {
    const form = this.getActiveApplicationForm();
    const sourceIndex = this.draggedApplicationFieldIndex;
    if (!form || sourceIndex == null || sourceIndex === targetIndex) return;
    const [field] = form.customFields.splice(sourceIndex, 1);
    form.customFields.splice(targetIndex, 0, field);
    this.draggedApplicationFieldIndex = null;
    this.renderApplicationFormBuilder();
    this.scheduleApplicationFormSave();
  },

  scheduleApplicationFormSave() {
    const status = document.getElementById('application-form-save-status');
    if (status) status.textContent = 'Saving…';
    clearTimeout(this.applicationFormSaveTimer);
    this.applicationFormSaveTimer = setTimeout(() => this.saveApplicationForms(), 500);
  },

  async saveApplicationForms() {
    const status = document.getElementById('application-form-save-status');
    const { error } = await this.sb.from('global_settings').upsert({
      company_id: this.companyId,
      key: 'job_application_forms',
      value: this.applicationForms
    }, { onConflict: 'company_id,key' });
    if (error) {
      console.error('Applicant form save failed:', error);
      if (status) status.textContent = 'Could not save';
      this.showToast('Applicant form changes could not be saved. Please try again.', true);
      return;
    }
    if (status) status.textContent = 'Saved';
  },

  async loadTemplateData() {
    const [postsResult, profileResult, templateSettingsResult, hiringInformationResult] = await Promise.all([
      this.sb
        .from('job_posts')
        .select(this.jobPostColumns)
        .eq('company_id', this.companyId)
        .order('created_at', { ascending: false })
        .limit(100),
      this.sb
        .from('global_settings')
        .select('value')
        .eq('company_id', this.companyId)
        .eq('key', 'company_profile_config')
        .maybeSingle(),
      this.sb
        .from('global_settings')
        .select('value')
        .eq('company_id', this.companyId)
        .eq('key', 'job_post_template_config')
        .maybeSingle(),
      this.sb
        .from('global_settings')
        .select('value')
        .eq('company_id', this.companyId)
        .eq('key', 'hiring_information')
        .maybeSingle()
    ]);

    if (postsResult.error) {
      console.error('Job template posts load failed:', postsResult.error);
      this.renderTemplateEmpty('Job posts could not be loaded. Apply the Hiring database migration, then refresh this page.');
      return;
    }

    if (profileResult.error) {
      console.error('Job template company profile load failed:', profileResult.error);
    }
    if (templateSettingsResult.error) {
      console.error('Job template settings load failed:', templateSettingsResult.error);
    }
    if (hiringInformationResult.error) {
      console.error('Hiring information load failed:', hiringInformationResult.error);
    }

    this.jobPosts = postsResult.data || [];
    this.companyProfile = profileResult.data?.value || {};
    this.jobTemplateSettings = templateSettingsResult.data?.value || {};
    this.hiringInformation = hiringInformationResult.data?.value || {};
    this.companyLogoDataUrl = await this.toDataUrl(this.companyProfile.logoDark || '');
    this.populateTemplateJobOptions();
  },

  populateTemplateJobOptions() {
    const select = document.getElementById('template-job-select');
    if (!select) return;
    if (!this.jobPosts.length) {
      select.innerHTML = '<option value="">No job posts available</option>';
      select.disabled = true;
      this.renderTemplateEmpty('Create a job post first to generate a shareable template.');
      return;
    }

    select.innerHTML = this.jobPosts.map(post =>
      `<option value="${this.esc(post.id)}">${this.esc(post.job_title)}</option>`
    ).join('');
    select.disabled = false;
    this.selectTemplateJob(this.jobPosts[0].id);
  },

  async selectTemplateJob(id) {
    const post = this.jobPosts.find(item => item.id === id);
    const button = document.getElementById('download-job-template');
    if (button) button.disabled = !post;
    if (!post) {
      this.renderTemplateEmpty('Select a job post to preview the template.');
      return;
    }
    const settings = this.getCurrentTemplateSettings(post.id);
    if (settings.headerImageUrl && !this.templateImageDataUrls[settings.headerImageUrl]) {
      const dataUrl = await this.toDataUrl(settings.headerImageUrl);
      if (dataUrl) this.templateImageDataUrls[settings.headerImageUrl] = dataUrl;
    }
    this.syncTemplateImageControls(settings);
    this.renderJobTemplate(post);
  },

  setTemplateHeaderText(mode) {
    this.templateHeaderTextMode = mode === 'theme' ? 'theme' : 'white';
    const select = document.getElementById('template-job-select');
    if (select?.value) this.selectTemplateJob(select.value);
  },

  getCurrentTemplateSettings(jobPostId = document.getElementById('template-job-select')?.value) {
    const saved = this.jobTemplateSettings?.[jobPostId] || {};
    return {
      headerImageUrl: saved.headerImageUrl || '',
      positionY: Math.min(100, Math.max(0, Number(saved.positionY) || 50)),
      zoom: Math.min(200, Math.max(100, Number(saved.zoom) || 100))
    };
  },

  syncTemplateImageControls(settings) {
    const adjustments = document.getElementById('template-image-adjustments');
    const position = document.getElementById('template-image-position');
    const zoom = document.getElementById('template-image-zoom');
    if (adjustments) adjustments.hidden = !settings.headerImageUrl;
    if (position) position.value = settings.positionY;
    if (zoom) zoom.value = settings.zoom;
    this.syncTemplateRangeProgress(position);
    this.syncTemplateRangeProgress(zoom);
  },

  syncTemplateRangeProgress(input) {
    if (!input) return;
    const minimum = Number(input.min) || 0;
    const maximum = Number(input.max) || 100;
    const value = Number(input.value) || minimum;
    const progress = maximum === minimum ? 0 : ((value - minimum) / (maximum - minimum)) * 100;
    input.style.setProperty('--range-progress', `${Math.min(100, Math.max(0, progress))}%`);
  },

  updateTemplateImageSetting(field, value) {
    const select = document.getElementById('template-job-select');
    const post = this.jobPosts.find(item => item.id === select?.value);
    if (!post) return;
    const settings = this.getCurrentTemplateSettings(post.id);
    settings[field] = field === 'positionY'
      ? Math.min(100, Math.max(0, Number(value) || 0))
      : Math.min(200, Math.max(100, Number(value) || 100));
    this.jobTemplateSettings[post.id] = settings;
    this.renderJobTemplate(post);
  },

  async saveJobTemplateSettings() {
    const { error } = await this.sb.from('global_settings').upsert({
      company_id: this.companyId,
      key: 'job_post_template_config',
      value: this.jobTemplateSettings
    }, { onConflict: 'company_id,key' });
    if (error) {
      console.error('Job template settings save failed:', error);
      this.showToast('The header image position could not be saved. Please try again.', true);
      return false;
    }
    return true;
  },

  async uploadTemplateHeaderImage(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    const select = document.getElementById('template-job-select');
    const post = this.jobPosts.find(item => item.id === select?.value);
    input.value = '';

    if (!post) {
      this.showToast('Select a job post before uploading a header image.', true);
      return;
    }
    if (!file) return;
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())) {
      this.showToast('Choose a JPEG, PNG, or WebP image.', true);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      this.showToast('The image is too large. Choose an image smaller than 20 MB.', true);
      return;
    }

    const uploadButton = input.nextElementSibling;
    const originalContent = uploadButton?.innerHTML;
    if (uploadButton) {
      uploadButton.disabled = true;
      uploadButton.textContent = 'Compressing image…';
    }

    try {
      const compressed = await this.compressTemplateHeaderImage(file);
      const path = `companies/${this.companyId}/hiring/job-post-templates/${post.id}-${Date.now()}.jpg`;
      const { error: uploadError } = await this.sb.storage
        .from('brightkey-assets')
        .upload(path, compressed, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicData } = this.sb.storage.from('brightkey-assets').getPublicUrl(path);
      const publicUrl = publicData?.publicUrl;
      if (!publicUrl) throw new Error('The uploaded image URL was not returned.');

      const dataUrl = await this.blobToDataUrl(compressed);
      if (dataUrl) this.templateImageDataUrls[publicUrl] = dataUrl;
      this.jobTemplateSettings[post.id] = {
        headerImageUrl: publicUrl,
        positionY: 50,
        zoom: 100
      };
      const settingsSaved = await this.saveJobTemplateSettings();
      if (!settingsSaved) throw new Error('Header image settings could not be saved.');
      this.syncTemplateImageControls(this.jobTemplateSettings[post.id]);
      this.renderJobTemplate(post);
      this.showToast('Header image uploaded and compressed.');
    } catch (error) {
      console.error('Job template header upload failed:', error);
      this.showToast('The header image could not be uploaded. Check the file and try again.', true);
    } finally {
      if (uploadButton) {
        uploadButton.disabled = false;
        uploadButton.innerHTML = originalContent;
      }
    }
  },

  compressTemplateHeaderImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const scale = Math.min(1, 2400 / image.naturalWidth, 2400 / image.naturalHeight);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.fillStyle = '#FFFFFF';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Image compression failed.'));
            return;
          }
          resolve(new File([blob], 'job-post-header.jpg', {
            type: 'image/jpeg',
            lastModified: Date.now()
          }));
        }, 'image/jpeg', 0.8);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('The image could not be read.'));
      };
      image.src = objectUrl;
    });
  },

  blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  },

  async removeTemplateHeaderImage() {
    const select = document.getElementById('template-job-select');
    const post = this.jobPosts.find(item => item.id === select?.value);
    if (!post) return;
    this.jobTemplateSettings[post.id] = { headerImageUrl: '', positionY: 50, zoom: 100 };
    await this.saveJobTemplateSettings();
    this.syncTemplateImageControls(this.jobTemplateSettings[post.id]);
    this.renderJobTemplate(post);
    this.showToast('Header image removed from the template.');
  },

  renderTemplateEmpty(message) {
    const shell = document.getElementById('template-preview-shell');
    if (!shell) return;
    shell.innerHTML = `<div class="template-empty">${this.esc(message)}</div>`;
    const button = document.getElementById('download-job-template');
    if (button) button.disabled = true;
  },

  renderJobTemplate(post) {
    const shell = document.getElementById('template-preview-shell');
    if (!shell) return;

    const colors = this.getTemplateColors();
    const companyName = this.companyProfile.companyName || 'Brightkey';
    const logoUrl = this.companyLogoDataUrl || this.companyProfile.logoDark || '/assets/logo.svg';
    const templateSettings = this.getCurrentTemplateSettings(post.id);
    const headerImageUrl = templateSettings.headerImageUrl
      ? (this.templateImageDataUrls[templateSettings.headerImageUrl] || templateSettings.headerImageUrl)
      : '';
    const positionY = Math.min(100, Math.max(0, Number(templateSettings.positionY) || 50));
    const zoom = Math.min(2, Math.max(1, (Number(templateSettings.zoom) || 100) / 100));
    const qualifications = (post.qualifications || [])
      .map(item => typeof item === 'string' ? item : item?.item)
      .filter(Boolean);
    const responsibilities = ['daily', 'weekly', 'monthly']
      .flatMap(frequency => Array.isArray(post.responsibilities?.[frequency])
        ? post.responsibilities[frequency].map(item => typeof item === 'string' ? item : item?.item)
        : [])
      .filter(Boolean);
    const reportingLabel = {
      remote: 'Remote',
      hybrid: 'Hybrid',
      on_site: 'On-site',
      online: 'Remote',
      office: 'On-site'
    }[post.reporting_mode] || '';
    const expertiseLabel = {
      entry_level: 'Entry-level',
      intermediate: 'Intermediate',
      expert: 'Expert'
    }[post.expertise_level] || '';
    const heroMeta = [
      reportingLabel,
      expertiseLabel
    ].filter(Boolean);

    const list = (items) => items.length
      ? `<ul>${items.map(item => `<li>${this.esc(item)}</li>`).join('')}</ul>`
      : '<p class="poster-muted">Details will be discussed during the application process.</p>';
    const section = (title, content, className = '') => `
      <section class="poster-section ${className}">
        <div class="poster-section-label">${this.esc(title)}</div>
        <div class="poster-section-body">${content}</div>
      </section>`;
    const headerText = this.templateHeaderTextMode === 'theme' ? colors.highlight : '#FFFFFF';
    const contactItems = [
      this.hiringInformation.email ? `
        <span class="poster-contact-item primary">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3z"/><path d="m3 6 9 7 9-7"/></svg>
          ${this.esc(this.hiringInformation.email)}
        </span>` : '',
      this.hiringInformation.contactNumber ? `
        <span class="poster-contact-item primary">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5C3 13.6 10.4 21 19.5 21a1.5 1.5 0 0 0 1.5-1.5V17l-5-1-1.2 3c-4.5-1.9-7.9-5.3-9.8-9.8L8 8Z"/></svg>
          ${this.esc(this.hiringInformation.contactNumber)}
        </span>` : '',
      this.hiringInformation.hiringPageWebsite ? `
        <span class="poster-contact-item">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 3 14 9-6 2-3 6Z"/><path d="m13 14 5 5"/></svg>
          ${this.esc(this.formatHiringWebsite(this.hiringInformation.hiringPageWebsite))}
        </span>` : ''
    ].filter(Boolean);

    shell.innerHTML = `
      <article class="job-poster-sheet" id="job-poster-sheet"
        style="--poster-primary:${colors.primary};--poster-secondary:${colors.secondary};--poster-highlight:${colors.highlight};--poster-header-text:${headerText};">
        <header class="poster-header">
          <div class="poster-brand">
            <img src="${this.esc(logoUrl)}" alt="${this.esc(companyName)} logo" />
          </div>
          <div class="poster-kicker"><span></span>${this.esc(post.department_name || companyName)}</div>
        </header>

        <div class="poster-hero${headerImageUrl ? ' has-image' : ''}">
          ${headerImageUrl ? `
            <img class="poster-hero-background" src="${this.esc(headerImageUrl)}" alt=""
              style="object-position:50% ${positionY}%;transform:scale(${zoom});" />
            <span class="poster-hero-overlay" aria-hidden="true"></span>` : ''}
          <div class="poster-hero-copy">
            <p>We're Hiring</p>
            <h1>${this.esc(post.job_title)}</h1>
            ${heroMeta.length ? `
              <div class="poster-hero-meta">
                ${heroMeta.map(item => `<span>${this.esc(item)}</span>`).join('')}
              </div>` : ''}
          </div>
        </div>

        <main class="poster-content">
          ${section('Job Description', `<p>${this.formatMultiline(post.job_description)}</p>`, 'poster-intro')}
          ${section('Qualifications', list(qualifications))}
          ${section('Responsibilities', list(responsibilities))}
        </main>

        <footer class="poster-footer">
          <div class="poster-apply">
            <strong>Join Our Growing Team</strong>
            ${contactItems.length ? `<div class="poster-contact-list">${contactItems.join('')}</div>` : ''}
          </div>
        </footer>
      </article>`;
  },

  renderModals() {
    if (document.getElementById('job-post-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="hiring-modal-overlay" id="job-post-modal" role="dialog" aria-modal="true" aria-labelledby="job-post-modal-title">
        <div class="hiring-modal-card">
          <div class="hiring-modal-header">
            <h3 id="job-post-modal-title">Create Job Post</h3>
            <button class="hiring-icon-btn" type="button" aria-label="Close" onclick="HiringApp.closeModal('job-post-modal')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <form id="job-post-form" novalidate>
            <div class="hiring-modal-body">
              <section class="hiring-form-section">
                <h4 class="hiring-section-title">Engagement</h4>
                <div class="hiring-form-grid">
                  <div class="hiring-field">
                    <label for="job-type">Type</label>
                    <select id="job-type" required onchange="HiringApp.updateTypeFields()">
                      <option value="" disabled selected hidden>Select employment type</option>
                      <option value="regular">Regular Employee</option>
                      <option value="project_based">Project Based</option>
                    </select>
                  </div>
                  <div class="hiring-field conditional-section employment-dependent regular-only" hidden>
                    <label for="job-position">Position Title</label>
                    <input id="job-position" list="position-options" placeholder="e.g., Data Encoder" />
                    <datalist id="position-options"></datalist>
                  </div>
                  <div class="hiring-field conditional-section employment-dependent" hidden>
                    <label for="job-department">Department</label>
                    <input id="job-department" list="department-options" placeholder="Select or enter new department" />
                    <datalist id="department-options"></datalist>
                  </div>
                  <div class="hiring-field conditional-section employment-dependent" hidden>
                    <label for="job-team">Team <span class="field-hint">Blank means department head</span></label>
                    <input id="job-team" list="team-options" placeholder="Select or enter new team" />
                    <datalist id="team-options"></datalist>
                  </div>
                  <div class="hiring-field conditional-section employment-dependent" hidden>
                    <label for="job-position-type">Position Type</label>
                    <select id="job-position-type" required>
                      <option value="" disabled selected hidden>Select position type</option>
                      <option value="member">Member</option>
                      <option value="manager">Manager</option>
                    </select>
                  </div>
                  <div class="hiring-field conditional-section employment-dependent" hidden>
                    <label for="job-level">Level <span class="field-hint">Optional</span></label>
                    <select id="job-level">
                      <option value="">No level</option>
                      <option value="1">Level 1</option>
                      <option value="2">Level 2</option>
                      <option value="3">Level 3</option>
                      <option value="4">Level 4</option>
                    </select>
                  </div>
                  <div class="hiring-field conditional-section employment-dependent" hidden>
                    <label for="job-hiring-manager">Hiring Manager</label>
                    <select id="job-hiring-manager" required>
                      <option value="" disabled selected hidden>Select an employee</option>
                    </select>
                  </div>
                </div>
              </section>

              <section class="hiring-form-section conditional-section employment-dependent" hidden>
                <h4 class="hiring-section-title">Job Details</h4>
                <div class="hiring-form-grid">
                  <div class="hiring-field full">
                    <label for="job-title">Job Post Title <span class="character-count" id="job-title-count">0 / 100</span></label>
                    <input id="job-title" maxlength="100" required placeholder="e.g., Data Encoder – Product Catalog" oninput="HiringApp.updateCharacterCount('job-title', 'job-title-count', 100)" />
                  </div>
                  <div class="hiring-field full">
                    <label for="job-description">Job Post Description <span class="character-count" id="job-description-count">0 / 500</span></label>
                    <textarea id="job-description" maxlength="500" required placeholder="e.g., Encode and maintain accurate product records, verify submitted information, and keep the company database organized and up to date." oninput="HiringApp.updateCharacterCount('job-description', 'job-description-count', 500)"></textarea>
                  </div>
                </div>
              </section>

              <section class="hiring-form-section conditional-section employment-dependent" hidden>
                <h4 class="hiring-section-title">Qualifications</h4>
                <div class="builder-list" id="qualifications-list"
                  ondragover="HiringApp.handleQualificationDragOver(event)"
                  ondrop="HiringApp.handleQualificationDrop(event)"></div>
                <button class="builder-add" type="button" onclick="HiringApp.addQualification()">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
                  Add qualification
                </button>
              </section>

              <section class="hiring-form-section conditional-section employment-dependent regular-only" id="responsibilities-section" hidden>
                <h4 class="hiring-section-title">Responsibilities</h4>
                <div class="builder-column-headings responsibility-headings" aria-hidden="true">
                  <span>Responsibility</span>
                  <span>KPI <small>(Optional)</small></span>
                  <span>Frequency</span>
                  <span></span>
                </div>
                <div class="builder-list" id="responsibilities-list"></div>
                <button class="builder-add" type="button" onclick="HiringApp.addResponsibility()">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
                  Add item
                </button>
              </section>

              <section class="hiring-form-section conditional-section employment-dependent project-only" id="milestones-section" hidden>
                <h4 class="hiring-section-title">Milestones</h4>
                <div class="builder-list" id="milestones-list"></div>
                <button class="builder-add" type="button" onclick="HiringApp.addMilestone()">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
                  Add milestone
                </button>
              </section>

              <section class="hiring-form-section conditional-section employment-dependent" hidden>
                <h4 class="hiring-section-title">Compensation</h4>
                <div class="hiring-form-grid">
                  <div class="hiring-field conditional-section project-only" hidden>
                    <label for="project-length">Project Length</label>
                    <select id="project-length">
                      <option value="" disabled selected hidden>Select project length</option>
                      <option value="short">Short (1–2 months)</option>
                      <option value="intermediate">Intermediate (3–6 months)</option>
                      <option value="long">Long (1 year+)</option>
                    </select>
                  </div>
                  <div class="hiring-field conditional-section project-only" hidden>
                    <label for="fixed-price">Fixed Price</label>
                    <input id="fixed-price" type="number" min="0" step="0.01" placeholder="₱0.00" />
                  </div>
                  <div class="hiring-field conditional-section regular-only">
                    <label>Salary</label>
                    <div class="salary-mode-options" role="radiogroup" aria-label="Salary format">
                      <label><input id="salary-mode-single" type="radio" name="salary-mode" value="single" checked onchange="HiringApp.toggleSalaryMode()" /> Single</label>
                      <label><input id="salary-mode-range" type="radio" name="salary-mode" value="range" onchange="HiringApp.toggleSalaryMode()" /> Range</label>
                    </div>
                    <div class="salary-input-grid" id="salary-input-grid">
                      <label class="salary-amount-field">
                        <span id="salary-primary-label">Monthly Salary</span>
                        <input id="monthly-salary" type="number" min="0" step="0.01" placeholder="₱0.00 / mo" />
                      </label>
                      <label class="salary-amount-field" id="salary-maximum-field" hidden>
                        <span>To Salary</span>
                        <input id="monthly-salary-max" type="number" min="0" step="0.01" placeholder="₱0.00 / mo" />
                      </label>
                    </div>
                  </div>
                  <div class="hiring-field conditional-section regular-only">
                    <label>Salary Options</label>
                    <div class="option-check-grid compact">
                      <label class="option-check"><input id="salary-confidential" type="checkbox" onchange="HiringApp.toggleSalaryConfidential()" /> Confidential</label>
                      <label class="option-check"><input id="salary-negotiable" type="checkbox" /> Negotiable</label>
                    </div>
                  </div>
                  <div class="hiring-field full conditional-section regular-only">
                    <label>Additional Compensation</label>
                    <div class="option-check-grid">
                      ${[
                        ['allowances', 'Allowances'],
                        ['commission', 'Commission'],
                        ['performance_bonus', 'Performance Bonus'],
                        ['13th_month', '13th Month'],
                        ['overtime_pay', 'Overtime Pay']
                      ].map(([value, label]) => `<label class="option-check"><input type="checkbox" name="compensation-extra" value="${value}" /> ${label}</label>`).join('')}
                    </div>
                  </div>
                </div>
              </section>

              <section class="hiring-form-section conditional-section employment-dependent regular-only" hidden>
                <h4 class="hiring-section-title">Benefits</h4>
                <div class="option-check-grid">
                  ${[
                    ['premiums', 'Premiums (SSS, PAGIBIG, etc.)'],
                    ['hmo', 'HMO'],
                    ['paid_leave', 'Paid Leave'],
                    ['gas_allowance', 'Gas Allowance'],
                    ['meal_allowance', 'Meal Allowance'],
                    ['transportation', 'Transportation'],
                    ['uniform', 'Uniform'],
                    ['company_phone', 'Company Phone'],
                    ['company_laptop', 'Company Laptop'],
                    ['training', 'Training']
                  ].map(([value, label]) => `<label class="option-check"><input type="checkbox" name="job-benefit" value="${value}" /> ${label}</label>`).join('')}
                </div>
              </section>

              <section class="hiring-form-section conditional-section employment-dependent" hidden>
                <h4 class="hiring-section-title">Reporting / Communication Hours</h4>
                <div class="hiring-form-grid">
                  <div class="hiring-field full">
                    <label>Select days</label>
                    <div class="day-picker" id="reporting-days">
                      ${[['M','M'],['T','T'],['W','W'],['Th','Th'],['F','F'],['Sa','Sa'],['Su','Su']].map(([value,label]) =>
                        `<button class="day-chip" type="button" data-day="${value}" onclick="HiringApp.toggleDay('${value}', this)">${label}</button>`
                      ).join('')}
                    </div>
                  </div>
                  <div class="hiring-field full">
                    <label>Time</label>
                    <div class="time-row">
                      <input id="reporting-time-start" type="time" aria-label="Reporting start time" />
                      <span>to</span>
                      <input id="reporting-time-end" type="time" aria-label="Reporting end time" />
                      <label class="inline-check conditional-section project-only" hidden><input id="free-hours" type="checkbox" onchange="HiringApp.toggleFreeHours()" /> Free hours</label>
                    </div>
                  </div>
                </div>
              </section>

              <section class="hiring-form-section conditional-section employment-dependent" hidden>
                <h4 class="hiring-section-title">Filters</h4>
                <div class="hiring-form-grid three">
                  <div class="hiring-field">
                    <label for="reporting-mode">Reporting</label>
                    <select id="reporting-mode">
                      <option value="" disabled selected hidden>Select reporting setup</option>
                      <option value="remote">Remote</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="on_site">On-site</option>
                    </select>
                  </div>
                  <div class="hiring-field">
                    <label for="location-scope">Location</label>
                    <select id="location-scope" onchange="HiringApp.updateLocationFields()">
                      <option value="everywhere">Anywhere</option>
                      <option value="specific">Country / City</option>
                    </select>
                  </div>
                  <div class="hiring-field">
                    <label for="applicant-type">Applicant</label>
                    <select id="applicant-type">
                      <option value="" disabled selected hidden>Select applicant type</option>
                      <option value="individual">Individual</option>
                      <option value="team">Team</option>
                      <option value="agency">Agency</option>
                    </select>
                  </div>
                  <div class="hiring-field conditional-section location-specific" hidden>
                    <label for="location-country">Country</label>
                    <input id="location-country" placeholder="Country" />
                  </div>
                  <div class="hiring-field conditional-section location-specific" hidden>
                    <label for="location-city">City</label>
                    <input id="location-city" placeholder="City" />
                  </div>
                  <div class="hiring-field">
                    <label for="expertise-level">Expertise</label>
                    <select id="expertise-level">
                      <option value="" disabled selected hidden>Select expertise</option>
                      <option value="entry_level">Entry-level</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="expert">Expert</option>
                    </select>
                  </div>
                </div>
              </section>

              <section class="hiring-form-section conditional-section employment-dependent" hidden>
                <h4 class="hiring-section-title">Availability</h4>
                <div class="hiring-form-grid availability-grid">
                  <div class="hiring-field short-field">
                    <label for="vacancy-count">Vacancies</label>
                    <input id="vacancy-count" type="number" min="1" max="99" step="1" value="1" inputmode="numeric" />
                  </div>
                  <div class="hiring-field">
                    <label for="availability-type">Starting</label>
                    <select id="availability-type" onchange="HiringApp.updateAvailabilityFields()">
                      <option value="immediately">Start Immediately</option>
                      <option value="start_date">Start Date</option>
                    </select>
                  </div>
                  <div class="hiring-field conditional-section start-date-field" hidden>
                    <label for="expected-start-date">Start Date</label>
                    <input id="expected-start-date" type="date" />
                  </div>
                </div>
              </section>

              <section class="hiring-form-section conditional-section employment-dependent" hidden>
                <h4 class="hiring-section-title">Tags / Relevant Skills</h4>
                <div class="hiring-field">
                  <label for="job-tags-input">Skills <span class="field-hint">Press comma to add</span></label>
                  <div class="tag-editor" id="job-tags-editor" onclick="document.getElementById('job-tags-input').focus()">
                    <div class="tag-pill-list" id="job-tags-list"></div>
                    <input id="job-tags-input" autocomplete="off" placeholder="Type a skill" onkeydown="HiringApp.handleTagKeydown(event)" oninput="HiringApp.handleTagInput(event)" onblur="HiringApp.commitTagInput()" />
                  </div>
                </div>
              </section>

              <section class="hiring-form-section conditional-section employment-dependent job-post-application-form-section" hidden>
                <h4 class="hiring-section-title">Application Form</h4>
                <p class="hiring-section-description">Choose required qualifications and add the questions applicants must answer.</p>
                <div id="job-post-application-form-builder" class="application-form-builder"></div>
              </section>

              <section class="hiring-form-section conditional-section employment-dependent" hidden>
                <div class="application-stages-heading">
                  <div>
                    <h4 class="hiring-section-title">Application Stages</h4>
                    <p>List the tests or interviewer actions applicants must complete before moving forward.</p>
                  </div>
                  <button class="btn btn-outline application-stage-add" id="add-application-stage-btn" type="button" onclick="HiringApp.addApplicationStage()">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                    Add Stage
                  </button>
                </div>
                <div class="application-submission-step" aria-label="Application workflow begins with submission">
                  <div class="application-submission-bar">Application Submission</div>
                  <svg class="application-submission-arrow" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 4v14M7 13l5 5 5-5"/>
                  </svg>
                </div>
                <div class="application-stages-list" id="application-stages-list"></div>
                <p class="application-stage-limit">Up to 4 stages · 5 tasks per stage</p>
                <div class="application-onboarding-step" aria-label="Successful applicants proceed to onboarding">
                  <svg class="application-onboarding-arrow" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 4v14M7 13l5 5 5-5"/>
                  </svg>
                  <div class="application-onboarding-bar">Onboarding</div>
                </div>
              </section>
            </div>
            <div class="hiring-modal-footer">
              <button class="btn btn-outline" type="button" onclick="HiringApp.closeModal('job-post-modal')">Cancel</button>
              <button class="btn btn-positive" id="post-job-btn" type="submit">Post</button>
            </div>
          </form>
        </div>
      </div>

      <div class="hiring-modal-overlay template-lightbox-overlay" id="template-preview-modal" role="dialog" aria-modal="true" aria-labelledby="template-preview-title">
        <div class="hiring-modal-card template-lightbox-card">
          <div class="hiring-modal-header">
            <div>
              <span class="template-preview-eyebrow">Template Preview</span>
              <h3 id="template-preview-title">Job Post</h3>
            </div>
            <div class="template-lightbox-actions">
              <button class="btn btn-primary" id="download-preview-template" type="button" disabled onclick="HiringApp.exportJobTemplatePDF(HiringApp.previewingId, 'download-preview-template')">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>
                Download PDF
              </button>
              <button class="hiring-icon-btn" type="button" aria-label="Close template preview" onclick="HiringApp.closeModal('template-preview-modal')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
          <div class="template-lightbox-body">
            <div class="template-preview-shell" id="template-preview-shell"></div>
          </div>
        </div>
      </div>

      <div class="hiring-modal-overlay" id="delete-job-modal" role="dialog" aria-modal="true" aria-labelledby="delete-job-title">
        <div class="hiring-modal-card compact">
          <div class="hiring-modal-header">
            <h3 id="delete-job-title">Delete Job Post</h3>
            <button class="hiring-icon-btn" type="button" aria-label="Close" onclick="HiringApp.closeModal('delete-job-modal')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="hiring-modal-body">
            <p class="modal-delete-copy">This job post will be permanently removed. This action cannot be undone.</p>
          </div>
          <div class="hiring-modal-footer">
            <button class="btn btn-outline" type="button" onclick="HiringApp.closeModal('delete-job-modal')">Cancel</button>
            <button class="btn btn-danger" type="button" onclick="HiringApp.confirmDelete()">Delete</button>
          </div>
        </div>
      </div>`);

    document.getElementById('job-post-form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.saveJobPost();
    });

    document.querySelectorAll('.hiring-modal-overlay').forEach((overlay) => {
      overlay.addEventListener('mousedown', (event) => {
        if (event.target === overlay) this.closeModal(overlay.id);
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && document.getElementById('template-preview-modal')?.classList.contains('open')) {
        this.closeModal('template-preview-modal');
      }
    });
  },

  async loadEmployees() {
    const [employeesResult, structureResult] = await Promise.all([
      this.sb
        .from('employees')
        .select('id, first_name, last_name, title, department, employment_status')
        .eq('company_id', this.companyId)
        .order('first_name', { ascending: true }),
      this.sb
        .from('global_settings')
        .select('value')
        .eq('company_id', this.companyId)
        .eq('key', 'company_structure')
        .maybeSingle()
    ]);

    if (employeesResult.error) {
      console.error('Hiring employees load failed:', employeesResult.error);
      this.showToast('Employee options could not be loaded. Refresh the page before selecting a hiring manager.', true);
      return;
    }

    this.employees = (employeesResult.data || []).filter((employee) =>
      String(employee.employment_status || 'Active').toLowerCase() !== 'inactive'
    );

    if (structureResult.error) {
      console.error('Hiring organization structure load failed:', structureResult.error);
      this.showToast('Organization teams could not be loaded. You can still enter a team manually.', true);
    }

    const departments = Array.isArray(structureResult.data?.value?.departments)
      ? structureResult.data.value.departments
      : [];
    this.organizationDepartments = departments
      .map(department => String(department?.name || '').trim())
      .filter(Boolean);
    this.organizationTeams = departments
      .flatMap(department => Array.isArray(department?.subteams) ? department.subteams : [])
      .map(team => String(team?.name || '').trim())
      .filter(Boolean);

    this.populateEmployeeOptions();
  },

  populateEmployeeOptions() {
    const unique = (values) => [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    const setOptions = (id, values) => {
      const list = document.getElementById(id);
      if (list) list.innerHTML = values.map(value => `<option value="${this.esc(value)}"></option>`).join('');
    };

    setOptions('position-options', unique(this.employees.map(employee => employee.title)));
    setOptions('department-options', unique([
      ...this.organizationDepartments,
      ...this.employees.map(employee => employee.department)
    ]));
    setOptions('team-options', unique(this.organizationTeams));

    const managerSelect = document.getElementById('job-hiring-manager');
    if (managerSelect) {
      const selectedId = managerSelect.value;
      const placeholder = this.employees.length ? 'Select an employee' : 'No active employees available';
      managerSelect.innerHTML = `
        <option value="" disabled hidden${selectedId ? '' : ' selected'}>${placeholder}</option>
        ${this.employees.map((employee) => {
          const fullName = [employee.first_name, employee.last_name].filter(Boolean).join(' ').trim();
          const label = employee.title ? `${fullName} — ${employee.title}` : fullName;
          return `<option value="${this.esc(employee.id)}">${this.esc(label || 'Unnamed employee')}</option>`;
        }).join('')}`;
      if (selectedId && this.employees.some(employee => employee.id === selectedId)) {
        managerSelect.value = selectedId;
      }
    }
  },

  async loadJobPosts() {
    const body = document.getElementById('job-posts-body');
    if (!body) return;

    const { data, error } = await this.sb
      .from('job_posts')
      .select(this.jobPostColumns)
      .eq('company_id', this.companyId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Job posts load failed:', error);
      body.innerHTML = `<tr><td colspan="10"><div class="hiring-empty">Job posts are not available yet. Apply the Hiring database migration, then refresh this page.</div></td></tr>`;
      return;
    }

    this.jobPosts = data || [];
    this.renderJobPosts();
  },

  renderJobPosts() {
    const body = document.getElementById('job-posts-body');
    if (!body) return;
    if (!this.jobPosts.length) {
      body.innerHTML = `<tr><td colspan="10"><div class="hiring-empty">No job posts yet. Create your first job post.</div></td></tr>`;
      return;
    }

    body.innerHTML = this.jobPosts.map(post => {
      const isProject = post.employment_type === 'project_based';
      const typeLabel = isProject ? 'Project Based' : 'Regular Employee';
      const departmentTeam = [post.department_name, post.team_name].filter(Boolean).join(' / ') || '—';
      const compensation = !isProject && post.salary_confidential
        ? `Confidential${post.salary_negotiable ? ' · Negotiable' : ''}`
        : isProject && post.fixed_price != null
          ? `${this.formatCurrency(post.fixed_price)} fixed`
          : !isProject && post.salary_mode === 'range' && post.monthly_salary != null && post.monthly_salary_max != null
            ? `${this.formatCurrency(post.monthly_salary)} – ${this.formatCurrency(post.monthly_salary_max)} / mo${post.salary_negotiable ? ' · Negotiable' : ''}`
            : post.monthly_salary == null
              ? '—'
              : `${this.formatCurrency(post.monthly_salary)} / mo${!isProject && post.salary_negotiable ? ' · Negotiable' : ''}`;
      const reporting = post.free_hours
        ? 'Free hours'
        : [this.formatTime(post.reporting_time_start), this.formatTime(post.reporting_time_end)].filter(Boolean).join(' – ') || '—';

      return `<tr>
        <td><span class="job-type-pill${isProject ? ' project' : ''}">${typeLabel}</span></td>
        <td><button class="job-title-cell" type="button" onclick="HiringApp.openEditModal('${this.esc(post.id)}')" aria-label="Edit ${this.esc(post.job_title)}">${this.esc(post.job_title)}</button></td>
        <td>${this.esc(departmentTeam)}</td>
        <td>${post.visibility_level ? `<span class="job-level-pill">Level ${post.visibility_level}</span>` : '—'}</td>
        <td>${this.esc(compensation)}</td>
        <td>${this.esc(reporting)}</td>
        <td>${this.esc(this.formatDate(post.created_at))}</td>
        <td><code class="job-code-cell">${this.esc(post.public_code || '—')}</code></td>
        <td>
          <label class="visibility-toggle" aria-label="Toggle visibility for ${this.esc(post.job_title)}">
            <input type="checkbox" ${post.status === 'posted' ? 'checked' : ''} disabled />
            <span class="visibility-toggle-track" aria-hidden="true"></span>
          </label>
        </td>
        <td>
          <div class="hiring-action-group">
            ${post.public_code ? `<a class="hiring-icon-btn" href="/careers/${this.esc(post.public_code)}" target="_blank" rel="noopener noreferrer" title="Open live job post" aria-label="Open live job post for ${this.esc(post.job_title)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07.07l2-2A5 5 0 0 0 12 4l-1.15 1.15"/><path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15"/></svg>
            </a>` : `<button class="hiring-icon-btn" type="button" title="Live job post unavailable" aria-label="Live job post unavailable for ${this.esc(post.job_title)}" disabled>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07.07l2-2A5 5 0 0 0 12 4l-1.15 1.15"/><path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15"/></svg>
            </button>`}
            <button class="hiring-icon-btn" type="button" title="Preview template" aria-label="Preview template for ${this.esc(post.job_title)}" onclick="HiringApp.openTemplatePreview('${this.esc(post.id)}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>
            </button>
            <button class="hiring-icon-btn danger" type="button" title="Delete" aria-label="Delete ${this.esc(post.job_title)}" onclick="HiringApp.openDeleteModal('${this.esc(post.id)}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  },
  openCreateModal() {
    this.editingId = null;
    this.resetForm();
    window.BKHiringJobApplicationForm?.open();
    document.getElementById('job-post-modal-title').textContent = 'Create Job Post';
    document.getElementById('post-job-btn').textContent = 'Post';
    this.openModal('job-post-modal');
  },

  openEditModal(id) {
    const post = this.jobPosts.find(item => item.id === id);
    if (!post) return;
    this.editingId = id;
    this.resetForm();
    this.fillForm(post);
    window.BKHiringJobApplicationForm?.open(id);
    document.getElementById('job-post-modal-title').textContent = 'Edit Job Post';
    document.getElementById('post-job-btn').textContent = 'Save Changes';
    this.openModal('job-post-modal');
  },

  openDeleteModal(id) {
    this.deletingId = id;
    this.openModal('delete-job-modal');
  },

  async openTemplatePreview(id) {
    const post = this.jobPosts.find(item => item.id === id);
    const shell = document.getElementById('template-preview-shell');
    const title = document.getElementById('template-preview-title');
    const downloadButton = document.getElementById('download-preview-template');
    if (!post || !shell || !title) return;

    this.previewingId = id;
    if (downloadButton) downloadButton.disabled = true;
    title.textContent = post.job_title;
    shell.innerHTML = `
      <div class="template-loading">
        <span class="spinner-cyan"></span>
        <span>Preparing job post template</span>
      </div>`;
    this.openModal('template-preview-modal');

    const [profileResult, settingsResult, hiringInformationResult] = await Promise.all([
      this.sb
        .from('global_settings')
        .select('value')
        .eq('company_id', this.companyId)
        .eq('key', 'company_profile_config')
        .maybeSingle(),
      this.sb
        .from('global_settings')
        .select('value')
        .eq('company_id', this.companyId)
        .eq('key', 'job_post_template_config')
        .maybeSingle(),
      this.sb
        .from('global_settings')
        .select('value')
        .eq('company_id', this.companyId)
        .eq('key', 'hiring_information')
        .maybeSingle()
    ]);

    if (profileResult.error) console.error('Job template company profile load failed:', profileResult.error);
    if (settingsResult.error) console.error('Job template settings load failed:', settingsResult.error);
    if (hiringInformationResult.error) console.error('Hiring information load failed:', hiringInformationResult.error);
    this.companyProfile = profileResult.data?.value || {};
    this.jobTemplateSettings = settingsResult.data?.value || {};
    this.hiringInformation = hiringInformationResult.data?.value || {};
    this.companyLogoDataUrl = await this.toDataUrl(this.companyProfile.logoDark || '');

    if (profileResult.error || settingsResult.error || hiringInformationResult.error) {
      this.showToast('Some template settings could not be loaded. The preview is using available information.', true);
    }

    if (document.getElementById('template-preview-modal')?.classList.contains('open')) {
      this.renderJobTemplate(post);
      if (downloadButton) downloadButton.disabled = false;
    }
  },

  openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('open');
  },

  closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('open');
    setTimeout(() => {
      modal.style.display = 'none';
      if (id === 'delete-job-modal') this.deletingId = null;
      if (id === 'template-preview-modal') this.previewingId = null;
    }, 150);
  },

  resetForm() {
    const form = document.getElementById('job-post-form');
    form?.reset();
    this.selectedDays.clear();
    this.setTags([]);
    this.setApplicationStages(this.getDefaultApplicationStages());
    document.querySelectorAll('.day-chip').forEach(button => button.classList.remove('active'));
    document.querySelectorAll('.invalid').forEach(field => field.classList.remove('invalid'));
    document.getElementById('qualifications-list').innerHTML = '';
    document.getElementById('responsibilities-list').innerHTML = '';
    document.getElementById('milestones-list').innerHTML = '';
    this.addQualification();
    this.addResponsibility();
    this.addMilestone();
    this.updateTypeFields();
    this.updateLocationFields();
    this.updateAvailabilityFields();
    this.toggleFreeHours();
    this.toggleSalaryMode();
    this.toggleSalaryConfidential();
    this.updateCharacterCount('job-title', 'job-title-count', 100);
    this.updateCharacterCount('job-description', 'job-description-count', 500);
  },

  fillForm(post) {
    const value = (id, fieldValue) => {
      const element = document.getElementById(id);
      if (element) element.value = fieldValue ?? '';
    };
    value('job-type', post.employment_type);
    value('job-position', post.position);
    value('job-department', post.department_name);
    value('job-team', post.team_name);
    value('job-position-type', post.position_type);
    value('job-level', post.visibility_level);
    value('job-hiring-manager', post.assignee_id);
    value('job-title', post.job_title);
    value('job-description', post.job_description);
    value('project-length', post.project_length);
    value('fixed-price', post.fixed_price);
    value('monthly-salary', post.monthly_salary);
    value('monthly-salary-max', post.monthly_salary_max);
    value('vacancy-count', post.vacancy_count || 1);
    value('availability-type', post.expected_start_date ? 'start_date' : 'immediately');
    value('expected-start-date', post.expected_start_date);
    value('reporting-time-start', this.trimTime(post.reporting_time_start));
    value('reporting-time-end', this.trimTime(post.reporting_time_end));
    value('reporting-mode', post.reporting_mode === 'online'
      ? 'remote'
      : post.reporting_mode === 'office'
        ? 'on_site'
        : post.reporting_mode);
    value('location-scope', post.location_scope || 'everywhere');
    value('location-country', post.location_country);
    value('location-city', post.location_city);
    value('applicant-type', post.applicant_type);
    value('expertise-level', post.expertise_level);
    this.setTags(post.tags || []);
    this.setApplicationStages(post.application_stages);
    document.getElementById('free-hours').checked = Boolean(post.free_hours);
    document.getElementById('salary-confidential').checked = Boolean(post.salary_confidential);
    document.getElementById('salary-negotiable').checked = Boolean(post.salary_negotiable);
    const salaryMode = post.salary_mode === 'range' ? 'range' : 'single';
    const salaryModeInput = document.querySelector(`input[name="salary-mode"][value="${salaryMode}"]`);
    if (salaryModeInput) salaryModeInput.checked = true;
    this.setCheckedValues('compensation-extra', post.compensation_extras || []);
    this.setCheckedValues('job-benefit', post.benefits || []);

    this.selectedDays = new Set(post.reporting_days || []);
    document.querySelectorAll('.day-chip').forEach(button => {
      button.classList.toggle('active', this.selectedDays.has(button.dataset.day));
    });

    this.setBuilderValues('qualifications-list', post.qualifications || [], 'qualification');
    const responsibilities = post.responsibilities || {};
    this.setResponsibilityValues(responsibilities);
    this.setBuilderValues('milestones-list', post.milestones || [], 'milestone');

    this.updateTypeFields();
    this.updateLocationFields();
    this.updateAvailabilityFields();
    this.toggleFreeHours();
    this.toggleSalaryMode();
    this.toggleSalaryConfidential();
    this.updateCharacterCount('job-title', 'job-title-count', 100);
    this.updateCharacterCount('job-description', 'job-description-count', 500);
  },

  setBuilderValues(containerId, values, kind) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    const rows = values.length ? values : [{}];
    rows.forEach(item => {
      if (kind === 'qualification') this.addQualification(item);
      if (kind === 'milestone') this.addMilestone(item);
    });
  },

  addQualification(item = {}) {
    const container = document.getElementById('qualifications-list');
    if (!container) return;
    const qualification = typeof item === 'string' ? item : (item.item || '');
    container.insertAdjacentHTML('beforeend', `
      <div class="builder-row qualification-row" data-builder-row>
        <button class="builder-drag-handle" type="button" draggable="true" aria-label="Drag to reorder qualification"
          ondragstart="HiringApp.handleQualificationDragStart(event)"
          ondragend="HiringApp.handleQualificationDragEnd(event)">
          <svg viewBox="0 0 16 24" width="12" height="18" aria-hidden="true">
            <circle cx="4" cy="5" r="1.5"></circle><circle cx="12" cy="5" r="1.5"></circle>
            <circle cx="4" cy="12" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle>
            <circle cx="4" cy="19" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle>
          </svg>
        </button>
        <input data-field="item" maxlength="200" placeholder="e.g., Detail-oriented with basic spreadsheet skills" value="${this.esc(qualification)}" onchange="BKHiringJobApplicationForm.syncQualifications()" />
        ${this.removeBuilderButton()}
      </div>`);
  },

  handleQualificationDragStart(event) {
    const row = event.currentTarget.closest('.qualification-row');
    if (!row) return;
    this.draggedQualificationRow = row;
    row.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', 'qualification');
    event.dataTransfer.setDragImage(row, 24, row.offsetHeight / 2);
  },

  handleQualificationDragOver(event) {
    const row = this.draggedQualificationRow;
    const container = document.getElementById('qualifications-list');
    if (!row || !container) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const target = event.target.closest('.qualification-row');
    if (!target || target === row || target.parentElement !== container) return;
    const bounds = target.getBoundingClientRect();
    const placeBefore = event.clientY < bounds.top + (bounds.height / 2);
    container.insertBefore(row, placeBefore ? target : target.nextSibling);
  },

  handleQualificationDrop(event) {
    if (!this.draggedQualificationRow) return;
    event.preventDefault();
    this.handleQualificationDragEnd();
  },

  handleQualificationDragEnd() {
    this.draggedQualificationRow?.classList.remove('dragging');
    this.draggedQualificationRow = null;
  },

  addResponsibility(item = {}) {
    const container = document.getElementById('responsibilities-list');
    if (!container) return;
    const frequency = item.frequency || '';
    container.insertAdjacentHTML('beforeend', `
      <div class="builder-row responsibility-row" data-builder-row>
        <input data-field="item" maxlength="200" placeholder="Responsibility" value="${this.esc(item.item || '')}" />
        <input data-field="kpi" maxlength="120" placeholder="KPI (optional)" value="${this.esc(item.kpi || '')}" />
        <select data-field="frequency" aria-label="Frequency" onchange="this.classList.remove('invalid'); HiringApp.sortResponsibilities()">
          <option value="" disabled${frequency ? '' : ' selected'} hidden>Select</option>
          <option value="daily"${frequency === 'daily' ? ' selected' : ''}>Daily</option>
          <option value="weekly"${frequency === 'weekly' ? ' selected' : ''}>Weekly</option>
          <option value="monthly"${frequency === 'monthly' ? ' selected' : ''}>Monthly</option>
        </select>
        ${this.removeBuilderButton()}
      </div>`);
    this.sortResponsibilities();
  },

  setResponsibilityValues(responsibilities) {
    const container = document.getElementById('responsibilities-list');
    if (!container) return;
    container.innerHTML = '';
    ['daily', 'weekly', 'monthly'].forEach(frequency => {
      (responsibilities[frequency] || []).forEach(item => {
        this.addResponsibility({ ...item, frequency });
      });
    });
    if (!container.children.length) this.addResponsibility();
  },

  sortResponsibilities() {
    const container = document.getElementById('responsibilities-list');
    if (!container) return;
    const order = { daily: 0, weekly: 1, monthly: 2, '': 3 };
    [...container.querySelectorAll('[data-builder-row]')]
      .sort((a, b) => {
        const aValue = a.querySelector('[data-field="frequency"]')?.value || '';
        const bValue = b.querySelector('[data-field="frequency"]')?.value || '';
        return order[aValue] - order[bValue];
      })
      .forEach(row => container.appendChild(row));
  },

  addMilestone(item = {}) {
    const container = document.getElementById('milestones-list');
    if (!container) return;
    container.insertAdjacentHTML('beforeend', `
      <div class="builder-row three-fields" data-builder-row>
        <input data-field="item" maxlength="200" placeholder="Milestone" value="${this.esc(item.item || '')}" />
        <input data-field="kpi" maxlength="120" placeholder="KPI" value="${this.esc(item.kpi || '')}" />
        <input data-field="payout" type="number" min="0" step="0.01" placeholder="Payout release ₱" value="${this.esc(item.payout ?? '')}" />
        ${this.removeBuilderButton()}
      </div>`);
  },

  removeBuilderButton() {
    return `<button class="hiring-icon-btn builder-remove" type="button" aria-label="Remove item" onclick="HiringApp.removeBuilderRow(this)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
    </button>`;
  },

  removeBuilderRow(button) {
    button.closest('[data-builder-row]')?.remove();
  },

  collectBuilder(containerId, fields) {
    return [...document.querySelectorAll(`#${containerId} [data-builder-row]`)]
      .map(row => {
        const item = {};
        fields.forEach(field => {
          const input = row.querySelector(`[data-field="${field}"]`);
          item[field] = field === 'payout'
            ? (input?.value ? Number(input.value) : null)
            : String(input?.value || '').trim();
        });
        return item;
      })
      .filter(item => item.item);
  },

  updateTypeFields() {
    const type = document.getElementById('job-type')?.value || '';
    const hasType = type === 'regular' || type === 'project_based';
    const isRegular = type === 'regular';

    document.querySelectorAll('.employment-dependent').forEach(element => {
      element.hidden = !hasType;
    });
    document.querySelectorAll('.regular-only').forEach(element => {
      element.hidden = !hasType || !isRegular;
    });
    document.querySelectorAll('.project-only').forEach(element => {
      element.hidden = !hasType || isRegular;
    });

    if (isRegular) {
      const freeHours = document.getElementById('free-hours');
      if (freeHours) freeHours.checked = false;
      this.toggleFreeHours();
    }
  },

  updateLocationFields() {
    const isSpecific = document.getElementById('location-scope')?.value === 'specific';
    document.querySelectorAll('.location-specific').forEach(element => { element.hidden = !isSpecific; });
  },

  updateAvailabilityFields() {
    const usesStartDate = document.getElementById('availability-type')?.value === 'start_date';
    document.querySelectorAll('.start-date-field').forEach(element => {
      element.hidden = !usesStartDate;
    });
    if (!usesStartDate) {
      const date = document.getElementById('expected-start-date');
      if (date) date.value = '';
    }
  },

  toggleDay(day, button) {
    if (this.selectedDays.has(day)) this.selectedDays.delete(day);
    else this.selectedDays.add(day);
    button.classList.toggle('active', this.selectedDays.has(day));
  },

  toggleFreeHours() {
    const isFree = document.getElementById('free-hours')?.checked;
    ['reporting-time-start', 'reporting-time-end'].forEach(id => {
      const field = document.getElementById(id);
      if (!field) return;
      field.disabled = isFree;
      if (isFree) field.value = '';
    });
  },

  toggleSalaryConfidential() {
    const isConfidential = document.getElementById('salary-confidential')?.checked;
    ['monthly-salary', 'monthly-salary-max'].forEach(id => {
      const salary = document.getElementById(id);
      if (!salary) return;
      salary.disabled = Boolean(isConfidential);
      if (isConfidential) salary.value = '';
    });
  },

  toggleSalaryMode() {
    const mode = document.querySelector('input[name="salary-mode"]:checked')?.value || 'single';
    const rangeField = document.getElementById('salary-maximum-field');
    const inputGrid = document.getElementById('salary-input-grid');
    const primaryLabel = document.getElementById('salary-primary-label');
    if (rangeField) rangeField.hidden = mode !== 'range';
    if (inputGrid) inputGrid.classList.toggle('range', mode === 'range');
    if (primaryLabel) primaryLabel.textContent = mode === 'range' ? 'From Salary' : 'Monthly Salary';
    if (mode !== 'range') {
      const maximum = document.getElementById('monthly-salary-max');
      if (maximum) maximum.value = '';
    }
  },

  setCheckedValues(name, values) {
    const selected = new Set(values || []);
    document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
      input.checked = selected.has(input.value);
    });
  },

  getCheckedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
  },

  handleTagKeydown(event) {
    if (event.key === ',') { event.preventDefault(); this.commitTagInput(); return; }
    if (event.key === 'Enter') event.preventDefault();
    if (event.key === 'Backspace' && !event.currentTarget.value && this.tagValues.length) {
      this.tagValues.pop();
      this.renderTags();
    }
  },

  handleTagInput(event) {
    const input = event.currentTarget;
    if (!input.value.includes(',')) return;
    const tokens = input.value.split(','); input.value = tokens.pop() || '';
    tokens.forEach(token => this.addTag(token));
  },

  commitTagInput() {
    const input = document.getElementById('job-tags-input');
    if (!input) return;
    this.addTag(input.value);
    input.value = '';
  },

  addTag(value) {
    const tag = String(value || '').trim();
    if (!tag) return;
    if (!this.tagValues.some(existing => existing.toLowerCase() === tag.toLowerCase())) {
      this.tagValues.push(tag);
      this.renderTags();
    }
  },

  removeTag(index) {
    this.tagValues.splice(index, 1);
    this.renderTags();
    document.getElementById('job-tags-input')?.focus();
  },

  setTags(values) {
    this.tagValues = [...new Set((values || []).map(value => String(value).trim()).filter(Boolean))];
    this.renderTags();
  },

  renderTags() {
    const list = document.getElementById('job-tags-list');
    if (!list) return;
    list.innerHTML = this.tagValues.map((tag, index) => `
      <span class="tag-pill">
        <span>${this.esc(tag)}</span>
        <button type="button" aria-label="Remove ${this.esc(tag)}" onclick="event.stopPropagation(); HiringApp.removeTag(${index})">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </span>`).join('');
  },

  getDefaultApplicationStages() {
    return [
      { name: 'Stage 1', actions: [''] },
      { name: 'Stage 2', actions: [''] },
      { name: 'Stage 3', actions: [''] }
    ];
  },

  normalizeApplicationStages(stages) {
    const isLegacyDefault = Array.isArray(stages)
      && stages.length === 1
      && Array.isArray(stages[0]?.actions)
      && stages[0].actions.length === 3
      && stages[0].actions.every(action => !String(action ?? '').trim());
    const source = Array.isArray(stages) && stages.length && !isLegacyDefault
      ? stages.slice(0, 4)
      : this.getDefaultApplicationStages();
    return source.map((stage, stageIndex) => {
      const actions = Array.isArray(stage?.actions) && stage.actions.length
        ? stage.actions.slice(0, 5).map(action => String(action ?? ''))
        : [''];
      return {
        name: `Stage ${stageIndex + 1}`,
        actions
      };
    });
  },

  setApplicationStages(stages) {
    this.applicationStages = this.normalizeApplicationStages(stages);
    this.renderApplicationStages();
  },

  getApplicationStagePlaceholder(stageIndex, actionIndex) {
    const defaults = [
      'Filter in relevant applications, reject irrelevant profiles',
      'Preliminary interview with HR via video call',
      'Final interview with CEO'
    ];
    if (actionIndex === 0 && defaults[stageIndex]) return defaults[stageIndex];
    return `Describe the next task for Stage ${stageIndex + 1}`;
  },

  renderApplicationStages() {
    const container = document.getElementById('application-stages-list');
    if (!container) return;
    container.innerHTML = this.applicationStages.map((stage, stageIndex) => `
      <article class="application-stage-card">
        <div class="application-stage-card-header">
          <h5>${this.esc(stage.name)}</h5>
          ${this.applicationStages.length > 1 ? `
            <button class="hiring-icon-btn application-stage-remove" type="button" aria-label="Remove ${this.esc(stage.name)}" onclick="HiringApp.removeApplicationStage(${stageIndex})">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
            </button>` : ''}
        </div>
        <div class="application-stage-actions">
          ${stage.actions.map((action, actionIndex) => `
            <div class="application-stage-action">
              <label for="application-stage-${stageIndex}-action-${actionIndex}">Task ${actionIndex + 1}</label>
              <div class="application-stage-action-control">
                <textarea
                  id="application-stage-${stageIndex}-action-${actionIndex}"
                  maxlength="500"
                  rows="3"
                  placeholder="${this.esc(this.getApplicationStagePlaceholder(stageIndex, actionIndex))}"
                  oninput="HiringApp.updateApplicationStageAction(${stageIndex}, ${actionIndex}, this.value)"
                >${this.esc(action)}</textarea>
                ${stage.actions.length > 1 ? `
                  <button class="hiring-icon-btn application-action-remove" type="button" aria-label="Remove task ${actionIndex + 1}" onclick="HiringApp.removeApplicationStageAction(${stageIndex}, ${actionIndex})">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>
                  </button>` : ''}
              </div>
            </div>`).join('')}
        </div>
        <button class="builder-add application-action-add" type="button" onclick="HiringApp.addApplicationStageAction(${stageIndex})" ${stage.actions.length >= 5 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Add Task
        </button>
      </article>`).join('');

    const addStageButton = document.getElementById('add-application-stage-btn');
    if (addStageButton) addStageButton.disabled = this.applicationStages.length >= 4;
  },

  updateApplicationStageAction(stageIndex, actionIndex, value) {
    const stage = this.applicationStages[stageIndex];
    if (!stage || actionIndex < 0 || actionIndex >= stage.actions.length) return;
    stage.actions[actionIndex] = value;
  },

  addApplicationStageAction(stageIndex) {
    const stage = this.applicationStages[stageIndex];
    if (!stage || stage.actions.length >= 5) return;
    stage.actions.push('');
    this.renderApplicationStages();
  },

  removeApplicationStageAction(stageIndex, actionIndex) {
    const stage = this.applicationStages[stageIndex];
    if (!stage || stage.actions.length <= 1) return;
    stage.actions.splice(actionIndex, 1);
    this.renderApplicationStages();
  },

  addApplicationStage() {
    if (this.applicationStages.length >= 4) return;
    this.applicationStages.push({
      name: `Stage ${this.applicationStages.length + 1}`,
      actions: ['']
    });
    this.renderApplicationStages();
  },

  removeApplicationStage(stageIndex) {
    if (this.applicationStages.length <= 1) return;
    this.applicationStages.splice(stageIndex, 1);
    this.applicationStages.forEach((stage, index) => {
      stage.name = `Stage ${index + 1}`;
    });
    this.renderApplicationStages();
  },

  updateCharacterCount(inputId, counterId, max) {
    const input = document.getElementById(inputId);
    const counter = document.getElementById(counterId);
    if (input && counter) counter.textContent = `${input.value.length} / ${max}`;
  },

  validateForm() {
    document.querySelectorAll('.invalid').forEach(field => field.classList.remove('invalid'));
    const type = document.getElementById('job-type').value;
    const required = ['job-position-type', 'job-hiring-manager', 'job-title', 'job-description'];
    const salaryMode = document.querySelector('input[name="salary-mode"]:checked')?.value || 'single';
    if (type === 'regular' && !document.getElementById('salary-confidential').checked) {
      required.push('monthly-salary');
      if (salaryMode === 'range') required.push('monthly-salary-max');
    }
    if (type === 'project_based') required.push('project-length', 'fixed-price');
    if (document.getElementById('location-scope').value === 'specific') {
      required.push('location-country');
    }
    if (document.getElementById('availability-type').value === 'start_date') {
      required.push('expected-start-date');
    }

    const invalid = required.map(id => document.getElementById(id)).filter(field => !String(field?.value || '').trim());
    document.querySelectorAll('#responsibilities-list [data-builder-row]').forEach(row => {
      const responsibility = row.querySelector('[data-field="item"]');
      const frequency = row.querySelector('[data-field="frequency"]');
      if (responsibility?.value.trim() && !frequency?.value) invalid.push(frequency);
    });
    const freeHours = document.getElementById('free-hours').checked;
    const start = document.getElementById('reporting-time-start');
    const end = document.getElementById('reporting-time-end');
    if (!freeHours && (!start.value || !end.value || start.value >= end.value)) {
      start.classList.add('invalid');
      end.classList.add('invalid');
      invalid.push(start);
    }
    const salaryMinimum = document.getElementById('monthly-salary');
    const salaryMaximum = document.getElementById('monthly-salary-max');
    if (
      type === 'regular'
      && salaryMode === 'range'
      && !document.getElementById('salary-confidential').checked
      && Number(salaryMaximum.value) < Number(salaryMinimum.value)
    ) {
      salaryMaximum.classList.add('invalid');
      invalid.push(salaryMaximum);
    }

    if (invalid.length) {
      invalid.forEach(field => field?.classList.add('invalid'));
      invalid[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.showToast('Complete the highlighted fields. Time and salary ranges must end at or above their starting values.', true);
      return false;
    }
    return true;
  },

  buildPayload() {
    const type = document.getElementById('job-type').value;
    const isRegular = type === 'regular';
    const freeHours = document.getElementById('free-hours').checked;
    const salaryMode = document.querySelector('input[name="salary-mode"]:checked')?.value || 'single';
    const salaryConfidential = isRegular && document.getElementById('salary-confidential').checked;
    return {
      company_id: this.companyId,
      employment_type: type,
      position: isRegular ? document.getElementById('job-position').value.trim() || null : null,
      department_name: document.getElementById('job-department').value.trim() || null,
      team_name: document.getElementById('job-team').value.trim() || null,
      assignee_id: document.getElementById('job-hiring-manager').value || null,
      position_type: document.getElementById('job-position-type').value || null,
      visibility_level: document.getElementById('job-level').value ? Number(document.getElementById('job-level').value) : null,
      job_title: document.getElementById('job-title').value.trim(),
      job_description: document.getElementById('job-description').value.trim(),
      qualifications: this.collectBuilder('qualifications-list', ['item']),
      responsibilities: isRegular
        ? this.collectResponsibilities()
        : { daily: [], weekly: [], monthly: [] },
      milestones: isRegular ? [] : this.collectBuilder('milestones-list', ['item', 'kpi', 'payout']),
      project_length: isRegular ? null : document.getElementById('project-length').value,
      fixed_price: isRegular ? null : Number(document.getElementById('fixed-price').value),
      monthly_salary: isRegular && !salaryConfidential
        ? Number(document.getElementById('monthly-salary').value)
        : null,
      salary_mode: isRegular ? salaryMode : 'single',
      monthly_salary_max: isRegular && !salaryConfidential && salaryMode === 'range'
        ? Number(document.getElementById('monthly-salary-max').value)
        : null,
      salary_confidential: salaryConfidential,
      salary_negotiable: isRegular && document.getElementById('salary-negotiable').checked,
      compensation_extras: isRegular ? this.getCheckedValues('compensation-extra') : [],
      benefits: isRegular ? this.getCheckedValues('job-benefit') : [],
      reporting_days: [...this.selectedDays],
      reporting_time_start: freeHours ? null : document.getElementById('reporting-time-start').value,
      reporting_time_end: freeHours ? null : document.getElementById('reporting-time-end').value,
      free_hours: freeHours,
      reporting_mode: document.getElementById('reporting-mode').value || null,
      location_scope: document.getElementById('location-scope').value,
      location_country: document.getElementById('location-scope').value === 'specific'
        ? document.getElementById('location-country').value.trim()
        : null,
      location_city: document.getElementById('location-scope').value === 'specific'
        ? document.getElementById('location-city').value.trim() || null
        : null,
      applicant_type: document.getElementById('applicant-type').value || null,
      expertise_level: document.getElementById('expertise-level').value || null,
      vacancy_count: Math.min(99, Math.max(1, Number(document.getElementById('vacancy-count').value) || 1)),
      expected_start_date: document.getElementById('availability-type').value === 'start_date'
        ? document.getElementById('expected-start-date').value || null
        : null,
      tags: [...this.tagValues],
      application_stages: this.normalizeApplicationStages(this.applicationStages),
      status: 'posted',
      created_by: this.authInfo.user.id
    };
  },

  collectResponsibilities() {
    const grouped = { daily: [], weekly: [], monthly: [] };
    this.collectBuilder('responsibilities-list', ['item', 'kpi', 'frequency']).forEach(item => {
      const frequency = Object.hasOwn(grouped, item.frequency) ? item.frequency : 'daily';
      grouped[frequency].push({ item: item.item, kpi: item.kpi });
    });
    return grouped;
  },

  async saveJobPost() {
    if (!this.validateForm()) return;
    const button = document.getElementById('post-job-btn');
    button.disabled = true;
    button.textContent = this.editingId ? 'Saving…' : 'Posting…';
    const payload = this.buildPayload();

    const request = this.editingId
      ? this.sb.from('job_posts').update(payload).eq('id', this.editingId).eq('company_id', this.companyId).select('id').single()
      : this.sb.from('job_posts').insert(payload).select('id').single();
    const { data: savedPost, error } = await request;

    button.disabled = false;
    button.textContent = this.editingId ? 'Save Changes' : 'Post';
    if (error) {
      console.error('Job post save failed:', error);
      const migrationMissing = error.code === 'PGRST205' || /job_posts/i.test(error.message || '');
      this.showToast(
        migrationMissing
          ? 'Hiring storage is not ready yet. Apply the Hiring database migration and try again.'
          : 'The job post could not be saved. Review the form and try again.',
        true
      );
      return;
    }

    const applicationFormSaved = await window.BKHiringJobApplicationForm?.save(savedPost?.id || this.editingId);
    if (applicationFormSaved === false) {
      this.showToast('The job post was saved, but its application questions could not be saved. Please edit the post and try again.', true);
    }

    this.closeModal('job-post-modal');
    this.showToast(this.editingId ? 'Job post updated.' : 'Job post published.');
    await this.loadJobPosts();
  },

  async confirmDelete() {
    if (!this.deletingId) return;
    const id = this.deletingId;
    const { error } = await this.sb
      .from('job_posts')
      .delete()
      .eq('id', id)
      .eq('company_id', this.companyId);

    if (error) {
      console.error('Job post delete failed:', error);
      this.showToast('The job post could not be deleted. Please try again.', true);
      return;
    }

    this.closeModal('delete-job-modal');
    this.showToast('Job post deleted.');
    await this.loadJobPosts();
  },

  getTemplateColors() {
    const brand = this.companyProfile.brandColors || {};
    const valid = (value, fallback) => /^#[0-9A-F]{6}$/i.test(String(value || '')) ? value : fallback;
    return {
      primary: valid(brand.primary, '#06B6D4'),
      secondary: valid(brand.secondary, '#0891B2'),
      highlight: valid(brand.highlight || brand.accent, '#F59E0B')
    };
  },

  formatBenefit(value) {
    const labels = {
      premiums: 'Premiums (SSS, PAGIBIG, etc.)',
      hmo: 'HMO',
      paid_leave: 'Paid Leave',
      gas_allowance: 'Gas Allowance',
      meal_allowance: 'Meal Allowance',
      transportation: 'Transportation',
      uniform: 'Uniform',
      company_phone: 'Company Phone',
      company_laptop: 'Company Laptop',
      training: 'Training'
    };
    return labels[value] || String(value || '').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  },

  formatExpertise(value) {
    return {
      entry_level: 'Entry-level',
      intermediate: 'Intermediate',
      expert: 'Expert'
    }[value] || 'Open';
  },

  formatReportingMode(value) {
    return {
      remote: 'Remote',
      hybrid: 'Hybrid',
      on_site: 'On-site',
      online: 'Remote',
      office: 'On-site'
    }[value] || String(value || '').replace(/_/g, ' ');
  },

  formatReportingDays(days) {
    const order = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'];
    const labels = { M: 'Mon', T: 'Tue', W: 'Wed', Th: 'Thu', F: 'Fri', Sa: 'Sat', Su: 'Sun' };
    const selected = order.filter(day => (days || []).includes(day));
    if (!selected.length) return 'Schedule to be discussed';

    const groups = [];
    let start = selected[0];
    let previous = selected[0];
    selected.slice(1).forEach(day => {
      if (order.indexOf(day) === order.indexOf(previous) + 1) {
        previous = day;
        return;
      }
      groups.push(start === previous ? labels[start] : `${labels[start]} to ${labels[previous]}`);
      start = day;
      previous = day;
    });
    groups.push(start === previous ? labels[start] : `${labels[start]} to ${labels[previous]}`);
    return groups.join(', ');
  },

  formatReportingSchedule(post) {
    const days = this.formatReportingDays(post.reporting_days || []);
    if (post.free_hours) return `${days}, flexible hours`;
    const timeRange = [this.formatTime(post.reporting_time_start), this.formatTime(post.reporting_time_end)]
      .filter(Boolean)
      .join(' to ');
    return timeRange ? `${days}, ${timeRange}` : days;
  },

  formatTemplateCompensation(post) {
    if (post.salary_confidential) return '';
    if (post.employment_type === 'project_based') {
      return post.fixed_price == null ? '' : `${this.formatCurrency(post.fixed_price)} fixed price`;
    }
    if (post.salary_mode === 'range' && post.monthly_salary != null && post.monthly_salary_max != null) {
      return `${this.formatCurrency(post.monthly_salary)} – ${this.formatCurrency(post.monthly_salary_max)} / month`;
    }
    return post.monthly_salary == null ? '' : `${this.formatCurrency(post.monthly_salary)} / month`;
  },

  formatMultiline(value) {
    return this.esc(value).replace(/\r?\n/g, '<br>');
  },

  formatHiringWebsite(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
      const host = parsed.hostname.replace(/^www\./i, '');
      const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
      return `${host}${path}`;
    } catch {
      return raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
    }
  },

  async toDataUrl(url) {
    if (!url || String(url).startsWith('data:')) return url || '';
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Logo download failed');
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.warn('Company logo could not be prepared for PDF export:', error);
      return '';
    }
  },

  async exportJobTemplatePDF(postId = '', buttonId = 'download-job-template') {
    const sheet = document.getElementById('job-poster-sheet');
    const select = document.getElementById('template-job-select');
    const post = this.jobPosts.find(item => item.id === (postId || select?.value));
    if (!sheet || !post) {
      this.showToast(post ? 'The template is still being prepared. Try again in a moment.' : 'Select a job post before downloading the PDF.', true);
      return;
    }
    if (typeof window.html2pdf !== 'function') {
      this.showToast('The PDF generator is still loading. Please try again in a moment.', true);
      return;
    }

    const button = document.getElementById(buttonId);
    if (!button) return;
    button.disabled = true;
    button.textContent = 'Preparing PDF…';
    const filename = `Job_Post_${post.job_title.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'Template'}.pdf`;
    const captureHost = document.createElement('div');
    captureHost.setAttribute('aria-hidden', 'true');
    captureHost.style.cssText = 'position:absolute;left:-9999px;top:0;width:210mm;background:#fff;pointer-events:none;';
    const captureSheet = sheet.cloneNode(true);
    captureHost.appendChild(captureSheet);
    document.body.appendChild(captureHost);

    try {
      await window.html2pdf().set({
        margin: 0,
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          backgroundColor: '#ffffff'
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['.poster-section', '.poster-footer'] }
      }).from(captureSheet).save();
      this.showToast('Job post PDF saved.');
    } catch (error) {
      console.error('Job post PDF export failed:', error);
      this.showToast('The job post PDF could not be created. Check the company logo and try again.', true);
    } finally {
      captureHost.remove();
      button.disabled = false;
      button.innerHTML = `
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>
        Download PDF`;
    }
  },

  formatCurrency(value) {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2
    }).format(Number(value) || 0);
  },

  formatDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric'
    });
  },

  trimTime(value) {
    return value ? String(value).slice(0, 5) : '';
  },

  formatTime(value) {
    if (!value) return '';
    const [hours, minutes] = this.trimTime(value).split(':').map(Number);
    const suffix = hours >= 12 ? 'PM' : 'AM';
    return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`;
  }
};

window.HiringApp = HiringApp;
document.addEventListener('DOMContentLoaded', () => HiringApp.init());

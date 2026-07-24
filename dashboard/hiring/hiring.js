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
    if (path.endsWith('/applicants')) activeTab = 'applicants';
    if (path.endsWith('/templates')) activeTab = 'templates';
    if (path.endsWith('/settings')) activeTab = 'settings';
    this.setActiveTab(activeTab);

    if (activeTab === 'job-post') {
      this.renderJobPostPage();
      this.renderModals();
      await Promise.all([this.loadEmployees(), this.loadJobPosts()]);
    } else if (activeTab === 'templates') {
      this.renderTemplatesPage();
      await this.loadTemplateData();
    } else if (activeTab === 'settings') {
      this.renderSettingsPage();
      await this.loadHiringInformation();
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
                  <th>Visibility</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="job-posts-body">
                <tr><td colspan="9"><div class="loading-wrapper"><span class="spinner-cyan"></span><span>Loading job posts</span></div></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  renderSettingsPage() {
    const content = document.querySelector('.hiring-content');
    if (!content) return;
    content.innerHTML = `
      <div class="hiring-page settings-page">
        <div class="hiring-page-header">
          <div>
            <h2>Settings</h2>
            <p class="hiring-page-description">Manage the contact details shown with your hiring information.</p>
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
      </form>`;

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

  renderTemplatesPage() {
    const content = document.querySelector('.hiring-content');
    if (!content) return;
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
            <span>Recommended: 1600 × 450 px</span>
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

  async loadTemplateData() {
    const [postsResult, profileResult, templateSettingsResult, hiringInformationResult] = await Promise.all([
      this.sb
        .from('job_posts')
        .select('*')
        .eq('company_id', this.companyId)
        .order('created_at', { ascending: false }),
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
        const scale = Math.min(1, 1600 / image.naturalWidth, 1600 / image.naturalHeight);
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
                    <label for="monthly-salary">Salary</label>
                    <input id="monthly-salary" type="number" min="0" step="0.01" placeholder="₱0.00 / mo" />
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
                  <label for="job-tags-input">Skills <span class="field-hint">Press comma or space to add</span></label>
                  <div class="tag-editor" id="job-tags-editor" onclick="document.getElementById('job-tags-input').focus()">
                    <div class="tag-pill-list" id="job-tags-list"></div>
                    <input id="job-tags-input" autocomplete="off" placeholder="Type a skill" onkeydown="HiringApp.handleTagKeydown(event)" oninput="HiringApp.handleTagInput(event)" onblur="HiringApp.commitTagInput()" />
                  </div>
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
      .select('*')
      .eq('company_id', this.companyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Job posts load failed:', error);
      body.innerHTML = `<tr><td colspan="9"><div class="hiring-empty">Job posts are not available yet. Apply the Hiring database migration, then refresh this page.</div></td></tr>`;
      return;
    }

    this.jobPosts = data || [];
    this.renderJobPosts();
  },

  renderJobPosts() {
    const body = document.getElementById('job-posts-body');
    if (!body) return;
    if (!this.jobPosts.length) {
      body.innerHTML = `<tr><td colspan="9"><div class="hiring-empty">No job posts yet. Create your first job post.</div></td></tr>`;
      return;
    }

    body.innerHTML = this.jobPosts.map(post => {
      const isProject = post.employment_type === 'project_based';
      const typeLabel = isProject ? 'Project Based' : 'Regular Employee';
      const departmentTeam = [post.department_name, post.team_name].filter(Boolean).join(' / ') || '—';
      const amount = isProject ? post.fixed_price : post.monthly_salary;
      const compensation = !isProject && post.salary_confidential
        ? `Confidential${post.salary_negotiable ? ' · Negotiable' : ''}`
        : amount == null
          ? '—'
          : `${this.formatCurrency(amount)}${isProject ? ' fixed' : ' / mo'}${!isProject && post.salary_negotiable ? ' · Negotiable' : ''}`;
      const reporting = post.free_hours
        ? 'Free hours'
        : [this.formatTime(post.reporting_time_start), this.formatTime(post.reporting_time_end)].filter(Boolean).join(' – ') || '—';

      return `<tr>
        <td><span class="job-type-pill${isProject ? ' project' : ''}">${typeLabel}</span></td>
        <td><span class="job-title-cell">${this.esc(post.job_title)}</span></td>
        <td>${this.esc(departmentTeam)}</td>
        <td>${post.visibility_level ? `<span class="job-level-pill">Level ${post.visibility_level}</span>` : '—'}</td>
        <td>${this.esc(compensation)}</td>
        <td>${this.esc(reporting)}</td>
        <td>${this.esc(this.formatDate(post.created_at))}</td>
        <td>
          <label class="visibility-toggle" aria-label="Toggle visibility for ${this.esc(post.job_title)}">
            <input type="checkbox" checked />
            <span class="visibility-toggle-track" aria-hidden="true"></span>
          </label>
        </td>
        <td>
          <div class="hiring-action-group">
            <button class="hiring-icon-btn" type="button" title="Preview template" aria-label="Preview template for ${this.esc(post.job_title)}" onclick="HiringApp.openTemplatePreview('${this.esc(post.id)}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>
            </button>
            <button class="hiring-icon-btn" type="button" title="Edit" aria-label="Edit ${this.esc(post.job_title)}" onclick="HiringApp.openEditModal('${this.esc(post.id)}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
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
    document.getElementById('free-hours').checked = Boolean(post.free_hours);
    document.getElementById('salary-confidential').checked = Boolean(post.salary_confidential);
    document.getElementById('salary-negotiable').checked = Boolean(post.salary_negotiable);
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
        <input data-field="item" maxlength="200" placeholder="e.g., Detail-oriented with basic spreadsheet skills" value="${this.esc(qualification)}" />
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
    const salary = document.getElementById('monthly-salary');
    if (!salary) return;
    salary.disabled = Boolean(isConfidential);
    if (isConfidential) salary.value = '';
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
    if (event.key === ',' || event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      this.commitTagInput();
      return;
    }
    if (event.key === 'Backspace' && !event.currentTarget.value && this.tagValues.length) {
      this.tagValues.pop();
      this.renderTags();
    }
  },

  handleTagInput(event) {
    if (!/[,\s]/.test(event.currentTarget.value)) return;
    const tokens = event.currentTarget.value.split(/[,\s]+/).filter(Boolean);
    event.currentTarget.value = '';
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

  updateCharacterCount(inputId, counterId, max) {
    const input = document.getElementById(inputId);
    const counter = document.getElementById(counterId);
    if (input && counter) counter.textContent = `${input.value.length} / ${max}`;
  },

  validateForm() {
    document.querySelectorAll('.invalid').forEach(field => field.classList.remove('invalid'));
    const type = document.getElementById('job-type').value;
    const required = ['job-position-type', 'job-hiring-manager', 'job-title', 'job-description'];
    if (type === 'regular' && !document.getElementById('salary-confidential').checked) required.push('monthly-salary');
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

    if (invalid.length) {
      invalid.forEach(field => field?.classList.add('invalid'));
      invalid[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.showToast('Complete the highlighted fields. Reporting start time must also be earlier than the end time.', true);
      return false;
    }
    return true;
  },

  buildPayload() {
    const type = document.getElementById('job-type').value;
    const isRegular = type === 'regular';
    const freeHours = document.getElementById('free-hours').checked;
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
      monthly_salary: isRegular && !document.getElementById('salary-confidential').checked
        ? Number(document.getElementById('monthly-salary').value)
        : null,
      salary_confidential: isRegular && document.getElementById('salary-confidential').checked,
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
      ? this.sb.from('job_posts').update(payload).eq('id', this.editingId).eq('company_id', this.companyId)
      : this.sb.from('job_posts').insert(payload);
    const { error } = await request;

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

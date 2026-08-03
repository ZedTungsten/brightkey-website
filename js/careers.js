(() => {
  'use strict';

  const COMPANY_ID = 'e6cf43ed-1f42-4aad-a6ed-470147a0489f';
  const API_URL = window.SUPABASE_URL || 'https://ymjlosnxuhsybkzkoofq.supabase.co';
  const API_KEY = window.SUPABASE_ANON;
  const publicStorage = window.supabase && API_KEY
    ? window.supabase.createClient(API_URL, API_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
    : null;

  const labels = {
    regular: 'Regular Employee',
    project_based: 'Project Based',
    remote: 'Remote',
    hybrid: 'Hybrid',
    on_site: 'On-site',
    online: 'Remote',
    office: 'On-site',
    entry_level: 'Entry Level',
    intermediate: 'Intermediate',
    expert: 'Expert',
    allowances: 'Allowances',
    commission: 'Commission',
    performance_bonus: 'Performance Bonus',
    '13th_month': '13th Month',
    overtime_pay: 'Overtime Pay',
    premiums: 'Premiums (SSS, PAG-IBIG, etc.)',
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

  function formatLabel(value) {
    if (!value) return '';
    return labels[value] || String(value)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, character => character.toUpperCase());
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatCurrency(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '';
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: 0
    }).format(amount);
  }

  function formatTime(value) {
    if (!value) return '';
    const [hours, minutes] = String(value).split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';
    const date = new Date(2000, 0, 1, hours, minutes);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = String(text);
    return element;
  }

  async function callRpc(name, payload) {
    if (!API_KEY) throw new Error('Public API configuration is unavailable');
    const response = await fetch(`${API_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: API_KEY,
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Public jobs request failed (${response.status})`);
    return response.json();
  }

  async function callApplicationApi(payload) {
    const response = await fetch('/api/job-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Your application could not be submitted. Please try again.');
    return result;
  }

  function locationLabel(job) {
    if (job.location_scope === 'everywhere') return 'Open location';
    return [job.location_city, job.location_country].filter(Boolean).join(', ') || 'Specified location';
  }

  function jobMeta(job) {
    return [
      formatLabel(job.employment_type),
      job.department_name,
      formatLabel(job.reporting_mode),
      locationLabel(job)
    ].filter(Boolean);
  }

  function jobHeroMeta(job) {
    return [
      locationLabel(job),
      formatLabel(job.reporting_mode),
      formatLabel(job.employment_type)
    ].filter(Boolean);
  }

  function renderEmpty(container, title, description) {
    const empty = createElement('div', 'careers-empty');
    empty.append(
      createElement('h3', '', title),
      createElement('p', '', description)
    );
    container.replaceChildren(empty);
  }

  function renderCareerCard(job) {
    const card = createElement('a', 'career-card');
    card.href = `/careers/${encodeURIComponent(job.public_code)}`;

    const content = createElement('div');
    const eyebrow = createElement('div', 'career-card__eyebrow');
    jobMeta(job).forEach(item => eyebrow.appendChild(createElement('span', '', item)));
    content.append(
      eyebrow,
      createElement('h3', '', job.job_title),
      createElement('p', '', job.job_description)
    );

    const arrow = createElement('span', 'career-card__arrow');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
    card.append(content, arrow);
    return card;
  }

  async function loadCareers() {
    const container = document.getElementById('careers-list');
    const count = document.getElementById('careers-count');
    if (!container || !count) return;

    try {
      const jobs = await callRpc('list_public_job_posts', { p_company_id: COMPANY_ID });
      count.textContent = `${jobs.length} open role${jobs.length === 1 ? '' : 's'}`;
      if (!jobs.length) {
        renderEmpty(container, 'No openings right now', 'Please check back soon for new opportunities.');
        return;
      }
      container.replaceChildren(...jobs.map(renderCareerCard));
    } catch (error) {
      console.error('Careers load failed:', error);
      count.textContent = 'Open roles unavailable';
      renderEmpty(container, 'Openings could not be loaded', 'Please refresh the page or try again later.');
    }
  }

  function addMetaPills(container, items) {
    items.filter(Boolean).forEach(item => container.appendChild(createElement('span', 'job-meta-pill', item)));
  }

  function normalizeItems(items) {
    return Array.isArray(items)
      ? items.map(item => typeof item === 'string' ? item : item?.item).filter(Boolean)
      : [];
  }

  function normalizeApplicationForm(row) {
    return {
      instructions: String(row?.instructions || ''),
      requiredQualifications: Array.isArray(row?.required_qualifications) ? row.required_qualifications : [],
      customFields: Array.isArray(row?.custom_fields) ? row.custom_fields : []
    };
  }

  let applicationModalScrollY = 0;

  function lockApplicationModalBackground() {
    applicationModalScrollY = window.scrollY;
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    document.documentElement.classList.add('job-application-modal-open');
    document.body.classList.add('job-application-modal-open');
    document.body.style.position = 'fixed';
    document.body.style.top = `-${applicationModalScrollY}px`;
    document.body.style.width = '100%';
    if (scrollbarWidth) document.body.style.paddingRight = `${scrollbarWidth}px`;
  }

  function unlockApplicationModalBackground() {
    document.documentElement.classList.remove('job-application-modal-open');
    document.body.classList.remove('job-application-modal-open');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.paddingRight = '';
    window.scrollTo(0, applicationModalScrollY);
  }

  function closeApplicationModal() {
    const modal = document.getElementById('job-application-modal');
    if (!modal) return;
    modal.classList.remove('open');
    unlockApplicationModalBackground();
    window.setTimeout(() => {
      modal.style.display = 'none';
      modal.remove();
    }, 150);
  }

  function createApplicationFieldLabel(text) {
    return createElement('span', 'job-application-field-label', text);
  }

  function createStandardApplicationField(labelText, type) {
    const label = createElement('label', 'job-application-field');
    const input = document.createElement('input');
    input.type = type;
    input.required = true;
    input.name = labelText.toLowerCase().replace(/\s+/g, '_');
    if (type === 'tel') {
      input.inputMode = 'numeric';
      input.pattern = '[0-9]*';
      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^0-9]/g, '');
      });
    }
    label.append(createApplicationFieldLabel(labelText), input);
    return label;
  }

  function validateApplicationFile(input) {
    const file = input.files?.[0];
    if (!file) return true;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!new Set(['jpg', 'jpeg', 'png', 'pdf', 'heic', 'gif']).has(extension)) {
      input.value = '';
      window.Toast?.show('Choose a JPG, JPEG, PNG, PDF, HEIC, or GIF file.', 'error');
      return false;
    }
    if (file.size > 15 * 1024 * 1024) {
      input.value = '';
      window.Toast?.show('The file is too large. Choose a file that is 15 MB or smaller.', 'error');
      return false;
    }
    return true;
  }

  function createCustomApplicationField(field, index) {
    const wrapper = createElement('div', 'job-application-question');
    const question = `${index + 1}. ${field?.question || 'Untitled question'}`;
    const type = field?.type || 'short';
    wrapper.dataset.questionIndex = String(index);
    wrapper.dataset.questionType = type;

    if (['checkboxes', 'radio', 'slider'].includes(type)) {
      const fieldset = createElement('fieldset', `job-application-field job-application-field--${type}`);
      fieldset.appendChild(createElement('legend', 'job-application-field-label', question));
      const options = Array.isArray(field.options) && field.options.length
        ? field.options
        : ['Option 1', 'Option 2'];
      if (type === 'slider') {
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.name = `application_question_${index}`;
        slider.min = '0';
        slider.max = String(Math.max(0, options.length - 1));
        slider.step = '1';
        slider.value = String(Math.floor((options.length - 1) / 2));
        const updateProgress = () => {
          const progress = Number(slider.max) > 0 ? (Number(slider.value) / Number(slider.max)) * 100 : 0;
          slider.style.setProperty('--slider-progress', `${progress}%`);
        };
        slider.addEventListener('input', updateProgress);
        updateProgress();
        const labelsRow = createElement('div', 'job-application-slider-labels');
        options.forEach(option => labelsRow.appendChild(createElement('span', '', option)));
        fieldset.append(slider, labelsRow);
      } else {
        const optionsRow = createElement('div', `job-application-options job-application-options--${type}`);
        let specifyTrigger = null;
        let specifyField = null;
        let specifyInput = null;
        const updateSpecifyState = () => {
          if (!specifyTrigger || !specifyField || !specifyInput) return;
          const isSelected = specifyTrigger.checked;
          specifyField.hidden = !isSelected;
          specifyInput.disabled = !isSelected;
          specifyInput.required = isSelected;
          if (!isSelected) specifyInput.value = '';
        };
        options.forEach((option, optionIndex) => {
          const optionLabel = createElement('label');
          const input = document.createElement('input');
          input.type = type === 'radio' ? 'radio' : 'checkbox';
          input.name = `application_question_${index}`;
          input.value = String(option || `Option ${optionIndex + 1}`);
          input.addEventListener('change', updateSpecifyState);
          if (field.allowSpecify && optionIndex === options.length - 1) specifyTrigger = input;
          optionLabel.append(input, createElement('span', '', input.value));
          optionsRow.appendChild(optionLabel);
        });
        if (field.allowSpecify) {
          specifyField = createElement('div', 'job-application-specify');
          specifyField.hidden = true;
          specifyInput = document.createElement('input');
          specifyInput.type = 'text';
          specifyInput.name = `application_question_${index}_specify`;
          specifyInput.placeholder = 'Please specify';
          specifyInput.maxLength = 180;
          specifyInput.disabled = true;
          specifyField.appendChild(specifyInput);
          optionsRow.appendChild(specifyField);
        }
        fieldset.appendChild(optionsRow);
      }
      wrapper.appendChild(fieldset);
      return wrapper;
    }

    const label = createElement('label', 'job-application-field');
    label.appendChild(createApplicationFieldLabel(question));
    if (type === 'long') {
      const textarea = document.createElement('textarea');
      textarea.name = `application_question_${index}`;
      textarea.rows = 2;
      textarea.maxLength = 500;
      const counter = createElement('small', 'job-application-character-count', '0 of 500');
      textarea.addEventListener('input', () => {
        counter.textContent = `${textarea.value.length} of 500`;
      });
      label.append(textarea, counter);
    } else {
      const input = document.createElement('input');
      input.type = type === 'date' ? 'date' : type === 'upload' ? 'file' : 'text';
      input.name = `application_question_${index}`;
      if (type === 'upload') {
        input.accept = '.jpg,.jpeg,.png,.pdf,.heic,.gif';
        input.addEventListener('change', () => validateApplicationFile(input));
        label.append(
          input,
          createElement('small', 'job-application-file-help', 'One file only · JPG, JPEG, PNG, PDF, HEIC or GIF · max 15 MB')
        );
      } else {
        label.appendChild(input);
      }
    }
    wrapper.appendChild(label);
    return wrapper;
  }

  function collectApplicationAnswer(form, field, index) {
    const type = field?.type || 'short';
    const fieldName = `application_question_${index}`;
    const specifyValue = form.elements.namedItem(`${fieldName}_specify`)?.value?.trim() || '';
    const options = Array.isArray(field.options) ? field.options : [];
    const lastOption = String(options[options.length - 1] || '');
    const formatChoice = value => field.allowSpecify && value === lastOption
      ? (specifyValue ? `${value}: ${specifyValue}` : '')
      : value;
    if (type === 'checkboxes') {
      return [...form.querySelectorAll(`input[name="${fieldName}"]:checked`)]
        .map(input => formatChoice(input.value))
        .filter(Boolean);
    }
    if (type === 'radio') {
      return formatChoice(form.querySelector(`input[name="${fieldName}"]:checked`)?.value || '');
    }
    if (type === 'slider') {
      const input = form.querySelector(`input[name="${fieldName}"]`);
      const options = Array.isArray(field.options) ? field.options : [];
      return options[Number(input?.value)] || '';
    }
    if (type === 'upload') return null;
    return form.elements.namedItem(fieldName)?.value || '';
  }

  async function uploadApplicationFile(job, applicationId, field, index, input) {
    const file = input?.files?.[0];
    if (!file) return null;
    if (!validateApplicationFile(input)) throw new Error('Choose a valid application file before submitting.');
    if (!publicStorage) throw new Error('File uploads are temporarily unavailable. Please try again later.');

    const upload = await callApplicationApi({
      action: 'prepare_upload',
      companyId: COMPANY_ID,
      jobCode: job.public_code,
      applicationId,
      questionIndex: index,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type || 'application/octet-stream'
    });
    const { error } = await publicStorage.storage
      .from(upload.bucket)
      .uploadToSignedUrl(upload.path, upload.token, file, {
        contentType: upload.contentType
      });
    if (error) throw new Error('The application file could not be uploaded. Choose the file again and retry.');
    return {
      path: upload.path,
      name: file.name,
      contentType: upload.contentType,
      size: file.size
    };
  }

  async function submitApplication(event, job, applicationForm, certificationInput, submitButton) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';
    const applicationId = crypto.randomUUID();
    try {
      const answers = [];
      for (let index = 0; index < applicationForm.customFields.length; index += 1) {
        const field = applicationForm.customFields[index];
        const fileInput = field.type === 'upload'
          ? form.elements.namedItem(`application_question_${index}`)
          : null;
        const file = field.type === 'upload'
          ? await uploadApplicationFile(job, applicationId, field, index, fileInput)
          : null;
        answers.push({
          index,
          answer: collectApplicationAnswer(form, field, index),
          file
        });
      }

      await callApplicationApi({
        action: 'submit',
        companyId: COMPANY_ID,
        jobCode: job.public_code,
        applicationId,
        firstName: form.elements.namedItem('first_name')?.value,
        lastName: form.elements.namedItem('last_name')?.value,
        address: form.elements.namedItem('address')?.value,
        contactNumber: form.elements.namedItem('contact_number')?.value,
        email: form.elements.namedItem('email')?.value,
        certified: certificationInput.checked,
        answers
      });
      window.Toast?.show('Your application has been submitted successfully.', 'success');
      closeApplicationModal();
    } catch (error) {
      window.Toast?.show(error.message || 'Your application could not be submitted. Please try again.', 'error');
      submitButton.disabled = false;
      submitButton.textContent = 'Submit';
    }
  }

  function openApplicationModal(job) {
    document.getElementById('job-application-modal')?.remove();
    const applicationForm = job.applicationForm || normalizeApplicationForm();
    const defaultInstructions = 'Please complete this application truthfully and accurately. Inaccurate or false information may affect the evaluation of your application or result in disqualification.';

    const overlay = createElement('div', 'job-application-modal');
    overlay.id = 'job-application-modal';
    const card = createElement('div', 'job-application-modal__card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'job-application-modal-title');
    const header = createElement('div', 'job-application-modal__header');
    const title = createElement('h2', '', job.job_title);
    title.id = 'job-application-modal-title';
    const closeButton = createElement('button', 'job-application-modal__close');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close application form');
    closeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    closeButton.addEventListener('click', closeApplicationModal);
    header.append(title, closeButton);

    const form = createElement('form', 'job-application-form');
    if (job.job_description) form.appendChild(createElement('p', 'job-application-description', job.job_description));

    const requiredItems = normalizeItems(job.qualifications)
      .filter(item => applicationForm.requiredQualifications.includes(item));
    if (requiredItems.length) {
      const section = createElement('section', 'job-application-section');
      const list = createElement('ul', 'job-application-qualification-list');
      requiredItems.forEach(item => list.appendChild(createElement('li', '', item)));
      section.append(createElement('h3', '', 'Required Qualifications'), list);
      form.appendChild(section);
    }
    form.appendChild(createElement(
      'p',
      'job-application-instructions',
      applicationForm.instructions.trim() || defaultInstructions
    ));

    const applicantSection = createElement('section', 'job-application-section');
    const applicantGrid = createElement('div', 'job-application-grid');
    applicantGrid.append(
      createStandardApplicationField('First Name', 'text'),
      createStandardApplicationField('Last Name', 'text'),
      createStandardApplicationField('Address', 'text'),
      createStandardApplicationField('Contact Number', 'tel'),
      createStandardApplicationField('Email', 'email')
    );
    applicantSection.append(createElement('h3', '', 'Applicant Information'), applicantGrid);
    form.appendChild(applicantSection);

    if (applicationForm.customFields.length) {
      const questionsSection = createElement('section', 'job-application-section');
      const questions = createElement('div', 'job-application-questions');
      applicationForm.customFields.forEach((field, index) => questions.appendChild(createCustomApplicationField(field, index)));
      questionsSection.append(createElement('h3', '', 'Additional Questions'), questions);
      form.appendChild(questionsSection);
    }

    const certification = createElement('label', 'job-application-certification');
    const certificationInput = document.createElement('input');
    certificationInput.type = 'checkbox';
    certificationInput.required = true;
    certification.append(
      certificationInput,
      createElement('span', '', 'I certify that the information I have provided is true, accurate, and complete. I consent to the collection and processing of my personal information for recruitment purposes, including consideration for future job opportunities.')
    );
    const submit = createElement('button', 'btn btn-cyan job-application-submit', 'Submit');
    submit.type = 'submit';
    form.addEventListener('submit', event => submitApplication(
      event,
      job,
      applicationForm,
      certificationInput,
      submit
    ));
    form.append(certification, submit);
    card.append(header, form);
    overlay.appendChild(card);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeApplicationModal();
    });
    document.body.appendChild(overlay);
    overlay.style.display = 'flex';
    overlay.offsetHeight;
    overlay.classList.add('open');
    lockApplicationModalBackground();
    closeButton.focus();
  }

  function appendListSection(parent, title, items, formatter = value => value) {
    const values = normalizeItems(items);
    if (!values.length) return;
    const section = createElement('section', 'job-section');
    const list = createElement('ul', 'job-list');
    values.forEach(value => list.appendChild(createElement('li', '', formatter(value))));
    section.append(createElement('h2', '', title), list);
    parent.appendChild(section);
  }

  function appendResponsibilities(parent, responsibilities) {
    const groups = [
      ['Daily responsibilities', responsibilities?.daily],
      ['Weekly responsibilities', responsibilities?.weekly],
      ['Monthly responsibilities', responsibilities?.monthly]
    ].filter(([, items]) => normalizeItems(items).length);
    if (!groups.length) return;

    const section = createElement('section', 'job-section');
    section.appendChild(createElement('h2', '', 'What you will do'));
    groups.forEach(([title, items]) => {
      const block = createElement('div', 'job-subsection');
      const list = createElement('ul', 'job-list');
      normalizeItems(items).forEach(value => list.appendChild(createElement('li', '', value)));
      block.append(createElement('h3', '', title), list);
      section.appendChild(block);
    });
    parent.appendChild(section);
  }

  function compensationText(job) {
    if (job.employment_type === 'project_based' && job.fixed_price != null) {
      return `${formatCurrency(job.fixed_price)} fixed project`;
    }
    if (job.salary_confidential) {
      return job.salary_negotiable ? 'Confidential · Negotiable' : 'Confidential';
    }
    if (job.salary_mode === 'range' && job.monthly_salary != null && job.monthly_salary_max != null) {
      return `${formatCurrency(job.monthly_salary)} – ${formatCurrency(job.monthly_salary_max)} per month${job.salary_negotiable ? ' · Negotiable' : ''}`;
    }
    if (job.monthly_salary != null) {
      return `${formatCurrency(job.monthly_salary)} per month${job.salary_negotiable ? ' · Negotiable' : ''}`;
    }
    return job.salary_negotiable ? 'Negotiable' : '';
  }

  function availabilityText(job) {
    return job.expected_start_date ? `Starts ${formatDate(job.expected_start_date)}` : 'Immediate availability';
  }

  function scheduleText(job) {
    if (job.free_hours) return 'Flexible hours';
    const time = [formatTime(job.reporting_time_start), formatTime(job.reporting_time_end)].filter(Boolean).join(' – ');
    const days = Array.isArray(job.reporting_days) ? job.reporting_days.join(', ') : '';
    return [days, time].filter(Boolean).join(' · ');
  }

  function renderJob(job) {
    document.title = `${job.job_title} — Careers at Brightkey`;
    const root = document.getElementById('job-detail-root');
    const hero = createElement('section', 'job-detail__hero');
    const heroImageUrl = String(job.template?.header_image_url || '').trim();
    const heroImage = heroImageUrl ? createElement('img', 'job-detail__hero-image') : null;
    if (heroImage) {
      heroImage.src = heroImageUrl;
      heroImage.alt = '';
      heroImage.setAttribute('aria-hidden', 'true');
      heroImage.style.objectPosition = `50% ${job.template?.header_image_position_y ?? 50}%`;
      heroImage.style.transform = `scale(${Math.min(2, Math.max(1, Number(job.template?.header_image_zoom || 100) / 100))})`;
    }
    const heroOverlay = createElement('span', 'job-detail__hero-overlay');
    heroOverlay.setAttribute('aria-hidden', 'true');
    const heroInner = createElement('div', 'container job-detail__hero-inner');
    const breadcrumb = createElement('nav', 'breadcrumb');
    breadcrumb.setAttribute('aria-label', 'Breadcrumb');
    const home = createElement('a', '', 'Home');
    home.href = '/';
    const careers = createElement('a', '', 'Careers');
    careers.href = '/careers';
    breadcrumb.append(home, createElement('span', '', '›'), careers, createElement('span', '', '›'), createElement('span', '', job.job_title));

    const eyebrow = createElement('div', 'job-detail__eyebrow');
    jobHeroMeta(job).forEach(item => eyebrow.appendChild(createElement('span', '', item)));
    const meta = createElement('div', 'job-detail__meta');
    addMetaPills(meta, [
      compensationText(job),
      availabilityText(job),
      scheduleText(job),
      `${job.vacancy_count || 1} opening${Number(job.vacancy_count || 1) === 1 ? '' : 's'}`
    ]);
    heroInner.append(
      breadcrumb,
      eyebrow,
      createElement('h1', '', job.job_title),
      createElement('p', 'job-detail__summary', job.job_description),
      meta
    );
    if (heroImage) hero.append(heroImage, heroOverlay);
    hero.appendChild(heroInner);

    const bodySection = createElement('section', 'section');
    const body = createElement('div', 'container job-detail__body');
    const content = createElement('div', 'job-detail__content');
    appendListSection(content, 'Qualifications', job.qualifications);
    appendResponsibilities(content, job.responsibilities);
    appendListSection(content, 'Benefits', job.benefits, formatLabel);
    appendListSection(content, 'Additional Compensation', job.compensation_extras, formatLabel);
    appendListSection(content, 'Project milestones', job.milestones);

    const applyCard = createElement('aside', 'job-apply-card');
    const applyButton = createElement('button', 'btn btn-cyan btn-lg', 'Apply');
    applyButton.type = 'button';
    applyButton.id = 'job-apply-button';
    applyButton.addEventListener('click', () => openApplicationModal(job));
    applyCard.append(
      createElement('h3', '', 'Interested in this role?'),
      createElement('p', '', 'Send your application to the Brightkey hiring team.'),
      applyButton
    );
    body.append(content, applyCard);
    bodySection.appendChild(body);
    root.replaceChildren(hero, bodySection);
  }

  function renderNotFound() {
    const root = document.getElementById('job-detail-root');
    const section = createElement('section', 'job-not-found');
    const container = createElement('div', 'container');
    const link = createElement('a', 'btn btn-cyan', 'View Open Positions');
    link.href = '/careers';
    container.append(
      createElement('div', 'section-eyebrow', 'Careers'),
      createElement('h1', '', 'This role is not available'),
      createElement('p', '', 'The position may have closed or the link may be incorrect.'),
      link
    );
    section.appendChild(container);
    root.replaceChildren(section);
  }

  async function loadJobDetail() {
    const code = decodeURIComponent(window.location.pathname.split('/').filter(Boolean).pop() || '');
    if (!/^[A-Za-z0-9_-]+$/.test(code)) {
      renderNotFound();
      return;
    }
    try {
      const [jobs, templates, forms, salaryRanges] = await Promise.all([
        callRpc('get_public_job_post', {
          p_company_id: COMPANY_ID,
          p_public_code: code
        }),
        callRpc('get_public_job_post_template', {
          p_company_id: COMPANY_ID,
          p_public_code: code
        }),
        callRpc('get_public_job_application_form', {
          p_company_id: COMPANY_ID,
          p_public_code: code
        }),
        callRpc('get_public_job_salary_range', {
          p_company_id: COMPANY_ID,
          p_public_code: code
        })
      ]);
      if (!jobs.length) {
        renderNotFound();
        return;
      }
      renderJob({
        ...jobs[0],
        ...(salaryRanges[0] || {}),
        template: templates[0] || null,
        applicationForm: normalizeApplicationForm(forms[0])
      });
    } catch (error) {
      console.error('Job detail load failed:', error);
      renderNotFound();
    }
  }

  const page = document.body.dataset.careersPage;
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeApplicationModal();
  });
  if (page === 'listing') loadCareers();
  if (page === 'detail') loadJobDetail();
})();

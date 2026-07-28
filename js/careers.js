(() => {
  'use strict';

  const COMPANY_ID = 'e6cf43ed-1f42-4aad-a6ed-470147a0489f';
  const API_URL = window.SUPABASE_URL || 'https://ymjlosnxuhsybkzkoofq.supabase.co';
  const API_KEY = window.SUPABASE_ANON;

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
    const heroImage = createElement('img', 'job-detail__hero-image');
    heroImage.src = job.template?.header_image_url || '/assets/og-image.png';
    heroImage.alt = '';
    heroImage.setAttribute('aria-hidden', 'true');
    heroImage.style.objectPosition = `50% ${job.template?.header_image_position_y ?? 50}%`;
    heroImage.style.transform = `scale(${Math.min(2, Math.max(1, Number(job.template?.header_image_zoom || 100) / 100))})`;
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
    hero.append(heroImage, heroOverlay, heroInner);

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
      const [jobs, templates] = await Promise.all([
        callRpc('get_public_job_post', {
          p_company_id: COMPANY_ID,
          p_public_code: code
        }),
        callRpc('get_public_job_post_template', {
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
        template: templates[0] || null
      });
    } catch (error) {
      console.error('Job detail load failed:', error);
      renderNotFound();
    }
  }

  const page = document.body.dataset.careersPage;
  if (page === 'listing') loadCareers();
  if (page === 'detail') loadJobDetail();
})();

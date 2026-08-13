(function () {
  'use strict';

  const CONTACT_TYPES = ['website', 'email', 'phone', 'social', 'city'];
  const state = { app: null, companyId: null, userId: null, profile: {}, employee: null, signature: { signatoryName: '', imageUrl: '' }, page: 'cover', contacts: { order: CONTACT_TYPES, included: ['website', 'email', 'phone'], social: '' } };
  const esc = value => state.app?.esc(value) || '';
  const validColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;

  function colors() {
    const brand = state.profile.brandColors || {};
    return {
      primary: validColor(brand.primary, '#06B6D4'),
      secondary: validColor(brand.secondary, '#0891B2'),
      highlight: validColor(brand.highlight || brand.accent, '#F59E0B')
    };
  }

  function safeLogo() {
    const value = String(state.profile.logoDark || state.profile.logoLight || '').trim();
    return /^(?:https:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i.test(value) ? value : '/assets/logo.svg';
  }

  function contact() {
    const profile = state.profile;
    const addressParts = String(profile.companyAddressLine2 || '').split(',').map(part => part.trim()).filter(Boolean);
    return {
      name: profile.companyName || 'Company Name',
      address: [profile.companyAddressLine1, profile.companyAddressLine2].filter(Boolean).join(', ') || 'Company address',
      city: profile.city || (addressParts.length > 1 ? addressParts.at(-2) : addressParts[0]) || '',
      email: profile.email || '',
      phone: profile.phone || '',
      website: String(profile.website || profile.companyWebsite || '').replace(/^https?:\/\//i, '').replace(/\/$/, '')
    };
  }

  function socialLinks() {
    return (Array.isArray(state.profile.socialLinks) ? state.profile.socialLinks : []).filter(link => link?.platform && link?.url);
  }

  function normalizeContacts(value) {
    const order = [...new Set([...(Array.isArray(value?.order) ? value.order : []), ...CONTACT_TYPES])].filter(type => CONTACT_TYPES.includes(type));
    const included = (Array.isArray(value?.included) ? value.included : ['website', 'email', 'phone']).filter(type => CONTACT_TYPES.includes(type));
    const links = socialLinks();
    const social = links.some(link => link.platform === value?.social) ? value.social : links[0]?.platform || '';
    return { order, included, social };
  }

  function contactItems() {
    const company = contact();
    const social = socialLinks().find(link => link.platform === state.contacts.social);
    const values = {
      website: ['Website', company.website], email: ['Email', company.email], phone: ['Phone', company.phone],
      social: [social?.platform || 'Social', social?.url ? `/${String(social.url).split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop()}` : ''], city: ['City', company.city]
    };
    return state.contacts.order.filter(type => state.contacts.included.includes(type) && values[type][1]).map(type => ({ type, label: values[type][0], value: values[type][1] }));
  }

  function signedInEmployee() {
    const user = state.app?.authInfo?.user || {};
    const metadata = user.user_metadata || {};
    return {
      name: [state.employee?.first_name, state.employee?.last_name].filter(Boolean).join(' ') || metadata.full_name || metadata.name || user.email || 'Signed-in employee',
      title: state.employee?.title || metadata.title || state.app?.authInfo?.role || 'Employee'
    };
  }

  function icon(type, platform = '') {
    const paths = {
      address: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
      email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
      phone: '<path d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5C3 13.6 10.4 21 19.5 21a1.5 1.5 0 0 0 1.5-1.5V17l-5-1-1.2 3c-4.5-1.9-7.9-5.3-9.8-9.8L8 8Z"/>',
      website: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
      social: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>'
    };
    const socialPaths = {
      Facebook: 'M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c4.56-.93 8-4.96 8-9.75z',
      Messenger: 'M12 2C6.48 2 2 6.14 2 11.25c0 2.91 1.45 5.51 3.73 7.15V22l3.41-1.87c.88.24 1.8.37 2.86.37 5.52 0 10-4.14 10-9.25S17.52 2 12 2zm1.14 12.03-2.58-2.75-5.04 2.75 5.54-5.89 2.63 2.75 4.99-2.75-5.54 5.89z',
      Instagram: 'M12 2.16c3.2 0 3.58.02 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.67 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.64-.07-4.85s.01-3.58.07-4.85c.15-3.23 1.67-4.77 4.92-4.92 1.27-.05 1.65-.07 4.85-.07zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0zm0 5.84A6.16 6.16 0 1 0 12 18.16 6.16 6.16 0 0 0 12 5.84zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.41-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z',
      X: 'M18.24 2.25h3.31l-7.23 8.26 8.51 11.24h-6.66l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.84L7.08 4.13H5.12z',
      LinkedIn: 'M19 0H5a5 5 0 0 0-5 5v14a5 5 0 0 0 5 5h14a5 5 0 0 0 5-5V5a5 5 0 0 0-5-5zM8 19H5V8h3zm-1.5-12.27A1.76 1.76 0 1 1 6.5 3.2a1.76 1.76 0 0 1 0 3.53zM20 19h-3v-5.6c0-3.37-4-3.11-4 0V19h-3V8h3v1.77c1.4-2.59 7-2.78 7 2.47z',
      Tiktok: 'M13.5 1H16c.18.89.68 2.02 1.54 3.14A5.74 5.74 0 0 0 21.5 6v2.5a7.45 7.45 0 0 1-5-2.29V15a6.25 6.25 0 1 1-6.25-6.25v2.5A3.75 3.75 0 1 0 14 15z',
      YouTube: 'M23.5 6.16a3 3 0 0 0-2.11-2.11C19.52 3.55 12 3.55 12 3.55s-7.52 0-9.39.5A3 3 0 0 0 .5 6.16C0 8.03 0 12 0 12s0 3.97.5 5.84a3 3 0 0 0 2.11 2.11c1.87.51 9.39.51 9.39.51s7.52 0 9.39-.51a3 3 0 0 0 2.11-2.11C24 15.97 24 12 24 12s0-3.97-.5-5.84zM9.55 15.57V8.43L15.82 12z',
      Pinterest: 'M12 0a12 12 0 0 0-4.37 23.17c-.11-.95-.2-2.4.04-3.44l1.41-5.96s-.36-.72-.36-1.78c0-1.67.97-2.92 2.17-2.92 1.02 0 1.52.77 1.52 1.69 0 1.03-.66 2.57-1 4-.28 1.19.6 2.17 1.78 2.17 2.13 0 3.77-2.25 3.77-5.5 0-2.87-2.06-4.88-5.01-4.88-3.41 0-5.42 2.56-5.42 5.21 0 1.03.4 2.14.9 2.74.1.12.11.22.08.34l-.33 1.36c-.05.22-.17.27-.4.16-1.5-.7-2.44-2.89-2.44-4.65 0-3.78 2.75-7.26 7.93-7.26 4.16 0 7.4 2.97 7.4 6.93 0 4.14-2.61 7.46-6.23 7.46-1.22 0-2.36-.63-2.75-1.38l-.75 2.86a13 13 0 0 1-1.49 3.14A12 12 0 1 0 12 0z',
      Amazon: 'M16.2 17.95c-4.07 1.93-8.55.98-12.14-1.2-.56-.34-.98.25-.51.68 3.31 3.01 7.68 4.13 11.73 2.15.67-.33 1.56-1.01 1.44-1.39-.08-.28-.28-.35-.52-.24zM17.1 16.25c-.45.05-1.46.18-1.63.5-.12.23.18.29.39.27.69-.08 2.24-.26 2.51.08.27.35-.3 1.8-.56 2.45-.08.2.09.29.27.13 1.2-1.07 1.51-3.29 1.27-3.59-.23-.29-1.8.1-2.25.16zM13.9 14.83c.28.2.72.18.96-.07l1.15-1.02c.39-.35.32-.9.03-1.3-.59-.81-1.22-1.46-1.22-2.95V4.54c0-2.1.15-4.03-1.4-5.48C12.2-2.11 10.17-2.5 8.61-2.5 5.58-2.5 2.2-1.37 1.48 2.38c-.08.4.22.61.48.67l3.09.33c.29-.01.5-.29.55-.58.27-1.29 1.35-1.91 2.56-1.91.66 0 1.4.24 1.79.83.4.59.39 1.37.39 2.01v.68c-1.84.21-4.25.34-5.98 1.08-1.99.85-3.39 2.61-3.39 5.18 0 3.3 2.08 4.95 4.77 4.95 2.26 0 3.5-.53 5.24-2.31.6.87.8 1.29 1.92 2.52zM10.34 7.75c0 1.24.03 2.28-.59 3.28-.5.89-1.31 1.46-2.2 1.46-1.22 0-1.94-.93-1.94-2.3 0-2.71 2.44-3.2 4.73-3.2z',
      Medium: 'M2 5.2c.02-.2-.05-.39-.2-.52L.35 2.93V2.67h4.5l3.48 7.63 3.06-7.63h4.29v.26l-1.24 1.19a.37.37 0 0 0-.14.35v8.75a.37.37 0 0 0 .14.35l1.21 1.19v.26H9.56v-.26l1.26-1.22c.13-.13.13-.17.13-.35V6.11l-3.5 8.88h-.47L2.9 6.11v5.96c-.03.33.08.65.29.89l1.64 1.99v.26H.18v-.26l1.64-1.99c.21-.24.3-.57.26-.89z'
    };
    if (type === 'social' && socialPaths[platform]) return `<svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${socialPaths[platform]}"/></svg>`;
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[type]}</svg>`;
  }

  function coverPage(employeeOverride = null) {
    const company = contact();
    const employee = employeeOverride || signedInEmployee();
    const items = contactItems();
    return `<article class="contract-sheet contract-cover">
      <div class="contract-cover-rail"></div>
      <header class="contract-cover-brand">
        <img src="${esc(safeLogo())}" alt="${esc(company.name)} logo">
        <div><strong>${esc(company.name)}</strong><span>${esc(company.address)}</span></div>
      </header>
      <div class="contract-cover-title"><h2>Employment<br>Contract</h2><i></i><div class="contract-cover-employee"><strong>${esc(employee.name)}</strong><span>${esc(employee.title)}</span></div></div>
      <footer class="contract-cover-footer" style="grid-template-columns:repeat(${Math.max(items.length, 1)},minmax(0,1fr))">${items.map(item => `<div><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong></div>`).join('')}</footer>
      <div class="contract-cover-bars"><i></i><i></i><i></i></div>
    </article>`;
  }

  function bodyPage(customContent = null) {
    const company = contact();
    const employee = signedInEmployee();
    const items = contactItems();
    const signatureImage = /^data:image\/(?:png|jpeg|webp);base64,/i.test(state.signature.imageUrl) ? state.signature.imageUrl : '';
    return `<article class="contract-sheet contract-body">
      <header class="contract-body-header">
        <img src="${esc(safeLogo())}" alt="${esc(company.name)} logo">
        <div><span>Employment Contract</span><i>|</i><strong>${esc(employee.name)}</strong></div>
      </header>
      <main class="contract-body-content">${customContent == null ? `
        <p class="contract-body-date">Effective date: <strong>Month DD, YYYY</strong></p>
        <h2>Employment Agreement</h2>
        <p>This Employment Contract is entered into between <strong>${esc(company.name)}</strong> and the employee identified in this agreement.</p>
        <section><span>01</span><div><h3>Position and responsibilities</h3><p>The employee agrees to perform the duties of the assigned position with professionalism, care, and fidelity to the company.</p></div></section>
        <section><span>02</span><div><h3>Compensation and benefits</h3><p>Compensation, benefits, and applicable allowances will follow the terms stated in the finalized employee agreement.</p></div></section>
        <section><span>03</span><div><h3>Terms of employment</h3><p>Employment conditions, working arrangements, confidentiality, and termination provisions are detailed in the succeeding contract pages.</p></div></section>
        ${signatureBlock(signatureImage, esc(employee.name), esc(employee.title))}` : customContent}
      </main>
      <footer class="contract-body-footer" style="grid-template-columns:repeat(${Math.max(items.length, 1)},minmax(0,1fr))">${items.map(item => `<div>${icon(item.type === 'city' ? 'address' : item.type, item.label)}<span>${esc(item.value)}</span></div>`).join('')}</footer>
    </article>`;
  }

  function signatureBlock(signatureImage = '', employeeName = '{{first_name}} {{last_name}}', employeeTitle = '{{title_position}}') {
    const safeSignature = /^data:image\/(?:png|jpeg|webp);base64,/i.test(signatureImage || state.signature.imageUrl) ? (signatureImage || state.signature.imageUrl) : '';
    return `<div class="contract-signatures"><div><div class="contract-signature-space">${safeSignature ? `<img src="${esc(safeSignature)}" alt="Authorized signature">` : ''}</div><i></i><strong>${esc(state.signature.signatoryName || 'Company Representative')}</strong><span>Authorized Signature</span></div><div><div class="contract-signature-space"></div><i></i><strong>${employeeName}</strong><span>${employeeTitle}</span></div></div>`;
  }

  function draw() {
    const preview = document.getElementById('contract-template-preview');
    if (!preview) return;
    const palette = colors();
    preview.style.setProperty('--contract-primary', palette.primary);
    preview.style.setProperty('--contract-secondary', palette.secondary);
    preview.style.setProperty('--contract-highlight', palette.highlight);
    preview.innerHTML = state.page === 'body' ? bodyPage() : coverPage();
    renderContactControls();
  }

  function renderContactControls() {
    const host = document.getElementById('contract-contact-list');
    if (!host) return;
    const links = socialLinks();
    const company = contact();
    const detailValues = { website: company.website, email: company.email, phone: company.phone, city: company.city };
    host.innerHTML = state.contacts.order.map((type, index) => `<div class="contract-contact-row">
      <label><input type="checkbox" ${state.contacts.included.includes(type) && (type === 'social' ? links.length : detailValues[type]) ? 'checked' : ''} ${(type === 'social' ? !links.length : !detailValues[type]) ? 'disabled' : ''} onchange="BKHiringContractTemplate.toggleContact('${type}', this.checked)"><span>${esc(type[0].toUpperCase() + type.slice(1))}</span></label>
      ${type === 'social' ? `<select aria-label="Social profile" ${links.length ? '' : 'disabled'} onchange="BKHiringContractTemplate.selectSocial(this.value)">${links.length ? links.map(link => `<option value="${esc(link.platform)}" ${link.platform === state.contacts.social ? 'selected' : ''}>${esc(link.platform)}</option>`).join('') : '<option>No active social links</option>'}</select>` : `<small>${detailValues[type] ? esc(detailValues[type]) : 'Not configured in Company Settings'}</small>`}
      <div class="contract-contact-order"><button type="button" aria-label="Move up" title="Move up" ${index === 0 ? 'disabled' : ''} onclick="BKHiringContractTemplate.moveContact('${type}', -1)"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button><button type="button" aria-label="Move down" title="Move down" ${index === state.contacts.order.length - 1 ? 'disabled' : ''} onclick="BKHiringContractTemplate.moveContact('${type}', 1)"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button></div>
    </div>`).join('');
  }

  function render(app) {
    state.app = app;
    const content = document.querySelector('.hiring-content');
    if (!content) return;
    content.innerHTML = `<div class="hiring-page contract-template-page">
      <div class="hiring-page-header contract-template-toolbar"><div><h2>Employment Contract</h2><p>Preview the branded A4 pages used by the employee contract builder.</p></div>
        <label class="template-select-wrap" for="contract-page-select"><span>View page</span><select id="contract-page-select" onchange="BKHiringContractTemplate.switchPage(this.value)"><option value="cover">Cover Page</option><option value="body">Body Page</option></select></label>
      </div>
      <section class="contract-contact-settings">
        <button class="contract-contact-toggle" type="button" aria-expanded="false" aria-controls="contract-contact-panel" onclick="BKHiringContractTemplate.toggleContactPanel(this)"><span><strong>Contact details</strong><small>Choose and order the details shown in the contract footer.</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        <div id="contract-contact-panel" class="contract-contact-panel" hidden><div id="contract-contact-list" class="contract-contact-list"></div></div>
      </section>
      <div class="contract-preview-stage"><div id="contract-template-preview" class="contract-template-preview"><div class="template-loading"><span class="spinner-cyan"></span><span>Loading contract template</span></div></div></div>
    </div>`;
  }

  async function ensureLoaded(app) {
    state.app = app;
    const user = app.authInfo?.user;
    if (state.companyId === app.companyId && state.userId === user?.id) return;
    state.userId = user?.id || null;
    state.employee = null;
    const { data: settingsRows, error: settingsError } = await app.sb.from('global_settings').select('key,value').eq('company_id', app.companyId).in('key', ['contract_template_config', 'contract_signature_config']).limit(2);
    if (settingsError) console.error('Contract settings load failed:', settingsError);
    const contactData = settingsRows?.find(row => row.key === 'contract_template_config');
    const signatureData = settingsRows?.find(row => row.key === 'contract_signature_config');
    const signatureValue = signatureData?.value && typeof signatureData.value === 'object' ? signatureData.value : {};
    state.signature = { signatoryName: String(signatureValue.signatoryName || ''), imageUrl: String(signatureValue.imageUrl || '') };
    if (user?.email) {
      const { data, error } = await app.sb.from('employees').select('first_name, last_name, email, contact_number, title, address, city, province, date_of_birth, date_hired, salary').eq('company_id', app.companyId).ilike('email', user.email).limit(1).maybeSingle();
      if (error) console.error('Contract template employee load failed:', error);
      state.employee = data || null;
    }
    if (app.companyProfile && Object.keys(app.companyProfile).length) {
      state.companyId = app.companyId;
      state.profile = app.companyProfile;
      state.contacts = normalizeContacts(contactData?.value);
      return;
    }
    const { data, error } = await app.sb.from('global_settings').select('value').eq('company_id', app.companyId).eq('key', 'company_profile_config').maybeSingle();
    if (error) {
      console.error('Contract template company profile load failed:', error);
      app.showToast('Company branding could not be loaded. Default contract styling is shown.', true);
    }
    state.companyId = app.companyId;
    state.profile = data?.value || {};
    state.contacts = normalizeContacts(contactData?.value);
  }

  async function init(app) {
    state.app = app;
    await ensureLoaded(app);
    draw();
  }

  function renderBodyPage(contentHtml = '') {
    const palette = colors();
    return `<div class="contract-template-preview" style="--contract-primary:${palette.primary};--contract-secondary:${palette.secondary};--contract-highlight:${palette.highlight}">${bodyPage(contentHtml)}</div>`;
  }

  function renderCoverPage() {
    const palette = colors();
    const employee = { name: '{{first_name}} {{last_name}}', title: '{{title_position}}' };
    return `<div class="contract-template-preview" style="--contract-primary:${palette.primary};--contract-secondary:${palette.secondary};--contract-highlight:${palette.highlight}">${coverPage(employee)}</div>`;
  }

  function renderSignatures() { return signatureBlock(); }

  function setEmployee(employee) {
    state.employee = employee && typeof employee === 'object' ? employee : null;
  }

  function configureContext(app, settings = {}) {
    state.app = app;
    state.companyId = app.companyId;
    state.userId = app.authInfo?.user?.id || null;
    state.profile = settings.companyProfile && typeof settings.companyProfile === 'object' ? settings.companyProfile : {};
    state.contacts = normalizeContacts(settings.contacts);
    const signature = settings.signature && typeof settings.signature === 'object' ? settings.signature : {};
    state.signature = { signatoryName: String(signature.signatoryName || ''), imageUrl: String(signature.imageUrl || '') };
    state.employee = null;
  }

  function fullDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return String(value || '');
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return new Intl.DateTimeFormat('en-US', { month: 'long', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date);
  }

  function personalizeHtml(html) {
    const user = state.app?.authInfo?.user || {};
    const metadata = user.user_metadata || {};
    const employee = state.employee || {};
    const values = {
      date_hired: fullDate(employee.date_hired), salary: employee.salary ?? '',
      first_name: employee.first_name || metadata.first_name || '', last_name: employee.last_name || metadata.last_name || '',
      street_address: employee.address || '', city: employee.city || '', province: employee.province || '',
      contact_number: employee.contact_number || metadata.phone || '', email: employee.email || user.email || '',
      title_position: employee.title || metadata.title || state.app?.authInfo?.role || '', date_of_birth: employee.date_of_birth || ''
    };
    return String(html || '').replace(/\{\{([a-z_]+)\}\}/g, (match, token) => Object.hasOwn(values, token) ? esc(values[token]) : match);
  }

  async function saveContacts() {
    const { error } = await state.app.sb.from('global_settings').upsert({ company_id: state.companyId, key: 'contract_template_config', value: state.contacts }, { onConflict: 'company_id,key' });
    if (error) { console.error('Contract contact settings save failed:', error); state.app.showToast('Contract contact settings could not be saved. Please try again.', true); }
  }

  function toggleContact(type, included) {
    state.contacts.included = included ? [...new Set([...state.contacts.included, type])] : state.contacts.included.filter(item => item !== type);
    draw(); saveContacts();
  }

  function selectSocial(platform) { state.contacts.social = platform; draw(); saveContacts(); }

  function toggleContactPanel(button) {
    const panel = document.getElementById('contract-contact-panel');
    if (!panel) return;
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(expanded));
    panel.hidden = !expanded;
  }

  function moveContact(type, direction) {
    const index = state.contacts.order.indexOf(type);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= state.contacts.order.length) return;
    [state.contacts.order[index], state.contacts.order[target]] = [state.contacts.order[target], state.contacts.order[index]];
    draw(); saveContacts();
  }

  function switchPage(page) {
    state.page = page === 'body' ? 'body' : 'cover';
    draw();
  }

  window.BKHiringContractTemplate = Object.freeze({ init, ensureLoaded, configureContext, setEmployee, renderBodyPage, renderCoverPage, renderSignatures, personalizeHtml, render, switchPage, toggleContact, selectSocial, toggleContactPanel, moveContact });
})();

(function () {
  'use strict';

  const state = { app: null, config: { signatoryName: '', imageUrl: '' } };
  const safeImage = value => /^data:image\/(?:png|jpeg|webp);base64,/i.test(String(value || '')) ? value : '';

  function render() {
    const host = document.getElementById('hiring-signature-settings');
    if (!host) return;
    const imageUrl = safeImage(state.config.imageUrl);
    host.innerHTML = `<section class="hiring-signature-section">
      <header><div><h3 class="hiring-section-title">Authorized Signature</h3><p>Set the representative name and signature used on employment contracts.</p></div><span>Contract template</span></header>
      <div class="hiring-signature-editor">
        <div class="hiring-signature-fields">
          <div class="hiring-field"><label for="contract-signatory-name">Signatory Name</label><input id="contract-signatory-name" type="text" maxlength="120" placeholder="Authorized Signatory" value="${state.app.esc(state.config.signatoryName)}"></div>
          <div class="hiring-field"><label>Signature Image</label><input id="contract-signature-file" class="hiring-signature-file" type="file" accept="image/png,image/jpeg,image/webp" onchange="BKHiringSignatureSettings.handleFile(event)"><label class="hiring-signature-upload" for="contract-signature-file"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5 5 5M5 15v4h14v-4"/></svg><span><strong>${imageUrl ? 'Replace signature image' : 'Choose signature image'}</strong><small>PNG, JPEG, or WebP · Maximum 2 MB</small></span></label></div>
        </div>
        <div class="hiring-signature-preview-card">
          <div class="hiring-signature-preview-heading"><strong>Preview</strong>${imageUrl ? '<span>Image ready</span>' : '<span>No image</span>'}</div>
          <div class="hiring-signature-canvas">${imageUrl ? `<img src="${state.app.esc(imageUrl)}" alt="Authorized signature preview">` : '<div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16c3-7 5-8 6-5s1 5 3 2 3-4 4-1 2 3 3 1"/></svg><span>Signature preview</span></div>'}</div>
          ${imageUrl ? '<button type="button" class="hiring-signature-remove" onclick="BKHiringSignatureSettings.removeImage()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg>Remove image</button>' : ''}
        </div>
      </div>
      <div class="hiring-signature-actions"><button id="save-contract-signature" type="button" class="btn btn-primary" onclick="BKHiringSignatureSettings.save()">Save Signature</button></div>
    </section>`;
  }

  async function init(app) {
    state.app = app;
    const { data, error } = await app.sb.from('global_settings').select('value').eq('company_id', app.companyId).eq('key', 'contract_signature_config').maybeSingle();
    if (error) {
      console.error('Contract signature settings load failed:', error);
      app.showToast('Authorized signature settings could not be loaded. Refresh the page and try again.', true);
    }
    const value = data?.value && typeof data.value === 'object' ? data.value : {};
    state.config = { signatoryName: String(value.signatoryName || ''), imageUrl: safeImage(value.imageUrl) };
    render();
  }

  function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    state.config.signatoryName = document.getElementById('contract-signatory-name')?.value.trim() || '';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      event.target.value = '';
      state.app.showToast('Choose a PNG, JPEG, or WebP signature image smaller than 2 MB.', true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { state.config.imageUrl = safeImage(reader.result); render(); };
    reader.onerror = () => state.app.showToast('The signature image could not be read. Choose another image.', true);
    reader.readAsDataURL(file);
  }

  function removeImage() { state.config.signatoryName = document.getElementById('contract-signatory-name')?.value.trim() || ''; state.config.imageUrl = ''; render(); }

  async function save() {
    const button = document.getElementById('save-contract-signature');
    const name = document.getElementById('contract-signatory-name')?.value.trim() || '';
    if (!button) return;
    button.disabled = true;
    button.textContent = 'Saving...';
    const value = { signatoryName: name, imageUrl: state.config.imageUrl };
    const { error } = await state.app.sb.from('global_settings').upsert({ company_id: state.app.companyId, key: 'contract_signature_config', value }, { onConflict: 'company_id,key' });
    button.disabled = false;
    button.textContent = 'Save Signature';
    if (error) {
      console.error('Contract signature settings save failed:', error);
      state.app.showToast('Authorized signature could not be saved. Please try again.', true);
      return;
    }
    state.config = value;
    state.app.showToast('Authorized signature saved.');
  }

  window.BKHiringSignatureSettings = Object.freeze({ init, handleFile, removeImage, save });
})();
(function () {
  const state = {
    host: null,
    forms: {},
    form: null,
    draggedIndex: null
  };

  const defaultForm = () => ({ instructions: '', requiredQualifications: [], customFields: [] });
  const cloneForm = (form) => ({
    ...defaultForm(),
    ...(form || {}),
    requiredQualifications: Array.isArray(form?.requiredQualifications) ? [...form.requiredQualifications] : [],
    customFields: Array.isArray(form?.customFields)
      ? form.customFields.map(field => ({ ...field, options: Array.isArray(field.options) ? [...field.options] : [] }))
      : []
  });
  const qualifications = () => state.host.collectBuilder('qualifications-list', ['item']).map(item => item.item).filter(Boolean);
  const rerender = () => window.BKHiringJobApplicationForm.render();

  function renderOptions(field, index) {
    if (!['checkboxes', 'radio', 'slider'].includes(field.type)) {
      const placeholders = {
        long: 'Long answer (two lines)',
        date: 'Date picker',
        upload: 'One file · JPG, JPEG, PNG, PDF, HEIC or GIF · max 15 MB',
        short: 'Short answer'
      };
      return `<div class="application-answer-preview ${field.type}">${placeholders[field.type] || placeholders.short}</div>`;
    }
    const options = field.options || [];
    const isSlider = field.type === 'slider';
    return `<div class="application-field-options">
      ${options.map((option, optionIndex) => `<div class="application-option-row"><input value="${state.host.esc(option)}" onchange="BKHiringJobApplicationForm.updateOption(${index}, ${optionIndex}, this.value)" />${isSlider && options.length === 5 && optionIndex === 2 ? '<span class="application-neutral-label">Neutral</span>' : ''}${!isSlider && optionIndex === options.length - 1 ? `<label class="application-option-specify-toggle" title="Add a ‘Please Specify’ short field"><input type="checkbox" ${field.allowSpecify ? 'checked' : ''} onchange="BKHiringJobApplicationForm.updateField(${index}, 'allowSpecify', this.checked, true)" /><span>Add “Please Specify” field</span></label>` : ''}<button type="button" aria-label="Remove option" ${options.length <= 2 ? 'disabled' : ''} onclick="BKHiringJobApplicationForm.removeOption(${index}, ${optionIndex})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg></button></div>`).join('')}
      <button class="application-add-option" type="button" ${options.length >= 10 ? 'disabled' : ''} onclick="BKHiringJobApplicationForm.addOption(${index})">Add option${options.length >= 10 ? ' (max 10)' : ''}</button>
    </div>`;
  }

  function renderField(field, index) {
    const typeLabels = { short: 'Short Answer', long: 'Long Answer', date: 'Date Picker', upload: 'Upload File', checkboxes: 'Checkboxes', radio: 'Radio Button', slider: 'Slider' };
    return `<article class="application-custom-field" ondragover="event.preventDefault()" ondrop="BKHiringJobApplicationForm.dropField(${index})">
      <button class="application-drag-handle" type="button" draggable="true" aria-label="Drag question" title="Drag to reorder" ondragstart="BKHiringJobApplicationForm.startDrag(event, ${index})" ondragend="BKHiringJobApplicationForm.endDrag()"><svg viewBox="0 0 12 20" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.3"/><circle cx="9" cy="3" r="1.3"/><circle cx="3" cy="10" r="1.3"/><circle cx="9" cy="10" r="1.3"/><circle cx="3" cy="17" r="1.3"/><circle cx="9" cy="17" r="1.3"/></svg></button>
      <div class="application-field-main">
        <label><span>Question ${index + 1}</span><input value="${state.host.esc(field.question)}" placeholder="Enter a question" onchange="BKHiringJobApplicationForm.updateField(${index}, 'question', this.value)" /></label>
        <label><span>Type of Answer</span><select onchange="BKHiringJobApplicationForm.updateType(${index}, this.value)">${Object.entries(typeLabels).map(([value, label]) => `<option value="${value}" ${field.type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        ${renderOptions(field, index)}
      </div>
      <div class="application-field-actions"><button class="application-duplicate-field" type="button" aria-label="Duplicate question" title="Duplicate question" onclick="BKHiringJobApplicationForm.duplicateField(${index})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></button><button class="application-remove-field" type="button" aria-label="Delete question" title="Delete question" onclick="BKHiringJobApplicationForm.removeField(${index})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg></button></div>
    </article>`;
  }

  window.BKHiringJobApplicationForm = {
    async init(host) {
      state.host = host;
      const { data, error } = await host.sb.from('global_settings').select('value').eq('company_id', host.companyId).eq('key', 'job_application_forms').maybeSingle();
      if (error) {
        console.error('Job application form load failed:', error);
        host.showToast('Application form settings could not be loaded. Please refresh and try again.', true);
      }
      state.forms = data?.value || {};
    },
    open(jobId = null) {
      state.form = cloneForm(jobId ? state.forms[jobId] : null);
      rerender();
    },
    syncQualifications() { if (state.form) rerender(); },
    render() {
      const container = document.getElementById('job-post-application-form-builder');
      if (!container || !state.form) return;
      const availableQualifications = qualifications();
      state.form.requiredQualifications = state.form.requiredQualifications.filter(item => availableQualifications.includes(item));
      container.innerHTML = `
        <section class="application-form-section application-qualifications-section">
          <div class="application-form-section-heading"><div><h5>Required qualifications</h5></div></div>
          ${availableQualifications.length ? `<div class="application-qualification-list">${availableQualifications.map((item, index) => `<label class="application-qualification-row"><input type="checkbox" ${state.form.requiredQualifications.includes(item) ? 'checked' : ''} onchange="BKHiringJobApplicationForm.toggleQualification(${index}, this.checked)" /><span>${state.host.esc(item)}</span>${state.form.requiredQualifications.includes(item) ? '<strong>Required</strong>' : ''}</label>`).join('')}</div>` : '<div class="application-fields-empty">Add qualifications above to choose which ones applicants must confirm.</div>'}
        </section>
        <section class="application-form-section">
          <div class="application-form-section-heading application-custom-fields-heading"><div><h5>Questions</h5></div></div>
          <div class="application-custom-fields">${state.form.customFields.length ? state.form.customFields.map(renderField).join('') : '<div class="application-fields-empty">Add a custom question, date, choice, or rating field.</div>'}</div>
          <div class="application-add-field-row"><button class="btn btn-outline btn-sm" type="button" onclick="BKHiringJobApplicationForm.addField()">Add Field</button></div>
        </section>`;
    },
    toggleQualification(index, checked) {
      const item = qualifications()[index];
      if (!item) return;
      state.form.requiredQualifications = checked
        ? [...new Set([...state.form.requiredQualifications, item])]
        : state.form.requiredQualifications.filter(value => value !== item);
      rerender();
    },
    addField(type = 'short') {
      state.form.customFields.push({ question: '', type, options: ['Option 1', 'Option 2', ...(type === 'slider' ? ['Option 3', 'Option 4'] : [])] });
      rerender();
    },
    duplicateField(index) {
      const field = state.form.customFields[index];
      if (!field) return;
      state.form.customFields.splice(index + 1, 0, { ...field, options: [...(field.options || [])] });
      rerender();
    },
    updateField(index, key, value, shouldRender = false) {
      const field = state.form.customFields[index];
      if (!field) return;
      field[key] = value;
      if (shouldRender) rerender();
    },
    updateType(index, type) {
      const field = state.form.customFields[index];
      if (!field) return;
      field.type = type;
      if (['checkboxes', 'radio'].includes(type) && field.options.length < 2) field.options = ['Option 1', 'Option 2'];
      if (type === 'slider' && field.options.length < 4) field.options = ['Option 1', 'Option 2', 'Option 3', 'Option 4'];
      rerender();
    },
    updateOption(fieldIndex, optionIndex, value) { state.form.customFields[fieldIndex].options[optionIndex] = value; },
    addOption(index) {
      const options = state.form.customFields[index]?.options;
      if (!options || options.length >= 10) return;
      options.push(`Option ${options.length + 1}`); rerender();
    },
    removeOption(fieldIndex, optionIndex) {
      const options = state.form.customFields[fieldIndex]?.options;
      if (!options || options.length <= 2) return;
      options.splice(optionIndex, 1); rerender();
    },
    removeField(index) { state.form.customFields.splice(index, 1); rerender(); },
    startDrag(event, index) { state.draggedIndex = index; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); },
    endDrag() { state.draggedIndex = null; },
    dropField(targetIndex) {
      if (state.draggedIndex == null || state.draggedIndex === targetIndex) return;
      const [field] = state.form.customFields.splice(state.draggedIndex, 1);
      state.form.customFields.splice(targetIndex, 0, field);
      state.draggedIndex = null; rerender();
    },
    async save(jobId) {
      if (!jobId || !state.form) return true;
      state.forms[jobId] = cloneForm(state.form);
      const { error } = await state.host.sb.from('global_settings').upsert({ company_id: state.host.companyId, key: 'job_application_forms', value: state.forms }, { onConflict: 'company_id,key' });
      if (error) console.error('Job application form save failed:', error);
      return !error;
    }
  };
})();

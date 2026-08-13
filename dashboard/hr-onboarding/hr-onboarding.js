(() => {
  'use strict';

  const TABS = [
    { key: 'contracts', label: 'Contracts', href: '/dashboard/hr-onboarding/contracts' },
    { key: 'handbook', label: 'Handbook', href: '/dashboard/hr-onboarding/handbook' },
    { key: 'materials', label: 'Materials', href: '/dashboard/hr-onboarding/materials' }
  ];
  const state = { sb: null, authInfo: null, companyId: null, employees: [], jobs: new Map(), signatures: new Map(), signaturesLoaded: false, contracts: null, contractRequest: null, pdfRequest: null, structure: { departments: [] }, departmentByEmployee: {}, teamsByEmployee: {}, department: '', team: '', selectedEmployee: null, currentPage: 0 };
  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const showToast = (message, isError = false) => window.Toast ? window.Toast.show(message, isError ? 'error' : 'success') : console[isError ? 'error' : 'log'](message);
  const templateApp = { get sb(){return state.sb;}, get authInfo(){return state.authInfo;}, get companyId(){return state.companyId;}, companyProfile: {}, esc, showToast };

  function activeTab() {
    const path = window.location.pathname.replace(/\/+$/, '');
    return TABS.find(tab => path === tab.href)?.key || 'contracts';
  }

  function renderShell() {
    const main = document.getElementById('hr-onboarding-main');
    if (!main) return;
    const selected = activeTab();
    main.innerHTML = `<header class="dash-topbar hr-onboarding-topbar"><h1>Onboarding</h1><nav class="drawer-tabs" aria-label="HR onboarding sections">${TABS.map(tab => `<a class="tab-btn${tab.key === selected ? ' active' : ''}" href="${tab.href}"${tab.key === selected ? ' aria-current="page"' : ''}>${tab.label}</a>`).join('')}</nav></header><section class="hr-onboarding-content" id="hr-onboarding-content" aria-live="polite">${selected === 'contracts' ? loadingTable() : ''}</section>`;
  }

  function loadingTable() {
    return `<div class="hr-contracts-panel hr-contracts-loading"><div class="hr-contracts-loading-state" role="status"><span class="spinner-cyan" aria-hidden="true"></span><span>Loading employee contracts</span></div></div>`;
  }

  function buildOrganizationMaps() {
    state.departmentByEmployee = {};
    state.teamsByEmployee = {};
    for (const department of state.structure.departments || []) {
      const departmentName = String(department?.name || '').trim();
      const assign = (employeeId, teamName = '') => {
        if (!employeeId) return;
        if (departmentName) state.departmentByEmployee[employeeId] = departmentName;
        if (teamName) state.teamsByEmployee[employeeId] = [...new Set([...(state.teamsByEmployee[employeeId] || []), teamName])];
      };
      assign(department.managerId);
      (department.colleagueIds || []).forEach(id => assign(id));
      for (const team of department.subteams || []) {
        const teamName = String(team?.name || '').trim();
        assign(team.managerId, teamName);
        (team.colleagueIds || []).forEach(id => assign(id, teamName));
      }
    }
  }

  function employeeDepartment(employee) { return state.departmentByEmployee[employee.id] || employee.department || ''; }
  function employeeTeams(employee) { return state.teamsByEmployee[employee.id] || []; }
  function signatureFor(employee) { return state.signatures.get(`${employee.id}:${employee.job_post_id}`) || null; }
  function contractFor(employee) { return employee.job_post_id && state.contracts ? state.contracts[employee.job_post_id] || null : null; }
  function employeeName(employee) { return [employee.first_name, employee.middle_name, employee.last_name].filter(Boolean).join(' '); }

  function optionList(values, current) {
    return `<option value="">All</option>${values.map(value => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(value)}</option>`).join('')}`;
  }

  function filteredEmployees() {
    return state.employees.filter(employee => {
      if (state.department && employeeDepartment(employee) !== state.department) return false;
      if (state.team && !employeeTeams(employee).includes(state.team)) return false;
      return true;
    });
  }

  function renderContracts() {
    const host = document.getElementById('hr-onboarding-content');
    if (!host) return;
    const departments = [...new Set(state.employees.map(employeeDepartment).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const availableForDepartment = state.department ? state.employees.filter(employee => employeeDepartment(employee) === state.department) : state.employees;
    const teams = [...new Set(availableForDepartment.flatMap(employeeTeams).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (state.team && !teams.includes(state.team)) state.team = '';
    const employees = filteredEmployees();
    host.innerHTML = `<div class="hr-contracts-panel"><div class="hr-contracts-filters"><label class="hr-contracts-filter"><span>Department</span><select onchange="HROnboardingApp.setDepartment(this.value)">${optionList(departments, state.department)}</select></label><label class="hr-contracts-filter"><span>Team</span><select onchange="HROnboardingApp.setTeam(this.value)">${optionList(teams, state.team)}</select></label></div><div class="hr-contracts-table-wrap"><table class="hr-contracts-table"><thead><tr><th>Employee</th><th>Department</th><th>Team</th><th>Position</th><th>Status</th><th>Actions</th></tr></thead><tbody>${employees.length ? employees.map(employeeRow).join('') : '<tr><td colspan="6" class="hr-contract-empty">No employees match these filters.</td></tr>'}<tr class="table-spacer-row"><td colspan="6"></td></tr></tbody></table></div></div>${viewerModal()}`;
  }

  function employeeRow(employee) {
    const signature = signatureFor(employee);
    const canLoadContract = Boolean(employee.job_post_id);
    const job = state.jobs.get(employee.job_post_id);
    const status = state.signaturesLoaded ? `<span class="hr-contract-status ${signature ? 'signed' : 'not-signed'}">${signature ? 'Signed' : 'Not Signed'}</span>` : '<span class="hr-contract-status loading">Loading…</span>';
    return `<tr><td><span class="hr-contracts-employee">${esc(employeeName(employee))}</span></td><td>${esc(employeeDepartment(employee) || '—')}</td><td>${esc(employeeTeams(employee).join(', ') || '—')}</td><td>${esc(employee.title || job?.job_title || '—')}</td><td>${status}</td><td><div class="hr-contract-actions"><button type="button" class="btn btn-outline btn-sm" onclick="HROnboardingApp.openContract('${employee.id}', this)"${canLoadContract ? '' : ' disabled'}>View Contract</button><button type="button" class="btn btn-cyan btn-sm" onclick="HROnboardingApp.savePdf('${employee.id}', this)"${canLoadContract ? '' : ' disabled'}>Save PDF</button></div></td></tr>`;
  }

  function viewerModal() {
    return `<div class="hr-contract-viewer" id="hr-contract-viewer" role="dialog" aria-modal="true" aria-labelledby="hr-contract-viewer-title" style="display:none"><div class="hr-contract-viewer-card"><header class="hr-contract-viewer-header"><div><h2 id="hr-contract-viewer-title">Contract</h2><p id="hr-contract-viewer-subtitle"></p></div><button type="button" onclick="HROnboardingApp.closeContract()" aria-label="Close contract viewer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header><div class="hr-contract-viewer-toolbar"><button id="hr-contract-viewer-pdf" type="button" class="btn btn-cyan btn-sm" onclick="HROnboardingApp.saveSelectedPdf(this)">Save PDF</button><div class="hr-contract-page-controls"><button id="hr-contract-previous" type="button" onclick="HROnboardingApp.changePage(-1)" aria-label="Previous contract page"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button><span id="hr-contract-page-status"></span><button id="hr-contract-next" type="button" onclick="HROnboardingApp.changePage(1)" aria-label="Next contract page"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button></div></div><div class="hr-contract-viewer-body"><div id="hr-contract-viewer-page" class="hr-contract-viewer-page"></div></div></div></div>`;
  }

  function sanitizeHtml(value) {
    const doc = new DOMParser().parseFromString(`<div>${String(value || '')}</div>`, 'text/html');
    const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'SPAN', 'A', 'LI']);
    [...doc.body.querySelectorAll('*')].forEach(node => {
      if (node === doc.body.firstElementChild) return;
      if (!allowed.has(node.tagName)) { node.replaceWith(...node.childNodes); return; }
      [...node.attributes].forEach(attribute => {
        if (node.tagName === 'A' && attribute.name === 'href' && /^https:\/\//i.test(attribute.value)) return;
        node.removeAttribute(attribute.name);
      });
      if (node.tagName === 'A') node.setAttribute('rel', 'noopener noreferrer');
    });
    return doc.body.firstElementChild?.innerHTML || '';
  }

  function personalize(html) { return window.BKHiringContractTemplate.personalizeHtml(sanitizeHtml(html)); }
  function personalizeTemplate(html) { return window.BKHiringContractTemplate.personalizeHtml(String(html || '')); }

  function renderSignatures(employee) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = window.BKHiringContractTemplate.renderSignatures() || '';
    const employeeSpace = wrapper.querySelectorAll('.contract-signatures > div')[1]?.querySelector('.contract-signature-space');
    const signature = signatureFor(employee);
    if (employeeSpace) employeeSpace.innerHTML = signature ? `<img src="${esc(signature.signature_data_url)}" alt="${esc(employeeName(employee))} signature">` : '';
    return personalizeTemplate(wrapper.innerHTML);
  }

  function renderBlock(block, employee) {
    if (!block || typeof block !== 'object') return '';
    if (block.type === 'signatures') return renderSignatures(employee);
    const tags = { title: 'h1', header1: 'h2', header2: 'h3', paragraph: 'p', list: 'ul', numbered: 'ol' };
    const tag = tags[block.type];
    if (!tag) return '';
    let content = personalize(block.html);
    if (['ul', 'ol'].includes(tag) && content && !/<li(?:\s|>)/i.test(content)) content = `<li>${content}</li>`;
    return `<div class="snippet-preview-block"><${tag}>${content}</${tag}></div>`;
  }

  function contractPages(employee) {
    const contract = contractFor(employee);
    if (!contract) return [];
    window.BKHiringContractTemplate.setEmployee(employee);
    const bodyPages = (Array.isArray(contract.pages) ? contract.pages : []).map(page => window.BKHiringContractTemplate.renderBodyPage(`<div class="snippet-template-content">${(Array.isArray(page) ? page : []).map(block => renderBlock(block, employee)).join('')}</div>`));
    return [personalizeTemplate(window.BKHiringContractTemplate.renderCoverPage()), ...bodyPages];
  }

  function renderViewerPage() {
    const pages = state.selectedEmployee ? contractPages(state.selectedEmployee) : [];
    const host = document.getElementById('hr-contract-viewer-page');
    if (host) host.innerHTML = pages[state.currentPage] || '';
    const status = document.getElementById('hr-contract-page-status');
    const previous = document.getElementById('hr-contract-previous');
    const next = document.getElementById('hr-contract-next');
    if (status) status.textContent = `Page ${state.currentPage + 1} of ${pages.length}`;
    if (previous) previous.disabled = state.currentPage === 0;
    if (next) next.disabled = state.currentPage >= pages.length - 1;
  }

  async function loadContractFor(employee) {
    if (!employee?.job_post_id) return null;
    if (!state.contracts) {
      if (!state.contractRequest) {
        state.contractRequest = state.sb.from('global_settings').select('value').eq('company_id', state.companyId).eq('key', 'job_contract_documents').maybeSingle()
          .then(({ data, error }) => {
            if (error) throw error;
            state.contracts = data?.value && typeof data.value === 'object' ? data.value : {};
          })
          .finally(() => { state.contractRequest = null; });
      }
      await state.contractRequest;
    }
    const signatureKey = `${employee.id}:${employee.job_post_id}`;
    const signature = state.signatures.get(signatureKey);
    if (signature && !signature.signature_data_url) {
      const { data, error } = await state.sb.from('employee_contract_signatures').select('signature_data_url,signed_at').eq('company_id', state.companyId).eq('employee_id', employee.id).eq('job_post_id', employee.job_post_id).maybeSingle();
      if (error) throw error;
      if (data) state.signatures.set(signatureKey, data);
    }
    return contractFor(employee);
  }

  async function openContract(employeeId, button) {
    const employee = state.employees.find(item => item.id === employeeId);
    if (!employee) return;
    const originalText = button?.textContent;
    if (button) { button.disabled = true; button.textContent = 'Loading…'; }
    try {
      if (!await loadContractFor(employee)) return showToast('No published contract is assigned to this employee.', true);
    } catch (error) {
      console.error('Employee contract load failed:', error);
      return showToast('The employee contract could not be loaded. Please try again.', true);
    } finally {
      if (button) { button.disabled = false; button.textContent = originalText; }
    }
    state.selectedEmployee = employee;
    state.currentPage = 0;
    document.getElementById('hr-contract-viewer-subtitle').textContent = `${employeeName(employee)} · ${state.jobs.get(employee.job_post_id)?.job_title || employee.title || 'Employee'}`;
    renderViewerPage();
    const viewer = document.getElementById('hr-contract-viewer');
    viewer.style.display = 'flex';
    void viewer.offsetHeight;
    viewer.classList.add('open');
  }

  function closeContract() {
    const viewer = document.getElementById('hr-contract-viewer');
    viewer?.classList.remove('open');
    setTimeout(() => { if (viewer) viewer.style.display = 'none'; }, 150);
  }

  function changePage(direction) {
    if (!state.selectedEmployee) return;
    const total = contractPages(state.selectedEmployee).length;
    const next = state.currentPage + direction;
    if (next < 0 || next >= total) return;
    state.currentPage = next;
    renderViewerPage();
    document.querySelector('.hr-contract-viewer-body')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function waitForImages(host) {
    await Promise.all([...host.querySelectorAll('img')].map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = image.onerror = resolve; })));
  }

  function ensurePdfLibrary() {
    if (typeof html2canvas === 'function' && typeof window.jspdf?.jsPDF === 'function') return Promise.resolve();
    if (state.pdfRequest) return state.pdfRequest;
    const loadScript = src => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('PDF library failed to load'));
      document.head.appendChild(script);
    });
    const requests = [];
    if (typeof html2canvas !== 'function') requests.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'));
    if (typeof window.jspdf?.jsPDF !== 'function') requests.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'));
    state.pdfRequest = Promise.all(requests).then(() => {
      if (typeof html2canvas !== 'function' || typeof window.jspdf?.jsPDF !== 'function') throw new Error('PDF library did not initialize');
    }).finally(() => { state.pdfRequest = null; });
    return state.pdfRequest;
  }

  async function savePdf(employeeId, button) {
    const employee = state.employees.find(item => item.id === employeeId);
    if (!employee) return;
    const originalText = button?.textContent;
    if (button) { button.disabled = true; button.textContent = 'Loading…'; }
    try {
      const [contract] = await Promise.all([loadContractFor(employee), ensurePdfLibrary()]);
      if (!contract) {
        if (button) { button.disabled = false; button.textContent = originalText; }
        return showToast('No published contract is assigned to this employee.', true);
      }
    } catch (error) {
      console.error('Employee contract load failed:', error);
      if (button) { button.disabled = false; button.textContent = originalText; }
      const message = String(error?.message || '').startsWith('PDF library')
        ? 'The PDF tools could not be loaded. Check your connection and try again.'
        : 'The employee contract could not be loaded. Please try again.';
      return showToast(message, true);
    }
    if (button) button.textContent = 'Saving…';
    const host = document.createElement('div');
    host.className = 'hr-contract-pdf-host';
    host.innerHTML = '<div class="hr-contract-pdf-document"></div>';
    document.body.appendChild(host);
    try {
      const filename = `Employment_Contract_${employeeName(employee).replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}.pdf`;
      const documentElement = host.firstElementChild;
      const pageHtml = contractPages(employee);
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      for (let index = 0; index < pageHtml.length; index += 1) {
        documentElement.innerHTML = `<section class="hr-contract-pdf-page">${pageHtml[index]}</section>`;
        await waitForImages(documentElement);
        const page = documentElement.firstElementChild;
        const canvas = await html2canvas(page, { scale: .75, useCORS: true, letterRendering: true, scrollX: 0, scrollY: 0, width: page.scrollWidth, height: page.scrollHeight, windowWidth: page.scrollWidth, windowHeight: page.scrollHeight, backgroundColor: '#ffffff' });
        if (index > 0) pdf.addPage('a4', 'portrait');
        pdf.addImage(canvas.toDataURL('image/jpeg', .98), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }
      pdf.save(filename);
    } catch (error) {
      console.error('Contract PDF generation failed:', error);
      showToast('The contract PDF could not be saved. Please try again.', true);
    } finally {
      host.remove();
      if (button) { button.disabled = false; button.textContent = originalText; }
    }
  }

  function saveSelectedPdf(button) { if (state.selectedEmployee) return savePdf(state.selectedEmployee.id, button); }
  function setDepartment(value) { state.department = value; state.team = ''; renderContracts(); }
  function setTeam(value) { state.team = value; renderContracts(); }

  async function loadContracts() {
    const settingsKeys = ['company_profile_config', 'contract_template_config', 'contract_signature_config', 'company_structure'];
    const employeeRequest = Promise.resolve(state.sb.from('employees').select('id,company_id,job_post_id,first_name,middle_name,last_name,email,contact_number,title,department,address,city,province,date_of_birth,date_hired,salary,employment_status').eq('company_id', state.companyId).order('last_name').order('first_name').limit(500));
    const jobRequest = Promise.resolve(state.sb.from('job_posts').select('id,job_title').eq('company_id', state.companyId).limit(500));
    const settingRequest = Promise.resolve(state.sb.from('global_settings').select('key,value').eq('company_id', state.companyId).in('key', settingsKeys).limit(settingsKeys.length));
    const signatureRequest = Promise.resolve(state.sb.from('employee_contract_signatures').select('employee_id,job_post_id,signed_at').eq('company_id', state.companyId).limit(500));
    const employeeResult = await employeeRequest;
    if (employeeResult.error) throw employeeResult.error;
    state.employees = employeeResult.data || [];
    renderContracts();
    const [jobResult, settingResult, signatureResult] = await Promise.all([jobRequest, settingRequest, signatureRequest]);
    const error = jobResult.error || settingResult.error || signatureResult.error;
    if (error) throw error;
    state.jobs = new Map((jobResult.data || []).map(job => [job.id, job]));
    state.signatures = new Map((signatureResult.data || []).map(signature => [`${signature.employee_id}:${signature.job_post_id}`, signature]));
    state.signaturesLoaded = true;
    const settings = Object.fromEntries((settingResult.data || []).map(row => [row.key, row.value]));
    state.structure = settings.company_structure || { departments: [] };
    templateApp.companyProfile = settings.company_profile_config || {};
    buildOrganizationMaps();
    window.BKHiringContractTemplate.configureContext(templateApp, {
      companyProfile: settings.company_profile_config,
      contacts: settings.contract_template_config,
      signature: settings.contract_signature_config
    });
    renderContracts();
  }

  async function init() {
    state.authInfo = await window.BKAuth.checkRoleGate(['HR'], '/admin.html');
    if (!state.authInfo) return;
    state.sb = window.BKAuth.sb;
    renderShell();
    if (activeTab() !== 'contracts') return;
    const company = await window.BKAuth.getCompany(state.authInfo.tenantId);
    state.companyId = company?.id || null;
    if (!state.companyId) return showToast('No active company was found for this account.', true);
    try { await loadContracts(); }
    catch (error) {
      console.error('HR contracts load failed:', error);
      document.getElementById('hr-onboarding-content').innerHTML = '<div class="hr-contracts-panel"><div class="hr-contract-empty">Employee contracts could not be loaded. Refresh the page and try again.</div></div>';
      showToast('Employee contracts could not be loaded. Refresh the page and try again.', true);
    }
  }

  window.HROnboardingApp = Object.freeze({ setDepartment, setTeam, openContract, closeContract, changePage, savePdf, saveSelectedPdf });
  document.addEventListener('DOMContentLoaded', init);
})();

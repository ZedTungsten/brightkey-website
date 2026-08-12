(() => {
  'use strict';

  const state = { sb: null, authInfo: null, companyId: null, employee: null, jobPost: null, contract: null, signature: null, drawing: false, hasInk: false };
  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const showToast = (message, isError = false) => window.Toast ? window.Toast.show(message, isError ? 'error' : 'success') : console[isError ? 'error' : 'log'](message);
  const app = { get sb(){return state.sb;}, get authInfo(){return state.authInfo;}, get companyId(){return state.companyId;}, companyProfile:{}, esc, showToast };

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

  function personalize(html) {
    return window.BKHiringContractTemplate?.personalizeHtml(sanitizeHtml(html)) || sanitizeHtml(html);
  }

  function renderBlock(block) {
    if (!block || typeof block !== 'object') return '';
    if (block.type === 'signatures') return renderSignatures();
    const tags = { title: 'h1', header1: 'h2', header2: 'h3', paragraph: 'p', list: 'ul', numbered: 'ol' };
    const tag = tags[block.type];
    if (!tag) return '';
    let content = personalize(block.html);
    if ((tag === 'ul' || tag === 'ol') && content && !/<li(?:\s|>)/i.test(content)) content = `<li>${content}</li>`;
    return `<div class="snippet-preview-block"><${tag}>${content}</${tag}></div>`;
  }

  function renderSignatures() {
    const template = document.createElement('div');
    template.innerHTML = window.BKHiringContractTemplate?.renderSignatures() || '';
    const columns = template.querySelectorAll('.contract-signatures > div');
    if (columns[1]) {
      const space = columns[1].querySelector('.contract-signature-space');
      if (space) space.outerHTML = `<button class="onboarding-signature-button" type="button" onclick="OnboardingApp.openSignature()" aria-label="${state.signature ? 'View or replace your signature' : 'Sign employment contract'}">${state.signature ? `<img src="${esc(state.signature.signature_data_url)}" alt="Employee signature">` : '<span>Click to sign</span>'}</button>`;
    }
    return personalize(template.innerHTML);
  }

  function renderContract() {
    const host = document.getElementById('onboarding-content');
    const pages = Array.isArray(state.contract?.pages) ? state.contract.pages : [];
    const status = state.signature ? 'Signed' : 'Not Signed';
    const cover = personalize(window.BKHiringContractTemplate?.renderCoverPage() || '');
    const bodyPages = pages.map(page => window.BKHiringContractTemplate?.renderBodyPage(`<div class="snippet-template-content">${(Array.isArray(page) ? page : []).map(renderBlock).join('')}</div>`) || '').join('');
    host.innerHTML = `<div class="onboarding-contract-header"><div><h2>${esc(state.jobPost.job_title)} Contract</h2><p>Review every page, then select the employee signature block to sign.</p></div><span class="contract-sign-status${state.signature ? ' signed' : ''}">${status}</span></div><div class="onboarding-contract-stage"><div class="contract-template-preview">${cover}${bodyPages}</div></div>${signatureModal()}`;
  }

  function signatureModal() {
    return `<div class="signature-modal" id="signature-modal" role="dialog" aria-modal="true" aria-labelledby="signature-modal-title" style="display:none"><div class="signature-modal-card"><div class="signature-modal-header"><h3 id="signature-modal-title">Employee Signature</h3><button type="button" onclick="OnboardingApp.closeSignature()" aria-label="Close signature modal"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="signature-modal-body"><p>Draw your signature inside the box. Saving it marks this employment contract as signed.</p><canvas id="employee-signature-canvas"></canvas></div><div class="signature-modal-footer"><button class="btn btn-outline" type="button" onclick="OnboardingApp.clearSignature()">Clear</button><button class="btn btn-primary" id="save-employee-signature" type="button" onclick="OnboardingApp.saveSignature()">Save Signature</button></div></div></div>`;
  }

  function renderEmpty(title, message) {
    document.getElementById('onboarding-content').innerHTML = `<div class="onboarding-empty"><h2>${esc(title)}</h2><p>${esc(message)}</p></div>`;
  }

  async function init() {
    state.authInfo = await window.BKAuth.checkRoleGate([], '/admin.html');
    if (!state.authInfo) return;
    state.sb = window.BKAuth.sb;
    const company = await window.BKAuth.getCompany(state.authInfo.tenantId);
    state.companyId = company?.id || null;
    const email = state.authInfo.user?.email;
    if (!state.companyId || !email) return renderEmpty('Contract unavailable', 'Your employee account could not be identified. Contact HR for assistance.');

    const { data: employee, error: employeeError } = await state.sb.from('employees').select('id, company_id, first_name, last_name, email, contact_number, title, address, city, province, date_of_birth, date_hired, salary, job_post_id').eq('company_id', state.companyId).ilike('email', email).limit(1).maybeSingle();
    if (employeeError) { console.error('Onboarding employee load failed:', employeeError); return renderEmpty('Contract unavailable', 'Your employee profile could not be loaded. Refresh the page or contact HR.'); }
    state.employee = employee;
    if (!employee?.job_post_id) return renderEmpty('No contract assigned', 'Your Employee Directory profile is not connected to a job post yet. Ask HR to assign one.');

    const [jobResult, settingsResult, signatureResult] = await Promise.all([
      state.sb.from('job_posts').select('id, job_title').eq('company_id', state.companyId).eq('id', employee.job_post_id).maybeSingle(),
      state.sb.from('global_settings').select('key,value').eq('company_id', state.companyId).in('key', ['job_contract_documents', 'company_profile_config', 'contract_template_config', 'contract_signature_config']).limit(4),
      state.sb.from('employee_contract_signatures').select('signature_data_url,signed_at').eq('company_id', state.companyId).eq('employee_id', employee.id).eq('job_post_id', employee.job_post_id).maybeSingle()
    ]);
    if (jobResult.error || settingsResult.error) { console.error('Onboarding contract load failed:', jobResult.error || settingsResult.error); return renderEmpty('Contract unavailable', 'Your employment contract could not be loaded. Refresh the page or contact HR.'); }
    if (signatureResult.error && signatureResult.error.code !== 'PGRST205') console.error('Onboarding signature load failed:', signatureResult.error);
    state.jobPost = jobResult.data;
    const settings = Object.fromEntries((settingsResult.data || []).map(row => [row.key, row.value]));
    state.contract = settings.job_contract_documents?.[employee.job_post_id] || null;
    state.signature = signatureResult.data || null;
    app.companyProfile = settings.company_profile_config || {};
    await window.BKHiringContractTemplate?.ensureLoaded(app);
    if (!state.jobPost || !Array.isArray(state.contract?.pages) || !state.contract.pages.length) return renderEmpty('Contract not ready', 'HR has not published a contract for your job post yet.');
    renderContract();
  }

  function setupCanvas() {
    const canvas = document.getElementById('employee-signature-canvas');
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
    const context = canvas.getContext('2d'); context.scale(ratio, ratio); context.lineWidth = 2; context.lineCap = 'round'; context.strokeStyle = '#09090B';
    const point = event => { const bounds = canvas.getBoundingClientRect(); const source = event.touches?.[0] || event; return [source.clientX - bounds.left, source.clientY - bounds.top]; };
    canvas.onpointerdown = event => { state.drawing = true; state.hasInk = true; context.beginPath(); context.moveTo(...point(event)); canvas.setPointerCapture(event.pointerId); };
    canvas.onpointermove = event => { if (!state.drawing) return; context.lineTo(...point(event)); context.stroke(); };
    canvas.onpointerup = canvas.onpointercancel = () => { state.drawing = false; };
    if (state.signature?.signature_data_url) { const image = new Image(); image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height); image.src = state.signature.signature_data_url; state.hasInk = true; }
  }

  function openSignature() { const modal = document.getElementById('signature-modal'); modal.style.display = 'flex'; void modal.offsetHeight; modal.classList.add('open'); requestAnimationFrame(setupCanvas); }
  function closeSignature() { const modal = document.getElementById('signature-modal'); modal?.classList.remove('open'); setTimeout(() => { if (modal) modal.style.display = 'none'; }, 150); }
  function clearSignature() { const canvas = document.getElementById('employee-signature-canvas'); canvas?.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); state.hasInk = false; }

  async function saveSignature() {
    if (!state.hasInk) return showToast('Draw your signature before saving.', true);
    const button = document.getElementById('save-employee-signature'); const canvas = document.getElementById('employee-signature-canvas');
    button.disabled = true; button.textContent = 'Saving…';
    const payload = { company_id: state.companyId, employee_id: state.employee.id, job_post_id: state.jobPost.id, signature_data_url: canvas.toDataURL('image/png'), signed_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const { data, error } = await state.sb.from('employee_contract_signatures').upsert(payload, { onConflict: 'company_id,employee_id,job_post_id' }).select('signature_data_url,signed_at').single();
    button.disabled = false; button.textContent = 'Save Signature';
    if (error) { console.error('Employee contract signature save failed:', error); return showToast('Your signature could not be saved. Please try again.', true); }
    state.signature = data; closeSignature(); renderContract(); showToast('Contract signed successfully.');
  }

  window.OnboardingApp = Object.freeze({ init, openSignature, closeSignature, clearSignature, saveSignature });
  document.addEventListener('DOMContentLoaded', init);
})();

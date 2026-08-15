(() => {
  'use strict';

  const state = { sb: null, authInfo: null, companyId: null, employee: null, jobPost: null, contract: null, signature: null, handbookFiles: [], handbookReads: {}, handbookIndex: -1, currentPage: 0, drawing: false, hasInk: false, pdfExporting: false };
  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const showToast = (message, isError = false) => window.Toast ? window.Toast.show(message, isError ? 'error' : 'success') : console[isError ? 'error' : 'log'](message);
  const app = { get sb(){return state.sb;}, get authInfo(){return state.authInfo;}, get companyId(){return state.companyId;}, companyProfile:{}, esc, showToast };
  const formatDate = value => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—'; };
  const formatSignatureDate = value => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : 'MM/DD/YYYY'; };

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

  function personalizeTemplate(html) {
    return window.BKHiringContractTemplate?.personalizeHtml(String(html || '')) || String(html || '');
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
      const signedDate = columns[1].querySelector('.contract-signature-date');
      if (space) space.outerHTML = state.signature
        ? `<div class="onboarding-signed-signature"><img src="${esc(state.signature.signature_data_url)}" alt="Employee signature"></div>`
        : '<button class="onboarding-signature-button" type="button" onclick="OnboardingApp.openSignature()" aria-label="Sign employment contract"><span>Click to sign</span></button>';
      if (signedDate && state.signature) signedDate.textContent = `Date signed: ${formatSignatureDate(state.signature.signed_at)}`;
    }
    return personalizeTemplate(template.innerHTML);
  }

  function renderContract() {
    const host = document.getElementById('onboarding-content');
    const status = state.signature ? 'Signed' : 'Not Signed';
    const cover = personalizeTemplate(window.BKHiringContractTemplate?.renderCoverPage() || '');
    const signedDate = state.signature ? `<span class="onboarding-contract-signed-date">Date Signed: ${esc(formatDate(state.signature.signed_at))}</span>` : '';
    const materials = materialsMarkup();
    host.innerHTML = `<div class="onboarding-card-layout"><section class="onboarding-contract-card" aria-labelledby="contract-card-title"><div class="onboarding-card-header"><div class="onboarding-contract-details"><h2 id="contract-card-title">Contract</h2><p>${esc(state.jobPost.job_title)}</p><span>Date Published: ${esc(formatDate(state.contract.updatedAt))}</span>${signedDate}</div><span class="contract-sign-status${state.signature ? ' signed' : ''}">${status}</span></div><button class="onboarding-cover-button" type="button" onclick="OnboardingApp.openViewer()" aria-label="Open ${esc(state.jobPost.job_title)} contract"><div class="onboarding-cover-preview">${cover}</div><span class="onboarding-open-label">Open contract</span></button></section>${materials}</div>${viewerModal()}${handbookViewerModal()}${signatureModal()}`;
  }

  function renderContractUnavailable(title, message) {
    const host = document.getElementById('onboarding-content');
    const materials = materialsMarkup();
    host.innerHTML = `<div class="onboarding-card-layout"><section class="onboarding-contract-card onboarding-contract-empty" aria-labelledby="contract-card-title"><div><h2 id="contract-card-title">${esc(title)}</h2><p>${esc(message)}</p></div></section>${materials}</div>${handbookViewerModal()}`;
  }

  function materialGroup(file) { return String(file?.group || '').trim() || 'Ungrouped'; }
  function materialsMarkup() {
    if (!state.handbookFiles.length) return '';
    const grouped = new Map();
    state.handbookFiles.forEach((file, index) => {
      const group = materialGroup(file);
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group).push({ file, index });
    });
    const groupsHtml = [...grouped.entries()].map(([group, entries]) => `<section class="onboarding-material-group"><header class="onboarding-material-group-header"><h3>${esc(group)}</h3></header><div class="onboarding-materials-grid">${entries.map(({ file, index }) => handbookCard(file, index)).join('')}</div></section>`).join('');
    return `<section class="onboarding-materials-area" aria-labelledby="onboarding-materials-title"><h2 id="onboarding-materials-title">Materials</h2><div class="onboarding-material-groups">${groupsHtml}</div></section>`;
  }

  function driveFileId(url) { try { return String(url || '').match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || new URL(url).searchParams.get('id') || ''; } catch { return ''; } }
  function handbookEmbedUrl(file) {
    const url = file.file_url;
    if (file.source === 'youtube' || file.file_type === 'youtube') { try { const parsed = new URL(url); const host = parsed.hostname.replace(/^www\./, ''); const id = host === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v') || parsed.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1]; return id ? `https://www.youtube.com/embed/${id}` : url; } catch { return url; } }
    if (file.file_type === 'doc') { if (url.includes('/pub')) return url.includes('embedded=true') ? url : `${url}${url.includes('?') ? '&' : '?'}embedded=true`; if (url.includes('/edit')) return url.replace(/\/edit.*$/, '/preview?rm=minimal'); return url.includes('/preview') ? url : `${url.replace(/\/+$/, '')}/preview?rm=minimal`; }
    if (['slide', 'sheet'].includes(file.file_type)) return url.includes('/pub') ? (url.includes('embedded=true') ? url : `${url}${url.includes('?') ? '&' : '?'}embedded=true`) : url.replace(/\/edit.*$/, '/preview');
    const id = driveFileId(url); return id ? `https://drive.google.com/file/d/${id}/preview` : url;
  }
  function handbookCard(file, index) {
    const isRead = Boolean(state.handbookReads[file.id]);
    const isVideo = file.source === 'youtube' || ['youtube', 'video'].includes(file.file_type);
    const icon = isVideo
      ? '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m10 8 6 4-6 4Z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></svg>';
    return `<button class="onboarding-material-card" type="button" onclick="OnboardingApp.openHandbook(${index})" aria-label="Open ${esc(file.name)}"><div class="onboarding-material-card-icon ${isVideo ? 'is-video' : 'is-document'}" aria-hidden="true">${icon}</div><div class="onboarding-material-meta"><strong title="${esc(file.name)}">${esc(file.name)}</strong><span class="handbook-read-status${isRead ? ' read' : ''}" id="material-access-status-${index}">${isRead ? 'Accessed' : 'Not Yet Accessed'}</span></div></button>`;
  }

  function handbookViewerModal() {
    return `<div class="onboarding-handbook-viewer" id="onboarding-handbook-viewer" role="dialog" aria-modal="true" aria-labelledby="onboarding-handbook-title" style="display:none"><header><span id="onboarding-handbook-title">Materials</span><a id="onboarding-handbook-drive-link" target="_blank" rel="noopener noreferrer">View in Google Drive</a><button type="button" onclick="OnboardingApp.closeHandbook()" aria-label="Close material viewer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header><div id="onboarding-handbook-body"></div><button class="handbook-viewer-nav previous" id="onboarding-handbook-previous" type="button" onclick="OnboardingApp.changeHandbook(-1)" aria-label="Previous material"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button><button class="handbook-viewer-nav next" id="onboarding-handbook-next" type="button" onclick="OnboardingApp.changeHandbook(1)" aria-label="Next material"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button></div>`;
  }

  function viewerModal() {
    return `<div class="onboarding-viewer" id="onboarding-viewer" role="dialog" aria-modal="true" aria-labelledby="onboarding-viewer-title" style="display:none"><div class="onboarding-viewer-card"><header class="onboarding-viewer-header"><div><h2 id="onboarding-viewer-title">Contract</h2><p>${esc(state.jobPost.job_title)}</p></div><button type="button" onclick="OnboardingApp.closeViewer()" aria-label="Close contract viewer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header><div class="onboarding-viewer-body"><div class="onboarding-page-controls"><button id="onboarding-save-pdf" class="btn btn-cyan btn-sm onboarding-save-pdf" type="button" onclick="OnboardingApp.savePdf(this)">Save as PDF</button><button id="onboarding-page-previous" type="button" onclick="OnboardingApp.changePage(-1)" aria-label="Previous contract page"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button><span id="onboarding-page-status"></span><button id="onboarding-page-next" type="button" onclick="OnboardingApp.changePage(1)" aria-label="Next contract page"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button></div><div class="onboarding-viewer-stage"><div id="onboarding-viewer-page" class="contract-template-preview"></div></div></div></div></div>`;
  }

  function contractPageCount() {
    return 1 + (Array.isArray(state.contract?.pages) ? state.contract.pages.length : 0);
  }

  function renderViewerPage() {
    const host = document.getElementById('onboarding-viewer-page');
    if (!host) return;
    const pages = Array.isArray(state.contract?.pages) ? state.contract.pages : [];
    host.innerHTML = state.currentPage === 0
      ? personalizeTemplate(window.BKHiringContractTemplate?.renderCoverPage() || '')
      : window.BKHiringContractTemplate?.renderBodyPage(`<div class="snippet-template-content">${(Array.isArray(pages[state.currentPage - 1]) ? pages[state.currentPage - 1] : []).map(renderBlock).join('')}</div>`) || '';
    const status = document.getElementById('onboarding-page-status');
    const previous = document.getElementById('onboarding-page-previous');
    const next = document.getElementById('onboarding-page-next');
    if (status) status.textContent = `Page ${state.currentPage + 1} of ${contractPageCount()}`;
    if (previous) previous.disabled = state.currentPage === 0;
    if (next) next.disabled = state.currentPage === contractPageCount() - 1;
  }

  function openViewer() {
    state.currentPage = 0;
    renderViewerPage();
    const viewer = document.getElementById('onboarding-viewer');
    if (!viewer) return;
    viewer.style.display = 'flex';
    void viewer.offsetHeight;
    viewer.classList.add('open');
  }

  function closeViewer() {
    const viewer = document.getElementById('onboarding-viewer');
    viewer?.classList.remove('open');
    setTimeout(() => { if (viewer) viewer.style.display = 'none'; }, 150);
  }

  function changePage(direction) {
    const nextPage = state.currentPage + direction;
    if (nextPage < 0 || nextPage >= contractPageCount()) return;
    state.currentPage = nextPage;
    renderViewerPage();
    document.querySelector('.onboarding-viewer-body')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateMaterialAccessStatus(index, accessed) {
    const status = document.getElementById(`material-access-status-${index}`);
    if (!status) return;
    status.classList.toggle('read', accessed);
    status.textContent = accessed ? 'Accessed' : 'Not Yet Accessed';
  }
  async function markHandbookRead(file, index) {
    if (!file || state.handbookReads[file.id]) return;
    state.handbookReads[file.id] = new Date().toISOString();
    updateMaterialAccessStatus(index, true);
    try {
      const { error } = await state.sb.from('global_settings').upsert({ company_id: state.companyId, key: `employee_handbook_reads_${state.employee.id}`, value: state.handbookReads }, { onConflict: 'company_id,key' });
      if (error) throw error;
    } catch (error) {
      delete state.handbookReads[file.id];
      updateMaterialAccessStatus(index, false);
      console.error('Material access status save failed:', error);
      showToast('This material was opened, but its Accessed status could not be saved. Please try opening it again.', true);
    }
  }
  function renderHandbookViewer() {
    const file = state.handbookFiles[state.handbookIndex]; if (!file) return;
    document.getElementById('onboarding-handbook-title').textContent = file.name;
    const link = document.getElementById('onboarding-handbook-drive-link');
    link.href = file.file_url;
    link.textContent = file.source === 'youtube' || file.file_type === 'youtube' ? 'Open in YouTube' : 'View in Google Drive';
    document.getElementById('onboarding-handbook-body').innerHTML = `<iframe src="${esc(handbookEmbedUrl(file))}" title="${esc(file.name)}"></iframe>`;
    document.getElementById('onboarding-handbook-previous').style.display = state.handbookIndex > 0 ? 'flex' : 'none';
    document.getElementById('onboarding-handbook-next').style.display = state.handbookIndex < state.handbookFiles.length - 1 ? 'flex' : 'none';
  }
  function openHandbook(index) {
    if (index < 0 || index >= state.handbookFiles.length) return;
    state.handbookIndex = index; renderHandbookViewer();
    document.getElementById('onboarding-handbook-viewer').style.display = 'flex';
    void markHandbookRead(state.handbookFiles[index], index);
  }
  function closeHandbook() { const viewer = document.getElementById('onboarding-handbook-viewer'); if (viewer) viewer.style.display = 'none'; const body = document.getElementById('onboarding-handbook-body'); if (body) body.innerHTML = ''; }
  function changeHandbook(direction) { const index = state.handbookIndex + direction; if (index < 0 || index >= state.handbookFiles.length) return; state.handbookIndex = index; renderHandbookViewer(); void markHandbookRead(state.handbookFiles[index], index); }

  function pdfPages() {
    const pages = Array.isArray(state.contract?.pages) ? state.contract.pages : [];
    return [personalizeTemplate(window.BKHiringContractTemplate?.renderCoverPage() || ''), ...pages.map(page => window.BKHiringContractTemplate?.renderBodyPage(`<div class="snippet-template-content">${(Array.isArray(page) ? page : []).map(renderBlock).join('')}</div>`) || '')];
  }

  function compactPdfPages(pages) {
    const assets = []; const indexes = new Map();
    const compactPages = pages.map(page => page.replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, dataUrl => {
      let index = indexes.get(dataUrl);
      if (index === undefined) { index = assets.length; indexes.set(dataUrl, index); assets.push(dataUrl); }
      return `__BK_PDF_ASSET_${index}__`;
    }));
    return { pages: compactPages, assets };
  }

  async function savePdf(button) {
    if (state.pdfExporting || !state.employee || !state.jobPost || !state.contract) return;
    state.pdfExporting = true;
    const originalText = button?.textContent || 'Save as PDF';
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    try {
      const employeeName = [state.employee.first_name, state.employee.last_name].filter(Boolean).join(' ') || 'Employee';
      const filename = `Employment_Contract_${employeeName.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}.pdf`;
      const response = await window.BKAuth.authenticatedFetch('/api/hr-contract-pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: state.companyId, employee_id: state.employee.id, job_post_id: state.jobPost.id, filename, ...compactPdfPages(pdfPages()) })
      });
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || 'The contract PDF could not be generated.'); }
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = blobUrl; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (error) {
      console.error('Employee contract PDF generation failed:', error);
      showToast(error?.message || 'The contract PDF could not be saved. Please try again.', true);
    } finally {
      state.pdfExporting = false;
      if (button) { button.disabled = false; button.textContent = originalText; }
    }
  }

  function signatureModal() {
    return `<div class="signature-modal" id="signature-modal" role="dialog" aria-modal="true" aria-labelledby="signature-modal-title" style="display:none"><div class="signature-modal-card"><div class="signature-modal-header"><h3 id="signature-modal-title">Employee Signature</h3><button type="button" onclick="OnboardingApp.closeSignature()" aria-label="Close signature modal"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="signature-modal-body"><p>Draw your signature inside the box. Saving it marks this employment contract as signed.</p><canvas id="employee-signature-canvas"></canvas></div><div class="signature-modal-footer"><button class="btn btn-outline" type="button" onclick="OnboardingApp.clearSignature()">Clear</button><button class="btn btn-primary" id="save-employee-signature" type="button" onclick="OnboardingApp.saveSignature()">Save Signature</button></div></div></div>`;
  }

  function renderEmpty(title, message) {
    document.getElementById('onboarding-content').innerHTML = `<div class="onboarding-empty"><h2>${esc(title)}</h2><p>${esc(message)}</p></div>`;
  }

  async function init() {
    state.authInfo = await window.BKAuth.checkMemberGate('/admin.html');
    if (!state.authInfo) return;
    state.sb = window.BKAuth.sb;
    const company = await window.BKAuth.getCompany(state.authInfo.tenantId);
    state.companyId = company?.id || null;
    const email = state.authInfo.user?.email;
    if (!state.companyId || !email) return renderEmpty('Contract unavailable', 'Your employee account could not be identified. Contact HR for assistance.');

    const { data: employee, error: employeeError } = await state.sb.from('employees').select('id, company_id, first_name, last_name, email, contact_number, title, address, city, province, date_of_birth, date_hired, salary, job_post_id').eq('company_id', state.companyId).ilike('email', email).limit(1).maybeSingle();
    if (employeeError) { console.error('Onboarding employee load failed:', employeeError); return renderEmpty('Contract unavailable', 'Your employee profile could not be loaded. Refresh the page or contact HR.'); }
    state.employee = employee;
    if (!employee) return renderEmpty('Contract unavailable', 'Your employee account could not be identified. Contact HR for assistance.');

    const handbookReadKey = `employee_handbook_reads_${employee.id}`;
    const [jobResult, settingsResult, signatureResult] = await Promise.all([
      employee.job_post_id
        ? state.sb.from('job_posts').select('id, job_title').eq('company_id', state.companyId).eq('id', employee.job_post_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      state.sb.from('global_settings').select('key,value').eq('company_id', state.companyId).in('key', ['job_contract_documents', 'company_profile_config', 'contract_template_config', 'contract_signature_config', 'hr_onboarding_handbook_files', 'hr_onboarding_job_materials', handbookReadKey]).limit(7),
      employee.job_post_id
        ? state.sb.from('employee_contract_signatures').select('signature_data_url,signed_at').eq('company_id', state.companyId).eq('employee_id', employee.id).eq('job_post_id', employee.job_post_id).maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ]);
    if (settingsResult.error) { console.error('Onboarding materials load failed:', settingsResult.error); return renderEmpty('Onboarding unavailable', 'Your onboarding information could not be loaded. Refresh the page or contact HR.'); }
    if (jobResult.error) console.error('Onboarding contract assignment load failed:', jobResult.error);
    if (signatureResult.error && signatureResult.error.code !== 'PGRST205') console.error('Onboarding signature load failed:', signatureResult.error);
    state.jobPost = jobResult.data;
    const settings = Object.fromEntries((settingsResult.data || []).map(row => [row.key, row.value]));
    state.contract = settings.job_contract_documents?.[employee.job_post_id] || null;
    state.signature = signatureResult.data || null;
    const generalMaterials = Array.isArray(settings.hr_onboarding_handbook_files) ? settings.hr_onboarding_handbook_files : [];
    const jobMaterials = Array.isArray(settings.hr_onboarding_job_materials?.[employee.job_post_id]) ? settings.hr_onboarding_job_materials[employee.job_post_id] : [];
    state.handbookFiles = [...generalMaterials, ...jobMaterials].filter(file => file?.id && file?.name && file?.file_url).slice(0, 100);
    state.handbookReads = settings[handbookReadKey] && typeof settings[handbookReadKey] === 'object' ? settings[handbookReadKey] : {};
    app.companyProfile = settings.company_profile_config || {};
    await window.BKHiringContractTemplate?.ensureLoaded(app);
    if (!employee.job_post_id || !state.jobPost) return renderContractUnavailable('No contract assigned', 'Your Employee Directory profile is not connected to a job post yet. Ask HR to assign one.');
    if (!Array.isArray(state.contract?.pages) || !state.contract.pages.length) return renderContractUnavailable('Contract not ready', 'HR has not published a contract for your job post yet.');
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

  function openSignature() { if (state.signature) return; const modal = document.getElementById('signature-modal'); modal.style.display = 'flex'; void modal.offsetHeight; modal.classList.add('open'); requestAnimationFrame(setupCanvas); }
  function closeSignature() { const modal = document.getElementById('signature-modal'); modal?.classList.remove('open'); setTimeout(() => { if (modal) modal.style.display = 'none'; }, 150); }
  function clearSignature() { if (state.signature) return; const canvas = document.getElementById('employee-signature-canvas'); canvas?.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); state.hasInk = false; }

  async function saveSignature() {
    if (state.signature) return showToast('This contract has already been signed.', true);
    if (!state.hasInk) return showToast('Draw your signature before saving.', true);
    const button = document.getElementById('save-employee-signature'); const canvas = document.getElementById('employee-signature-canvas');
    button.disabled = true; button.textContent = 'Saving…';
    const payload = { company_id: state.companyId, employee_id: state.employee.id, job_post_id: state.jobPost.id, signature_data_url: canvas.toDataURL('image/png'), signed_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const { data, error } = await state.sb.from('employee_contract_signatures').insert(payload).select('signature_data_url,signed_at').single();
    button.disabled = false; button.textContent = 'Save Signature';
    if (error) { console.error('Employee contract signature save failed:', error); return showToast(error.code === '23505' ? 'This contract has already been signed.' : 'Your signature could not be saved. Please try again.', true); }
    state.signature = data; closeSignature(); renderContract(); showToast('Contract signed successfully.');
  }

  window.OnboardingApp = Object.freeze({ init, openViewer, closeViewer, changePage, savePdf, openHandbook, closeHandbook, changeHandbook, openSignature, closeSignature, clearSignature, saveSignature });
  document.addEventListener('DOMContentLoaded', init);
})();

(function () {
  'use strict';
  const SETTINGS_KEY = 'contract_snippets';
  const JOB_CONTRACTS_KEY = 'job_contract_documents';
  const TEMPLATES_KEY = 'contract_document_templates';
  const BLOCK_TYPES = { title: 'Title', header1: 'Header 1', header2: 'Header 2', paragraph: 'Paragraph', list: 'List', numbered: 'Numbered List', signatures: 'Signatures' };
  const PERSONALIZATION_FIELDS = [
    ['date_hired', 'Date Hired'], ['salary', 'Salary'], ['first_name', 'First Name'], ['last_name', 'Last Name'],
    ['street_address', 'Street Address'], ['city', 'City'], ['province', 'Province'], ['contact_number', 'Contact Number'],
    ['email', 'Email'], ['title_position', 'Title / Position'], ['date_of_birth', 'Date of Birth']
  ];
  const state = { app: null, jobs: [], snippets: [], jobContracts: {}, pages: [[]], currentPage: 0, history: [], redoHistory: [], personalizationRange: null, selectionListenerBound: false, shortcutListenerBound: false, templateReady: false, draggedBlock: null, dropIndex: null, editingId: null, activeJobId: null, builderMode: 'clause', readOnly: false, deletingId: null, saving: false };
  const esc = value => state.app?.esc(value) || ''; const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  function normalizeBlock(block) {
    const requestedType = block?.type === 'header' ? 'header2' : block?.type; const type = Object.hasOwn(BLOCK_TYPES, requestedType) ? requestedType : 'paragraph';
    const legacyPlaceholders = new Set(['Section heading', 'Write contract text here.', 'List item']);
    const html = block && Object.hasOwn(block, 'html') ? sanitizeHtml(block.html) : ''; const id = String(block?.id || uid());
    return { id, sourceId: String(block?.sourceId || id), type, html: legacyPlaceholders.has(html) ? '' : html };
  }
  function normalizeSnippet(item) {
    const sourcePages = Array.isArray(item?.pages) && item.pages.length ? item.pages : [Array.isArray(item?.blocks) ? item.blocks : []];
    return {
      id: String(item?.id || uid()),
      title: String(item?.title || '').trim().slice(0, 120),
      pages: sourcePages.map(page => (Array.isArray(page) ? page : []).slice(0, 40).map(normalizeBlock)),
      updatedAt: String(item?.updatedAt || new Date().toISOString())
    };
  }
  function currentBlocks() { return state.pages[state.currentPage] || []; }
  function isCoverPage() { return ['job', 'template'].includes(state.builderMode) && state.currentPage === 0; }
  function plainText(html) { const node = document.createElement('div'); node.innerHTML = sanitizeHtml(html); return (node.textContent || '').replace(/\u00a0/g, ' ').trim(); }
  function pageIsBlank(page) { return !page.length || page.every(block => block.type !== 'signatures' && !plainText(block.html)); }
  function sanitizeHtml(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '').replace(/\u200b/g, '');
    const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'LI', 'UL', 'OL']);
    [...template.content.querySelectorAll('*')].forEach(node => {
      if (!allowed.has(node.tagName)) node.replaceWith(...node.childNodes);
      else [...node.attributes].forEach(attribute => node.removeAttribute(attribute.name));
    });
    return template.innerHTML.slice(0, 10000);
  }
  function renderPersonalizationPills(html) {
    if (state.readOnly) return window.BKHiringContractTemplate?.personalizeHtml(html) || String(html || '');
    const allowed = new Set(PERSONALIZATION_FIELDS.map(([token]) => token));
    return String(html || '').replace(/\{\{([a-z_]+)\}\}/g, (match, token) => allowed.has(token) ? `<span class="personalization-pill" contenteditable="false" data-token="${token}">${match}</span>` : match);
  }
  function renderPage() {
    const content = document.querySelector('.hiring-content');
    if (!content) return;
    content.innerHTML = `<div class="hiring-page contracts-page">
      <div class="contracts-grid">
        <section class="contracts-column" aria-labelledby="contract-jobs-title">
          <div class="contracts-column-header"><div><h2 id="contract-jobs-title">Jobs</h2><p>Select a job post to build its contract later.</p></div></div>
          <div id="contract-job-cards" class="contract-jobs-table-wrap"><div class="contracts-skeleton"><i></i><i></i><i></i></div></div>
        </section>
        <div class="contracts-side-stack"><section class="contracts-column" aria-labelledby="contract-snippets-title">
          <div class="contracts-column-header"><div><h2 id="contract-snippets-title">Contract Clauses</h2><p>Reusable clauses for employment contracts.</p></div>
            <button class="btn btn-primary" id="create-clause-button" type="button" disabled onclick="BKHiringContracts.openBuilder()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Create Clause</button>
          </div>
          <div id="contract-snippet-cards" class="contract-card-list"><div class="contracts-skeleton"><i></i><i></i></div></div>
        </section>${window.BKContractTemplates?.sectionMarkup() || ''}</div>
      </div>
      ${builderModal()}${deleteModal()}${window.BKContractTemplates?.modalsMarkup() || ''}
    </div>`;
  }
  function builderModal() {
    return `<div class="hiring-modal-overlay snippet-builder-overlay" id="snippet-builder-modal" role="dialog" aria-modal="true" aria-labelledby="snippet-builder-title" style="display:none">
      <div class="hiring-modal-card snippet-builder-card">
          <div class="hiring-modal-header"><div><h3 id="snippet-builder-title">Create Contract Clause</h3><p id="snippet-builder-description">Drag content blocks into the contract preview.</p></div>
          <div class="snippet-header-actions"><button class="btn btn-outline btn-sm" id="load-job-template" type="button" hidden onclick="BKContractTemplates.beginLoad()">Load Template</button><button class="btn btn-outline btn-sm" id="save-job-template" type="button" hidden onclick="BKHiringContracts.saveAsTemplate()">Save Template</button><button class="hiring-icon-btn" type="button" aria-label="Close builder" onclick="BKHiringContracts.closeBuilder()"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
        </div>
        <div class="snippet-builder-body">
          <label class="snippet-title-field"><span>Title <b>*</b></span><input id="snippet-title" type="text" maxlength="120" placeholder="e.g. Non-compete clause" required /></label>
          <div class="snippet-builder-workspace">
            <aside class="snippet-block-library" aria-label="Content blocks"><h4>Content Blocks</h4><p>Drag or click a block to add it.</p>
              ${Object.entries(BLOCK_TYPES).map(([type, label]) => `<button class="snippet-block-source" type="button" draggable="true" data-block-type="${type}" ondragstart="BKHiringContracts.dragNew(event, '${type}')" ondragend="BKHiringContracts.endDrag()" onclick="BKHiringContracts.addBlock('${type}')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h10"/></svg><span>${label}</span></button>`).join('')}
              <div class="snippet-clause-loader" id="snippet-clause-loader"><strong>Clauses</strong><div id="snippet-clause-list" class="snippet-clause-list"></div></div>
            </aside>
            <section class="snippet-preview-wrap"><div class="snippet-format-toolbar" aria-label="Text formatting">
                <button id="snippet-undo" type="button" aria-label="Undo" title="Undo" onclick="BKHiringContracts.undo()"><svg viewBox="0 0 24 24"><path d="M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6"/></svg></button>
                <button id="snippet-redo" type="button" aria-label="Redo" title="Redo" onclick="BKHiringContracts.redo()"><svg viewBox="0 0 24 24"><path d="m15 7 5 5-5 5m4-5h-8a6 6 0 0 0-6 6"/></svg></button>
                <button id="snippet-format-bold" type="button" aria-label="Bold" title="Bold" onmousedown="event.preventDefault()" onclick="BKHiringContracts.format('bold')"><strong>B</strong></button>
                <button id="snippet-format-italic" type="button" aria-label="Italic" title="Italic" onmousedown="event.preventDefault()" onclick="BKHiringContracts.format('italic')"><i>I</i></button>
                <button id="snippet-format-underline" type="button" aria-label="Underline" title="Underline" onmousedown="event.preventDefault()" onclick="BKHiringContracts.format('underline')"><u>U</u></button>
                <button class="snippet-indent-button" id="snippet-indent-decrease" type="button" hidden aria-label="Decrease indent" title="Decrease indent" onmousedown="event.preventDefault()" onclick="BKHiringContracts.indentList('outdent')"><svg viewBox="0 0 24 24"><path d="M10 6h10M10 12h10M10 18h10M7 9l-3 3 3 3"/></svg></button>
                <button class="snippet-indent-button" id="snippet-indent-increase" type="button" hidden aria-label="Increase indent" title="Increase indent" onmousedown="event.preventDefault()" onclick="BKHiringContracts.indentList('indent')"><svg viewBox="0 0 24 24"><path d="M10 6h10M10 12h10M10 18h10M4 9l3 3-3 3"/></svg></button>
                <button class="snippet-personalization-button" type="button" onclick="BKHiringContracts.togglePersonalization(event, this)">Personalization</button>
                <div class="snippet-page-controls"><button class="snippet-insert-page" id="snippet-insert-page" type="button" onclick="BKHiringContracts.insertPage()">Insert Page</button><button id="snippet-page-previous" type="button" aria-label="Previous page" title="Previous page" onclick="BKHiringContracts.changePage(-1)"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button><span id="snippet-page-status">Page 1 of 1</span><button id="snippet-page-next" type="button" aria-label="Next page" title="Next page" onclick="BKHiringContracts.nextPage()"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button></div>
              </div>
              <div class="snippet-page-stage"><div id="snippet-preview" ondragover="BKHiringContracts.allowDrop(event)" ondrop="BKHiringContracts.drop(event)"></div></div>
            </section>
          </div>
          <div class="snippet-personalization-menu" id="snippet-personalization-menu" hidden>${PERSONALIZATION_FIELDS.map(([token, label]) => `<button type="button" onclick="BKHiringContracts.insertPersonalization('${token}')"><span>${label}</span><code>{{${token}}}</code></button>`).join('')}</div>
        </div>
        <div class="hiring-modal-footer"><button class="btn btn-outline" type="button" onclick="BKHiringContracts.closeBuilder()">Cancel</button><button class="btn btn-primary" id="save-snippet-button" type="button" onclick="BKHiringContracts.save()">Save Clause</button></div>
      </div>
    </div>`;
  }
  function deleteModal() {
    return `<div class="hiring-modal-overlay clause-delete-overlay" id="clause-delete-modal" role="dialog" aria-modal="true" aria-labelledby="clause-delete-title" style="display:none"><div class="hiring-modal-card clause-delete-card"><div class="hiring-modal-header"><h3 id="clause-delete-title">Delete Clause</h3><button class="hiring-icon-btn" type="button" aria-label="Close" onclick="BKHiringContracts.closeDelete()"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="clause-delete-body"><p>This clause will be permanently removed from your reusable contract clauses.</p></div><div class="hiring-modal-footer"><button class="btn btn-outline" type="button" onclick="BKHiringContracts.closeDelete()">Cancel</button><button class="btn clause-delete-confirm" type="button" onclick="BKHiringContracts.confirmDelete()">Delete Clause</button></div></div></div>`;
  }
  async function init(app) {
    state.app = app;
    state.templateReady = false;
    renderPage();
    await Promise.all([window.BKHiringContractTemplate?.ensureLoaded(app), loadJobs(), loadSnippets()]);
    if (!state.selectionListenerBound) {
      document.addEventListener('selectionchange', updateFormatToolbar);
      state.selectionListenerBound = true;
    }
    if (!state.shortcutListenerBound) {
      document.addEventListener('keydown', builderShortcut);
      state.shortcutListenerBound = true;
    }
    state.templateReady = true;
    const createButton = document.getElementById('create-clause-button');
    if (createButton) createButton.disabled = false;
  }
  async function loadJobs() {
    const host = document.getElementById('contract-job-cards');
    const { data, error } = await state.app.sb.from('job_posts').select('id, job_title, department_name, team_name, employment_type, status, public_code').eq('company_id', state.app.companyId).order('created_at', { ascending: false }).limit(100);
    if (error) {
      console.error('Contract jobs load failed:', error);
      if (host) host.innerHTML = '<div class="hiring-empty">Job posts could not be loaded. Refresh the page and try again.</div>';
      return;
    }
    state.jobs = data || [];
    renderJobs();
  }
  function renderJobs() {
    const host = document.getElementById('contract-job-cards');
    if (!host) return;
    if (!state.jobs.length) { host.innerHTML = '<div class="hiring-empty">No job posts yet.</div>'; return; }
    const rows = state.jobs.map(job => {
      const contract = state.jobContracts[job.id];
      const pages = Array.isArray(contract?.pages) ? contract.pages.filter(page => !pageIsBlank(Array.isArray(page) ? page : [])) : [];
      const changed = contract?.updatedAt ? new Date(contract.updatedAt) : null; const lastChanged = changed && !Number.isNaN(changed.getTime()) ? changed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
      return `<tr><td><strong>${esc(job.job_title)}</strong></td><td><code>${esc(job.public_code || 'Draft')}</code></td><td>${esc(lastChanged)}</td><td>${pages.length || '-'}</td><td><div class="contract-job-actions"><button type="button" aria-label="View ${esc(job.job_title)} contract" title="View contract" onclick="BKHiringContracts.openJobContract('${esc(job.id)}', true)"><svg viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg></button><button type="button" aria-label="Edit ${esc(job.job_title)} contract" title="Edit contract" onclick="BKHiringContracts.openJobContract('${esc(job.id)}', false)"><svg viewBox="0 0 24 24"><path d="m4 16-.8 4.8L8 20l11-11-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/></svg></button></div></td></tr>`;
    }).join('');
    host.innerHTML = `<table class="contract-jobs-table"><thead><tr><th>Job Title</th><th>Job Code</th><th>Last Changed</th><th>Pages</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  async function loadSnippets() {
    const { data, error } = await state.app.sb.from('global_settings').select('key,value').eq('company_id', state.app.companyId).in('key', [SETTINGS_KEY, JOB_CONTRACTS_KEY, TEMPLATES_KEY]).limit(3);
    if (error) {
      console.error('Contract snippets load failed:', error);
      state.app.showToast('Contract snippets could not be loaded. Refresh the page and try again.', true);
    }
    const settings = Object.fromEntries((data || []).map(row => [row.key, row.value]));
    const items = Array.isArray(settings[SETTINGS_KEY]?.items) ? settings[SETTINGS_KEY].items : [];
    state.snippets = items.slice(0, 100).map(normalizeSnippet).filter(item => item.title && item.pages.some(page => page.length));
    state.jobContracts = settings[JOB_CONTRACTS_KEY] && typeof settings[JOB_CONTRACTS_KEY] === 'object' ? settings[JOB_CONTRACTS_KEY] : {};
    window.BKContractTemplates?.init(state.app, settings[TEMPLATES_KEY], openTemplateEditor, loadTemplateIntoJob);
    renderJobs();
    renderSnippets();
  }
  function renderSnippets() {
    const host = document.getElementById('contract-snippet-cards');
    if (!host) return;
    if (!state.snippets.length) { host.innerHTML = '<div class="hiring-empty">No clauses yet. Create a reusable NDA, non-compete, or other contract clause.</div>'; return; }
    const sorted = [...state.snippets].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
    host.innerHTML = sorted.map(item => `<article class="contract-list-card snippet-card"><div class="clause-card-content"><h3>${esc(item.title)}</h3></div><div class="clause-card-actions"><button type="button" aria-label="Edit ${esc(item.title)}" title="Edit clause" onclick="BKHiringContracts.openBuilder('${esc(item.id)}')"><svg viewBox="0 0 24 24"><path d="m4 16-.8 4.8L8 20l11-11-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/></svg></button><button class="delete" type="button" aria-label="Delete ${esc(item.title)}" title="Delete clause" onclick="BKHiringContracts.openDelete('${esc(item.id)}')"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5M14 11v5"/></svg></button></div></article>`).join('');
  }
  function openBuilder(id = '') {
    if (!state.templateReady) { state.app.showToast('The company contract template is still loading. Please try again in a moment.', true); return; }
    state.builderMode = 'clause';
    state.readOnly = false;
    state.activeJobId = null;
    const existing = state.snippets.find(item => item.id === id);
    state.editingId = existing?.id || null;
    state.pages = existing ? existing.pages.map(page => page.map(normalizeBlock)) : [[]];
    state.currentPage = 0;
    state.history = [];
    state.redoHistory = [];
    const title = document.getElementById('snippet-title');
    if (title) { title.value = existing?.title || ''; title.style.borderColor = ''; }
    const heading = document.getElementById('snippet-builder-title');
    if (heading) heading.textContent = existing ? 'Edit Contract Clause' : 'Create Contract Clause';
    document.getElementById('snippet-builder-description').hidden = false;
    document.querySelector('.snippet-title-field').hidden = false;
    const saveButton = document.getElementById('save-snippet-button');
    if (saveButton) { saveButton.hidden = false; saveButton.textContent = 'Save Clause'; }
    document.getElementById('save-job-template').hidden = true;
    document.getElementById('load-job-template').hidden = true;
    renderPreview();
    const modal = document.getElementById('snippet-builder-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    void modal.offsetHeight;
    modal.classList.add('open');
    setTimeout(() => title?.focus(), 100);
  }

  function openJobContract(id, readOnly = false) {
    if (!state.templateReady) { state.app.showToast('The company contract template is still loading. Please try again in a moment.', true); return; }
    const job = state.jobs.find(item => item.id === id);
    if (!job) return;
    const stored = state.jobContracts[id];
    let bodyPages = (Array.isArray(stored?.pages) && stored.pages.length ? stored.pages : [[]]).map(page => (Array.isArray(page) ? page : []).map(normalizeBlock));
    if (readOnly) bodyPages = bodyPages.filter(page => !pageIsBlank(page));
    state.builderMode = 'job';
    state.readOnly = Boolean(readOnly);
    state.activeJobId = id;
    state.editingId = null;
    state.pages = [[], ...bodyPages];
    state.currentPage = 0;
    state.history = [];
    state.redoHistory = [];
    document.getElementById('snippet-builder-title').textContent = `${readOnly ? 'View' : 'Edit'} Contract — ${job.job_title}`;
    document.getElementById('snippet-builder-description').hidden = Boolean(readOnly);
    document.querySelector('.snippet-title-field').hidden = true;
    const button = document.getElementById('save-snippet-button');
    if (button) { button.hidden = readOnly; button.textContent = 'Save Contract'; }
    document.getElementById('save-job-template').hidden = Boolean(readOnly);
    document.getElementById('load-job-template').hidden = Boolean(readOnly);
    openModal();
  }

  function openTemplateEditor(item = null) {
    if (!state.templateReady) return;
    state.builderMode = 'template'; state.readOnly = false; state.activeJobId = null; state.editingId = item?.id || null;
    state.pages = [[], ...((item?.pages?.length ? item.pages : [[]]).map(page => page.map(normalizeBlock)))];
    state.currentPage = 0; state.history = []; state.redoHistory = [];
    const title = document.getElementById('snippet-title');
    title.value = item?.title || ''; title.style.borderColor = '';
    document.getElementById('snippet-builder-title').textContent = item ? 'Edit Contract Template' : 'Create Contract Template';
    document.getElementById('snippet-builder-description').hidden = false;
    document.querySelector('.snippet-title-field').hidden = false;
    document.getElementById('save-job-template').hidden = true;
    document.getElementById('load-job-template').hidden = true;
    const button = document.getElementById('save-snippet-button'); button.hidden = false; button.textContent = 'Save Template';
    openModal();
  }

  function saveAsTemplate() {
    if (state.builderMode !== 'job' || state.readOnly) return;
    syncCurrentPage();
    const pages = state.pages.slice(1).filter(page => !pageIsBlank(page));
    window.BKContractTemplates?.askName(JSON.parse(JSON.stringify(pages)));
  }

  function loadTemplateIntoJob(item) {
    if (state.builderMode !== 'job' || state.readOnly) return;
    const sources = new Map();
    state.pages = [[], ...item.pages.map(page => page.map(block => { const key = block.sourceId || block.id; if (!sources.has(key)) sources.set(key, uid()); return normalizeBlock({ ...block, id: uid(), sourceId: sources.get(key) }); }))];
    state.currentPage = 0; state.history = []; state.redoHistory = []; renderPreview();
  }

  function openModal() {
    renderPreview();
    const modal = document.getElementById('snippet-builder-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    void modal.offsetHeight;
    modal.classList.add('open');
  }

  function closeBuilder() {
    const modal = document.getElementById('snippet-builder-modal');
    if (!modal) return;
    modal.classList.remove('open');
    setTimeout(() => { modal.style.display = 'none'; }, 150);
  }

  function openDelete(id) {
    if (!state.snippets.some(item => item.id === id)) return;
    state.deletingId = id;
    const modal = document.getElementById('clause-delete-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    void modal.offsetHeight;
    modal.classList.add('open');
  }

  function closeDelete() {
    const modal = document.getElementById('clause-delete-modal');
    if (!modal) return;
    modal.classList.remove('open');
    setTimeout(() => { modal.style.display = 'none'; state.deletingId = null; }, 150);
  }

  async function persist(items, failureMessage) {
    const { error } = await state.app.sb.from('global_settings').upsert({ company_id: state.app.companyId, key: SETTINGS_KEY, value: { items } }, { onConflict: 'company_id,key' });
    if (error) { console.error(failureMessage, error); return false; }
    state.snippets = items;
    renderSnippets();
    return true;
  }

  async function confirmDelete() {
    if (!state.deletingId || state.saving) return;
    state.saving = true;
    const items = state.snippets.filter(item => item.id !== state.deletingId);
    const saved = await persist(items, 'Contract clause delete failed:');
    state.saving = false;
    if (!saved) { state.app.showToast('The clause could not be deleted. Please try again.', true); return; }
    closeDelete();
    state.app.showToast('Contract clause deleted.');
  }

  function addBlock(type, index = null) {
    if (state.readOnly || isCoverPage()) return;
    const blocks = currentBlocks();
    if (!Object.hasOwn(BLOCK_TYPES, type) || blocks.length >= 40) return;
    const target = Number.isInteger(index) ? Math.max(0, Math.min(index, blocks.length)) : blocks.length;
    recordHistory();
    blocks.splice(target, 0, normalizeBlock({ type }));
    renderPreview();
  }

  function beginDrag() {
    state.dropIndex = currentBlocks().length;
    document.querySelector('.snippet-template-content')?.classList.add('drag-active');
  }

  function dragNew(event, type) { state.draggedBlock = null; beginDrag(); event.dataTransfer.setData('text/plain', `new:${type}`); event.dataTransfer.effectAllowed = 'copy'; }
  function dragClause(event, id) { state.draggedBlock = null; beginDrag(); event.dataTransfer.setData('text/plain', `clause:${id}`); event.dataTransfer.effectAllowed = 'copy'; }
  function dragExisting(event, id) { state.draggedBlock = id; beginDrag(); event.dataTransfer.setData('text/plain', `existing:${id}`); event.dataTransfer.effectAllowed = 'move'; }
  function endDrag() {
    state.draggedBlock = null;
    state.dropIndex = null;
    document.querySelector('.snippet-template-content')?.classList.remove('drag-active');
    document.querySelector('.snippet-insert-line')?.remove();
  }

  function allowDrop(event) {
    if (state.readOnly || isCoverPage()) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = state.draggedBlock ? 'move' : 'copy';
    const content = event.currentTarget.querySelector('.snippet-template-content');
    if (!content) return;
    content.classList.add('drag-active');
    const blocks = [...content.querySelectorAll('.snippet-preview-block')];
    const target = event.target.closest('.snippet-preview-block');
    let index = blocks.length;
    if (target) {
      const targetIndex = blocks.indexOf(target);
      index = event.clientY < target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2 ? targetIndex : targetIndex + 1;
    } else if (blocks.length && event.clientY < blocks[0].getBoundingClientRect().top) {
      index = 0;
    }
    state.dropIndex = index;
    let line = content.querySelector('.snippet-insert-line');
    if (index === blocks.length) { line?.remove(); return; }
    if (!line) { line = document.createElement('div'); line.className = 'snippet-insert-line'; }
    const reference = blocks[index] || content.querySelector('.snippet-drop-guide');
    content.insertBefore(line, reference || null);
  }
  function drop(event) {
    if (state.readOnly || isCoverPage()) return;
    event.preventDefault();
    const payload = event.dataTransfer.getData('text/plain');
    const insertionIndex = Number.isInteger(state.dropIndex) ? state.dropIndex : currentBlocks().length;
    if (payload.startsWith('new:')) addBlock(payload.slice(4), insertionIndex);
    else if (payload.startsWith('clause:')) loadClause(payload.slice(7), insertionIndex);
    else if (payload.startsWith('existing:')) {
      const id = payload.slice(9);
      const blocks = currentBlocks();
      const from = blocks.findIndex(block => block.id === id);
      let to = insertionIndex;
      if (from >= 0) {
        recordHistory();
        const [block] = blocks.splice(from, 1);
        if (from < to) to -= 1;
        blocks.splice(Math.max(0, Math.min(to, blocks.length)), 0, block);
      }
      endDrag();
      renderPreview();
    }
    endDrag();
  }

  function updateBlock(id, element) {
    const block = currentBlocks().find(item => item.id === id);
    if (block) block.html = sanitizeHtml(element.innerHTML);
  }

  function snapshot() { return JSON.stringify({ pages: state.pages, currentPage: state.currentPage }); }

  function recordHistory() {
    const value = snapshot();
    if (state.history.at(-1) !== value) state.history.push(value);
    if (state.history.length > 50) state.history.shift();
    state.redoHistory = [];
  }

  function restoreSnapshot(value) {
    const parsed = JSON.parse(value);
    state.pages = parsed.pages.map(page => page.map(normalizeBlock));
    state.currentPage = Math.min(parsed.currentPage, state.pages.length - 1);
    renderPreview();
  }

  function undo() {
    const value = state.history.pop();
    if (!value) return;
    state.redoHistory.push(snapshot());
    restoreSnapshot(value);
  }

  function redo() {
    const value = state.redoHistory.pop();
    if (!value) return;
    state.history.push(snapshot());
    restoreSnapshot(value);
  }

  function builderShortcut(event) {
    if (event.defaultPrevented || state.readOnly || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
    const modal = document.getElementById('snippet-builder-modal');
    if (!modal?.classList.contains('open')) return;
    event.preventDefault();
    if (event.shiftKey) redo(); else undo();
  }

  function beforeInput(event) {
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      event.preventDefault();
      if (event.inputType === 'historyUndo') undo(); else redo();
      return;
    }
    if (event.inputType !== 'insertFromPaste') recordHistory();
  }

  function compactPages(startPage) {
    const originPage = Math.min(startPage, state.pages.length - 1);
    let pageIndex = Math.max(0, startPage);
    while (pageIndex < state.pages.length - 1) {
      const page = state.pages[pageIndex];
      const nextPage = state.pages[pageIndex + 1];
      while (nextPage.length) {
        const candidate = nextPage.shift();
        const preceding = page.at(-1);
        const rejoinsSource = preceding && preceding.sourceId === candidate.sourceId && preceding.type === candidate.type;
        if (rejoinsSource) {
          page.pop();
          candidate.id = preceding.id;
          candidate.html = joinBlockHtml(preceding, candidate);
        }
        page.push(candidate);
        state.currentPage = pageIndex;
        renderPreview();
        if (pageOverflows()) {
          const editable = document.querySelector(`#snippet-preview [data-block-id="${CSS.escape(candidate.id)}"] [contenteditable="true"]`);
          const canSplit = !['title', 'header1', 'header2', 'signatures'].includes(candidate.type);
          const overflowHtml = canSplit && editable ? (['list', 'numbered'].includes(candidate.type) ? fitListBlock(candidate, editable) : fitTextBlock(candidate, editable)) : null;
          if (overflowHtml && plainText(candidate.html)) nextPage.unshift(normalizeBlock({ type: candidate.type, html: overflowHtml, sourceId: candidate.sourceId }));
          else {
            page.pop();
            if (rejoinsSource) {
              page.push(preceding);
              nextPage.unshift(normalizeBlock({ ...candidate, id: uid(), html: splitJoinedBlockHtml(preceding, candidate) }));
            } else nextPage.unshift(candidate);
          }
          renderPreview();
          break;
        }
      }
      if (!nextPage.length) state.pages.splice(pageIndex + 1, 1);
      else pageIndex += 1;
    }
    state.currentPage = Math.min(originPage, state.pages.length - 1);
    renderPreview();
  }

  function removeBlock(id) {
    if (state.readOnly || isCoverPage()) return;
    const pageIndex = state.currentPage;
    const sourceId = currentBlocks().find(block => block.id === id)?.sourceId;
    recordHistory();
    state.pages = state.pages.map(page => page.filter(block => sourceId ? block.sourceId !== sourceId : block.id !== id));
    compactPages(pageIndex);
  }

  function joinBlockHtml(first, second) {
    if (['list', 'numbered'].includes(first.type)) return sanitizeHtml(`${first.html}${second.html}`);
    const separator = /(?:\s|<br\s*\/?>)$/i.test(first.html) || /^(?:\s|<br\s*\/?>)/i.test(second.html) ? '' : ' ';
    return sanitizeHtml(`${first.html}${separator}${second.html}`);
  }

  function splitJoinedBlockHtml(first, joined) {
    const firstLength = plainText(first.html).length;
    return splitHtmlAtOffset(joined.html, firstLength).after;
  }

  function blockMarkup(block) {
    const locked = state.readOnly;
    const handle = locked ? '' : `<button class="snippet-drag-handle" type="button" draggable="true" aria-label="Drag ${esc(BLOCK_TYPES[block.type])}" title="Drag to reorder" ondragstart="BKHiringContracts.dragExisting(event, '${esc(block.id)}')" ondragend="BKHiringContracts.endDrag()"><svg viewBox="0 0 12 20" aria-hidden="true"><circle cx="3" cy="3" r="1.3"/><circle cx="9" cy="3" r="1.3"/><circle cx="3" cy="10" r="1.3"/><circle cx="9" cy="10" r="1.3"/><circle cx="3" cy="17" r="1.3"/><circle cx="9" cy="17" r="1.3"/></svg></button>`;
    const remove = locked ? '' : `<button class="snippet-remove-block" type="button" aria-label="Remove block" title="Remove block" onclick="BKHiringContracts.removeBlock('${esc(block.id)}')"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5M14 11v5"/></svg></button>`;
    if (block.type === 'signatures') return `<div class="snippet-preview-block snippet-signatures-block" data-block-id="${esc(block.id)}">${handle}${renderPersonalizationPills(window.BKHiringContractTemplate?.renderSignatures() || '')}${remove}</div>`;
    const content = sanitizeHtml(block.html);
    const tag = block.type === 'title' ? 'h1' : block.type === 'header1' ? 'h2' : block.type === 'header2' ? 'h3' : block.type === 'list' ? 'ul' : block.type === 'numbered' ? 'ol' : 'p';
    const isList = block.type === 'list' || block.type === 'numbered';
    const innerContent = renderPersonalizationPills(content);
    const inner = isList && innerContent ? (/<li(?:\s|>)/i.test(innerContent) ? innerContent : `<li>${innerContent}</li>`) : innerContent;
    const placeholder = block.type === 'title' ? 'Document title' : block.type === 'header1' ? 'Primary section heading' : block.type === 'header2' ? 'Section heading' : block.type === 'paragraph' ? 'Write contract text here.' : 'List item';
    return `<div class="snippet-preview-block" data-block-id="${esc(block.id)}">${handle}<${tag} contenteditable="${locked ? 'false' : 'true'}" spellcheck="true" data-placeholder="${placeholder}" ${isList ? 'onfocus="BKHiringContracts.ensureListItem(event)"' : ''} onkeydown="BKHiringContracts.editorKeydown(event, '${esc(block.id)}', '${block.type}')" onbeforeinput="BKHiringContracts.beforeInput(event)" onpaste="BKHiringContracts.pastePlainText(event, '${esc(block.id)}')" oninput="BKHiringContracts.editorInput(event, '${esc(block.id)}')">${inner}</${tag}>${remove}</div>`;
  }

  function renderPreview() {
    const host = document.getElementById('snippet-preview');
    if (!host) return;
    const card = document.querySelector('.snippet-builder-card');
    const cover = isCoverPage();
    card?.classList.toggle('is-locked-page', cover || state.readOnly);
    card?.classList.toggle('is-readonly', state.readOnly);
    const clauseList = document.getElementById('snippet-clause-list');
    if (clauseList) clauseList.innerHTML = state.snippets.length ? [...state.snippets].sort((a, b) => a.title.localeCompare(b.title)).map(item => `<button type="button" draggable="true" ondragstart="BKHiringContracts.dragClause(event, '${esc(item.id)}')" ondragend="BKHiringContracts.endDrag()" onclick="BKHiringContracts.loadClause('${esc(item.id)}')" title="Drag or click to add ${esc(item.title)}"><svg viewBox="0 0 12 20" aria-hidden="true"><circle cx="3" cy="3" r="1.3"/><circle cx="9" cy="3" r="1.3"/><circle cx="3" cy="10" r="1.3"/><circle cx="9" cy="10" r="1.3"/><circle cx="3" cy="17" r="1.3"/><circle cx="9" cy="17" r="1.3"/></svg><span>${esc(item.title)}</span></button>`).join('') : '<small>No clauses saved yet.</small>';
    const clauseLoader = document.getElementById('snippet-clause-loader');
    if (clauseLoader) clauseLoader.hidden = state.builderMode === 'clause' || cover || state.readOnly;
    if (cover) {
      host.innerHTML = renderPersonalizationPills(window.BKHiringContractTemplate?.renderCoverPage() || '');
    } else {
    const blocks = currentBlocks();
    const editor = `${blocks.length ? blocks.map(blockMarkup).join('') : '<div class="snippet-drop-empty"><strong>Build your clause</strong><span>Drag Header, Paragraph, List, or Numbered List blocks here.</span></div>'}<div class="snippet-drop-guide">Drop your blocks here</div>`;
    host.innerHTML = window.BKHiringContractTemplate?.renderBodyPage(`<div class="snippet-template-content">${editor}</div>`) || editor;
    }
    const status = document.getElementById('snippet-page-status');
    const previous = document.getElementById('snippet-page-previous');
    const next = document.getElementById('snippet-page-next');
    const insert = document.getElementById('snippet-insert-page');
    if (status) status.textContent = `Page ${state.currentPage + 1} of ${state.pages.length}`;
    if (previous) previous.disabled = state.currentPage === 0;
    if (insert) { insert.hidden = state.readOnly; insert.disabled = state.currentPage === state.pages.length - 1; }
    if (next) {
      const atEnd = state.currentPage === state.pages.length - 1;
      const canAdd = atEnd && !state.readOnly;
      next.disabled = atEnd && !canAdd;
      next.classList.toggle('snippet-add-page', canAdd);
      next.setAttribute('aria-label', canAdd ? 'Add page' : 'Next page');
      next.title = canAdd ? 'Add page' : 'Next page';
      next.innerHTML = canAdd ? '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>' : '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>';
    }
    const undoButton = document.getElementById('snippet-undo');
    const redoButton = document.getElementById('snippet-redo');
    if (undoButton) undoButton.disabled = !state.history.length;
    if (redoButton) redoButton.disabled = !state.redoHistory.length;
  }

  function syncCurrentPage() {
    document.querySelectorAll('#snippet-preview [contenteditable="true"]').forEach(element => updateBlock(element.closest('[data-block-id]').dataset.blockId, element));
  }

  function changePage(direction) {
    const nextPage = state.currentPage + direction;
    if (nextPage < 0 || nextPage >= state.pages.length) return;
    syncCurrentPage();
    state.currentPage = nextPage;
    renderPreview();
  }

  function nextPage() {
    if (state.currentPage < state.pages.length - 1) changePage(1);
    else if (!state.readOnly) addPage();
  }
  function insertPage() {
    if (state.readOnly || state.currentPage >= state.pages.length - 1) return;
    syncCurrentPage(); recordHistory(); state.pages.splice(state.currentPage + 1, 0, []); state.currentPage += 1; renderPreview();
  }

  function addPage() {
    if (state.readOnly) return;
    syncCurrentPage();
    recordHistory();
    state.pages.push([]);
    state.currentPage = state.pages.length - 1;
    renderPreview();
  }

  function loadClause(id, insertionIndex = null) {
    if (!id || state.readOnly || state.builderMode !== 'job' || state.currentPage === 0) return;
    const clause = state.snippets.find(item => item.id === id);
    if (!clause) return;
    recordHistory();
    const sourceIds = new Map();
    const copies = clause.pages.map(page => page.map(block => {
      const originalSource = block.sourceId || block.id;
      if (!sourceIds.has(originalSource)) sourceIds.set(originalSource, uid());
      return normalizeBlock({ ...block, id: uid(), sourceId: sourceIds.get(originalSource) });
    }));
    const firstPage = copies.shift() || [];
    const target = Number.isInteger(insertionIndex) ? Math.max(0, Math.min(insertionIndex, currentBlocks().length)) : currentBlocks().length;
    currentBlocks().splice(target, 0, ...firstPage);
    if (copies.length) state.pages.splice(state.currentPage + 1, 0, ...copies);
    renderPreview();
    const last = firstPage.at(-1);
    if (last && pageOverflows()) paginateOverflow(last.id);
  }

  function format(command) {
    if (state.readOnly || isCoverPage()) return;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const anchor = selection?.anchorNode;
    const anchorElement = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    const selectedPills = range ? [...document.querySelectorAll('#snippet-preview .personalization-pill')].filter(pill => range.intersectsNode(pill)) : [];
    const editable = anchorElement?.closest('[contenteditable="true"]') || selectedPills[0]?.closest('[contenteditable="true"]');
    const block = editable?.closest('[data-block-id]');
    if (!editable || !block || block.querySelector('h1, h2, h3')) {
      state.app.showToast('Select text in a paragraph or list before formatting.', true);
      return;
    }
    recordHistory();
    if (selectedPills.length && selectedPills.map(pill => pill.textContent).join('').replace(/\s/g, '') === selection.toString().replace(/\s/g, '')) {
      const tag = command === 'bold' ? 'STRONG' : command === 'italic' ? 'EM' : 'U';
      const remove = selectedPills.every(pill => pill.parentElement?.tagName === tag);
      selectedPills.forEach(pill => {
        if (remove) pill.parentElement.replaceWith(pill);
        else if (pill.parentElement?.tagName !== tag) { const wrapper = document.createElement(tag.toLowerCase()); pill.replaceWith(wrapper); wrapper.appendChild(pill); }
      });
      updateBlock(block.dataset.blockId, editable);
      updateFormatToolbar();
      return;
    }
    document.execCommand(command, false);
    updateBlock(block.dataset.blockId, editable);
    editable.focus();
    updateFormatToolbar();
  }

  function updateFormatToolbar() {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const anchor = selection?.anchorNode;
    const anchorElement = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    const selectedPills = range ? [...document.querySelectorAll('#snippet-preview .personalization-pill')].filter(pill => range.intersectsNode(pill)) : [];
    const editable = anchorElement?.closest('[contenteditable="true"]') || selectedPills[0]?.closest('[contenteditable="true"]');
    const inListItem = Boolean(editable?.matches('ul, ol') && anchorElement?.closest('li'));
    document.querySelectorAll('.snippet-indent-button').forEach(button => { button.hidden = !inListItem || state.readOnly; });
    const tags = { bold: 'STRONG', italic: 'EM', underline: 'U' };
    Object.entries(tags).forEach(([command, tag]) => {
      const button = document.getElementById(`snippet-format-${command}`);
      if (!button) return;
      const pillActive = selectedPills.length && selectedPills.every(pill => pill.closest(tag.toLowerCase()));
      const active = Boolean(editable && (pillActive || document.queryCommandState(command)));
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function indentList(command) {
    if (!['indent', 'outdent'].includes(command) || state.readOnly) return;
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const anchorElement = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    const item = anchorElement?.closest('li');
    const editable = item?.closest('[contenteditable="true"]');
    if (!item || !editable || !editable.matches('ul, ol')) return;
    recordHistory();
    document.execCommand(command, false);
    const block = editable.closest('[data-block-id]');
    if (block) updateBlock(block.dataset.blockId, editable);
    editable.focus();
    updateFormatToolbar();
  }

  function editorInput(event, id) {
    updateBlock(id, event.currentTarget);
    updateFormatToolbar();
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || range.startOffset < 2 || node.data.slice(range.startOffset - 2, range.startOffset) !== '{{') return;
    const replacement = range.cloneRange();
    replacement.setStart(node, range.startOffset - 2);
    state.personalizationRange = replacement;
    openPersonalizationAtRange(replacement);
  }

  function positionPersonalizationMenu(rect) {
    const menu = document.getElementById('snippet-personalization-menu');
    const card = document.querySelector('.snippet-builder-card');
    if (!menu || !card) return;
    const cardRect = card.getBoundingClientRect();
    menu.hidden = false;
    menu.style.left = `${Math.max(12, Math.min(rect.left - cardRect.left, cardRect.width - 250))}px`;
    menu.style.top = `${Math.max(12, rect.bottom - cardRect.top + 6)}px`;
  }

  function openPersonalizationAtRange(range) {
    const rect = range.getBoundingClientRect();
    positionPersonalizationMenu(rect);
  }

  function togglePersonalization(event, button) {
    event.stopPropagation();
    const menu = document.getElementById('snippet-personalization-menu');
    if (!menu) return;
    if (!menu.hidden) { menu.hidden = true; return; }
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const rangeNode = range?.startContainer;
    const rangeElement = rangeNode?.nodeType === Node.ELEMENT_NODE ? rangeNode : rangeNode?.parentElement;
    const editable = rangeElement?.closest('[contenteditable="true"]');
    if (!range || !editable || !editable.contains(range.endContainer)) {
      state.app.showToast('Place the caret inside a contract block first.', true);
      return;
    }
    state.personalizationRange = range.cloneRange();
    positionPersonalizationMenu(button.getBoundingClientRect());
  }

  function insertPersonalization(token) {
    if (!PERSONALIZATION_FIELDS.some(([value]) => value === token) || !state.personalizationRange) return;
    recordHistory();
    const range = state.personalizationRange;
    range.deleteContents();
    const pill = document.createElement('span');
    pill.className = 'personalization-pill';
    pill.contentEditable = 'false';
    pill.dataset.token = token;
    pill.textContent = `{{${token}}}`;
    range.insertNode(pill);
    range.setStartAfter(pill);
    const caretMarker = document.createTextNode('\u200b');
    range.insertNode(caretMarker);
    range.setStartAfter(caretMarker);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const editable = pill.parentElement.closest('[contenteditable="true"]');
    const block = editable?.closest('[data-block-id]');
    if (editable && block) updateBlock(block.dataset.blockId, editable);
    document.getElementById('snippet-personalization-menu').hidden = true;
    state.personalizationRange = null;
    editable?.focus();
  }

  function pastePlainText(event, id) {
    event.preventDefault();
    recordHistory();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !event.currentTarget.contains(range.startContainer) || !event.currentTarget.contains(range.endContainer)) selectEditorContents(event.currentTarget);
    const text = event.clipboardData?.getData('text/plain') || '';
    if (['UL', 'OL'].includes(event.currentTarget.tagName) && /[\r\n]/.test(text)) {
      const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => line.replace(/^(?:[•*-]|\d+[.)])\s+/, ''));
      const activeRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const rangeNode = activeRange?.startContainer;
      const rangeElement = rangeNode?.nodeType === Node.ELEMENT_NODE ? rangeNode : rangeNode?.parentElement;
      let currentItem = rangeElement?.closest('li');
      if (!currentItem || !event.currentTarget.contains(currentItem)) currentItem = null;
      if (currentItem && activeRange) {
        activeRange.deleteContents();
        activeRange.insertNode(document.createTextNode(lines.shift() || ''));
      }
      let insertionPoint = currentItem;
      lines.forEach(line => {
        const item = document.createElement('li');
        item.textContent = line;
        if (insertionPoint) insertionPoint.after(item); else event.currentTarget.appendChild(item);
        insertionPoint = item;
      });
      if (insertionPoint) {
        const caret = document.createRange();
        caret.selectNodeContents(insertionPoint);
        caret.collapse(false);
        selection.removeAllRanges();
        selection.addRange(caret);
      }
      updateBlock(id, event.currentTarget);
      paginateOverflow(id);
      return;
    }
    document.execCommand('insertText', false, text);
    updateBlock(id, event.currentTarget);
    paginateOverflow(id);
  }

  function paragraphKeydown(event, id) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    recordHistory();
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!event.currentTarget.contains(range.commonAncestorContainer)) return;
    range.deleteContents();
    const lineBreak = document.createElement('br');
    const caretMarker = document.createTextNode('\u200b');
    range.insertNode(caretMarker);
    range.insertNode(lineBreak);
    range.setStartAfter(caretMarker);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    updateBlock(id, event.currentTarget);
  }

  function editorKeydown(event, id, type) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      selectEditorContents(event.currentTarget);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      const commands = { b: 'bold', i: 'italic', u: 'underline' };
      const command = commands[event.key.toLowerCase()];
      if (command) { event.preventDefault(); format(command); return; }
    }
    if (type === 'paragraph') paragraphKeydown(event, id);
  }

  function selectEditorContents(element) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function ensureListItem(event) {
    if (event.currentTarget.children.length || event.currentTarget.textContent.trim()) return;
    const item = document.createElement('li');
    item.appendChild(document.createElement('br'));
    event.currentTarget.appendChild(item);
  }

  function pageOverflows() {
    const content = document.querySelector('#snippet-preview .contract-body-content');
    return Boolean(content && content.scrollHeight > content.clientHeight + 1);
  }

  function continuationPage(pageIndex) {
    if (!state.pages[pageIndex + 1]) state.pages.push([]);
    return state.pages[pageIndex + 1];
  }

  function fitTextBlock(block, editable) {
    const originalHtml = sanitizeHtml(editable.innerHTML);
    const plain = editable.textContent || '';
    const boundaries = [...plain.matchAll(/\S+\s*/g)].map(match => match.index + match[0].length);
    if (boundaries.length < 2) return null;
    let low = 1;
    let high = boundaries.length - 1;
    let fit = 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      editable.innerHTML = splitHtmlAtOffset(originalHtml, boundaries[middle - 1]).before;
      if (pageOverflows()) high = middle - 1;
      else { fit = middle; low = middle + 1; }
    }
    const split = splitHtmlAtOffset(originalHtml, boundaries[fit - 1]);
    editable.innerHTML = split.before;
    if (pageOverflows()) { editable.innerHTML = originalHtml; return null; }
    block.html = split.before;
    return split.after;
  }

  function splitHtmlAtOffset(html, offset) {
    const container = document.createElement('div');
    container.innerHTML = sanitizeHtml(html);
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let total = 0;
    while (walker.nextNode()) {
      nodes.push({ node: walker.currentNode, start: total });
      total += walker.currentNode.data.length;
    }
    const boundary = nodes.find(item => offset <= item.start + item.node.data.length) || nodes.at(-1);
    if (!boundary) return { before: '', after: '' };
    const localOffset = Math.max(0, Math.min(offset - boundary.start, boundary.node.data.length));
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(container);
    beforeRange.setEnd(boundary.node, localOffset);
    const afterRange = document.createRange();
    afterRange.selectNodeContents(container);
    afterRange.setStart(boundary.node, localOffset);
    const beforeHost = document.createElement('div');
    const afterHost = document.createElement('div');
    beforeHost.appendChild(beforeRange.cloneContents());
    afterHost.appendChild(afterRange.cloneContents());
    return { before: sanitizeHtml(beforeHost.innerHTML).trim(), after: sanitizeHtml(afterHost.innerHTML).trim() };
  }

  function fitListBlock(block, editable) {
    const items = [...editable.children].filter(item => item.tagName === 'LI' && item.textContent.trim());
    if (items.length < 2) return null;
    const overflow = [];
    while (items.length > 1 && pageOverflows()) {
      const item = items.pop();
      overflow.unshift(item.outerHTML);
      item.remove();
    }
    block.html = sanitizeHtml(editable.innerHTML);
    return overflow.length ? overflow.join('') : null;
  }

  function paginateOverflow(blockId) {
    const originPage = state.currentPage;
    const originBlockId = blockId;
    let pageIndex = state.currentPage;
    let activeId = blockId;
    while (pageIndex <= state.pages.length) {
      state.currentPage = pageIndex;
      renderPreview();
      if (!pageOverflows()) break;
      const page = state.pages[pageIndex];
      const blockIndex = page.findIndex(block => block.id === activeId);
      const block = page[blockIndex];
      let editable = document.querySelector(`#snippet-preview [data-block-id="${CSS.escape(activeId)}"] [contenteditable="true"]`);
      if (!block || !editable) break;
      const trailingBlocks = page.splice(blockIndex + 1);
      let nextPage = trailingBlocks.length ? continuationPage(pageIndex) : null;
      if (trailingBlocks.length) {
        nextPage.unshift(...trailingBlocks);
        renderPreview();
        editable = document.querySelector(`#snippet-preview [data-block-id="${CSS.escape(activeId)}"] [contenteditable="true"]`);
        if (!pageOverflows()) break;
      }
      const canSplit = !['title', 'header1', 'header2', 'signatures'].includes(block.type);
      const overflowHtml = canSplit ? (['list', 'numbered'].includes(block.type) ? fitListBlock(block, editable) : fitTextBlock(block, editable)) : null;
      if (!overflowHtml) break;
      const continuation = normalizeBlock({ type: block.type, html: overflowHtml, sourceId: block.sourceId });
      nextPage ||= continuationPage(pageIndex);
      nextPage.unshift(continuation);
      activeId = continuation.id;
      pageIndex += 1;
    }
    compactPages(originPage);
    state.currentPage = originPage;
    renderPreview();
    requestAnimationFrame(() => {
      const editable = document.querySelector(`#snippet-preview [data-block-id="${CSS.escape(originBlockId)}"] [contenteditable="true"]`);
      if (!editable) return;
      editable.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editable);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    });
  }

  async function save() {
    if (state.saving) return;
    if (state.builderMode === 'template') {
      syncCurrentPage();
      while (state.pages.length > 2 && pageIsBlank(state.pages.at(-1))) state.pages.pop();
      const title = document.getElementById('snippet-title'); const name = title.value.trim();
      if (!name) { title.style.borderColor = 'var(--danger)'; title.focus(); return; }
      const pages = state.pages.slice(1);
      if (!pages.some(page => !pageIsBlank(page))) { state.app.showToast('Add template content on page 2 before saving.', true); return; }
      const saved = await window.BKContractTemplates?.save(state.editingId, name, pages);
      if (saved) { closeBuilder(); state.app.showToast(state.editingId ? 'Contract template updated.' : 'Contract template saved.'); }
      return;
    }
    if (state.builderMode === 'job') {
      syncCurrentPage();
      while (state.pages.length > 2 && pageIsBlank(state.pages.at(-1))) state.pages.pop();
      const bodyPages = state.pages.slice(1);
      if (!bodyPages.some(page => !pageIsBlank(page))) { state.app.showToast('Add contract content on page 2 before saving.', true); return; }
      const job = state.jobs.find(item => item.id === state.activeJobId); const contractSettings = { key: JOB_CONTRACTS_KEY };
      const previous = state.jobContracts[state.activeJobId] || null;
      const changed = JSON.stringify(previous?.pages || []) !== JSON.stringify(bodyPages);
      state.jobContracts[state.activeJobId] = { pages: bodyPages, jobTitle: job?.job_title || '', updatedAt: changed || !previous?.updatedAt ? new Date().toISOString() : previous.updatedAt };
      const button = document.getElementById('save-snippet-button');
      state.saving = true;
      if (button) { button.disabled = true; button.textContent = 'Saving…'; }
      const { error, signatureError } = await window.BKHiringContractSignatures.persist(state.app, state.jobContracts, state.activeJobId, changed, previous, contractSettings.key);
      state.saving = false;
      if (button) { button.disabled = false; button.textContent = 'Save Contract'; }
      if (error) { console.error('Job contract save failed:', error); state.app.showToast('The contract could not be saved. Please try again.', true); return; }
      if (signatureError) { console.error('Changed contract signature invalidation failed:', signatureError); state.app.showToast('The contract was not changed because existing signatures could not be reset. Please try again.', true); return; }
      renderJobs();
      closeBuilder();
      state.app.showToast(changed && previous ? 'Contract updated. Existing employee signatures were reset.' : 'Job contract saved.');
      return;
    }
    const title = document.getElementById('snippet-title');
    const name = title?.value.trim() || '';
    if (!name) { title.style.borderColor = 'var(--danger)'; title.focus(); return; }
    syncCurrentPage();
    while (state.pages.length > 1 && pageIsBlank(state.pages.at(-1))) state.pages.pop();
    state.currentPage = Math.min(state.currentPage, state.pages.length - 1);
    if (!state.pages.some(page => !pageIsBlank(page))) { state.app.showToast('Add at least one content block before saving.', true); return; }
    const snippet = normalizeSnippet({ id: state.editingId || uid(), title: name, pages: state.pages, updatedAt: new Date().toISOString() });
    const items = state.editingId ? state.snippets.map(item => item.id === state.editingId ? snippet : item) : [snippet, ...state.snippets].slice(0, 100);
    const button = document.getElementById('save-snippet-button');
    state.saving = true;
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    const saved = await persist(items, 'Contract clause save failed:');
    state.saving = false;
    if (button) { button.disabled = false; button.textContent = 'Save Clause'; }
    if (!saved) { state.app.showToast('The clause could not be saved. Please try again.', true); return; }
    closeBuilder();
    state.app.showToast(state.editingId ? 'Contract clause updated.' : 'Contract clause saved.');
    state.editingId = null;
  }

  window.BKHiringContracts = { init, openBuilder, openJobContract, openTemplateEditor, saveAsTemplate, loadTemplateIntoJob, closeBuilder, openDelete, closeDelete, confirmDelete, addBlock, addPage, insertPage, changePage, nextPage, loadClause, dragNew, dragClause, dragExisting, endDrag, allowDrop, drop, updateBlock, editorInput, removeBlock, format, indentList, togglePersonalization, insertPersonalization, pastePlainText, paragraphKeydown, editorKeydown, beforeInput, ensureListItem, undo, redo, save };
})();

'use strict';

(function quotationBuilder() {
  const FONT_FAMILIES = { commissioner:'"Commissioner",sans-serif', merriweather:'"Merriweather",serif', montserrat:'"Montserrat",sans-serif', 'open-sans':'"Open Sans",sans-serif', roboto:'"Roboto",sans-serif', times:'"Times New Roman",Times,serif' };
  const CONTENT_TITLES = { 'scope-of-work':'Scope of work', exclusions:'Exclusions', 'project-schedule':'Project Schedule', warranty:'Warranty', 'payment-terms':'Payment Terms', 'quotation-validity':'Quotation Validity', acceptance:'Acceptance' };
  const RICH_TEXT_TAGS = new Set(['P','DIV','BR','STRONG','B','EM','I','U','MARK','UL','OL','LI']);
  const { FIELD_IDS, DEFAULTS } = window.BKQuotationDocument;
  function createCoverPage() { return { type:'cover', fields:{ ...DEFAULTS }, items:[{ description:'', model:'', qty:'1' }], pricing:{ subtotal:'', less:[{ label:'Less:', amount:'' }] } }; }
  function createContentPage() { return { type:'content', sections:[] }; }
  let activeContentEditor = null;
  let activeAcceptanceIndex = null;
  const firstPage = createCoverPage();
  const state = { companyId:null, companyProfile:{}, quotationNumber:'', documentDate:new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()), pages:[firstPage], currentPage:0, currentOverflow:0, items:firstPage.items, pricing:firstPage.pricing, dirty:false };
  const byId = id => document.getElementById(id);
  function markDirty() { state.dirty = true; }
  function markClean() { state.dirty = false; }

  function toast(message, type = 'success') {
    const container = byId('toast-container');
    if (!container) return;
    const item = document.createElement('div');
    item.className = `toast toast-${type}`;
    item.textContent = message;
    container.appendChild(item);
    setTimeout(() => item.remove(), 3500);
  }

  function fieldValue(id) { return String(byId(id)?.value || '').trim(); }
  function isProjectIncluded() { return byId('quotation-include-project')?.checked !== false; }
  function showValue(targetId, value) { const target = byId(targetId); if (target) target.textContent = value || '—'; }

  function isAllowedLogoSource(value) {
    if (!value) return false;
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) return true;
    try { return ['http:', 'https:'].includes(new URL(value, window.location.origin).protocol); }
    catch (_) { return false; }
  }

  function isAllowedHeaderImage(value) {
    return /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(value) && value.length <= 2.8 * 1024 * 1024;
  }

  function renderLogo() {
    const logo = byId('quotation-logo');
    const fallback = byId('quotation-logo-fallback');
    const status = byId('quotation-logo-status');
    if (fieldValue('quotation-branding-option') !== 'logo') { logo.hidden = true; fallback.hidden = true; return; }
    const source = String(state.companyProfile.logoDark || '').trim();
    fallback.textContent = state.companyProfile.companyName || 'Company';
    if (!isAllowedLogoSource(source)) {
      logo.hidden = true; fallback.hidden = false;
      status.textContent = source ? 'The configured dark logo format is unsupported.' : 'No dark logo is configured in Company Settings.';
      return;
    }
    logo.onload = () => {
      if (fieldValue('quotation-branding-option') !== 'logo') { logo.hidden = true; return; }
      logo.hidden = false; fallback.hidden = true; status.textContent = 'Using the dark logo from Company Settings.';
    };
    logo.onerror = () => { logo.hidden = true; fallback.hidden = false; status.textContent = 'The configured dark logo could not be loaded.'; };
    logo.src = source;
    if (logo.complete && logo.naturalWidth > 0) logo.onload();
  }

  function renderBranding() {
    const useHeaderImage = fieldValue('quotation-branding-option') === 'header-image';
    const storedSource = fieldValue('quotation-header-image');
    const source = isAllowedHeaderImage(storedSource) ? storedSource : '';
    const headerImage = byId('quotation-header-image-preview');
    byId('quotation-logo-controls').hidden = useHeaderImage;
    byId('quotation-header-image-controls').hidden = !useHeaderImage;
    byId('quotation-header-image-remove').hidden = !source;
    headerImage.hidden = true;
    headerImage.onload = () => {
      if (fieldValue('quotation-branding-option') !== 'header-image' || headerImage.src !== source) return;
      headerImage.hidden = false;
    };
    headerImage.onerror = () => { headerImage.hidden = true; byId('quotation-header-image-status').textContent = 'The header image could not be displayed.'; };
    if (useHeaderImage && source) headerImage.src = source;
    else headerImage.removeAttribute('src');
    renderLogo();
  }

  function renderPreview() {
    const familyKey = byId('quotation-font-family')?.value || DEFAULTS['quotation-font-family'];
    const logoSize = byId('quotation-logo-size')?.value || DEFAULTS['quotation-logo-size'];
    const alignment = byId('quotation-brand-alignment')?.value || DEFAULTS['quotation-brand-alignment'];
    const previewTitle = byId('preview-title');
    renderBranding();
    byId('quotation-logo').dataset.size = logoSize;
    byId('quotation-branding').dataset.alignment = alignment;
    previewTitle.style.fontFamily = FONT_FAMILIES[familyKey] || FONT_FAMILIES.commissioner;
    previewTitle.style.fontWeight = byId('quotation-font-weight')?.value || DEFAULTS['quotation-font-weight'];
    previewTitle.style.fontSize = `${byId('quotation-title-font-size')?.value || DEFAULTS['quotation-title-font-size']}px`;
    showValue('preview-title', fieldValue('quotation-title') || DEFAULTS['quotation-title']);
    showValue('preview-number', state.quotationNumber);
    showValue('preview-company', fieldValue('prepared-company'));
    showValue('preview-address', fieldValue('prepared-address'));
    showValue('preview-contact', fieldValue('prepared-contact'));
    showValue('preview-client-name', fieldValue('project-client-name'));
    showValue('preview-client-address', fieldValue('project-client-address'));
    showValue('preview-project-scope', fieldValue('project-scope'));
    byId('quotation-project-fields').hidden = !isProjectIncluded();
    byId('quotation-project-preview').hidden = !isProjectIncluded();
    byId('quotation-project-preview').parentElement.classList.toggle('project-hidden', !isProjectIncluded());
    renderItemsPreview();
  }

  function createItemInput(item, field, index) {
    const input = document.createElement('input');
    input.className = 'form-input';
    input.type = 'text';
    input.value = item[field];
    input.maxLength = field === 'description' ? 300 : field === 'model' ? 120 : 40;
    input.setAttribute('aria-label', `${field === 'qty' ? 'Quantity' : field[0].toUpperCase() + field.slice(1)} row ${index + 1}`);
    input.addEventListener('input', () => { state.items[index][field] = input.value; renderItemsPreview(); });
    return input;
  }

  function createDeleteButton(index) {
    const button = document.createElement('button');
    button.className = 'quotation-item-delete';
    button.type = 'button';
    button.disabled = index === 0;
    button.title = index === 0 ? 'The first row cannot be deleted' : `Delete row ${index + 1}`;
    button.setAttribute('aria-label', button.title);
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6"/></svg>';
    button.addEventListener('click', () => { if (index === 0) return; state.items.splice(index, 1); markDirty(); renderItemEditor(); renderItemsPreview(); });
    return button;
  }

  function renderItemEditor() {
    const rows = state.items.map((item, index) => {
      const row = document.createElement('div');
      row.className = 'quotation-item-grid quotation-item-row';
      const number = document.createElement('span');
      number.className = 'quotation-item-number';
      number.textContent = String(index + 1);
      row.append(number, createItemInput(item, 'description', index), createItemInput(item, 'model', index), createItemInput(item, 'qty', index), createDeleteButton(index));
      return row;
    });
    byId('quotation-item-rows').replaceChildren(...rows);
  }

  function renderItemsPreview() {
    showValue('preview-items-title', fieldValue('quotation-items-title') || DEFAULTS['quotation-items-title']);
    const chunks = paginateItems(state.items);
    if (state.currentOverflow >= chunks.length) state.currentOverflow = chunks.length - 1;
    const visibleItems = chunks[state.currentOverflow] || chunks[0];
    const firstIndex = chunks.slice(0, state.currentOverflow).reduce((sum, chunk) => sum + chunk.length, 0);
    const rows = visibleItems.map((item, index) => {
      const row = document.createElement('tr');
      const number = document.createElement('td');
      number.textContent = String(firstIndex + index + 1);
      row.append(number);
      ['description','model','qty'].forEach(field => { const cell = document.createElement('td'); cell.textContent = item[field] || '—'; row.append(cell); });
      return row;
    });
    byId('preview-item-rows').replaceChildren(...rows);
    byId('quotation-preview-totals').hidden = state.currentOverflow < chunks.length - 1;
    renderTotals();
    updatePageNavigation();
  }

  function itemPageUnits(item) {
    return Math.max(1, Math.ceil(item.description.length / 44), Math.ceil(item.model.length / 30), Math.ceil(item.qty.length / 12));
  }

  function paginateItems(items) {
    const chunks = [[]];
    let capacity = 7;
    let used = 0;
    items.forEach(item => {
      const units = Math.min(itemPageUnits(item), capacity);
      if (chunks[chunks.length - 1].length && used + units > capacity) { chunks.push([]); capacity = 16; used = 0; }
      chunks[chunks.length - 1].push(item); used += units;
    });
    return chunks;
  }

  function amountNumber(value) {
    const parsed = Number(String(value || '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formattedAmount(value) {
    return amountNumber(value).toLocaleString('en-PH', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }

  function createLessRow(item, index) {
    const row = document.createElement('div');
    row.className = 'quotation-less-editor-row';
    const label = document.createElement('input');
    label.className = 'form-input quotation-less-label';
    label.type = 'text'; label.maxLength = 80; label.value = item.label;
    label.placeholder = 'Less:'; label.setAttribute('aria-label', `Less label ${index + 1}`);
    label.addEventListener('input', () => { state.pricing.less[index].label = label.value; renderTotals(); });
    const input = document.createElement('input');
    input.className = 'form-input quotation-less-amount';
    input.type = 'text'; input.inputMode = 'decimal'; input.maxLength = 40; input.value = item.amount; input.placeholder = '0.00';
    input.setAttribute('aria-label', `Less amount ${index + 1}`);
    input.addEventListener('input', () => { state.pricing.less[index].amount = input.value; renderTotals(); });
    const add = document.createElement('button');
    add.className = 'quotation-less-add'; add.type = 'button'; add.title = `Add Less line after ${index + 1}`; add.setAttribute('aria-label', add.title);
    add.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
    add.addEventListener('click', () => { state.pricing.less.splice(index + 1, 0, { label:'Less:', amount:'' }); markDirty(); renderLessEditor(); renderTotals(); });
    const remove = document.createElement('button');
    remove.className = 'quotation-less-delete'; remove.type = 'button'; remove.title = `Delete Less line ${index + 1}`; remove.setAttribute('aria-label', remove.title);
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6"/></svg>';
    remove.addEventListener('click', () => {
      if (state.pricing.less.length === 1) state.pricing.less[0] = { label:'Less:', amount:'' };
      else state.pricing.less.splice(index, 1);
      markDirty();
      renderLessEditor(); renderTotals();
    });
    row.append(label, input, add, remove);
    return row;
  }

  function renderLessEditor() {
    byId('quotation-less-rows').replaceChildren(...state.pricing.less.map(createLessRow));
  }

  function renderTotals() {
    const subtotal = amountNumber(state.pricing.subtotal);
    const totalLess = state.pricing.less.reduce((sum, item) => sum + amountNumber(item.amount), 0);
    byId('preview-subtotal').textContent = formattedAmount(subtotal);
    byId('quotation-grand-total-editor').textContent = formattedAmount(subtotal - totalLess);
    byId('preview-grand-total').textContent = formattedAmount(subtotal - totalLess);
    const rows = state.pricing.less.map(item => {
      const row = document.createElement('div');
      const label = document.createElement('span'); label.textContent = item.label;
      const amount = document.createElement('span'); amount.textContent = formattedAmount(item.amount);
      row.append(label, amount); return row;
    });
    byId('preview-less-rows').replaceChildren(...rows);
  }

  function selectEditorTab(tabName) {
    const showItems = tabName === 'items';
    byId('quotation-header-panel').hidden = showItems;
    byId('quotation-items-panel').hidden = !showItems;
    [['quotation-header-tab', !showItems], ['quotation-items-tab', showItems]].forEach(([id, active]) => {
      const tab = byId(id);
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
  }

  function collectSettings() {
    return FIELD_IDS.reduce((settings, id) => {
      const field = byId(id);
      settings[id] = field?.type === 'checkbox' ? String(field.checked) : field?.value || '';
      return settings;
    }, {});
  }

  function syncCurrentPage() {
    if (state.pages[state.currentPage]?.type === 'content') {
      document.querySelectorAll('#quotation-content-elements .quotation-content-editor').forEach(editor => {
        const section = state.pages[state.currentPage].sections[Number(editor.dataset.sectionIndex)];
        if (section) section.html = sanitizeRichText(editor.innerHTML);
      });
      return;
    }
    state.pages[state.currentPage] = { type:'cover', fields:collectSettings(), items:state.items, pricing:state.pricing };
  }

  function pageViews() {
    return state.pages.flatMap((page, sourceIndex) => page.type === 'cover'
      ? paginateItems(page.items).map((_, overflowIndex) => ({ sourceIndex, overflowIndex }))
      : [{ sourceIndex, overflowIndex:0 }]);
  }

  function currentViewIndex(views = pageViews()) {
    return Math.max(0, views.findIndex(view => view.sourceIndex === state.currentPage && view.overflowIndex === state.currentOverflow));
  }

  function updatePageNavigation() {
    const views = pageViews();
    const viewIndex = currentViewIndex(views);
    byId('quotation-page-number').textContent = `${viewIndex + 1} / ${views.length}`;
    byId('quotation-page-prev').disabled = viewIndex === 0;
    byId('quotation-page-next').disabled = viewIndex === views.length - 1;
    byId('quotation-add-page').disabled = state.pages.length >= 50;
    byId('quotation-delete-page').disabled = state.pages[state.currentPage]?.type !== 'content';
  }

  function restoreSettings(settings = {}) {
    FIELD_IDS.forEach(id => {
      const field = byId(id);
      if (!field) return;
      const value = settings[id] ?? DEFAULTS[id];
      if (field.type === 'checkbox') field.checked = value !== 'false';
      else field.value = value;
    });
    const hasHeaderImage = Boolean(fieldValue('quotation-header-image'));
    byId('quotation-header-image-status').textContent = hasHeaderImage ? 'Header image ready.' : 'Upload a PNG, JPEG, or WebP image up to 2 MB.';
  }

  function activatePage(index, overflowIndex = 0) {
    if (index < 0 || index >= state.pages.length) return;
    state.currentPage = index;
    state.currentOverflow = overflowIndex;
    const page = state.pages[index];
    const isContentPage = page.type === 'content';
    byId('quotation-cover-page-content').hidden = isContentPage;
    byId('quotation-content-page').hidden = !isContentPage;
    byId('quotation-content-toolbox').hidden = !isContentPage;
    byId('quotation-content-page-settings').hidden = !isContentPage;
    byId('quotation-header-tab').disabled = isContentPage || overflowIndex > 0;
    byId('quotation-items-tab').disabled = isContentPage;
    if (isContentPage) {
      byId('quotation-header-panel').hidden = true;
      byId('quotation-items-panel').hidden = true;
      renderContentPage(); updatePageNavigation();
      return;
    }
    byId('quotation-cover-page-content').querySelector('.quotation-document-header').hidden = overflowIndex > 0;
    byId('quotation-cover-page-content').querySelector('.quotation-details-grid').hidden = overflowIndex > 0;
    selectEditorTab(overflowIndex > 0 ? 'items' : 'header');
    state.items = page.items;
    state.pricing = page.pricing;
    restoreSettings(page.fields);
    byId('quotation-subtotal').value = state.pricing.subtotal;
    renderItemEditor(); renderLessEditor(); renderPreview(); updatePageNavigation();
  }

  function goToPage(viewIndex) {
    const views = pageViews();
    if (viewIndex < 0 || viewIndex >= views.length) return;
    syncCurrentPage();
    const view = views[viewIndex];
    activatePage(view.sourceIndex, view.overflowIndex);
  }

  function changePage(offset) {
    const views = pageViews();
    goToPage(currentViewIndex(views) + offset);
  }

  function addPage() {
    if (state.pages.length >= 50) return;
    syncCurrentPage();
    state.pages.push(createContentPage());
    markDirty();
    activatePage(state.pages.length - 1, 0);
  }

  function setDeletePageModalOpen(open) {
    const modal = byId('quotation-delete-page-modal');
    document.querySelector('.dash-layout').inert = open;
    if (open) {
      modal.style.display = 'flex'; void modal.offsetHeight; modal.classList.add('open');
      byId('quotation-cancel-delete-page').focus();
      return;
    }
    modal.classList.remove('open');
    setTimeout(() => { if (!modal.classList.contains('open')) modal.style.display = 'none'; }, 200);
    byId('quotation-delete-page').focus();
  }

  function deleteCurrentPage() {
    if (state.pages[state.currentPage]?.type !== 'content') return;
    state.pages.splice(state.currentPage, 1);
    const nextIndex = Math.min(state.currentPage, state.pages.length - 1);
    markDirty(); activatePage(nextIndex); setDeletePageModalOpen(false);
  }

  function handleHeaderImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      event.target.value = '';
      byId('quotation-header-image-status').textContent = 'Choose a PNG, JPEG, or WebP image up to 2 MB.';
      toast('The header image must be a PNG, JPEG, or WebP file up to 2 MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = loadEvent => {
      byId('quotation-header-image').value = String(loadEvent.target?.result || '');
      byId('quotation-header-image-status').textContent = 'Header image ready.';
      markDirty();
      renderPreview();
    };
    reader.onerror = () => toast('The header image could not be read.', 'error');
    reader.readAsDataURL(file);
  }

  function removeHeaderImage() {
    byId('quotation-header-image').value = '';
    byId('quotation-header-image-file').value = '';
    byId('quotation-header-image-status').textContent = 'Upload a PNG, JPEG, or WebP image up to 2 MB.';
    markDirty();
    renderPreview();
  }

  function sanitizeRichText(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const clean = document.createElement('div');
    function appendSafe(source, target) {
      Array.from(source.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) { target.appendChild(document.createTextNode(node.textContent || '')); return; }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (!RICH_TEXT_TAGS.has(node.tagName)) { appendSafe(node, target); return; }
        const element = document.createElement(node.tagName.toLowerCase());
        appendSafe(node, element); target.appendChild(element);
      });
    }
    appendSafe(template.content, clean);
    return clean.innerHTML;
  }

  function defaultSectionHtml(kind) {
    if (kind === 'scope-of-work') return '<p>The following items or services are included in this proposal:</p><ul><li><br></li></ul>';
    if (kind === 'exclusions') return '<p>The following items or services are not included in this proposal:</p><ul><li><br></li></ul>';
    return '<p><br></p>';
  }

  function acceptanceData(section) {
    return { preparedName:'', preparedPosition:'', preparedSignature:'', acceptedName:'', acceptedPosition:'', acceptedSignature:'', ...(section.acceptance || {}) };
  }

  function createAcceptancePreview(section) {
    const data = acceptanceData(section);
    const preview = document.createElement('div');
    preview.className = 'quotation-acceptance-preview';
    [['Prepared by', 'prepared'], ['Accepted by', 'accepted']].forEach(([labelText, prefix]) => {
      const party = document.createElement('div');
      party.className = 'quotation-acceptance-party';
      const label = document.createElement('span'); label.className = 'quotation-acceptance-label'; label.textContent = `${labelText}:`;
      party.append(label);
      const signature = data[`${prefix}Signature`];
      if (signature) { const image = document.createElement('img'); image.className = 'quotation-acceptance-signature'; image.src = signature; image.alt = `${labelText} signature`; party.append(image); }
      const name = document.createElement('span'); name.className = 'quotation-acceptance-name'; name.textContent = data[`${prefix}Name`] || 'Name';
      const position = document.createElement('span'); position.className = 'quotation-acceptance-position'; position.textContent = data[`${prefix}Position`] || 'Position';
      party.append(name, position); preview.append(party);
    });
    return preview;
  }

  function selectAcceptance(index) {
    const section = state.pages[state.currentPage]?.sections?.[index];
    activeAcceptanceIndex = section?.kind === 'acceptance' ? index : null;
    const settings = byId('quotation-acceptance-settings');
    settings.hidden = activeAcceptanceIndex === null;
    byId('quotation-content-toolbox').hidden = activeAcceptanceIndex !== null;
    if (activeAcceptanceIndex === null) return;
    const data = acceptanceData(section);
    settings.querySelectorAll('[data-acceptance-field]').forEach(input => { input.value = data[input.dataset.acceptanceField]; });
    settings.querySelectorAll('[data-acceptance-signature]').forEach(input => { input.value = ''; });
  }

  function renderContentPage() {
    const page = state.pages[state.currentPage];
    if (page?.type !== 'content') return;
    const sections = page.sections || [];
    const elements = byId('quotation-content-elements');
    const fragment = document.createDocumentFragment();
    sections.forEach((section, index) => {
      const wrapper = document.createElement('section');
      wrapper.className = 'quotation-content-element';
      wrapper.dataset.kind = section.kind;
      wrapper.dataset.sectionIndex = String(index);
      const actions = document.createElement('div');
      actions.className = 'quotation-content-element-actions';
      actions.innerHTML = `<button class="quotation-content-element-action" type="button" data-element-action="up" aria-label="Move ${CONTENT_TITLES[section.kind]} up" title="Move up" ${index === 0 ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button><button class="quotation-content-element-action" type="button" data-element-action="down" aria-label="Move ${CONTENT_TITLES[section.kind]} down" title="Move down" ${index === sections.length - 1 ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><button class="quotation-content-element-action delete" type="button" data-element-action="delete" aria-label="Delete ${CONTENT_TITLES[section.kind]}" title="Delete"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6"/></svg></button>`;
      const title = document.createElement('h2');
      title.className = 'quotation-content-title';
      title.textContent = CONTENT_TITLES[section.kind];
      if (section.kind === 'acceptance') wrapper.append(actions, title, createAcceptancePreview(section));
      else {
        const editor = document.createElement('div');
        editor.className = 'quotation-content-editor';
        editor.dataset.sectionIndex = String(index);
        editor.contentEditable = 'true';
        editor.setAttribute('role', 'textbox');
        editor.setAttribute('aria-multiline', 'true');
        editor.innerHTML = sanitizeRichText(section.html);
        wrapper.append(actions, title, editor);
      }
      fragment.append(wrapper);
    });
    elements.replaceChildren(fragment);
    activeContentEditor = elements.querySelector('.quotation-content-editor');
    updateContentToolbar();
  }

  function contentElementsOverflow() {
    const sheet = byId('quotation-sheet');
    const sections = [...document.querySelectorAll('#quotation-content-elements > .quotation-content-element')];
    if (!sheet || !sections.length) return false;
    const sheetStyle = getComputedStyle(sheet);
    const contentBottom = sheet.getBoundingClientRect().bottom - parseFloat(sheetStyle.paddingBottom || '0');
    return sections.at(-1).getBoundingClientRect().bottom > contentBottom + 1;
  }

  function paginateContentOverflow() {
    let pageIndex = state.currentPage;
    if (state.pages[pageIndex]?.type !== 'content' || !contentElementsOverflow()) return;
    syncCurrentPage();
    while (pageIndex < 50) {
      state.currentPage = pageIndex;
      renderContentPage();
      const page = state.pages[pageIndex];
      if (!contentElementsOverflow() || page.sections.length < 2) break;
      const overflowSection = page.sections.pop();
      const followingPage = state.pages[pageIndex + 1];
      if (followingPage?.type === 'content') followingPage.sections.unshift(overflowSection);
      else state.pages.splice(pageIndex + 1, 0, { type:'content', sections:[overflowSection] });
      pageIndex += 1;
    }
    state.currentPage = pageIndex;
    state.currentOverflow = 0;
    renderContentPage();
    updatePageNavigation();
  }

  function createContentSection(kind) {
    if (!CONTENT_TITLES[kind] || state.pages[state.currentPage]?.type !== 'content') return;
    const sections = state.pages[state.currentPage].sections;
    const index = sections.length;
    sections.splice(index, 0, { kind, html:defaultSectionHtml(kind), ...(kind === 'acceptance' ? { acceptance:acceptanceData({}) } : {}) });
    markDirty();
    renderContentPage();
    activeContentEditor = document.querySelector(`.quotation-content-editor[data-section-index="${index}"]`);
    activeContentEditor?.focus();
    if (kind === 'acceptance') selectAcceptance(index);
    requestAnimationFrame(paginateContentOverflow);
  }

  function updateContentElement(index, action) {
    const page = state.pages[state.currentPage];
    if (page?.type !== 'content' || index < 0 || index >= page.sections.length) return;
    syncCurrentPage();
    if (action === 'delete') page.sections.splice(index, 1);
    else {
      const target = action === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= page.sections.length) return;
      [page.sections[index], page.sections[target]] = [page.sections[target], page.sections[index]];
    }
    markDirty();
    renderContentPage();
    selectAcceptance(-1);
    updatePageNavigation();
    requestAnimationFrame(paginateContentOverflow);
  }

  function updateContentToolbar() {
    const selection = window.getSelection();
    const anchorElement = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection?.anchorNode?.parentElement;
    const insideEditor = anchorElement && activeContentEditor?.contains(anchorElement);
    document.querySelectorAll('.quotation-content-tool').forEach(button => {
      let active = false;
      if (insideEditor) {
        if (button.dataset.command === 'highlight') active = Boolean(anchorElement.closest('mark'));
        else { try { active = document.queryCommandState(button.dataset.command); } catch (_) { active = false; } }
      }
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function toggleTextHighlight() {
    const selection = window.getSelection();
    if (!activeContentEditor || !selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!activeContentEditor.contains(range.commonAncestorContainer)) return;
    const anchorElement = selection.anchorNode.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode.parentElement;
    const mark = anchorElement.closest('mark');
    if (mark && activeContentEditor.contains(mark)) mark.replaceWith(...mark.childNodes);
    else {
      const highlight = document.createElement('mark');
      highlight.append(range.extractContents());
      range.insertNode(highlight);
      range.selectNodeContents(highlight);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    const page = state.pages[state.currentPage];
    const section = page?.type === 'content' ? page.sections[Number(activeContentEditor.dataset.sectionIndex)] : null;
    if (section) section.html = sanitizeRichText(activeContentEditor.innerHTML);
  }

  function positionContentToolbox() {
    const preview = document.querySelector('.quotation-preview-area');
    const toolbox = byId('quotation-content-toolbox');
    if (!preview || !toolbox) return;
    const bounds = preview.getBoundingClientRect();
    toolbox.style.top = `${Math.round(bounds.top + 15)}px`;
    toolbox.style.left = `${Math.round(bounds.left + 15)}px`;
  }

  function bindEvents() {
    FIELD_IDS.forEach(id => { byId(id)?.addEventListener('input', renderPreview); byId(id)?.addEventListener('change', renderPreview); });
    byId('quotation-header-image-file')?.addEventListener('change', handleHeaderImage);
    byId('quotation-header-image-remove')?.addEventListener('click', removeHeaderImage);
    byId('quotation-header-tab')?.addEventListener('click', () => selectEditorTab('header'));
    byId('quotation-items-tab')?.addEventListener('click', () => selectEditorTab('items'));
    byId('quotation-add-page')?.addEventListener('click', addPage);
    byId('quotation-delete-page')?.addEventListener('click', () => { if (state.pages[state.currentPage]?.type === 'content') setDeletePageModalOpen(true); });
    byId('quotation-cancel-delete-page')?.addEventListener('click', () => setDeletePageModalOpen(false));
    byId('quotation-confirm-delete-page')?.addEventListener('click', deleteCurrentPage);
    byId('quotation-delete-page-modal')?.addEventListener('click', event => { if (event.target === event.currentTarget) setDeletePageModalOpen(false); });
    byId('quotation-page-prev')?.addEventListener('click', () => changePage(-1));
    byId('quotation-page-next')?.addEventListener('click', () => changePage(1));
    byId('quotation-content-page-settings')?.addEventListener('click', event => {
      const option = event.target.closest('[data-section-kind]');
      if (option) createContentSection(option.dataset.sectionKind);
    });
    byId('quotation-content-elements')?.addEventListener('click', event => {
      const button = event.target.closest('[data-element-action]');
      const element = event.target.closest('.quotation-content-element');
      if (button) {
        if (!button.disabled) updateContentElement(Number(element.dataset.sectionIndex), button.dataset.elementAction);
        return;
      }
      if (element) selectAcceptance(Number(element.dataset.sectionIndex));
    });
    byId('quotation-acceptance-settings')?.addEventListener('input', event => {
      const input = event.target.closest('[data-acceptance-field]');
      const section = state.pages[state.currentPage]?.sections?.[activeAcceptanceIndex];
      if (!input || section?.kind !== 'acceptance') return;
      section.acceptance = acceptanceData(section);
      section.acceptance[input.dataset.acceptanceField] = input.value;
      const prefix = input.dataset.acceptanceField.startsWith('prepared') ? 'prepared' : 'accepted';
      const field = input.dataset.acceptanceField.endsWith('Name') ? '.quotation-acceptance-name' : '.quotation-acceptance-position';
      const party = document.querySelector(`.quotation-content-element[data-section-index="${activeAcceptanceIndex}"] .quotation-acceptance-party:${prefix === 'prepared' ? 'first' : 'last'}-child ${field}`);
      if (party) party.textContent = input.value || (field.endsWith('name') ? 'Name' : 'Position');
      markDirty();
    });
    byId('quotation-acceptance-settings')?.addEventListener('change', event => {
      const input = event.target.closest('[data-acceptance-signature]');
      const section = state.pages[state.currentPage]?.sections?.[activeAcceptanceIndex];
      const file = input?.files?.[0];
      if (!input || section?.kind !== 'acceptance' || !file) return;
      if (file.type !== 'image/png' || file.size > 2 * 1024 * 1024) { toast('Use a PNG signature image up to 2 MB.', 'error'); input.value = ''; return; }
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        section.acceptance = acceptanceData(section);
        section.acceptance[input.dataset.acceptanceSignature] = String(reader.result || '');
        markDirty(); renderContentPage(); selectAcceptance(activeAcceptanceIndex);
      });
      reader.readAsDataURL(file);
    });
    byId('quotation-content-elements')?.addEventListener('input', event => {
      const editor = event.target.closest('.quotation-content-editor');
      if (!editor) return;
      const page = state.pages[state.currentPage];
      const section = page?.type === 'content' ? page.sections[Number(editor.dataset.sectionIndex)] : null;
      if (section) section.html = sanitizeRichText(editor.innerHTML);
      activeContentEditor = editor;
      markDirty();
      updateContentToolbar();
      requestAnimationFrame(paginateContentOverflow);
    });
    byId('quotation-content-elements')?.addEventListener('paste', event => {
      if (!event.target.closest('.quotation-content-editor')) return;
      event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
    });
    ['keyup','mouseup','focusin'].forEach(name => byId('quotation-content-elements')?.addEventListener(name, event => { const editor = event.target.closest('.quotation-content-editor'); if (editor) { activeContentEditor = editor; selectAcceptance(-1); } updateContentToolbar(); }));
    document.querySelectorAll('.quotation-content-tool').forEach(button => {
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => {
        activeContentEditor?.focus();
        if (button.dataset.command === 'highlight') toggleTextHighlight();
        else document.execCommand(button.dataset.command, false);
        markDirty();
        updateContentToolbar();
      });
    });
    document.addEventListener('selectionchange', updateContentToolbar);
    window.addEventListener('resize', positionContentToolbox);
    if ('ResizeObserver' in window) new ResizeObserver(positionContentToolbox).observe(document.querySelector('.quotation-preview-area'));
    positionContentToolbox();
    byId('quotation-add-item')?.addEventListener('click', () => { state.items.push({ description:'', model:'', qty:'1' }); markDirty(); renderItemEditor(); renderItemsPreview(); });
    byId('quotation-subtotal')?.addEventListener('input', event => { state.pricing.subtotal = event.target.value; renderTotals(); });
    document.querySelector('.quotation-builder')?.addEventListener('input', markDirty);
    document.querySelector('.quotation-builder')?.addEventListener('change', markDirty);
    window.addEventListener('beforeunload', event => {
      if (!state.dirty) return;
      event.preventDefault(); event.returnValue = true;
    });
  }

  function renderDate() {
    byId('preview-date').textContent = new Intl.DateTimeFormat('en-PH', { year:'numeric', month:'long', day:'numeric', timeZone:'Asia/Manila' }).format(new Date(`${state.documentDate}T12:00:00Z`));
  }

  function restoreDocument(snapshot) {
    const document = window.BKQuotationDocument.validate(snapshot);
    state.pages = document.pages.map(page => page.type === 'content'
      ? { type:'content', sections:page.sections.map(section => ({ ...section, html:sanitizeRichText(section.html) })) }
      : page);
    state.companyProfile = document.branding;
    state.documentDate = document.date;
    activatePage(0); renderDate(); markClean();
  }

  function setQuotationNumber(number) {
    state.quotationNumber = String(number || '');
    showValue('preview-number', state.quotationNumber);
  }

  function compactPdfDocument(documentSnapshot) {
    const assets = [];
    const indexes = new Map();
    const json = JSON.stringify(documentSnapshot).replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/gi, dataUrl => {
      let index = indexes.get(dataUrl);
      if (index === undefined) { index = assets.length; indexes.set(dataUrl, index); assets.push(dataUrl); }
      return `__BK_PDF_ASSET_${index}__`;
    });
    return { document:JSON.parse(json), assets };
  }

  async function downloadPdf() {
    const button = byId('quotation-download-pdf');
    if (!button || button.disabled || state.pdfExporting) return;
    state.pdfExporting = true;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Preparing PDF...';
    try {
      syncCurrentPage();
      const snapshot = window.BKQuotationDocument.capture(null, state.companyProfile, state.documentDate, null, null, state.pages);
      const filename = `Quotation_${String(state.quotationNumber || state.documentDate).replace(/[^a-z0-9-]+/gi, '_')}.pdf`;
      const response = await window.BKAuth.authenticatedFetch('/api/quotation-pdf', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ company_id:state.companyId, quotation_number:state.quotationNumber, filename, ...compactPdfDocument(snapshot) })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'The quotation PDF could not be generated.');
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      toast('Quotation PDF downloaded.', 'success');
    } catch (error) {
      console.error('Quotation PDF generation failed:', error);
      toast(error?.message || 'The quotation PDF could not be generated. Please try again.', 'error');
    } finally {
      state.pdfExporting = false;
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  async function init() {
    try {
      const authInfo = await window.BKAuth.checkRoleGate(['Sales'], '/admin.html');
      if (!authInfo) return;
      const sb = window.BKAuth.sb;
      const { data:company, error:companyError } = await sb.from('companies').select('id').eq('tenant_id', authInfo.tenantId).limit(1).maybeSingle();
      if (companyError) throw companyError;
      if (!company?.id) throw new Error('No company is configured for this tenant.');
      state.companyId = company.id;
      const { data:settings, error:settingsError } = await sb.from('global_settings').select('key,value').eq('company_id', state.companyId).eq('key', 'company_profile_config').limit(1);
      if (settingsError) throw settingsError;
      const settingsMap = Object.fromEntries((settings || []).map(item => [item.key, item.value || {}]));
      state.companyProfile = settingsMap.company_profile_config || {};
      restoreSettings(); renderItemEditor(); renderLessEditor(); renderPreview(); renderDate(); updatePageNavigation(); bindEvents();
      await window.BKQuotationFiles.init({
        sb, companyId:state.companyId, toast,
        capture:() => { syncCurrentPage(); return window.BKQuotationDocument.capture(null, state.companyProfile, state.documentDate, null, null, state.pages); },
        restore:restoreDocument,
        setQuotationNumber, markClean
      });
      byId('quotation-download-pdf').disabled = false;
      byId('quotation-download-pdf').addEventListener('click', downloadPdf);
      byId('quotation-loading').hidden = true; byId('quotation-sheet').hidden = false;
    } catch (error) {
      console.error('Unable to initialize quotation builder:', error);
      byId('quotation-loading').textContent = 'The quotation builder could not be loaded.';
      toast('The quotation builder could not be loaded.', 'error');
    }
  }

  init();
})();

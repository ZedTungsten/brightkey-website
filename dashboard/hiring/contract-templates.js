(function () {
  'use strict';

  const KEY = 'contract_document_templates';
  const state = { app: null, items: [], pendingPages: null, deletingId: null, selectedId: null, openEditor: null, loadTemplate: null };
  const esc = value => state.app?.esc(value) || '';
  const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function sectionMarkup() {
    return `<section class="contracts-column" aria-labelledby="saved-templates-title"><div class="contracts-column-header"><div><h2 id="saved-templates-title">Saved Templates</h2><p>Reusable complete employment contracts.</p></div><button class="btn btn-primary" id="create-contract-template" type="button" disabled onclick="BKContractTemplates.create()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Create Template</button></div><div id="saved-template-cards" class="contract-card-list"><div class="contracts-skeleton"><i></i></div></div></section>`;
  }

  function modalsMarkup() {
    return `<div class="hiring-modal-overlay template-name-overlay" id="template-name-modal" role="dialog" aria-modal="true" aria-labelledby="template-name-title" style="display:none"><div class="hiring-modal-card template-name-card"><div class="hiring-modal-header"><h3 id="template-name-title">Save Contract Template</h3><button class="hiring-icon-btn" type="button" aria-label="Close" onclick="BKContractTemplates.closeName()"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="template-name-body"><label><span>Template name <b>*</b></span><input id="template-name-input" maxlength="120" placeholder="e.g. Regular Employment Contract"></label></div><div class="hiring-modal-footer"><button class="btn btn-outline" type="button" onclick="BKContractTemplates.closeName()">Cancel</button><button class="btn btn-primary" id="confirm-template-name" type="button" onclick="BKContractTemplates.confirmName()">Save Template</button></div></div></div>
    <div class="hiring-modal-overlay clause-delete-overlay" id="template-delete-modal" role="dialog" aria-modal="true" aria-labelledby="template-delete-title" style="display:none"><div class="hiring-modal-card clause-delete-card"><div class="hiring-modal-header"><h3 id="template-delete-title">Delete Template</h3><button class="hiring-icon-btn" type="button" aria-label="Close" onclick="BKContractTemplates.closeDelete()"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="clause-delete-body"><p>This saved contract template will be permanently removed.</p></div><div class="hiring-modal-footer"><button class="btn btn-outline" type="button" onclick="BKContractTemplates.closeDelete()">Cancel</button><button class="btn clause-delete-confirm" type="button" onclick="BKContractTemplates.confirmDelete()">Delete Template</button></div></div></div>
    <div class="hiring-modal-overlay clause-delete-overlay" id="template-replace-modal" role="dialog" aria-modal="true" aria-labelledby="template-replace-title" style="display:none"><div class="hiring-modal-card clause-delete-card"><div class="hiring-modal-header"><h3 id="template-replace-title">Replace Current Contract?</h3><button class="hiring-icon-btn" type="button" aria-label="Close" onclick="BKContractTemplates.closeReplace()"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="clause-delete-body"><p>Loading a template will discard all current unsaved contract pages and blocks.</p></div><div class="hiring-modal-footer"><button class="btn btn-outline" type="button" onclick="BKContractTemplates.closeReplace()">Cancel</button><button class="btn btn-primary" type="button" onclick="BKContractTemplates.chooseTemplate()">Continue</button></div></div></div>
    <div class="hiring-modal-overlay template-name-overlay" id="template-load-modal" role="dialog" aria-modal="true" aria-labelledby="template-load-title" style="display:none"><div class="hiring-modal-card template-load-card"><div class="hiring-modal-header"><h3 id="template-load-title">Load Template</h3><button class="hiring-icon-btn" type="button" aria-label="Close" onclick="BKContractTemplates.closeLoad()"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div id="template-load-list" class="template-load-list"></div><div class="hiring-modal-footer"><button class="btn btn-outline" type="button" onclick="BKContractTemplates.closeLoad()">Cancel</button><button class="btn btn-primary" id="confirm-load-template" type="button" disabled onclick="BKContractTemplates.confirmLoad()">Load Template</button></div></div></div>`;
  }

  function init(app, value, openEditor, loadTemplate) {
    state.app = app;
    state.openEditor = openEditor;
    state.loadTemplate = loadTemplate;
    state.items = Array.isArray(value?.items) ? value.items.slice(0, 100).filter(item => item?.id && item?.title && Array.isArray(item.pages)) : [];
    render();
    const button = document.getElementById('create-contract-template');
    if (button) button.disabled = false;
  }

  function render() {
    const host = document.getElementById('saved-template-cards');
    if (!host) return;
    if (!state.items.length) { host.innerHTML = '<div class="hiring-empty">No saved templates yet.</div>'; return; }
    host.innerHTML = [...state.items].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })).map(item => `<article class="contract-list-card snippet-card"><div class="clause-card-content"><h3>${esc(item.title)}</h3></div><div class="clause-card-actions"><button type="button" aria-label="Edit ${esc(item.title)}" title="Edit template" onclick="BKContractTemplates.edit('${esc(item.id)}')"><svg viewBox="0 0 24 24"><path d="m4 16-.8 4.8L8 20l11-11-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/></svg></button><button class="delete" type="button" aria-label="Delete ${esc(item.title)}" title="Delete template" onclick="BKContractTemplates.openDelete('${esc(item.id)}')"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5M14 11v5"/></svg></button></div></article>`).join('');
  }

  function create() { state.openEditor?.(null); }
  function edit(id) { const item = state.items.find(entry => entry.id === id); if (item) state.openEditor?.(item); }
  function get(id) { return state.items.find(item => item.id === id) || null; }

  function beginLoad() { if (!state.items.length) { state.app.showToast('Create a saved template first.', true); return; } show('template-replace-modal'); }
  function closeReplace() { hide('template-replace-modal'); }
  function chooseTemplate() {
    hide('template-replace-modal'); state.selectedId = null;
    document.getElementById('template-load-list').innerHTML = [...state.items].sort((a, b) => a.title.localeCompare(b.title)).map(item => `<button type="button" onclick="BKContractTemplates.selectLoad('${esc(item.id)}', this)"><span>${esc(item.title)}</span><i></i></button>`).join('');
    document.getElementById('confirm-load-template').disabled = true; show('template-load-modal');
  }
  function selectLoad(id, button) { state.selectedId = get(id)?.id || null; document.querySelectorAll('#template-load-list button').forEach(item => item.classList.toggle('selected', item === button)); document.getElementById('confirm-load-template').disabled = !state.selectedId; }
  function closeLoad() { hide('template-load-modal'); state.selectedId = null; }
  function confirmLoad() { const item = get(state.selectedId); if (!item) return; state.loadTemplate?.(item); closeLoad(); }

  function askName(pages) {
    state.pendingPages = pages;
    const input = document.getElementById('template-name-input');
    input.value = '';
    input.style.borderColor = '';
    show('template-name-modal');
    setTimeout(() => input.focus(), 100);
  }

  function closeName() { hide('template-name-modal'); state.pendingPages = null; }
  async function confirmName() {
    const input = document.getElementById('template-name-input');
    const name = input.value.trim();
    if (!name) { input.style.borderColor = 'var(--danger)'; input.focus(); return; }
    if (!state.pendingPages?.some(page => page.length)) { state.app.showToast('Add contract content before saving a template.', true); return; }
    const saved = await save(null, name, state.pendingPages);
    if (saved) { hide('template-name-modal'); state.pendingPages = null; state.app.showToast('Contract template saved.'); }
  }

  async function save(id, title, pages) {
    const item = { id: id || uid(), title: String(title).trim().slice(0, 120), pages, updatedAt: new Date().toISOString() };
    const items = id ? state.items.map(entry => entry.id === id ? item : entry) : [item, ...state.items].slice(0, 100);
    const { error } = await state.app.sb.from('global_settings').upsert({ company_id: state.app.companyId, key: KEY, value: { items } }, { onConflict: 'company_id,key' });
    if (error) { console.error('Contract template save failed:', error); state.app.showToast('The contract template could not be saved. Please try again.', true); return false; }
    state.items = items; render(); return true;
  }

  function openDelete(id) { if (!get(id)) return; state.deletingId = id; show('template-delete-modal'); }
  function closeDelete() { hide('template-delete-modal'); state.deletingId = null; }
  async function confirmDelete() {
    if (!state.deletingId) return;
    const items = state.items.filter(item => item.id !== state.deletingId);
    const { error } = await state.app.sb.from('global_settings').upsert({ company_id: state.app.companyId, key: KEY, value: { items } }, { onConflict: 'company_id,key' });
    if (error) { console.error('Contract template delete failed:', error); state.app.showToast('The contract template could not be deleted. Please try again.', true); return; }
    state.items = items; render(); closeDelete(); state.app.showToast('Contract template deleted.');
  }

  function show(id) { const modal = document.getElementById(id); modal.style.display = 'flex'; void modal.offsetHeight; modal.classList.add('open'); }
  function hide(id) { const modal = document.getElementById(id); modal.classList.remove('open'); setTimeout(() => { modal.style.display = 'none'; }, 150); }

  window.BKContractTemplates = { sectionMarkup, modalsMarkup, init, create, edit, get, beginLoad, closeReplace, chooseTemplate, selectLoad, closeLoad, confirmLoad, askName, closeName, confirmName, save, openDelete, closeDelete, confirmDelete };
})();

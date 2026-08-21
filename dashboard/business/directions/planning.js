(function () {
  'use strict';

  const state = { sb: null, companyId: null, directions: [] };

  function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function toast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const item = document.createElement('div');
    item.className = `toast toast-${type}`;
    item.textContent = message;
    container.appendChild(item);
    setTimeout(() => item.remove(), 3500);
  }

  async function loadDirections() {
    const { data, error } = await state.sb.from('management_directions')
      .select('id,parent_id,title,description,target_date,bucket,completed_at,created_at')
      .eq('company_id', state.companyId).order('created_at', { ascending: true }).limit(500);
    if (error) throw error;
    state.directions = data || [];
    renderDirections();
  }

  function renderDirections() {
    ['urgent_important', 'not_urgent_important'].forEach(bucket => {
      const list = document.getElementById(`planning-${bucket.replaceAll('_', '-')}-list`);
      const bucketDirections = state.directions.filter(direction => direction.bucket === bucket);
      if (!bucketDirections.length) {
        list.innerHTML = '<div class="planning-empty">No directions in this priority.</div>';
        return;
      }

      const topLevel = bucketDirections.filter(direction => !direction.parent_id);
      const rows = [];
      topLevel.forEach(direction => {
        rows.push(directionRow(direction, 0));
        bucketDirections.filter(child => child.parent_id === direction.id)
          .forEach(child => rows.push(directionRow(child, 1)));
      });
      bucketDirections.filter(direction => direction.parent_id && !bucketDirections.some(parent => parent.id === direction.parent_id))
        .forEach(direction => rows.push(directionRow(direction, 1)));
      list.innerHTML = rows.join('');
    });
  }

  function directionRow(direction, depth) {
    const completed = Boolean(direction.completed_at);
    const indent = depth ? 'margin-left:2rem;border-left:2px dashed var(--border);padding-left:1rem;' : '';
    const description = direction.description
      ? `<div style="font-size:0.78rem;color:var(--text-secondary);margin-top:0.2rem;word-break:break-word;">${esc(direction.description)}</div>` : '';
    const date = direction.target_date
      ? `<span style="font-size:0.72rem;font-weight:600;padding:0.15rem 0.4rem;background:var(--bg-elevated);color:var(--text-muted);border:1px solid var(--border);border-radius:4px;">${esc(direction.target_date)}</span>` : '';
    return `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:0.65rem 0.85rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;gap:1rem;${indent}">
      <div style="display:flex;align-items:flex-start;gap:0.75rem;flex:1;min-width:0;">
        <input type="checkbox" ${completed ? 'checked' : ''} onchange="Planning.toggleDirectionCompletion('${esc(direction.id)}',this.checked)" aria-label="Mark ${esc(direction.title)} complete" style="width:18px;height:18px;cursor:pointer;flex-shrink:0;margin-top:0.15rem;" />
        <div style="flex:1;min-width:0;"><div style="font-size:0.84rem;line-height:1.4;font-weight:600;color:${completed ? 'var(--text-muted)' : 'var(--text-primary)'};${completed ? 'text-decoration:line-through;' : ''}">${esc(direction.title)}</div>${description}<div style="margin-top:0.4rem;">${date}</div></div>
      </div>
      <div style="display:flex;gap:0.35rem;align-items:center;flex-shrink:0;">
        <button type="button" onclick="Planning.openDirectionModal('${esc(direction.id)}')" title="Edit Direction" aria-label="Edit ${esc(direction.title)}" style="padding:0.25rem;background:none;border:none;cursor:pointer;color:var(--text-muted);"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button type="button" onclick="Planning.deleteDirection('${esc(direction.id)}')" title="Delete Direction" aria-label="Delete ${esc(direction.title)}" style="padding:0.25rem;background:none;border:none;cursor:pointer;color:var(--danger);"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
      </div>
    </div>`;
  }

  function openDirectionModal(id = '') {
    const direction = state.directions.find(item => item.id === id);
    document.getElementById('direction-modal-id').value = direction?.id || '';
    document.getElementById('direction-modal-title').textContent = direction ? 'Edit Direction' : 'Add New Direction';
    document.getElementById('direction-modal-title-input').value = direction?.title || '';
    document.getElementById('direction-modal-desc-input').value = direction?.description || '';
    document.getElementById('direction-modal-date-input').value = direction?.target_date || '';
    document.getElementById('direction-modal-bucket-input').value = direction?.bucket || 'urgent_important';
    const parent = document.getElementById('direction-modal-parent-input');
    parent.innerHTML = '<option value="">None — Main Direction</option>' + state.directions
      .filter(item => !item.parent_id && item.id !== id)
      .map(item => `<option value="${esc(item.id)}">${esc(item.title)}</option>`).join('');
    parent.value = direction?.parent_id || '';
    const modal = document.getElementById('direction-modal');
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeDirectionModal() {
    const modal = document.getElementById('direction-modal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    setTimeout(() => { modal.style.display = 'none'; }, 150);
  }

  async function saveDirection(event) {
    event.preventDefault();
    const id = document.getElementById('direction-modal-id').value;
    const payload = {
      title: document.getElementById('direction-modal-title-input').value.trim(),
      description: document.getElementById('direction-modal-desc-input').value.trim(),
      target_date: document.getElementById('direction-modal-date-input').value || null,
      bucket: document.getElementById('direction-modal-bucket-input').value,
      parent_id: document.getElementById('direction-modal-parent-input').value || null
    };
    if (!payload.title) return;
    const button = document.getElementById('btn-submit-direction');
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      const query = id
        ? state.sb.from('management_directions').update({ ...payload, updated_at: new Date().toISOString() }).eq('company_id', state.companyId).eq('id', id)
        : state.sb.from('management_directions').insert({ ...payload, company_id: state.companyId });
      const { error } = await query;
      if (error) throw error;
      closeDirectionModal();
      await loadDirections();
      toast(id ? 'Direction updated.' : 'Direction created.');
    } catch (error) {
      console.error('Direction save failed:', error);
      toast('The direction could not be saved. Check your entries and try again.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Save Direction';
    }
  }

  async function deleteDirection(id) {
    const accepted = await window.BKDialog.ask({ title: 'Delete Direction', message: 'Delete this direction and its sub-directions?', okText: 'Delete', danger: true });
    if (!accepted) return;
    try {
      const { error } = await state.sb.from('management_directions').delete().eq('company_id', state.companyId).eq('id', id);
      if (error) throw error;
      await loadDirections();
      toast('Direction deleted.');
    } catch (error) {
      console.error('Direction delete failed:', error);
      toast('The direction could not be deleted. Try again.', 'error');
    }
  }

  async function toggleDirectionCompletion(id, completed) {
    try {
      const { error } = await state.sb.from('management_directions')
        .update({ completed_at: completed ? new Date().toISOString() : null })
        .eq('company_id', state.companyId).eq('id', id);
      if (error) throw error;
      await loadDirections();
      toast(completed ? 'Direction completed.' : 'Direction returned to active planning.');
    } catch (error) {
      console.error('Direction status update failed:', error);
      toast('The direction status could not be updated. Try again.', 'error');
    }
  }

  async function init() {
    const authInfo = await window.BKAuth.checkRoleGate(['Business'], '/admin');
    if (!authInfo?.tenantId) return;
    state.sb = window.BKAuth.sb;
    const { data: company, error } = await state.sb.from('companies').select('id')
      .eq('tenant_id', authInfo.tenantId).limit(1).maybeSingle();
    state.companyId = company?.id || null;
    if (error || !state.companyId) {
      toast('Your company workspace could not be loaded. Refresh and try again.', 'error');
      return;
    }
    try {
      await loadDirections();
    } catch (loadError) {
      console.error('Directions load failed:', loadError);
      toast('Directions could not be loaded. Refresh and try again.', 'error');
    }
  }

  window.Planning = { openDirectionModal, closeDirectionModal, saveDirection, deleteDirection, toggleDirectionCompletion };
  document.addEventListener('DOMContentLoaded', init);
})();

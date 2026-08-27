(function () {
  'use strict';

  const TERMINAL = new Set(['returned', 'lost', 'damaged', 'consumed', 'disposed']);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const state = { sb: null, companyId: null, tenantId: null, year: new Date().getFullYear(), employees: [], warehouses: [], products: [], inventory: [], issues: [], events: [], photoFiles: [], existingPhotoPaths: [], originalPhotoPaths: [], photoPreviewUrls: [] };
  const $ = id => document.getElementById(id);

  function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function localDate(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function formatDate(value) {
    if (!value) return '';
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function showToast(message, error = false) {
    if (window.Toast?.show) window.Toast.show(message, error ? 'error' : 'success');
    else if (typeof window.showToast === 'function') window.showToast(message, error);
  }

  function actionError(error, fallback) {
    const message = String(error?.message || '');
    const known = [
      'Select the date', 'Attach no more than 3 photo proofs', 'One or more photo proofs are invalid',
      'Select a valid installer', 'Select a valid warehouse',
      'Select a valid inventory SKU', 'This SKU has no available inventory in the selected warehouse',
      'This SKU is no longer available',
      'Select a valid tool status', 'The issued tool could not be found',
      'This tool issue has already ended', 'The status date cannot be before the issue date',
      'The issue date cannot be after the ending status date',
      'The issue date cannot be after a recorded status date',
      'The original warehouse inventory row is unavailable', 'You do not have permission'
    ].find(text => message.includes(text));
    return known ? message : fallback;
  }

  function openModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('open');
  }

  function closeModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.classList.remove('open');
    setTimeout(() => { modal.style.display = 'none'; }, 180);
  }

  function employeeName(employee) {
    return `${employee.first_name || ''} ${employee.last_name || ''}`.trim();
  }

  function eventsFor(issueId) {
    return state.events.filter(event => event.issue_id === issueId);
  }

  function renderCard(issue, endpoint) {
    const meaningfulEvents = eventsFor(issue.id).filter(event => event.status !== 'issued');
    const tags = meaningfulEvents.map(event => `<span class="tool-event-tag">${esc(event.status)}</span>`).join('');
    const date = endpoint === 'end' && issue.ended_on ? issue.ended_on : issue.issued_on;
    const fallback = '/assets/og-image.png';
    return `<div class="installer-tool-card-shell" data-issue-id="${esc(issue.id)}">
      <button type="button" class="installer-tool-card">
        <span class="installer-tool-card-main"><img src="${esc(issue.product_image_url || fallback)}" alt="" onerror="this.src='${fallback}'"><span><strong>${esc(issue.sku)}</strong><span class="tool-title">${esc(issue.product_title)}</span></span></span>
        <span class="tool-date">${esc(formatDate(date))}</span>${tags ? `<span class="tool-event-tags">${tags}</span>` : ''}
      </button>
      <button type="button" class="installer-tool-edit" data-edit-issue-id="${esc(issue.id)}" aria-label="Edit ${esc(issue.sku)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button>
    </div>`;
  }

  function render() {
    $('installer-tools-year').textContent = state.year;
    const head = $('installer-tools-head');
    const body = $('installer-tools-body');
    head.innerHTML = `<tr><th>Installer</th>${MONTHS.map(month => `<th>${month}</th>`).join('')}</tr>`;

    const visible = state.issues.filter(issue => {
      const startYear = Number(issue.issued_on.slice(0, 4));
      const endYear = issue.ended_on ? Number(issue.ended_on.slice(0, 4)) : state.year;
      return startYear <= state.year && endYear >= state.year;
    });
    const byEmployee = new Map();
    visible.forEach(issue => {
      if (!byEmployee.has(issue.employee_id)) byEmployee.set(issue.employee_id, []);
      byEmployee.get(issue.employee_id).push(issue);
    });
    if (!state.employees.length) {
      body.innerHTML = '<tr><td colspan="13" class="installer-tools-empty">No tools issued for this year.</td></tr>';
      return;
    }

    const today = new Date();
    const currentMonth = today.getFullYear() === state.year ? today.getMonth() : 11;
    const rows = [];
    state.employees.forEach(employee => {
      const issues = byEmployee.get(employee.id) || [];
      issues.sort((a, b) => a.issued_on.localeCompare(b.issued_on) || a.sku.localeCompare(b.sku));
      if (!issues.length) {
        rows.push(`<tr><td class="installer-tool-owner">${esc(employeeName(employee))}</td>${MONTHS.map(() => '<td class="installer-tool-month"></td>').join('')}</tr>`);
        return;
      }
      issues.forEach((issue, issueIndex) => {
        const startYear = Number(issue.issued_on.slice(0, 4));
        const issuedMonth = Number(issue.issued_on.slice(5, 7)) - 1;
        const startMonth = startYear < state.year ? 0 : issuedMonth;
        const endYear = issue.ended_on ? Number(issue.ended_on.slice(0, 4)) : null;
        const endMonth = issue.ended_on
          ? (Number(issue.ended_on.slice(0, 4)) > state.year ? 11 : Number(issue.ended_on.slice(5, 7)) - 1)
          : currentMonth;
        const cells = MONTHS.map((_, month) => {
          const inRange = month >= startMonth && month <= endMonth;
          const isStart = month === startMonth;
          const isEnd = month === endMonth;
          const isIssuedMonth = startYear === state.year && month === issuedMonth;
          const isCurrentActiveMonth = !issue.ended_on && state.year === today.getFullYear() && month === currentMonth;
          const isActualEndMonth = endYear === state.year && isEnd;
          const showCard = isIssuedMonth || isCurrentActiveMonth || isActualEndMonth;
          const classes = ['installer-tool-month', inRange ? 'in-range' : '', isStart ? 'range-start' : '', isEnd ? 'range-end' : ''].filter(Boolean).join(' ');
          return `<td class="${classes}">${showCard ? renderCard(issue, isActualEndMonth ? 'end' : 'start') : ''}</td>`;
        }).join('');
        rows.push(`<tr>${issueIndex === 0 ? `<td class="installer-tool-owner" rowspan="${issues.length}">${esc(employeeName(employee))}</td>` : ''}${cells}</tr>`);
      });
    });
    body.innerHTML = rows.join('');
  }

  function populateSkuOptions(selectedSku = '') {
    const warehouseId = $('tool-issue-warehouse').value;
    const available = new Map();
    state.inventory.filter(row => row.warehouse_id === warehouseId).forEach(row => {
      available.set(String(row.sku).toUpperCase(), row.available);
    });
    $('tool-issue-sku').innerHTML = '<option value="" disabled selected hidden>Select SKU</option>' + state.products
      .filter(product => (available.get(String(product.sku).toUpperCase()) || 0) > 0 || String(product.sku).toUpperCase() === String(selectedSku).toUpperCase())
      .map(product => {
        const count = available.get(String(product.sku).toUpperCase()) || 0;
        const availability = count > 0 ? `${count} available` : 'currently issued';
        return `<option value="${esc(product.sku)}">${esc(product.sku)} — ${esc(product.title)} (${availability})</option>`;
      }).join('');
    $('tool-issue-sku').disabled = !warehouseId;
    if (selectedSku) $('tool-issue-sku').value = selectedSku;
  }

  function renderPhotoProofs() {
    state.photoPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    state.photoPreviewUrls = [];
    const preview = $('tool-issue-photo-previews');
    preview.replaceChildren();
    state.existingPhotoPaths.forEach((path, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'tool-photo-preview';
      const image = document.createElement('img');
      image.src = state.sb.storage.from('brightkey-assets').getPublicUrl(path).data.publicUrl;
      image.alt = `Photo proof ${index + 1}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'tool-photo-remove';
      remove.dataset.existingPhotoIndex = String(index);
      remove.setAttribute('aria-label', `Remove photo proof ${index + 1}`);
      remove.textContent = '×';
      wrapper.append(image, remove);
      preview.append(wrapper);
    });
    state.photoFiles.forEach((file, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'tool-photo-preview';
      const image = document.createElement('img');
      const previewUrl = URL.createObjectURL(file);
      state.photoPreviewUrls.push(previewUrl);
      image.src = previewUrl;
      image.alt = `New photo proof ${index + 1}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'tool-photo-remove';
      remove.dataset.newPhotoIndex = String(index);
      remove.setAttribute('aria-label', `Remove new photo proof ${index + 1}`);
      remove.textContent = '×';
      wrapper.append(image, remove);
      preview.append(wrapper);
    });
    const total = state.existingPhotoPaths.length + state.photoFiles.length;
    $('tool-issue-photo-count').textContent = `${total} of 3`;
    $('tool-issue-add-photos').disabled = total >= 3;
  }

  function compressPhoto(file) {
    return new Promise((resolve, reject) => {
      const sourceUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(sourceUrl);
        const maxDimension = 1800;
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          if (!blob) reject(new Error('Photo compression failed.'));
          else resolve(new File([blob], `${crypto.randomUUID()}.jpg`, { type: 'image/jpeg' }));
        }, 'image/jpeg', .82);
      };
      image.onerror = () => {
        URL.revokeObjectURL(sourceUrl);
        reject(new Error('Photo reading failed.'));
      };
      image.src = sourceUrl;
    });
  }

  async function selectPhotoProofs(event) {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selected.length) return;
    if (state.existingPhotoPaths.length + state.photoFiles.length + selected.length > 3) {
      showToast('You can attach up to 3 photo proofs.', true);
      return;
    }
    if (selected.some(file => !file.type.startsWith('image/') || file.size > 20 * 1024 * 1024)) {
      showToast('Choose image files no larger than 20 MB each.', true);
      return;
    }
    try {
      const compressed = await Promise.all(selected.map(compressPhoto));
      state.photoFiles.push(...compressed);
      renderPhotoProofs();
    } catch (error) {
      showToast('One of the selected photos could not be prepared. Choose another image.', true);
    }
  }

  async function uploadPhotoProofs() {
    const uploadedPaths = [];
    try {
      for (const file of state.photoFiles) {
        if (window.BKAuth?.checkStorageQuota) await window.BKAuth.checkStorageQuota(state.companyId, file);
        const path = `companies/${state.companyId}/installer-tools/${crypto.randomUUID()}.jpg`;
        const { error } = await state.sb.storage.from('brightkey-assets').upload(path, file, {
          contentType: 'image/jpeg',
          cacheControl: '31536000',
          upsert: false
        });
        if (error) throw error;
        uploadedPaths.push(path);
      }
      return uploadedPaths;
    } catch (error) {
      if (uploadedPaths.length) await state.sb.storage.from('brightkey-assets').remove(uploadedPaths);
      throw error;
    }
  }

  function resetIssueModal() {
    $('tool-edit-issue-id').value = '';
    $('tool-issue-modal-title').textContent = 'Issue Tools';
    $('tool-issue-submit').textContent = 'Issue Tool';
    $('tool-issue-installer').value = '';
    $('tool-issue-warehouse').value = '';
    populateSkuOptions();
    $('tool-issue-date').value = localDate();
    state.photoFiles = [];
    state.existingPhotoPaths = [];
    state.originalPhotoPaths = [];
    renderPhotoProofs();
  }

  function openIssueModal(issue = null) {
    resetIssueModal();
    if (issue) {
      $('tool-edit-issue-id').value = issue.id;
      $('tool-issue-modal-title').textContent = 'Edit Issued Tool';
      $('tool-issue-submit').textContent = 'Save Changes';
      $('tool-issue-installer').value = issue.employee_id;
      $('tool-issue-warehouse').value = issue.warehouse_id;
      populateSkuOptions(issue.sku);
      $('tool-issue-date').value = issue.issued_on;
      state.existingPhotoPaths = [...(issue.photo_proof_paths || [])];
      state.originalPhotoPaths = [...state.existingPhotoPaths];
      renderPhotoProofs();
    }
    openModal('tool-issue-modal');
  }

  async function loadReferenceData() {
    const companyResult = await state.sb.from('companies').select('tenant_id').eq('id', state.companyId).maybeSingle();
    if (companyResult.error || !companyResult.data?.tenant_id) throw companyResult.error || new Error('Company context is unavailable.');
    state.tenantId = companyResult.data.tenant_id;
    const [employeesResult, productsResult, warehousesResult] = await Promise.all([
      state.sb.rpc('get_company_installer_directory', { p_company_id: state.companyId }),
      state.sb.from('products').select('id,sku,title,image_main,category').eq('company_id', state.companyId).eq('count_inventory', true).order('sku').limit(1000),
      state.sb.from('warehouses').select('id,name').eq('tenant_id', state.tenantId).eq('is_active', true).order('name').limit(100)
    ]);
    for (const result of [employeesResult, productsResult, warehousesResult]) if (result.error) throw result.error;
    state.employees = (employeesResult.data || []).filter(employee => {
      const assignments = String(employee.assignment || '').toLowerCase().split(',').map(value => value.trim());
      return assignments.some(value => value === 'installer' || value === 'installers');
    });
    state.products = (productsResult.data || []).filter(product => ['tools', 'supplies'].includes(String(product.category || '').trim().toLowerCase()));
    state.warehouses = warehousesResult.data || [];
    $('tool-issue-installer').innerHTML = '<option value="" disabled selected hidden>Select installer</option>' + state.employees.map(employee => `<option value="${esc(employee.id)}">${esc(employeeName(employee))}</option>`).join('');
    $('tool-issue-warehouse').innerHTML = '<option value="" disabled selected hidden>Select warehouse</option>' + state.warehouses.map(warehouse => `<option value="${esc(warehouse.id)}">${esc(warehouse.name)}</option>`).join('');
  }

  async function loadInventory() {
    const eligibleSkus = state.products.map(product => product.sku).filter(Boolean);
    if (!eligibleSkus.length) {
      state.inventory = [];
      populateSkuOptions();
      return;
    }
    const inventoryResult = await state.sb.from('inventory').select('warehouse_id,sku,available').eq('company_id', state.companyId).in('sku', eligibleSkus).gt('available', 0).limit(2000);
    if (inventoryResult.error) throw inventoryResult.error;
    state.inventory = inventoryResult.data || [];
    populateSkuOptions();
  }

  async function loadTimeline() {
    const start = `${state.year}-01-01`;
    const end = `${state.year}-12-31`;
    const issuesResult = await state.sb.from('installer_tool_issues').select('id,employee_id,warehouse_id,sku,product_title,product_image_url,issued_on,lifecycle_status,ended_on,photo_proof_paths').eq('company_id', state.companyId).lte('issued_on', end).or(`ended_on.is.null,ended_on.gte.${start}`).order('issued_on').limit(1000);
    if (issuesResult.error) throw issuesResult.error;
    state.issues = issuesResult.data || [];

    const issueIds = state.issues.map(issue => issue.id);
    if (issueIds.length) {
      const eventsResult = await state.sb.from('installer_tool_issue_events').select('issue_id,status,event_date,created_at').eq('company_id', state.companyId).in('issue_id', issueIds).order('event_date').limit(3000);
      if (eventsResult.error) throw eventsResult.error;
      state.events = eventsResult.data || [];
    } else state.events = [];

    render();
  }

  async function refresh() {
    await Promise.all([loadInventory(), loadTimeline()]);
  }

  async function submitIssue(event) {
    event.preventDefault();
    const button = $('tool-issue-submit');
    button.disabled = true;
    let uploadedPaths = [];
    let issueCreated = false;
    const editIssueId = $('tool-edit-issue-id').value;
    const removedPhotoPaths = state.originalPhotoPaths.filter(path => !state.existingPhotoPaths.includes(path));
    try {
      uploadedPaths = await uploadPhotoProofs();
      const payload = {
        p_company_id: state.companyId,
        p_employee_id: $('tool-issue-installer').value,
        p_warehouse_id: $('tool-issue-warehouse').value,
        p_sku: $('tool-issue-sku').value,
        p_issued_on: $('tool-issue-date').value,
        p_photo_proof_paths: [...state.existingPhotoPaths, ...uploadedPaths]
      };
      if (editIssueId) payload.p_issue_id = editIssueId;
      const { error } = await state.sb.rpc(editIssueId ? 'update_installer_tool_issue' : 'issue_installer_tool', payload);
      if (error) throw error;
      issueCreated = true;
      if (removedPhotoPaths.length) {
        const { error: removeError } = await state.sb.storage.from('brightkey-assets').remove(removedPhotoPaths);
        if (removeError) showToast('Changes were saved, but an old photo could not be removed from storage.', true);
      }
      closeModal('tool-issue-modal');
      state.photoFiles = [];
      state.existingPhotoPaths = [];
      state.originalPhotoPaths = [];
      renderPhotoProofs();
      showToast(editIssueId ? 'Issued tool updated.' : 'Tool issued and inventory deducted.');
      try { await refresh(); }
      catch (error) { showToast('The change was saved, but the calendar could not be refreshed. Reload the page to see it.', true); }
    } catch (error) {
      if (!issueCreated && uploadedPaths.length) await state.sb.storage.from('brightkey-assets').remove(uploadedPaths);
      showToast(actionError(error, editIssueId ? 'The issued tool could not be updated. Refresh and try again.' : 'The tool could not be issued. Refresh and try again.'), true);
    } finally { button.disabled = false; }
  }

  async function submitStatus(event) {
    event.preventDefault();
    const button = $('tool-status-submit');
    button.disabled = true;
    try {
      const { error } = await state.sb.rpc('update_installer_tool_status', {
        p_company_id: state.companyId,
        p_issue_id: $('tool-status-issue-id').value,
        p_status: $('tool-status-value').value,
        p_event_date: $('tool-status-date').value
      });
      if (error) throw error;
      closeModal('tool-status-modal');
      showToast('Tool status updated.');
      await refresh();
    } catch (error) {
      showToast(actionError(error, 'The tool status could not be updated. Refresh and try again.'), true);
    } finally { button.disabled = false; }
  }

  async function changeYear(delta) {
    state.year += delta;
    try { await loadTimeline(); }
    catch (error) {
      state.year -= delta;
      showToast('The tool calendar could not be loaded. Please try again.', true);
    }
  }

  async function init({ sb, companyId }) {
    state.sb = sb;
    state.companyId = companyId;
    $('tool-issue-date').value = localDate();
    $('tool-status-date').value = localDate();
    $('issue-tool-button').addEventListener('click', () => openIssueModal());
    $('tool-issue-form').addEventListener('submit', submitIssue);
    $('tool-status-form').addEventListener('submit', submitStatus);
    $('tool-issue-warehouse').addEventListener('change', populateSkuOptions);
    $('tool-issue-add-photos').addEventListener('click', () => $('tool-issue-photos').click());
    $('tool-issue-photos').addEventListener('change', selectPhotoProofs);
    $('tool-issue-photo-previews').addEventListener('click', event => {
      const remove = event.target.closest('[data-existing-photo-index], [data-new-photo-index]');
      if (!remove) return;
      if (remove.dataset.existingPhotoIndex !== undefined) state.existingPhotoPaths.splice(Number(remove.dataset.existingPhotoIndex), 1);
      else state.photoFiles.splice(Number(remove.dataset.newPhotoIndex), 1);
      renderPhotoProofs();
    });
    $('installer-tools-prev-year').addEventListener('click', () => changeYear(-1));
    $('installer-tools-next-year').addEventListener('click', () => changeYear(1));
    $('installer-tools-body').addEventListener('click', event => {
      const edit = event.target.closest('[data-edit-issue-id]');
      if (edit) {
        const issue = state.issues.find(item => item.id === edit.dataset.editIssueId);
        if (issue) openIssueModal(issue);
        return;
      }
      const card = event.target.closest('[data-issue-id]');
      if (!card) return;
      const issue = state.issues.find(item => item.id === card.dataset.issueId);
      if (!issue || TERMINAL.has(issue.lifecycle_status)) return;
      $('tool-status-issue-id').value = issue.id;
      $('tool-status-title').textContent = `${issue.sku} — ${issue.product_title}`;
      $('tool-status-date').min = issue.issued_on;
      $('tool-status-date').value = issue.issued_on > localDate() ? issue.issued_on : localDate();
      openModal('tool-status-modal');
    });
    document.querySelectorAll('[data-close-tool-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.closeToolModal)));
    try {
      await loadReferenceData();
      await refresh();
      renderPhotoProofs();
    }
    catch (error) {
      console.error('Installer tools failed to load:', error);
      $('installer-tools-body').innerHTML = '<tr><td colspan="13" class="installer-tools-empty">The tool calendar could not be loaded. Refresh the page and try again.</td></tr>';
      showToast('The tool calendar could not be loaded. Please try again.', true);
    }
  }

  window.BKInstallerTools = { init };
})();

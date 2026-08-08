'use strict';

let selectedBusinessId = '';
let selectedFeatureId = '';
let selectedSpecificationId = '';
let catalogSpecifications = [];
let draggedSpecificationId = '';
let draggedFeatureId = '';

function defaultFeatureDisplayName(name) {
  return String(name || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeFeatureKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function safeSpecificationDefinitions(value) {
  if (!Array.isArray(value?.definitions)) {
    return [];
  }

  return value.definitions
    .filter((definition) => definition && definition.id && definition.label && definition.field)
    .map((definition) => ({
      id: String(definition.id),
      label: String(definition.label),
      field: String(definition.field),
      source: definition.source === 'column' ? 'column' : 'json',
      placeholder: String(definition.placeholder || '')
    }));
}

function setSpecificationSaveStatus(text, state = '') {
  const status = document.getElementById('spec-autosave-status');
  status.textContent = text;
  status.className = `autosave-status ${state}`.trim();
}

async function autosaveSpecifications() {
  setSpecificationSaveStatus('Saving...', 'saving');
  const { error } = await SettingsPage.sb.from('global_settings').upsert({
    company_id: SettingsPage.currentCompanyId,
    key: 'catalog_spec_definitions',
    value: { definitions: catalogSpecifications }
  }, { onConflict: 'company_id,key' });

  if (error) {
    console.error('Error saving catalog specifications:', error);
    setSpecificationSaveStatus('Save failed', 'error');
    SettingsPage.showToast('Specification changes could not be saved. Please try again.', true);
    return false;
  }

  setSpecificationSaveStatus('Autosaved', 'saved');
  return true;
}

async function reorderSpecifications(insertionIndex) {
  const fromIndex = catalogSpecifications.findIndex((item) => item.id === draggedSpecificationId);
  if (fromIndex < 0) return;
  const [moved] = catalogSpecifications.splice(fromIndex, 1);
  const adjustedIndex = fromIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
  if (adjustedIndex === fromIndex) {
    catalogSpecifications.splice(fromIndex, 0, moved);
    return;
  }
  catalogSpecifications.splice(Math.max(0, Math.min(adjustedIndex, catalogSpecifications.length)), 0, moved);
  renderSpecifications();
  await autosaveSpecifications();
}

function renderSpecifications() {
  const tbody = document.getElementById('specifications-body');
  tbody.textContent = '';

  if (catalogSpecifications.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.className = 'empty-state';
    cell.textContent = 'No product specifications configured.';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  catalogSpecifications.forEach((definition) => {
    const row = document.createElement('tr');
    row.className = 'spec-row';
    row.dataset.specificationId = definition.id;

    const orderCell = document.createElement('td');
    const labelCell = document.createElement('td');
    const actionCell = document.createElement('td');

    const dragHandle = document.createElement('button');
    dragHandle.type = 'button';
    dragHandle.className = 'drag-handle';
    dragHandle.draggable = true;
    dragHandle.title = 'Drag to reorder';
    dragHandle.setAttribute('aria-label', `Reorder ${definition.label}`);
    dragHandle.innerHTML = '<svg aria-hidden="true" viewBox="0 0 12 20"><circle cx="3" cy="4" r="1.4"></circle><circle cx="9" cy="4" r="1.4"></circle><circle cx="3" cy="10" r="1.4"></circle><circle cx="9" cy="10" r="1.4"></circle><circle cx="3" cy="16" r="1.4"></circle><circle cx="9" cy="16" r="1.4"></circle></svg>';
    orderCell.appendChild(dragHandle);

    labelCell.textContent = definition.label;
    labelCell.style.fontWeight = '650';

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'spec-edit';
    edit.title = 'Edit specification name';
    edit.setAttribute('aria-label', `Edit ${definition.label}`);
    edit.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg>';
    edit.addEventListener('click', () => openSpecificationModal(definition));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'spec-delete';
    remove.title = 'Delete specification';
    remove.setAttribute('aria-label', `Delete ${definition.label}`);
    remove.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M9 6V4h6v2"></path></svg>';
    remove.addEventListener('click', () => confirmDeleteSpecification(definition));
    actionCell.className = 'spec-actions';
    actionCell.append(edit, remove);

    row.addEventListener('dragstart', (event) => {
      draggedSpecificationId = definition.id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', definition.id);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      draggedSpecificationId = '';
      row.classList.remove('dragging');
      document.querySelectorAll('.spec-row').forEach((item) => item.classList.remove('drag-over-before', 'drag-over-after'));
      document.querySelectorAll('.spec-drop-end').forEach((item) => item.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (!draggedSpecificationId || draggedSpecificationId === definition.id) return;
      const after = event.clientY > row.getBoundingClientRect().top + (row.offsetHeight / 2);
      row.classList.toggle('drag-over-before', !after);
      row.classList.toggle('drag-over-after', after);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over-before', 'drag-over-after'));
    row.addEventListener('drop', async (event) => {
      event.preventDefault();
      const toIndex = catalogSpecifications.findIndex((item) => item.id === definition.id);
      const after = event.clientY > row.getBoundingClientRect().top + (row.offsetHeight / 2);
      row.classList.remove('drag-over-before', 'drag-over-after');
      if (toIndex < 0) return;
      await reorderSpecifications(toIndex + (after ? 1 : 0));
    });

    row.append(orderCell, labelCell, actionCell);
    tbody.appendChild(row);
  });

  const dropRow = document.createElement('tr');
  dropRow.className = 'spec-drop-end';
  const dropCell = document.createElement('td');
  dropCell.colSpan = 3;
  dropCell.setAttribute('aria-label', 'Drop specification at end of list');
  dropRow.appendChild(dropCell);
  dropRow.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (draggedSpecificationId) dropRow.classList.add('drag-over');
  });
  dropRow.addEventListener('dragleave', () => dropRow.classList.remove('drag-over'));
  dropRow.addEventListener('drop', async (event) => {
    event.preventDefault();
    dropRow.classList.remove('drag-over');
    await reorderSpecifications(catalogSpecifications.length);
  });
  tbody.appendChild(dropRow);

}

async function loadSpecifications() {
  const { data, error } = await SettingsPage.sb
    .from('global_settings')
    .select('value')
    .eq('company_id', SettingsPage.currentCompanyId)
    .eq('key', 'catalog_spec_definitions')
    .maybeSingle();

  if (error) {
    console.error('Error loading catalog specifications:', error);
    SettingsPage.showToast('Saved specification order could not be loaded.', true);
  }

  catalogSpecifications = safeSpecificationDefinitions(data?.value);
  renderSpecifications();
  setSpecificationSaveStatus('Autosaved', 'saved');
}

function confirmDeleteSpecification(definition) {
  SettingsPage.showConfirmModal(`Delete the ${definition.label} specification from the catalog? Existing product values will be retained.`, async () => {
    catalogSpecifications = catalogSpecifications.filter((item) => item.id !== definition.id);
    renderSpecifications();
    await autosaveSpecifications();
  });
}

async function saveFeatureOrder(businessFeatures) {
  const orderedFeatures = businessFeatures.map((feature, index) => ({
    id: feature.id,
    business_id: feature.business_id,
    name: feature.name,
    display_name: feature.display_name,
    sort_order: index
  }));
  const { error } = await SettingsPage.sb.from('business_features')
    .upsert(orderedFeatures, { onConflict: 'id' });
  if (error) throw error;
}

async function reorderFeatures(list, businessFeatures, businessId, insertionIndex) {
  const fromIndex = businessFeatures.findIndex((item) => item.id === draggedFeatureId);
  if (fromIndex < 0) return;
  const [moved] = businessFeatures.splice(fromIndex, 1);
  const adjustedIndex = fromIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
  if (adjustedIndex === fromIndex) {
    businessFeatures.splice(fromIndex, 0, moved);
    return;
  }
  businessFeatures.splice(Math.max(0, Math.min(adjustedIndex, businessFeatures.length)), 0, moved);
  renderFeatureList(list, businessFeatures, businessId);
  try {
    await saveFeatureOrder(businessFeatures);
    SettingsPage.showToast('Feature order saved.');
  } catch (error) {
    console.error('Error saving feature order:', error);
    SettingsPage.showToast('Feature order could not be saved. Please try again.', true);
    await loadCatalogSettings();
  }
}

function createFeatureRow(feature, businessFeatures) {
  const chip = document.createElement('div');
  chip.className = 'feature-chip';
  chip.dataset.featureId = feature.id;

  const dragHandle = document.createElement('button');
  dragHandle.type = 'button';
  dragHandle.className = 'feature-drag-handle';
  dragHandle.draggable = true;
  dragHandle.title = 'Drag to reorder';
  dragHandle.setAttribute('aria-label', `Reorder ${feature.display_name || defaultFeatureDisplayName(feature.name)}`);
  dragHandle.innerHTML = '<svg aria-hidden="true" viewBox="0 0 12 20"><circle cx="3" cy="4" r="1.4"></circle><circle cx="9" cy="4" r="1.4"></circle><circle cx="3" cy="10" r="1.4"></circle><circle cx="9" cy="10" r="1.4"></circle><circle cx="3" cy="16" r="1.4"></circle><circle cx="9" cy="16" r="1.4"></circle></svg>';

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'feature-chip-edit';
  edit.setAttribute('aria-label', `Edit ${feature.display_name || defaultFeatureDisplayName(feature.name)}`);
  const text = document.createElement('span');
  text.className = 'feature-chip-text';
  const name = document.createElement('span');
  name.textContent = feature.display_name || defaultFeatureDisplayName(feature.name);
  text.appendChild(name);
  edit.appendChild(text);
  edit.addEventListener('click', () => openFeatureModal(feature.business_id, feature));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'feature-delete';
  remove.setAttribute('aria-label', `Delete ${name.textContent}`);
  remove.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
  remove.addEventListener('click', () => confirmDeleteFeature(feature));

  dragHandle.addEventListener('dragstart', (event) => {
    draggedFeatureId = feature.id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', feature.id);
    chip.classList.add('dragging');
  });
  dragHandle.addEventListener('dragend', () => {
    draggedFeatureId = '';
    chip.classList.remove('dragging');
    document.querySelectorAll('.feature-chip').forEach((item) => item.classList.remove('drag-over-before', 'drag-over-after'));
    document.querySelectorAll('.feature-drop-end').forEach((item) => item.classList.remove('drag-over'));
  });
  chip.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (!draggedFeatureId || draggedFeatureId === feature.id) return;
    const after = event.clientY > chip.getBoundingClientRect().top + (chip.offsetHeight / 2);
    chip.classList.toggle('drag-over-before', !after);
    chip.classList.toggle('drag-over-after', after);
  });
  chip.addEventListener('dragleave', () => chip.classList.remove('drag-over-before', 'drag-over-after'));
  chip.addEventListener('drop', async (event) => {
    event.preventDefault();
    const list = chip.parentElement;
    const toIndex = businessFeatures.findIndex((item) => item.id === feature.id);
    const after = event.clientY > chip.getBoundingClientRect().top + (chip.offsetHeight / 2);
    chip.classList.remove('drag-over-before', 'drag-over-after');
    if (toIndex < 0) return;
    await reorderFeatures(list, businessFeatures, feature.business_id, toIndex + (after ? 1 : 0));
  });

  chip.append(dragHandle, edit, remove);
  return chip;
}

function renderFeatureList(list, businessFeatures, businessId) {
  list.textContent = '';
  list.dataset.businessId = businessId;
  if (businessFeatures.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'empty-inline';
    empty.textContent = 'No product features configured.';
    list.appendChild(empty);
  } else {
    businessFeatures.forEach((feature) => list.appendChild(createFeatureRow(feature, businessFeatures)));
  }
  const dropAtEnd = document.createElement('div');
  dropAtEnd.className = 'feature-drop-end';
  dropAtEnd.setAttribute('aria-label', 'Drop feature at end of list');
  dropAtEnd.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (draggedFeatureId) dropAtEnd.classList.add('drag-over');
  });
  dropAtEnd.addEventListener('dragleave', () => dropAtEnd.classList.remove('drag-over'));
  dropAtEnd.addEventListener('drop', async (event) => {
    event.preventDefault();
    dropAtEnd.classList.remove('drag-over');
    await reorderFeatures(list, businessFeatures, businessId, businessFeatures.length);
  });
  list.appendChild(dropAtEnd);
  const addFeature = document.createElement('button');
  addFeature.type = 'button';
  addFeature.className = 'feature-add';
  addFeature.title = 'Add product feature';
  addFeature.setAttribute('aria-label', 'Add product feature');
  addFeature.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
  addFeature.addEventListener('click', () => openFeatureModal(businessId));
  list.appendChild(addFeature);
}

function renderBusinesses(businesses, features) {
  const container = document.getElementById('business-features-body');
  container.textContent = '';

  if (businesses.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No businesses configured. Create one from the Businesses settings tab.';
    container.appendChild(empty);
  }

  businesses.forEach((business) => {
    const card = document.createElement('article');
    card.className = 'business-feature-card';
    const businessFeatures = features.filter((feature) => feature.business_id === business.id);

    const heading = document.createElement('h3');
    heading.className = 'business-feature-card-title';
    heading.textContent = business.name;

    const list = document.createElement('div');
    list.className = 'feature-list';
    renderFeatureList(list, businessFeatures, business.id);
    card.append(heading, list);
    container.appendChild(card);
  });

}

async function loadCatalogSettings() {
  try {
    const { data: businesses, error: businessError } = await SettingsPage.sb
      .from('tenant_businesses')
      .select('id,name,company_id')
      .eq('company_id', SettingsPage.currentCompanyId)
      .order('name');
    if (businessError) throw businessError;

    const businessIds = (businesses || []).map((business) => business.id);
    let features = [];
    if (businessIds.length > 0) {
      const { data, error } = await SettingsPage.sb
        .from('business_features')
        .select('id,business_id,name,display_name,sort_order')
        .in('business_id', businessIds)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      features = data || [];
    }

    renderBusinesses(businesses || [], features);
  } catch (error) {
    console.error('Error loading catalog settings:', error);
    SettingsPage.showToast('Catalog settings could not be loaded. Please refresh and try again.', true);
    renderBusinesses([], []);
  }
}

window.openFeatureModal = function(businessId, feature = null) {
  selectedBusinessId = businessId;
  selectedFeatureId = feature?.id || '';
  document.getElementById('feature-display-name').value = feature
    ? (feature.display_name || defaultFeatureDisplayName(feature.name))
    : '';
  document.getElementById('feature-name').value = feature?.name || '';
  document.getElementById('feature-name').disabled = Boolean(feature);
  document.getElementById('feature-key-group').style.display = feature ? 'none' : '';
  document.getElementById('feature-modal-title').textContent = feature ? 'Edit Product Feature' : 'Add Product Feature';
  document.getElementById('btn-save-feature').textContent = feature ? 'Save Changes' : 'Add Feature';
  document.getElementById('feature-modal').classList.add('open');
  document.getElementById('feature-display-name').focus();
};

window.closeFeatureModal = function() {
  document.getElementById('feature-modal').classList.remove('open');
  selectedBusinessId = '';
  selectedFeatureId = '';
  document.getElementById('feature-name').disabled = false;
  document.getElementById('feature-key-group').style.display = '';
};

window.openSpecificationModal = function(definition = null) {
  selectedSpecificationId = definition?.id || '';
  document.getElementById('specification-label').value = definition?.label || '';
  document.getElementById('specification-modal-title').textContent = definition ? 'Edit Specification' : 'Add Specification';
  document.getElementById('specification-form-hint').textContent = definition
    ? 'Only the front-facing name will change. Existing product values remain tied to the same specification ID and field.'
    : 'A safe field key will be generated automatically.';
  document.getElementById('btn-save-specification').textContent = definition ? 'Save Changes' : 'Add Specification';
  document.getElementById('specification-modal').classList.add('open');
  document.getElementById('specification-label').focus();
};

window.closeSpecificationModal = function() {
  document.getElementById('specification-modal').classList.remove('open');
  selectedSpecificationId = '';
};

function confirmDeleteFeature(feature) {
  const displayName = feature.display_name || defaultFeatureDisplayName(feature.name);
  SettingsPage.showConfirmModal(`Delete the ${displayName} feature?`, async () => {
    const { error } = await SettingsPage.sb.from('business_features').delete().eq('id', feature.id);
    if (error) {
      SettingsPage.showToast('This feature could not be deleted. Please try again.', true);
      return;
    }
    SettingsPage.showToast('Feature deleted.');
    await loadCatalogSettings();
  });
}

document.getElementById('feature-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const displayName = document.getElementById('feature-display-name').value.trim();
  const name = normalizeFeatureKey(document.getElementById('feature-name').value);
  if (!displayName || !name || !selectedBusinessId) return;

  const button = document.getElementById('btn-save-feature');
  const isEditing = Boolean(selectedFeatureId);
  button.disabled = true;
  button.textContent = 'Saving...';
  try {
    const query = isEditing
      ? SettingsPage.sb.from('business_features').update({ display_name: displayName }).eq('id', selectedFeatureId)
      : SettingsPage.sb.from('business_features').insert({
        business_id: selectedBusinessId,
        name,
        display_name: displayName,
        sort_order: document.querySelectorAll(`.feature-list[data-business-id="${selectedBusinessId}"] .feature-chip[data-feature-id]`).length
      });
    const { error } = await query;
    if (error) throw error;
    closeFeatureModal();
    SettingsPage.showToast(isEditing ? 'Feature label updated.' : 'Feature added.');
    await loadCatalogSettings();
  } catch (error) {
    console.error('Error adding catalog feature:', error);
    SettingsPage.showToast('This feature already exists or could not be saved.', true);
  } finally {
    button.disabled = false;
    button.textContent = isEditing ? 'Save Changes' : 'Add Feature';
  }
});

document.getElementById('specification-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const label = document.getElementById('specification-label').value.trim();
  const isEditing = Boolean(selectedSpecificationId);
  const field = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!label || !field) return;

  if (!isEditing && catalogSpecifications.some((definition) => definition.field === field)) {
    SettingsPage.showToast('A specification with this name already exists.', true);
    return;
  }

  if (isEditing && catalogSpecifications.some((definition) => definition.id !== selectedSpecificationId && definition.label.toLowerCase() === label.toLowerCase())) {
    SettingsPage.showToast('A specification with this name already exists.', true);
    return;
  }

  const button = document.getElementById('btn-save-specification');
  button.disabled = true;
  button.textContent = 'Saving...';
  if (isEditing) {
    const definition = catalogSpecifications.find((item) => item.id === selectedSpecificationId);
    if (definition) {
      definition.label = label;
      definition.placeholder = `Enter ${label.toLowerCase()}`;
    }
  } else {
    catalogSpecifications.push({
      id: `custom_${field}`,
      label,
      field,
      source: 'json',
      placeholder: `Enter ${label.toLowerCase()}`
    });
  }
  renderSpecifications();

  if (await autosaveSpecifications()) {
    closeSpecificationModal();
    SettingsPage.showToast(isEditing ? 'Specification name updated.' : 'Specification added.');
  }
  button.disabled = false;
  button.textContent = isEditing ? 'Save Changes' : 'Add Specification';
});

window.initSettingsPage = async function() {
  await Promise.all([loadSpecifications(), loadCatalogSettings()]);
};

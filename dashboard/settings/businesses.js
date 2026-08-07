'use strict';

let editingBusinessId = '';

function formatBusinessDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));
}

function businessKey(name) {
  return String(name || '').toLowerCase().replace(/[\s_.-]+/g, '_');
}

function renderBusinesses(businesses, productCounts = new Map()) {
  const tbody = document.getElementById('businesses-body');
  tbody.textContent = '';

  if (businesses.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'empty-state';
    cell.textContent = 'No businesses created yet.';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  businesses.forEach((business) => {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    const description = document.createElement('td');
    const products = document.createElement('td');
    const created = document.createElement('td');
    const actions = document.createElement('td');

    name.className = 'business-name';
    name.textContent = business.name;
    description.className = 'business-description';
    description.textContent = business.description || '—';
    products.className = 'business-product-count';
    products.textContent = String(productCounts.get(businessKey(business.name)) || 0);
    created.textContent = formatBusinessDate(business.created_at);

    actions.className = 'business-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'business-action business-edit';
    edit.title = `Edit ${business.name}`;
    edit.setAttribute('aria-label', `Edit ${business.name}`);
    edit.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
    edit.addEventListener('click', () => openBusinessModal(business));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'business-action business-delete';
    remove.title = `Delete ${business.name}`;
    remove.setAttribute('aria-label', `Delete ${business.name}`);
    remove.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M8 6V4h8v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
    remove.addEventListener('click', () => confirmDeleteBusiness(business));

    actions.append(edit, remove);

    row.append(name, description, products, created, actions);
    tbody.appendChild(row);
  });
}

async function loadBusinesses() {
  if (!SettingsPage.currentCompanyId) {
    renderBusinesses([]);
    return;
  }

  const [businessesResult, countsResult] = await Promise.all([
    SettingsPage.sb
      .from('tenant_businesses')
      .select('id,name,description,created_at')
      .eq('company_id', SettingsPage.currentCompanyId)
      .order('name'),
    SettingsPage.sb.rpc('get_business_product_counts', {
      p_company_id: SettingsPage.currentCompanyId
    })
  ]);

  if (businessesResult.error || countsResult.error) {
    console.error('Error loading businesses:', businessesResult.error || countsResult.error);
    SettingsPage.showToast('Businesses could not be loaded. Please refresh and try again.', true);
    renderBusinesses([]);
    return;
  }

  const productCounts = new Map(
    (countsResult.data || []).map((row) => [row.business_key, Number(row.product_count) || 0])
  );
  renderBusinesses(businessesResult.data || [], productCounts);
}

function updateCharacterCount(inputId, countId) {
  const input = document.getElementById(inputId);
  const count = document.getElementById(countId);
  if (input && count) count.textContent = String(input.value.length);
}

window.openBusinessModal = function(business = null) {
  const name = document.getElementById('business-name');
  const description = document.getElementById('business-description');
  editingBusinessId = business?.id || '';
  name.value = business?.name || '';
  description.value = business?.description || '';
  document.getElementById('business-modal-title').textContent = business ? 'Edit Business' : 'Create Business';
  document.getElementById('btn-save-business').textContent = business ? 'Save Changes' : 'Create Business';
  updateCharacterCount('business-name', 'business-name-count');
  updateCharacterCount('business-description', 'business-description-count');
  document.getElementById('business-modal').classList.add('open');
  name.focus();
};

window.closeBusinessModal = function() {
  document.getElementById('business-modal').classList.remove('open');
  editingBusinessId = '';
};

function confirmDeleteBusiness(business) {
  SettingsPage.showConfirmModal(`Delete ${business.name}? Its configured product features will also be removed.`, async () => {
    const { error } = await SettingsPage.sb
      .from('tenant_businesses')
      .delete()
      .eq('id', business.id)
      .eq('company_id', SettingsPage.currentCompanyId);

    if (error) {
      console.error('Error deleting business:', error);
      SettingsPage.showToast('The business could not be deleted. Please try again.', true);
      return;
    }

    SettingsPage.showToast('Business deleted.');
    await loadBusinesses();
  });
}

document.getElementById('business-name').addEventListener('input', () => {
  updateCharacterCount('business-name', 'business-name-count');
});

document.getElementById('business-description').addEventListener('input', () => {
  updateCharacterCount('business-description', 'business-description-count');
});

document.getElementById('business-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('business-name').value.trim();
  const description = document.getElementById('business-description').value.trim();
  if (!name || !description || !SettingsPage.currentCompanyId) return;

  const button = document.getElementById('btn-save-business');
  const isEditing = Boolean(editingBusinessId);
  button.disabled = true;
  button.textContent = isEditing ? 'Saving...' : 'Creating...';

  try {
    const query = isEditing
      ? SettingsPage.sb
        .from('tenant_businesses')
        .update({ name, description })
        .eq('id', editingBusinessId)
        .eq('company_id', SettingsPage.currentCompanyId)
      : SettingsPage.sb.from('tenant_businesses').insert({
        company_id: SettingsPage.currentCompanyId,
        name,
        description
      });
    const { error } = await query;
    if (error) throw error;

    closeBusinessModal();
    SettingsPage.showToast(isEditing ? 'Business updated.' : 'Business created.');
    await loadBusinesses();
  } catch (error) {
    console.error(`Error ${isEditing ? 'updating' : 'creating'} business:`, error);
    const isDuplicate = error?.code === '23505';
    SettingsPage.showToast(
      isDuplicate
        ? 'A business with this name already exists. Use a different name.'
        : `The business could not be ${isEditing ? 'updated' : 'created'}. Check the details and try again.`,
      true
    );
  } finally {
    button.disabled = false;
    button.textContent = isEditing ? 'Save Changes' : 'Create Business';
  }
});

window.initSettingsPage = loadBusinesses;

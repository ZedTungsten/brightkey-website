'use strict';

(function registerInstallerCustomCredits() {
  let credits = [];
  let managerCredits = [];
  let managerMonth = new Date();
  let pendingDeleteId = null;
  const getModal = () => document.getElementById('installer-custom-credit-modal');
  const getManagerModal = () => document.getElementById('manage-installer-custom-credits-modal');
  const getDeleteModal = () => document.getElementById('delete-installer-custom-credit-modal');
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  window.BKInstallerCustomCredits = Object.freeze({
    async load({ sb, companyId, start, end }) {
      const { data, error } = await sb.from('installer_custom_credits')
        .select('id, employee_id, label, credit_date, credit_value')
        .eq('company_id', companyId)
        .gte('credit_date', start)
        .lte('credit_date', end)
        .order('credit_date', { ascending: true });
      if (error) throw error;
      credits = data || [];
    },
    applyToSummary(summary, employeeId) {
      credits.filter(credit => credit.employee_id === employeeId).forEach(credit => {
        summary.credit += Number(credit.credit_value) || 0;
        if (credit.credit_date && (!summary.lastAssigned || credit.credit_date > summary.lastAssigned)) summary.lastAssigned = credit.credit_date;
      });
    },
    appendHistoryRows(rows, employee) {
      credits.filter(credit => credit.employee_id === employee.id).forEach(credit => {
        rows.push({ employee, date: credit.credit_date || '', completed: true, customer: credit.label || 'Custom credit', sku: [], assignment: 'Custom' });
      });
    }
  });

  function eligibleInstallers() {
    const names = new Set((window._installerAssignmentNames || []).map(name => String(name || '').trim().toLowerCase()));
    names.add('installer');
    names.add('installers');
    return dbEmployees.filter(employee => isActiveBookingEmployee(employee)
      && String(employee.assignment || '').split(',').some(name => names.has(name.trim().toLowerCase())))
      .sort((a, b) => [a.first_name, a.last_name].join(' ').localeCompare([b.first_name, b.last_name].join(' ')));
  }

  function closeModal() {
    getModal()?.classList.remove('open');
    getModal()?.setAttribute('aria-hidden', 'true');
  }

  function updateManagerButtonVisibility() {
    const button = document.getElementById('edit-installer-custom-credits');
    if (button) button.style.display = window.location.pathname === '/dashboard/installers/assignments' ? 'inline-flex' : 'none';
  }

  function setOverlayOpen(modal, open) {
    modal?.classList.toggle('open', open);
    modal?.setAttribute('aria-hidden', String(!open));
  }

  function monthStorageKey() {
    return `bk_custom_credit_month_${currentCompanyId}`;
  }

  function setManagerMonth(year, month) {
    managerMonth = new Date(year, month, 1);
    localStorage.setItem(monthStorageKey(), `${managerMonth.getFullYear()}-${String(managerMonth.getMonth() + 1).padStart(2, '0')}`);
    document.getElementById('custom-credit-month-title').textContent = `${monthNames[managerMonth.getMonth()]} ${managerMonth.getFullYear()}`;
  }

  function getManagerMonthRange() {
    return {
      start: formatLocalDate(new Date(managerMonth.getFullYear(), managerMonth.getMonth(), 1)),
      end: formatLocalDate(new Date(managerMonth.getFullYear(), managerMonth.getMonth() + 1, 0))
    };
  }

  function installerName(employeeId) {
    const employee = dbEmployees.find(item => item.id === employeeId);
    return employee ? [employee.first_name, employee.last_name].filter(Boolean).join(' ') : 'Unknown installer';
  }

  function makeCell(text = '') {
    const cell = document.createElement('td');
    cell.textContent = text;
    return cell;
  }

  function makeIconButton({ label, type, onClick }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `custom-credit-icon-button${type === 'delete' ? ' delete' : ''}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = type === 'delete'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5M14 11v5"></path></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
    button.addEventListener('click', onClick);
    return button;
  }

  function renderManagerRows() {
    const tbody = document.getElementById('custom-credit-manager-tbody');
    tbody.replaceChildren();
    if (!managerCredits.length) {
      const row = document.createElement('tr');
      const cell = makeCell('No custom credits for this month.');
      cell.colSpan = 5;
      cell.className = 'custom-credit-empty';
      row.append(cell);
      tbody.append(row);
      return;
    }
    managerCredits.forEach(credit => {
      const row = document.createElement('tr');
      row.dataset.creditId = credit.id;
      row.append(makeCell(installerName(credit.employee_id)));
      row.append(makeCell(credit.label));
      row.append(makeCell(Number(credit.credit_value).toLocaleString('en-PH', { maximumFractionDigits: 2 })));
      row.append(makeCell(new Date(`${credit.credit_date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })));
      const actionCell = makeCell();
      const actions = document.createElement('div');
      actions.className = 'custom-credit-actions';
      actions.append(
        makeIconButton({ label: 'Edit custom credit', type: 'edit', onClick: () => renderEditRow(credit) }),
        makeIconButton({ label: 'Delete custom credit', type: 'delete', onClick: () => openDeleteModal(credit) })
      );
      actionCell.append(actions);
      row.append(actionCell);
      tbody.append(row);
    });
  }

  function makeEditInput({ type, value, className = '', min, step }) {
    const input = document.createElement('input');
    input.className = `form-input ${className}`.trim();
    input.type = type;
    input.value = value;
    input.required = true;
    if (min) input.min = min;
    if (step) input.step = step;
    return input;
  }

  function renderEditRow(credit) {
    renderManagerRows();
    const row = document.querySelector(`[data-credit-id="${credit.id}"]`);
    if (!row) return;
    const cells = row.children;
    const labelInput = makeEditInput({ type: 'text', value: credit.label });
    labelInput.maxLength = 120;
    const amountInput = makeEditInput({ type: 'number', value: String(credit.credit_value), className: 'custom-credit-amount-input', min: '0.01', step: '0.01' });
    const dateInput = makeEditInput({ type: 'date', value: credit.credit_date });
    cells[1].replaceChildren(labelInput);
    cells[2].replaceChildren(amountInput);
    cells[3].replaceChildren(dateInput);
    const buttons = document.createElement('div');
    buttons.className = 'custom-credit-row-buttons';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-outline';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', renderManagerRows);
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn btn-primary';
    save.textContent = 'Save Changes';
    save.addEventListener('click', () => saveCreditChanges(credit.id, { labelInput, amountInput, dateInput, save }));
    buttons.append(cancel, save);
    cells[4].replaceChildren(buttons);
    labelInput.focus();
  }

  async function refreshAfterMutation() {
    const results = await Promise.allSettled([loadManagerCredits(), loadMonthBookings()]);
    const refreshError = results.find(result => result.status === 'rejected');
    if (refreshError) {
      console.error('Custom credit saved but an affected view could not be refreshed:', refreshError.reason);
      showToast('Saved, but an affected view could not refresh. Reload the page to see the latest totals.', true);
      return false;
    }
    return true;
  }

  async function saveCreditChanges(id, fields) {
    const label = fields.labelInput.value.trim();
    const creditValue = Number(fields.amountInput.value);
    const creditDate = fields.dateInput.value;
    if (!label || !Number.isFinite(creditValue) || creditValue <= 0 || !creditDate) return;
    fields.save.disabled = true;
    fields.save.textContent = 'Saving...';
    try {
      const { data, error } = await sb.from('installer_custom_credits')
        .update({ label, credit_value: creditValue, credit_date: creditDate })
        .eq('id', id)
        .eq('company_id', currentCompanyId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Custom credit was not found or is no longer editable.');
      const refreshed = await refreshAfterMutation();
      if (refreshed) showToast('Custom credit updated.');
    } catch (error) {
      console.error('Failed to update installer custom credit:', error);
      showToast('The custom credit could not be updated. Please try again.', true);
      fields.save.disabled = false;
      fields.save.textContent = 'Save Changes';
    }
  }

  function openDeleteModal(credit) {
    pendingDeleteId = credit.id;
    document.getElementById('delete-installer-custom-credit-message').textContent = `Delete “${credit.label}” for ${installerName(credit.employee_id)}? This cannot be undone.`;
    setOverlayOpen(getDeleteModal(), true);
  }

  function closeDeleteModal() {
    pendingDeleteId = null;
    setOverlayOpen(getDeleteModal(), false);
  }

  async function deleteCredit() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    const button = document.getElementById('confirm-delete-installer-custom-credit');
    button.disabled = true;
    button.textContent = 'Deleting...';
    try {
      const { data, error } = await sb.from('installer_custom_credits')
        .delete()
        .eq('id', id)
        .eq('company_id', currentCompanyId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Custom credit was not found or is no longer editable.');
      closeDeleteModal();
      const refreshed = await refreshAfterMutation();
      if (refreshed) showToast('Custom credit deleted.');
    } catch (error) {
      console.error('Failed to delete installer custom credit:', error);
      showToast('The custom credit could not be deleted. Please try again.', true);
    } finally {
      button.disabled = false;
      button.textContent = 'Delete';
    }
  }

  async function loadManagerCredits() {
    const tbody = document.getElementById('custom-credit-manager-tbody');
    const loadingRow = document.createElement('tr');
    const loadingCell = makeCell('Loading custom credits...');
    loadingCell.colSpan = 5;
    loadingCell.className = 'custom-credit-empty';
    loadingRow.append(loadingCell);
    tbody.replaceChildren(loadingRow);
    const { start, end } = getManagerMonthRange();
    try {
      const { data, error } = await sb.from('installer_custom_credits')
        .select('id, employee_id, label, credit_date, credit_value')
        .eq('company_id', currentCompanyId)
        .gte('credit_date', start)
        .lte('credit_date', end)
        .order('credit_date', { ascending: false })
        .limit(500);
      if (error) throw error;
      managerCredits = data || [];
      renderManagerRows();
    } catch (error) {
      console.error('Failed to load custom credit manager:', error);
      managerCredits = [];
      loadingCell.textContent = 'Custom credits could not be loaded. Please try again.';
    }
  }

  async function openManagerModal() {
    const saved = localStorage.getItem(monthStorageKey());
    const savedMatch = /^(\d{4})-(\d{2})$/.exec(saved || '');
    setManagerMonth(savedMatch ? Number(savedMatch[1]) : currentYear, savedMatch ? Number(savedMatch[2]) - 1 : currentMonth);
    setOverlayOpen(getManagerModal(), true);
    await loadManagerCredits();
  }

  function closeManagerModal() {
    setOverlayOpen(getManagerModal(), false);
  }

  async function changeManagerMonth(offset) {
    setManagerMonth(managerMonth.getFullYear(), managerMonth.getMonth() + offset);
    await loadManagerCredits();
  }

  function openModal() {
    const options = eligibleInstallers().map(employee => {
      const option = document.createElement('option');
      option.value = employee.id;
      option.textContent = [employee.first_name, employee.last_name].filter(Boolean).join(' ');
      return option;
    });
    document.getElementById('installer-custom-credit-employee').replaceChildren(...options);
    document.getElementById('installer-custom-credit-date').value = formatLocalDate(new Date());
    document.getElementById('installer-custom-credit-label').value = '';
    document.getElementById('installer-custom-credit-value').value = '1';
    getModal()?.classList.add('open');
    getModal()?.setAttribute('aria-hidden', 'false');
    document.getElementById('installer-custom-credit-employee').focus();
  }

  async function submit(event) {
    event.preventDefault();
    const label = document.getElementById('installer-custom-credit-label').value.trim();
    const employeeId = document.getElementById('installer-custom-credit-employee').value;
    const creditValue = Number(document.getElementById('installer-custom-credit-value').value);
    const creditDate = document.getElementById('installer-custom-credit-date').value;
    if (!label || !employeeId || !Number.isFinite(creditValue) || creditValue <= 0 || !creditDate || !currentCompanyId) return;
    const button = document.getElementById('submit-installer-custom-credit');
    button.disabled = true;
    button.textContent = 'Adding...';
    try {
      const { error } = await sb.from('installer_custom_credits').insert({
        company_id: currentCompanyId,
        employee_id: employeeId,
        label,
        credit_date: creditDate,
        credit_value: creditValue
      });
      if (error) throw error;
      closeModal();
      await loadMonthBookings();
      if (getManagerModal()?.classList.contains('open')) await loadManagerCredits();
      showToast('Custom credit added.');
    } catch (error) {
      console.error('Failed to add installer custom credit:', error);
      showToast('The custom credit could not be added. Please try again.', true);
    } finally {
      button.disabled = false;
      button.textContent = 'Add';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateManagerButtonVisibility();
    document.getElementById('add-installer-custom-credit')?.addEventListener('click', openModal);
    document.getElementById('edit-installer-custom-credits')?.addEventListener('click', openManagerModal);
    document.getElementById('close-installer-custom-credit')?.addEventListener('click', closeModal);
    document.getElementById('cancel-installer-custom-credit')?.addEventListener('click', closeModal);
    document.getElementById('installer-custom-credit-form')?.addEventListener('submit', submit);
    document.getElementById('close-manage-installer-custom-credits')?.addEventListener('click', closeManagerModal);
    document.getElementById('custom-credit-month-previous')?.addEventListener('click', () => changeManagerMonth(-1));
    document.getElementById('custom-credit-month-next')?.addEventListener('click', () => changeManagerMonth(1));
    document.getElementById('cancel-delete-installer-custom-credit')?.addEventListener('click', closeDeleteModal);
    document.getElementById('confirm-delete-installer-custom-credit')?.addEventListener('click', deleteCredit);
    getModal()?.addEventListener('click', event => { if (event.target === getModal()) closeModal(); });
    getManagerModal()?.addEventListener('click', event => { if (event.target === getManagerModal()) closeManagerModal(); });
    getDeleteModal()?.addEventListener('click', event => { if (event.target === getDeleteModal()) closeDeleteModal(); });
  });
  window.addEventListener('popstate', updateManagerButtonVisibility);
})();

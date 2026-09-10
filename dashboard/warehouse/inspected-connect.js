'use strict';

(() => {
  const RESULT_LIMIT = 500;
  let sb;
  let companyId;
  let showToast;
  let onConnected;
  let initialized = false;
  let selectedInspection = null;
  let selectedDispatch = null;
  let inspections = [];
  let dispatches = [];
  let dispatchMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let previousFocus = null;

  const byId = id => document.getElementById(id);

  function monthRange() {
    const start = new Date(dispatchMonth.getFullYear(), dispatchMonth.getMonth(), 1);
    const end = new Date(dispatchMonth.getFullYear(), dispatchMonth.getMonth() + 1, 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  function formatDate(value) {
    return value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  }

  function setMessage(container, message) {
    container.replaceChildren();
    const copy = document.createElement('p');
    copy.className = 'connect-list-message';
    copy.textContent = message;
    container.append(copy);
  }

  function makeOption({ name, value, primary, secondary, checked, onChange }) {
    const label = document.createElement('label');
    label.className = 'connect-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = checked;
    input.addEventListener('change', onChange);
    const copy = document.createElement('span');
    copy.className = 'connect-option-copy';
    const main = document.createElement('span');
    main.className = 'connect-option-primary';
    main.textContent = primary;
    const detail = document.createElement('span');
    detail.className = 'connect-option-secondary';
    detail.textContent = secondary;
    copy.append(main, detail);
    label.append(input, copy);
    return label;
  }

  function updateConnectButton() {
    byId('connect-inspection-confirm').disabled = !(selectedInspection && selectedDispatch);
  }

  function renderInspections() {
    const list = byId('connect-in-stock-list');
    list.replaceChildren();
    if (!inspections.length) {
      setMessage(list, 'There are no unassigned in-stock inspection codes.');
      return;
    }
    inspections.forEach(inspection => {
      list.append(makeOption({
        name: 'connect-inspection',
        value: inspection.id,
        primary: inspection.code,
        secondary: `${inspection.sku} · Inspected ${formatDate(inspection.inspected_at)}`,
        checked: selectedInspection?.id === inspection.id,
        onChange: () => {
          selectedInspection = inspection;
          selectedDispatch = null;
          renderDispatches();
          updateConnectButton();
        }
      }));
    });
  }

  function renderDispatches() {
    const list = byId('connect-dispatched-list');
    list.replaceChildren();
    if (!selectedInspection) {
      setMessage(list, 'Select an in-stock inspection code to see compatible dispatched orders.');
      return;
    }
    const compatible = dispatches.filter(dispatch => dispatch.sku === selectedInspection.sku && dispatch.availableUnits.length);
    if (!compatible.length) {
      setMessage(list, `No available dispatched ${selectedInspection.sku} units were found for this month.`);
      return;
    }
    compatible.forEach(dispatch => {
      const availableLabel = `${dispatch.availableUnits.length} of ${dispatch.quantity} unit${dispatch.quantity === 1 ? '' : 's'} available`;
      list.append(makeOption({
        name: 'connect-dispatch',
        value: dispatch.id,
        primary: `${dispatch.reference_id} · ${dispatch.customer_name || 'Customer not recorded'}`,
        secondary: `${dispatch.sku} · Dispatched ${formatDate(dispatch.timestamp_dispatched)} · ${availableLabel}`,
        checked: selectedDispatch?.id === dispatch.id,
        onChange: () => {
          selectedDispatch = dispatch;
          updateConnectButton();
        }
      }));
    });
  }

  async function loadInspections() {
    setMessage(byId('connect-in-stock-list'), 'Loading in-stock inspection codes...');
    const { data, error } = await sb.from('warehouse_inspections')
      .select('id,code,sku,inspected_at,warehouse_inspection_allocations()')
      .eq('company_id', companyId)
      .eq('inspection_status', 'completed')
      .is('warehouse_inspection_allocations', null)
      .order('inspected_at', { ascending: false })
      .limit(RESULT_LIMIT);
    if (error) throw error;
    inspections = data || [];
    if (selectedInspection && !inspections.some(item => item.id === selectedInspection.id)) selectedInspection = null;
    renderInspections();
  }

  async function loadDispatches() {
    byId('connect-month-label').textContent = dispatchMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    setMessage(byId('connect-dispatched-list'), 'Loading dispatched orders...');
    selectedDispatch = null;
    updateConnectButton();
    const { start, end } = monthRange();
    const { data: transactions, error } = await sb.from('inventory_transactions')
      .select('id,reference_id,sku,quantity,customer_name,timestamp_dispatched')
      .eq('company_id', companyId)
      .eq('type', 'customer_order')
      .not('timestamp_dispatched', 'is', null)
      .is('timestamp_cancelled', null)
      .gte('timestamp_dispatched', start)
      .lt('timestamp_dispatched', end)
      .order('timestamp_dispatched', { ascending: false })
      .limit(RESULT_LIMIT);
    if (error) throw error;
    const transactionIds = (transactions || []).map(item => item.id);
    let allocations = [];
    if (transactionIds.length) {
      const result = await sb.from('warehouse_inspection_allocations')
        .select('transaction_id,unit_index')
        .eq('company_id', companyId)
        .in('transaction_id', transactionIds)
        .limit(RESULT_LIMIT);
      if (result.error) throw result.error;
      allocations = result.data || [];
    }
    const usedByTransaction = new Map();
    allocations.forEach(allocation => {
      if (!usedByTransaction.has(allocation.transaction_id)) usedByTransaction.set(allocation.transaction_id, new Set());
      usedByTransaction.get(allocation.transaction_id).add(allocation.unit_index);
    });
    dispatches = (transactions || []).map(transaction => {
      const used = usedByTransaction.get(transaction.id) || new Set();
      const availableUnits = Array.from({ length: Math.max(0, Number(transaction.quantity) || 0) }, (_, index) => index + 1)
        .filter(unit => !used.has(unit));
      return { ...transaction, availableUnits };
    });
    renderDispatches();
  }

  function open() {
    previousFocus = document.activeElement;
    selectedInspection = null;
    selectedDispatch = null;
    dispatchMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    updateConnectButton();
    const modal = byId('inspect-connect-modal');
    modal.removeAttribute('inert');
    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
      modal.classList.add('open');
      modal.querySelector('.modal-close')?.focus();
    });
    Promise.all([loadInspections(), loadDispatches()]).catch(error => {
      console.error(error);
      showToast('Inspection and dispatch records could not be loaded.', true);
    });
  }

  function close() {
    const modal = byId('inspect-connect-modal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('inert', '');
    setTimeout(() => { modal.style.display = ''; }, 160);
    previousFocus?.focus();
  }

  async function changeMonth(offset) {
    dispatchMonth = new Date(dispatchMonth.getFullYear(), dispatchMonth.getMonth() + offset, 1);
    try {
      await loadDispatches();
    } catch (error) {
      console.error(error);
      setMessage(byId('connect-dispatched-list'), 'Dispatched orders could not be loaded.');
      showToast('Dispatched orders could not be loaded.', true);
    }
  }

  async function connect() {
    if (!selectedInspection || !selectedDispatch) return;
    const button = byId('connect-inspection-confirm');
    button.disabled = true;
    button.textContent = 'Connecting...';
    try {
      const unitIndex = selectedDispatch.availableUnits[0];
      if (!unitIndex || selectedInspection.sku !== selectedDispatch.sku) throw new Error('The selected records are no longer compatible.');
      const { data: userData, error: userError } = await sb.auth.getUser();
      if (userError) throw userError;
      const { error } = await sb.from('warehouse_inspection_allocations').insert({
        company_id: companyId,
        transaction_id: selectedDispatch.id,
        inspection_id: selectedInspection.id,
        unit_index: unitIndex,
        reference_id: selectedDispatch.reference_id,
        sku: selectedDispatch.sku,
        allocated_by: userData.user?.id
      });
      if (error) throw error;
      close();
      showToast(`${selectedInspection.code} connected to ${selectedDispatch.reference_id}.`);
      await onConnected?.();
    } catch (error) {
      console.error(error);
      const raced = error?.code === '23505';
      showToast(raced ? 'That inspection or dispatched unit was already connected. Refresh and try again.' : 'The inspection could not be connected. Please try again.', true);
      if (raced) await Promise.all([loadInspections(), loadDispatches()]);
    } finally {
      button.disabled = !(selectedInspection && selectedDispatch);
      button.textContent = 'Connect';
    }
  }

  function init(options) {
    sb = options.sb;
    companyId = options.companyId;
    showToast = options.showToast;
    onConnected = options.onConnected;
    if (initialized) return;
    initialized = true;
    byId('update-inspected-btn').addEventListener('click', open);
    byId('connect-prev-month').addEventListener('click', () => changeMonth(-1));
    byId('connect-next-month').addEventListener('click', () => changeMonth(1));
    byId('connect-inspection-confirm').addEventListener('click', connect);
    byId('inspect-connect-modal').addEventListener('click', event => { if (event.target === event.currentTarget) close(); });
    document.querySelectorAll('[data-connect-close]').forEach(button => button.addEventListener('click', close));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && byId('inspect-connect-modal').classList.contains('open')) close();
    });
  }

  window.WarehouseInspectedConnect = { init };
})();

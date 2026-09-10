'use strict';

window.WarehouseInspectedAssigned = (() => {
  const PAGE_SIZE = 50;
  let sb;
  let companyId;
  let openGallery;
  let showToast;
  let currentPage = 0;
  let totalRecords = 0;

  const byId = id => document.getElementById(id);
  const formatDate = value => value
    ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  function renderError() {
    const body = byId('assigned-list');
    body.replaceChildren();
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 8;
    cell.className = 'empty-cell';
    cell.textContent = 'Assigned records could not be loaded. Refresh and try again.';
    showToast('Assigned records could not be loaded. Refresh and try again.', true);
  }

  function renderPagination(rowCount) {
    const footer = byId('assigned-pagination');
    const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
    footer.hidden = totalRecords <= PAGE_SIZE;
    byId('assigned-page-status').textContent = totalRecords
      ? `${currentPage * PAGE_SIZE + 1}–${currentPage * PAGE_SIZE + rowCount} of ${totalRecords}`
      : '';
    byId('assigned-prev-page').disabled = currentPage === 0;
    byId('assigned-next-page').disabled = currentPage + 1 >= totalPages;
  }

  function render(records) {
    const body = byId('assigned-list');
    body.replaceChildren();
    if (!records.length) {
      const row = body.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 8;
      cell.className = 'empty-cell';
      cell.textContent = 'No inspections are currently assigned for Pack or Dispatch.';
      renderPagination(0);
      return;
    }
    records.forEach(record => {
      const row = body.insertRow();
      [record.code, record.sku, record.reference_id, record.customer_name].forEach(value => {
        const cell = row.insertCell();
        cell.textContent = value || '—';
      });
      const mediaCell = row.insertCell();
      const mediaButton = document.createElement('button');
      mediaButton.type = 'button';
      mediaButton.className = 'media-link';
      mediaButton.textContent = 'See Media Uploaded';
      mediaButton.addEventListener('click', () => openGallery(record));
      mediaCell.appendChild(mediaButton);
      [record.inspected_by_name, formatDate(record.inspected_at), formatDate(record.allocated_at)].forEach(value => {
        const cell = row.insertCell();
        cell.textContent = value || '—';
      });
    });
    renderPagination(records.length);
  }

  async function load() {
    const body = byId('assigned-list');
    body.innerHTML = '<tr><td colspan="8"><div class="loading-wrapper"><div class="spinner-cyan"></div><span>Loading assigned records...</span></div></td></tr>';
    const start = currentPage * PAGE_SIZE;
    const { data, count, error } = await sb.from('warehouse_inspection_allocations')
      .select(`
        allocated_at,
        reference_id,
        transaction:inventory_transactions!inner(id, customer_name, type, status, timestamp_dispatched, timestamp_received, timestamp_cancelled),
        inspection:warehouse_inspections!inner(id, code, sku, media_urls, inspected_by_name, inspected_at)
      `, { count: 'exact' })
      .eq('company_id', companyId)
      .eq('transaction.type', 'customer_order')
      .is('transaction.timestamp_dispatched', null)
      .is('transaction.timestamp_received', null)
      .is('transaction.timestamp_cancelled', null)
      .in('transaction.status', ['reserved', 'inspect', 'packed'])
      .order('allocated_at', { ascending: false })
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw error;
    totalRecords = count || 0;
    const records = (data || []).map(allocation => ({
      ...allocation.inspection,
      reference_id: allocation.reference_id,
      customer_name: allocation.transaction?.customer_name,
      allocated_at: allocation.allocated_at
    }));
    render(records);
  }

  async function changePage(nextPage) {
    if (nextPage < 0 || nextPage * PAGE_SIZE >= totalRecords) return;
    currentPage = nextPage;
    try {
      await load();
    } catch (error) {
      console.error(error);
      renderError();
    }
  }

  async function init(context) {
    ({ sb, companyId, openGallery, showToast } = context);
    byId('assigned-prev-page').addEventListener('click', () => changePage(currentPage - 1));
    byId('assigned-next-page').addEventListener('click', () => changePage(currentPage + 1));
    try {
      await load();
    } catch (error) {
      console.error(error);
      renderError();
    }
  }

  return Object.freeze({ init });
})();

'use strict';

const Forecast = {
  sb: null,
  companyId: '',
  tenantId: '',
  warehouseId: '',
  days: 30,
  showOnlyWithSales: false,
  visibleStatuses: new Set(['critical', 'soon', 'healthy']),
  products: [],
  businesses: [],
  suppliers: [],
  warehouses: [],
  inventory: [],
  sales: [],
  incoming: [],
  visibleForecastRows: [],
  recommendedOrderGroups: [],
  editingGroupId: '',
  deletingGroupId: '',
  groupDraftSkus: new Set(),
  exclusionDraftSkus: new Set(),
  deletingExclusionSku: '',
  starDraftKeys: new Set(),
  config: { default_average_days: 30, lead_times: [], safety_stock: {}, future_demand: [], sku_groups: [], excluded_skus: [], starred_skus: [] }
};

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function showToast(message, isError = false) {
  const host = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `forecast-toast ${isError ? 'error' : 'success'}`;
  toast.textContent = message;
  host.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3500);
}

function parseArrayField(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function isInstallerCompletedOrder(booking) {
  if (['done', 'completed', 'finished'].includes(String(booking.status || '').toLowerCase())) return true;
  const doors = parseArrayField(booking.doors);
  if (!doors.length) return false;
  const products = parseArrayField(booking.products);
  return doors.every(door => {
    if (door?.completed) return true;
    const attachedSkus = Array.isArray(door?.products) ? door.products : [];
    return attachedSkus.length > 0 && attachedSkus.every(sku => {
      const matches = products.filter(product => product?.sku === sku);
      return matches.length > 0 && matches.every(product => product.cancelled);
    });
  });
}

function getCompletedOrderItems(booking) {
  if (!isInstallerCompletedOrder(booking)) return [];
  const products = parseArrayField(booking.products);
  if (products.length) {
    return products.filter(product => product?.sku && !product.cancelled && product.sku !== 'ADD-ON LABOR')
      .map(product => ({ sku: String(product.sku).trim(), quantity: Number(product.qty ?? product.quantity) || 1 }));
  }
  const skus = String(booking.product_skus || '').split(' | ');
  const quantities = String(booking.product_qtys || '').split(' | ');
  return skus.map((sku, index) => ({ sku: sku.trim(), quantity: Number(quantities[index]) || 1 }))
    .filter(item => item.sku && item.sku !== 'ADD-ON LABOR');
}

function normalizeConfig(value) {
  const source = value && typeof value === 'object' ? value : {};
  const supportedDays = new Set([7, 14, 30, 60, 90, 180, 365]);
  const defaultAverageDays = Number(source.default_average_days);
  return {
    default_average_days: supportedDays.has(defaultAverageDays) ? defaultAverageDays : 30,
    lead_times: Array.isArray(source.lead_times) ? source.lead_times : [],
    safety_stock: source.safety_stock && typeof source.safety_stock === 'object' ? source.safety_stock : {},
    future_demand: Array.isArray(source.future_demand) ? source.future_demand : [],
    sku_groups: Array.isArray(source.sku_groups) ? source.sku_groups : [],
    excluded_skus: Array.isArray(source.excluded_skus) ? source.excluded_skus : [],
    starred_skus: Array.isArray(source.starred_skus) ? source.starred_skus : []
  };
}

async function fetchPaged(table, projection, configure, pageSize = 500, maxPages = 20) {
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    let query = Forecast.sb.from(table).select(projection);
    query = configure(query).range(page * pageSize, (page + 1) * pageSize - 1);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function loadReferenceData() {
  const [products, businessResult, supplierResult, warehouseResult, configResult] = await Promise.all([
    fetchPaged('products', 'id,sku,title,business,count_inventory', query => query
      .eq('company_id', Forecast.companyId).order('sku')),
    Forecast.sb.from('tenant_businesses').select('id,name').eq('company_id', Forecast.companyId).order('name'),
    Forecast.sb.from('suppliers').select('id,name,business_id').eq('company_id', Forecast.companyId).order('name'),
    Forecast.sb.from('warehouses').select('id,name,is_active').eq('tenant_id', Forecast.tenantId).order('created_at'),
    Forecast.sb.from('global_settings').select('value').eq('company_id', Forecast.companyId)
      .eq('key', 'inventory_forecast_config').maybeSingle()
  ]);
  if (businessResult.error) throw businessResult.error;
  if (supplierResult.error) throw supplierResult.error;
  if (warehouseResult.error) throw warehouseResult.error;
  if (configResult.error) throw configResult.error;

  Forecast.products = products.filter(product => product.count_inventory !== false && product.sku);
  Forecast.businesses = businessResult.data || [];
  Forecast.suppliers = supplierResult.data || [];
  Forecast.warehouses = (warehouseResult.data || []).filter(warehouse => warehouse.is_active);
  Forecast.config = normalizeConfig(configResult.data?.value);
  Forecast.days = Forecast.config.default_average_days;
  document.getElementById('forecast-days').value = String(Forecast.days);
  renderWarehouseOptions();
  renderSettings();
}

function renderWarehouseOptions() {
  const select = document.getElementById('forecast-warehouse');
  select.textContent = '';
  Forecast.warehouses.forEach(warehouse => {
    const option = document.createElement('option');
    option.value = warehouse.id;
    option.textContent = warehouse.name;
    select.appendChild(option);
  });
  Forecast.warehouseId = Forecast.warehouses[0]?.id || '';
  if (!Forecast.warehouseId) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No warehouse configured';
    select.appendChild(option);
    select.disabled = true;
  }
}

async function loadForecastData() {
  const body = document.getElementById('forecast-body');
  const columnCount = Forecast.config.future_demand.length ? 15 : 13;
  const table = document.getElementById('forecast-table');
  table.classList.toggle('has-future-demand', columnCount === 15);
  table.querySelectorAll('.future-demand-column').forEach(column => { column.hidden = columnCount !== 15; });
  body.innerHTML = `<tr><td colspan="${columnCount}" class="empty-state">Loading forecast…</td></tr>`;
  if (!Forecast.warehouseId) {
    body.innerHTML = `<tr><td colspan="${columnCount}" class="empty-state">Create an active warehouse first.</td></tr>`;
    return;
  }

  const start = new Date();
  start.setDate(start.getDate() - Forecast.days);
  const end = new Date();
  const toLocalDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const startDate = toLocalDate(start);
  const endDate = toLocalDate(end);
  try {
    const [inventoryResult, sales, incoming] = await Promise.all([
      Forecast.sb.from('inventory').select('sku,available,reserved').or(`company_id.eq.${Forecast.companyId},company_id.is.null`)
        .eq('warehouse_id', Forecast.warehouseId),
      fetchPaged('installation_bookings', 'order_no,product_skus,product_qtys,products,doors,status,scheduled_date', query => query
        .eq('company_id', Forecast.companyId).like('order_no', 'ORD-%')
        .gte('scheduled_date', startDate).lte('scheduled_date', endDate)
        .order('scheduled_date', { ascending: false })),
      fetchPaged('inventory_transactions', 'sku,quantity', query => query
        .eq('company_id', Forecast.companyId).eq('warehouse_id', Forecast.warehouseId)
        .eq('type', 'supplier_order').eq('status', 'ordered'))
    ]);
    if (inventoryResult.error) throw inventoryResult.error;
    Forecast.inventory = inventoryResult.data || [];
    Forecast.sales = sales.flatMap(getCompletedOrderItems);
    Forecast.incoming = incoming;
    renderForecast();
  } catch (error) {
    console.error('Forecast loading failed:', error);
    body.innerHTML = `<tr><td colspan="${columnCount}" class="empty-state">Forecast data could not be loaded. Refresh and try again.</td></tr>`;
  }
}

function sumBySku(rows, field) {
  const map = new Map();
  rows.forEach(row => {
    const sku = String(row.sku || '').trim().toUpperCase();
    if (sku) map.set(sku, (map.get(sku) || 0) + (Number(row[field]) || 0));
  });
  return map;
}

function buildForecastEntities() {
  const excluded = new Set(Forecast.config.excluded_skus.map(sku => String(sku).toUpperCase()));
  const products = Forecast.products.filter(product => !excluded.has(String(product.sku).toUpperCase()));
  const bySku = new Map(products.map(product => [String(product.sku).toUpperCase(), product]));
  const grouped = new Set();
  const entities = [];

  Forecast.config.sku_groups.forEach(group => {
    const members = [...new Set((group.skus || []).map(sku => String(sku).toUpperCase()))]
      .filter(sku => bySku.has(sku) && !grouped.has(sku));
    if (members.length < 2) return;
    members.forEach(sku => grouped.add(sku));
    entities.push({ key: `group:${group.id}`, sku: group.name || members.join(' + '), title: group.name || 'Combined SKU', members,
      products: members.map(sku => bySku.get(sku)), combined: true });
  });
  products.forEach(product => {
    const sku = String(product.sku).toUpperCase();
    if (!grouped.has(sku)) entities.push({ key: `sku:${sku}`, sku: product.sku, title: product.title || '—', members: [sku], products: [product], combined: false });
  });
  const starred = new Set(Forecast.config.starred_skus);
  entities.forEach(entity => { entity.starred = starred.has(entity.key); });
  return entities.sort((a, b) => Number(b.starred) - Number(a.starred) || String(a.sku).localeCompare(String(b.sku), undefined, { sensitivity: 'base' }));
}

function getLeadTime(entity) {
  const businessIds = new Set(entity.products.map(product => {
    const key = String(product.business || '').toLowerCase();
    return Forecast.businesses.find(business => business.name.toLowerCase().replace(/[\s_.-]+/g, '_') === key)?.id;
  }).filter(Boolean));
  const days = Forecast.config.lead_times.filter(item => businessIds.has(item.business_id))
    .map(item => Number(item.days) || 0).filter(value => value > 0);
  return days.length ? Math.max(...days) : 0;
}

function getFutureDemand(entity, averageDailySales) {
  const members = new Set(entity.members);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Forecast.config.future_demand.reduce((total, event) => {
    const end = new Date(`${event.end_date}T00:00:00`);
    if (Number.isNaN(end.getTime()) || end < today || !(event.skus || []).some(sku => members.has(String(sku).toUpperCase()))) return total;
    const value = Math.max(0, Number(event.value) || 0);
    if (event.mode === 'percent') {
      const horizon = Math.max(1, Math.ceil((end - today) / 86400000));
      return total + (averageDailySales * horizon * value / 100);
    }
    return total + value;
  }, 0);
}

function renderForecast() {
  const hasFutureDemand = Forecast.config.future_demand.length > 0;
  const columnCount = hasFutureDemand ? 15 : 13;
  const table = document.getElementById('forecast-table');
  table.classList.toggle('has-future-demand', hasFutureDemand);
  table.querySelectorAll('.future-demand-column').forEach(column => { column.hidden = !hasFutureDemand; });
  const inventoryAvailable = sumBySku(Forecast.inventory, 'available');
  const inventoryReserved = sumBySku(Forecast.inventory, 'reserved');
  const sold = sumBySku(Forecast.sales, 'quantity');
  const incoming = sumBySku(Forecast.incoming, 'quantity');
  const entities = buildForecastEntities();
  const rows = entities.map(entity => {
    const sum = map => entity.members.reduce((total, sku) => total + (map.get(sku) || 0), 0);
    const available = sum(inventoryAvailable);
    const reserved = sum(inventoryReserved);
    const onHand = available + reserved;
    const incomingPo = sum(incoming);
    const futureAvailable = onHand + incomingPo;
    const soldQuantity = sum(sold);
    const average = soldQuantity / Forecast.days;
    const daysLeft = average > 0 ? available / average : null;
    const leadTime = getLeadTime(entity);
    const safetyValues = entity.members.map(sku => Number(Forecast.config.safety_stock[sku]) || 0);
    const safety = entity.combined ? Math.max(0, ...safetyValues) : safetyValues[0] || 0;
    const demand = getFutureDemand(entity, average);
    const recommendedReorder = Math.ceil(Math.max(0,
      (average * (Forecast.days + leadTime)) + safety + demand - (available + incomingPo)
    ));
    const orderPoint = average * leadTime + safety + demand;
    let status = 'Healthy';
    let statusClass = 'healthy';
    if (available < safety) { status = 'Critical'; statusClass = 'critical'; }
    else if (futureAvailable <= orderPoint) { status = 'Order Soon'; statusClass = 'soon'; }
    return { ...entity, available, reserved, onHand, incomingPo, futureAvailable, soldQuantity, average, daysLeft, leadTime, safety, recommendedReorder, demand, status, statusClass };
  });

  const visibleRows = rows.filter(row => Forecast.visibleStatuses.has(row.statusClass)
    && (!Forecast.showOnlyWithSales || row.soldQuantity > 0));
  Forecast.visibleForecastRows = visibleRows;
  const orderRecommendedButton = document.getElementById('order-recommended');
  if (orderRecommendedButton) orderRecommendedButton.disabled = !visibleRows.some(row => row.recommendedReorder > 0);
  const body = document.getElementById('forecast-body');
  if (!visibleRows.length) {
    const message = rows.length ? 'No products match the selected filters.' : 'No forecastable SKUs found.';
    body.innerHTML = `<tr><td colspan="${columnCount}" class="empty-state">${message}</td></tr>`;
    return;
  }
  body.innerHTML = visibleRows.map(row => `<tr>
    <td><span class="sku-code${row.starred ? ' starred-sku' : ''}">${esc(row.sku)}</span>${row.combined ? '<span class="combined-label">Combined</span>' : ''}</td>
    <td>${esc(row.title)}</td><td class="number">${row.onHand}</td><td class="number">${row.reserved}</td>
    <td class="number">${row.incomingPo}</td><td class="number">${row.available}</td>${hasFutureDemand ? `<td class="number">${row.futureAvailable}</td>` : ''}
    <td class="number metric-divider">${row.soldQuantity || '—'}</td><td class="number">${row.average > 0 ? row.average.toFixed(2) : '—'}</td><td class="number">${row.daysLeft === null ? '—' : row.daysLeft.toFixed(1)}</td>
    <td class="number">${row.leadTime || '—'}</td><td class="number">${row.safety}</td><td class="number">${row.recommendedReorder || '—'}</td>${hasFutureDemand ? `<td class="number">${Math.ceil(row.demand)}</td>` : ''}
    <td><span class="status-pill status-${row.statusClass}">${row.status}</span></td></tr>`).join('');
}

function getBusinessForProduct(product) {
  const productBusiness = String(product?.business || '');
  return Forecast.businesses.find(business => business.id === productBusiness || normalizeBusiness(business.name) === normalizeBusiness(productBusiness)) || null;
}

function buildRecommendedOrderGroups() {
  const groups = new Map();
  Forecast.visibleForecastRows.filter(row => row.recommendedReorder > 0).forEach(row => {
    const product = row.products.find(item => getBusinessForProduct(item)) || row.products[0];
    const business = getBusinessForProduct(product);
    if (!business || !row.members.length) return;
    if (!groups.has(business.id)) groups.set(business.id, { business, items: [] });
    groups.get(business.id).items.push({ sku: row.members[0], qty: row.recommendedReorder });
  });
  return [...groups.values()];
}

const RECOMMENDED_STATUS_LABELS = { critical: 'Critical', soon: 'Order Soon', healthy: 'Healthy' };

function syncStatusFilters() {
  const selectedCount = Forecast.visibleStatuses.size;
  const statusLabel = document.getElementById('status-filter-label');
  if (statusLabel) statusLabel.textContent = selectedCount === 3 ? 'Status' : `Status (${selectedCount})`;
  document.querySelectorAll('#status-filter-menu input, #recommended-status-menu input').forEach(input => {
    input.checked = Forecast.visibleStatuses.has(input.value);
  });
  const pills = document.getElementById('recommended-status-pills');
  if (pills) pills.innerHTML = [...Forecast.visibleStatuses]
    .map(status => `<span class="recommended-status-pill ${esc(status)}">${esc(RECOMMENDED_STATUS_LABELS[status] || status)}</span>`).join('') || '<span class="recommended-status-summary-label">None</span>';
}

function renderRecommendedSupplierList(savedSelections = new Map()) {
  Forecast.recommendedOrderGroups = buildRecommendedOrderGroups();
  const list = document.getElementById('recommended-supplier-list');
  const continueButton = document.getElementById('continue-recommended-order');
  if (!Forecast.recommendedOrderGroups.length) {
    list.innerHTML = '<div class="recommended-empty">No recommended reorder items match the selected statuses.</div>';
    continueButton.disabled = true;
    return;
  }
  list.innerHTML = Forecast.recommendedOrderGroups.map(group => {
    const suppliers = Forecast.suppliers.filter(supplier => !supplier.business_id || supplier.business_id === group.business.id);
    const items = group.items.map(item => `<tr><td><span class="sku-code">${esc(item.sku)}</span></td><td>${Math.ceil(Number(item.qty) || 0)}</td></tr>`).join('');
    return `<section class="recommended-business-group">
      <label class="recommended-supplier-row"><strong>${esc(group.business.name)}</strong><select data-business-id="${esc(group.business.id)}"><option value="">Choose supplier</option>${suppliers.map(supplier => `<option value="${esc(supplier.id)}"${savedSelections.get(group.business.id) === supplier.id ? ' selected' : ''}>${esc(supplier.name)}</option>`).join('')}</select></label>
      <table class="recommended-item-table"><thead><tr><th>SKU</th><th>Qty</th></tr></thead><tbody>${items}</tbody></table>
    </section>`;
  }).join('');
  continueButton.disabled = false;
}

function refreshRecommendedOrderModal() {
  const savedSelections = new Map([...document.querySelectorAll('#recommended-supplier-list select')]
    .map(select => [select.dataset.businessId, select.value]));
  renderForecast();
  syncStatusFilters();
  renderRecommendedSupplierList(savedSelections);
}

function openRecommendedOrderModal() {
  Forecast.recommendedOrderGroups = buildRecommendedOrderGroups();
  if (!Forecast.recommendedOrderGroups.length) {
    showToast('No visible SKUs currently have a recommended reorder quantity.', true);
    return;
  }
  syncStatusFilters();
  renderRecommendedSupplierList();
  setModalOpen('recommended-order-modal', true);
}

async function continueRecommendedOrder(button) {
  const selections = [...document.querySelectorAll('#recommended-supplier-list select')];
  if (selections.some(select => !select.value)) {
    showToast('Choose a supplier for every affected business.', true);
    return;
  }
  const supplierByBusiness = new Map(selections.map(select => [select.dataset.businessId, select.value]));
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const handoff = {
    nonce,
    created_at: new Date().toISOString(),
    warehouse_id: Forecast.warehouseId || null,
    orders: Forecast.recommendedOrderGroups.map(group => ({
      business_id: group.business.id,
      supplier_id: supplierByBusiness.get(group.business.id),
      items: group.items
    }))
  };
  button.disabled = true;
  button.textContent = 'Preparing...';
  try {
    const { error } = await Forecast.sb.from('global_settings').upsert({
      company_id: Forecast.companyId,
      key: 'inventory_reorder_handoff',
      value: handoff
    }, { onConflict: 'company_id,key' });
    if (error) throw error;
    window.location.href = `/dashboard/inventory/order?recommended=${encodeURIComponent(nonce)}`;
  } catch (error) {
    console.error('Recommended order handoff failed:', error);
    showToast('The recommended order could not be prepared. Try again.', true);
    button.disabled = false;
    button.textContent = 'Continue to Order';
  }
}

async function saveConfig(message) {
  const { error } = await Forecast.sb.from('global_settings').upsert({
    company_id: Forecast.companyId, key: 'inventory_forecast_config', value: Forecast.config
  }, { onConflict: 'company_id,key' });
  if (error) throw error;
  showToast(message);
  await loadForecastData();
}

function renderLeadTimes() {
  const body = document.getElementById('lead-time-body');
  const businessMap = new Map(Forecast.businesses.map(item => [item.id, item.name]));
  if (!Forecast.suppliers.length) {
    body.innerHTML = '<tr><td colspan="3" class="empty-state">No suppliers configured.</td></tr>';
    return;
  }
  body.innerHTML = Forecast.suppliers.map(supplier => {
    const current = Forecast.config.lead_times.find(item => item.supplier_id === supplier.id);
    return `<tr data-supplier="${esc(supplier.id)}" data-business="${esc(supplier.business_id || '')}"><td>${esc(businessMap.get(supplier.business_id) || 'All Businesses')}</td><td>${esc(supplier.name)}</td><td><input class="lead-days" type="number" min="0" step="1" value="${Number(current?.days) || 0}" /></td></tr>`;
  }).join('');
}

function renderGeneralSettings() {
  const select = document.getElementById('default-forecast-days');
  if (select) select.value = String(Forecast.config.default_average_days || 30);
}

function renderSafetyStock() {
  const entities = buildForecastEntities();
  const leftBody = document.getElementById('safety-stock-body-left');
  const rightBody = document.getElementById('safety-stock-body-right');
  if (!entities.length) {
    leftBody.innerHTML = '<tr><td colspan="3" class="empty-state">No forecastable SKUs found.</td></tr>';
    rightBody.innerHTML = '<tr><td colspan="3" class="empty-state">No forecastable SKUs found.</td></tr>';
    return;
  }
  const rows = entities.map(entity => {
    const safety = Math.max(0, ...entity.members.map(sku => Number(Forecast.config.safety_stock[sku]) || 0));
    const title = entity.combined ? `Combined: ${entity.members.join(', ')}` : entity.title;
    return `<tr data-skus="${esc(JSON.stringify(entity.members))}"><td><span class="sku-code${entity.starred ? ' starred-sku' : ''}">${esc(entity.sku)}</span>${entity.combined ? '<span class="combined-label">Combined</span>' : ''}</td><td>${esc(title || '—')}</td><td><input class="safety-value" type="number" min="0" step="1" value="${safety}" /></td></tr>`;
  });
  const splitAt = Math.ceil(rows.length / 2);
  leftBody.innerHTML = rows.slice(0, splitAt).join('');
  rightBody.innerHTML = rows.slice(splitAt).join('') || '<tr><td colspan="3" class="empty-state">No additional SKUs.</td></tr>';
}

function normalizeBusiness(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_.-]+/g, '');
}

function productBelongsToBusiness(product, business) {
  return business === 'all' || (business && (product.business === business.id || normalizeBusiness(product.business) === normalizeBusiness(business.name)));
}

function skuCheckboxes(selected = [], prefix = 'sku', products = Forecast.products) {
  const selectedSet = new Set(selected.map(sku => String(sku).toUpperCase()));
  return products.map((product, index) => {
    const sku = String(product.sku).toUpperCase();
    return `<label class="check-option"><input type="checkbox" id="${prefix}-${index}" value="${esc(sku)}" ${selectedSet.has(sku) ? 'checked' : ''} /><span>${esc(product.sku)}</span></label>`;
  }).join('');
}

function renderDemand() {
  document.getElementById('demand-skus').innerHTML = skuCheckboxes([], 'demand');
  const list = document.getElementById('demand-list');
  if (!Forecast.config.future_demand.length) {
    list.innerHTML = '<div class="settings-card empty-state">No future demand events.</div>';
    return;
  }
  list.innerHTML = Forecast.config.future_demand.map(event => `<div class="settings-list-item"><div><strong>${esc(event.name)}</strong><br><span>Until ${esc(event.end_date)} · ${(event.skus || []).length} SKU(s) · ${esc(event.value)} ${event.mode === 'percent' ? '%' : 'units'}</span></div><button class="delete-button" type="button" data-delete-demand="${esc(event.id)}">Delete</button></div>`).join('');
}

function renderSkuRules() {
  renderStarredList();
  const list = document.getElementById('group-list');
  if (!Forecast.config.sku_groups.length) {
    list.innerHTML = '<tr><td colspan="3" class="empty-state">No combined SKU groups.</td></tr>';
  } else {
    list.innerHTML = Forecast.config.sku_groups.map(group => `<tr><td><strong>${esc(group.name)}</strong></td><td>${esc((group.skus || []).join(', '))}</td><td><div class="row-actions"><button class="icon-button edit-icon" type="button" data-edit-group="${esc(group.id)}" aria-label="Edit ${esc(group.name)}" title="Edit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button><button class="icon-button delete-icon" type="button" data-delete-group="${esc(group.id)}" aria-label="Delete ${esc(group.name)}" title="Delete"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg></button></div></td></tr>`).join('');
  }
  renderExcludedList();
}

function buildStarCandidates() {
  const grouped = new Set();
  const candidates = Forecast.config.sku_groups.filter(group => (group.skus || []).length >= 2).map(group => {
    (group.skus || []).forEach(sku => grouped.add(String(sku).toUpperCase()));
    return { key: `group:${group.id}`, label: group.name || (group.skus || []).join(' + '), type: 'Combined' };
  });
  Forecast.products.forEach(product => {
    const sku = String(product.sku).toUpperCase();
    if (!grouped.has(sku)) candidates.push({ key: `sku:${sku}`, label: product.sku, type: 'SKU' });
  });
  return candidates.sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }));
}

function renderStarredList() {
  const body = document.getElementById('starred-list');
  const starred = new Set(Forecast.config.starred_skus);
  const rows = buildStarCandidates().filter(item => starred.has(item.key));
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="3" class="empty-state">No starred SKUs.</td></tr>';
    return;
  }
  body.innerHTML = rows.map(item => `<tr><td><span class="sku-code starred-sku">${esc(item.label)}</span></td><td>${esc(item.type)}</td><td><div class="row-actions"><button class="icon-button delete-icon" type="button" data-remove-star="${esc(item.key)}" aria-label="Remove star from ${esc(item.label)}" title="Remove Star"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg></button></div></td></tr>`).join('');
}

function renderStarOptions(query = '') {
  const term = String(query).trim().toLowerCase();
  const starred = new Set(Forecast.config.starred_skus);
  const options = buildStarCandidates().filter(item => !starred.has(item.key) && (!term || String(item.label).toLowerCase().includes(term)));
  document.getElementById('star-options').innerHTML = options.length ? options.map((item, index) => `<label class="check-option"><input type="checkbox" id="star-${index}" value="${esc(item.key)}" ${Forecast.starDraftKeys.has(item.key) ? 'checked' : ''} /><span>${esc(item.label)} <small>${esc(item.type)}</small></span></label>`).join('') : '<div class="empty-state">No available SKUs or groups.</div>';
}

function openStarModal() {
  Forecast.starDraftKeys = new Set();
  document.getElementById('star-search').value = '';
  renderStarOptions();
  setModalOpen('star-modal', true);
  document.getElementById('star-search').focus();
}

function closeStarModal() {
  Forecast.starDraftKeys = new Set();
  setModalOpen('star-modal', false);
}

function renderExcludedList() {
  const body = document.getElementById('excluded-list');
  if (!Forecast.config.excluded_skus.length) {
    body.innerHTML = '<tr><td colspan="3" class="empty-state">No disregarded SKUs.</td></tr>';
    return;
  }
  const productMap = new Map(Forecast.products.map(product => [String(product.sku).toUpperCase(), product]));
  body.innerHTML = Forecast.config.excluded_skus.map(rawSku => {
    const sku = String(rawSku).toUpperCase();
    const product = productMap.get(sku);
    return `<tr><td><span class="sku-code">${esc(sku)}</span></td><td>${esc(product?.title || '—')}</td><td><div class="row-actions"><button class="icon-button delete-icon" type="button" data-delete-exclusion="${esc(sku)}" aria-label="Remove ${esc(sku)} exclusion" title="Remove"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg></button></div></td></tr>`;
  }).join('');
}

function renderExclusionBusinessOptions() {
  document.getElementById('exclusion-business').innerHTML = '<option value="all" selected>ALL</option>' + Forecast.businesses.map(business => `<option value="${esc(business.id)}">${esc(business.name)}</option>`).join('');
}

function renderExclusionSkus(businessId = 'all', query = '') {
  const business = businessId === 'all' ? 'all' : Forecast.businesses.find(item => item.id === businessId);
  const term = String(query).trim().toLowerCase();
  const excluded = new Set(Forecast.config.excluded_skus.map(sku => String(sku).toUpperCase()));
  const grouped = new Set(Forecast.config.sku_groups.flatMap(group => group.skus || []).map(sku => String(sku).toUpperCase()));
  const products = Forecast.products.filter(product => productBelongsToBusiness(product, business) && !excluded.has(String(product.sku).toUpperCase()) && !grouped.has(String(product.sku).toUpperCase()) && (!term || String(product.sku).toLowerCase().includes(term)));
  document.getElementById('exclusion-skus').innerHTML = products.length ? skuCheckboxes([...Forecast.exclusionDraftSkus], 'exclusion', products) : '<div class="empty-state">No available SKUs.</div>';
}

function openExclusionModal() {
  Forecast.exclusionDraftSkus = new Set();
  document.getElementById('exclusion-search').value = '';
  renderExclusionBusinessOptions();
  renderExclusionSkus();
  setModalOpen('exclusion-modal', true);
  document.getElementById('exclusion-search').focus();
}

function closeExclusionModal() {
  Forecast.exclusionDraftSkus = new Set();
  setModalOpen('exclusion-modal', false);
}

function renderGroupBusinessOptions(selectedId = 'all') {
  const select = document.getElementById('group-business');
  select.innerHTML = `<option value="all" ${selectedId === 'all' ? 'selected' : ''}>ALL</option>` + Forecast.businesses.map(business => `<option value="${esc(business.id)}" ${business.id === selectedId ? 'selected' : ''}>${esc(business.name)}</option>`).join('');
}

function renderGroupSkus(businessId, query = '') {
  const business = businessId === 'all' ? 'all' : Forecast.businesses.find(item => item.id === businessId);
  const term = String(query).trim().toLowerCase();
  const groupedElsewhere = new Set(Forecast.config.sku_groups.filter(group => group.id !== Forecast.editingGroupId)
    .flatMap(group => group.skus || []).map(sku => String(sku).toUpperCase()));
  const businessProducts = Forecast.products.filter(product => productBelongsToBusiness(product, business) && !groupedElsewhere.has(String(product.sku).toUpperCase()));
  const products = businessProducts.filter(product => !term || String(product.sku).toLowerCase().includes(term));
  document.getElementById('group-skus').innerHTML = products.length ? skuCheckboxes([...Forecast.groupDraftSkus], 'group', products) : `<div class="empty-state">${businessProducts.length ? 'No matching SKUs.' : 'No inventory SKUs registered under this business.'}</div>`;
}

function inferGroupBusinessId(group) {
  if (group.business_id === 'all') return 'all';
  if (group.business_id && Forecast.businesses.some(item => item.id === group.business_id)) return group.business_id;
  const members = new Set((group.skus || []).map(sku => String(sku).toUpperCase()));
  const product = Forecast.products.find(item => members.has(String(item.sku).toUpperCase()));
  return Forecast.businesses.find(business => productBelongsToBusiness(product || {}, business))?.id || '';
}

function setModalOpen(id, open) {
  const modal = document.getElementById(id);
  modal.style.display = 'flex';
  modal.offsetHeight;
  modal.classList.toggle('open', open);
  modal.setAttribute('aria-hidden', String(!open));
  if (!open) window.setTimeout(() => { if (!modal.classList.contains('open')) modal.style.display = 'none'; }, 150);
}

function openGroupModal(group = null) {
  Forecast.editingGroupId = group?.id || '';
  document.getElementById('group-modal-title').textContent = group ? 'Edit Group' : 'Add Group';
  document.getElementById('group-name').value = group?.name || '';
  document.getElementById('group-sku-search').value = '';
  Forecast.groupDraftSkus = new Set((group?.skus || []).map(sku => String(sku).toUpperCase()));
  const businessId = group ? inferGroupBusinessId(group) : 'all';
  renderGroupBusinessOptions(businessId);
  renderGroupSkus(businessId);
  setModalOpen('group-modal', true);
  document.getElementById('group-name').focus();
}

function closeGroupModal() {
  Forecast.editingGroupId = '';
  Forecast.groupDraftSkus = new Set();
  setModalOpen('group-modal', false);
}

function renderSettings() {
  renderGeneralSettings();
  renderLeadTimes();
  renderSafetyStock();
  renderDemand();
  renderSkuRules();
}

function checkedValues(containerId) {
  return [...document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`)].map(input => input.value);
}

function setForecastView(viewName, updateHash = true) {
  const selectedView = viewName === 'settings' ? 'settings' : 'forecast';
  document.querySelectorAll('[data-view]').forEach(item => item.classList.toggle('active', item.dataset.view === selectedView));
  document.querySelectorAll('.forecast-view').forEach(view => view.classList.toggle('active', view.id === `${selectedView}-view`));
  if (updateHash) history.replaceState(null, '', selectedView === 'settings' ? '#settings' : `${window.location.pathname}${window.location.search}`);
}

function bindEvents() {
  document.getElementById('forecast-warehouse').addEventListener('change', event => {
    Forecast.warehouseId = event.target.value;
    loadForecastData();
  });
  document.getElementById('forecast-days').addEventListener('change', event => {
    Forecast.days = Number(event.target.value) || 30;
    loadForecastData();
  });
  const statusButton = document.getElementById('status-filter-button');
  const statusMenu = document.getElementById('status-filter-menu');
  statusButton.addEventListener('click', event => {
    event.stopPropagation();
    statusMenu.hidden = !statusMenu.hidden;
    statusButton.setAttribute('aria-expanded', String(!statusMenu.hidden));
  });
  statusMenu.addEventListener('click', event => event.stopPropagation());
  statusMenu.addEventListener('change', event => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    if (event.target.checked) Forecast.visibleStatuses.add(event.target.value);
    else Forecast.visibleStatuses.delete(event.target.value);
    syncStatusFilters();
    renderForecast();
  });
  document.getElementById('show-only-with-sales').addEventListener('change', event => {
    Forecast.showOnlyWithSales = event.target.checked;
    renderForecast();
  });
  const recommendedStatusButton = document.getElementById('recommended-status-button');
  const recommendedStatusMenu = document.getElementById('recommended-status-menu');
  recommendedStatusButton.addEventListener('click', event => {
    event.stopPropagation();
    recommendedStatusMenu.hidden = !recommendedStatusMenu.hidden;
    recommendedStatusButton.setAttribute('aria-expanded', String(!recommendedStatusMenu.hidden));
  });
  recommendedStatusMenu.addEventListener('click', event => event.stopPropagation());
  recommendedStatusMenu.addEventListener('change', event => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    if (event.target.checked) Forecast.visibleStatuses.add(event.target.value);
    else Forecast.visibleStatuses.delete(event.target.value);
    refreshRecommendedOrderModal();
  });
  document.addEventListener('click', () => {
    statusMenu.hidden = true;
    statusButton.setAttribute('aria-expanded', 'false');
    recommendedStatusMenu.hidden = true;
    recommendedStatusButton.setAttribute('aria-expanded', 'false');
  });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setForecastView(button.dataset.view)));
  document.getElementById('order-recommended').addEventListener('click', openRecommendedOrderModal);
  document.getElementById('close-recommended-order').addEventListener('click', () => setModalOpen('recommended-order-modal', false));
  document.getElementById('cancel-recommended-order').addEventListener('click', () => setModalOpen('recommended-order-modal', false));
  document.getElementById('continue-recommended-order').addEventListener('click', event => continueRecommendedOrder(event.currentTarget));
  document.querySelectorAll('[data-setting]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-setting]').forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('.settings-panel').forEach(panel => panel.classList.toggle('active', panel.id === `setting-${button.dataset.setting}`));
  }));

  document.getElementById('lead-time-body').addEventListener('change', async event => {
    if (!event.target.matches('.lead-days')) return;
    Forecast.config.lead_times = [...document.querySelectorAll('#lead-time-body tr[data-supplier]')].map(row => ({
      business_id: row.dataset.business || null, supplier_id: row.dataset.supplier,
      days: Math.max(0, Math.round(Number(row.querySelector('.lead-days').value) || 0))
    }));
    try { await saveConfig('Lead time saved.'); } catch (error) { console.error(error); showToast('Lead time could not be saved.', true); }
  });
  document.getElementById('default-forecast-days').addEventListener('change', async event => {
    const supportedDays = new Set([7, 14, 30, 60, 90, 180, 365]);
    const days = Number(event.target.value);
    if (!supportedDays.has(days)) return;
    Forecast.config.default_average_days = days;
    Forecast.days = days;
    document.getElementById('forecast-days').value = String(days);
    try { await saveConfig('Default average daily sales range saved.'); }
    catch (error) { console.error(error); showToast('The default sales range could not be saved.', true); }
  });
  document.querySelector('.safety-tables').addEventListener('change', async event => {
    if (!event.target.matches('.safety-value')) return;
    const values = { ...Forecast.config.safety_stock };
    document.querySelectorAll('.safety-stock-body tr[data-skus]').forEach(row => {
      const safety = Math.max(0, Math.round(Number(row.querySelector('.safety-value').value) || 0));
      let skus = [];
      try { skus = JSON.parse(row.dataset.skus); } catch (error) { console.error('Invalid safety stock SKU group:', error); }
      skus.forEach(sku => { values[String(sku).toUpperCase()] = safety; });
    });
    Forecast.config.safety_stock = values;
    try { await saveConfig('Safety stock saved.'); } catch (error) { console.error(error); showToast('Safety stock could not be saved.', true); }
  });

  const demandForm = document.getElementById('demand-form');
  document.getElementById('add-demand').addEventListener('click', () => { demandForm.hidden = false; });
  document.getElementById('cancel-demand').addEventListener('click', () => { demandForm.hidden = true; });
  document.getElementById('save-demand').addEventListener('click', async () => {
    const event = {
      id: crypto.randomUUID(), end_date: document.getElementById('demand-end-date').value,
      name: document.getElementById('demand-name').value.trim(), skus: checkedValues('demand-skus'),
      mode: document.getElementById('demand-mode').value,
      value: Math.max(0, Number(document.getElementById('demand-value').value) || 0)
    };
    if (!event.end_date || !event.name || !event.skus.length || event.value <= 0) {
      showToast('Complete the date, event name, affected SKUs, and projected demand.', true); return;
    }
    Forecast.config.future_demand.push(event);
    try { await saveConfig('Future demand event saved.'); demandForm.hidden = true; renderDemand(); }
    catch (error) { console.error(error); showToast('The future demand event could not be saved.', true); }
  });
  document.getElementById('demand-list').addEventListener('click', async event => {
    const button = event.target.closest('[data-delete-demand]');
    if (!button) return;
    Forecast.config.future_demand = Forecast.config.future_demand.filter(item => item.id !== button.dataset.deleteDemand);
    try { await saveConfig('Future demand event removed.'); renderDemand(); } catch (error) { console.error(error); showToast('The event could not be removed.', true); }
  });

  document.getElementById('add-stars').addEventListener('click', openStarModal);
  document.getElementById('star-search').addEventListener('input', event => renderStarOptions(event.target.value));
  document.getElementById('star-options').addEventListener('change', event => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    if (event.target.checked) Forecast.starDraftKeys.add(event.target.value);
    else Forecast.starDraftKeys.delete(event.target.value);
  });
  document.getElementById('close-star-modal').addEventListener('click', closeStarModal);
  document.getElementById('cancel-stars').addEventListener('click', closeStarModal);
  document.getElementById('star-modal').addEventListener('click', event => { if (event.target === event.currentTarget) closeStarModal(); });
  document.getElementById('save-stars').addEventListener('click', async () => {
    if (!Forecast.starDraftKeys.size) { showToast('Select at least one SKU or combined group.', true); return; }
    Forecast.config.starred_skus = [...new Set([...Forecast.config.starred_skus, ...Forecast.starDraftKeys])];
    try { await saveConfig('Starred SKUs updated.'); closeStarModal(); renderStarredList(); renderSafetyStock(); }
    catch (error) { console.error(error); showToast('Starred SKUs could not be saved.', true); }
  });
  document.getElementById('starred-list').addEventListener('click', async event => {
    const button = event.target.closest('[data-remove-star]');
    if (!button) return;
    Forecast.config.starred_skus = Forecast.config.starred_skus.filter(key => key !== button.dataset.removeStar);
    try { await saveConfig('Star removed.'); renderStarredList(); renderSafetyStock(); }
    catch (error) { console.error(error); showToast('The star could not be removed.', true); }
  });

  document.getElementById('add-group').addEventListener('click', () => openGroupModal());
  document.getElementById('group-business').addEventListener('change', event => {
    Forecast.groupDraftSkus = new Set();
    document.getElementById('group-sku-search').value = '';
    renderGroupSkus(event.target.value);
  });
  document.getElementById('group-sku-search').addEventListener('input', event => renderGroupSkus(document.getElementById('group-business').value, event.target.value));
  document.getElementById('group-skus').addEventListener('change', event => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    if (event.target.checked) Forecast.groupDraftSkus.add(event.target.value);
    else Forecast.groupDraftSkus.delete(event.target.value);
  });
  document.getElementById('close-group-modal').addEventListener('click', closeGroupModal);
  document.getElementById('cancel-group').addEventListener('click', closeGroupModal);
  document.getElementById('group-modal').addEventListener('click', event => { if (event.target === event.currentTarget) closeGroupModal(); });
  document.getElementById('save-group').addEventListener('click', async () => {
    const name = document.getElementById('group-name').value.trim();
    const businessId = document.getElementById('group-business').value;
    const skus = [...Forecast.groupDraftSkus];
    if (!name || skus.length < 2) { showToast('Enter a group name and choose at least two SKUs.', true); return; }
    const nextGroup = { id: Forecast.editingGroupId || crypto.randomUUID(), name, business_id: businessId, skus };
    const index = Forecast.config.sku_groups.findIndex(item => item.id === Forecast.editingGroupId);
    if (index >= 0) Forecast.config.sku_groups[index] = nextGroup;
    else Forecast.config.sku_groups.push(nextGroup);
    try { await saveConfig('Forecast SKU group saved.'); closeGroupModal(); renderSkuRules(); renderSafetyStock(); }
    catch (error) { console.error(error); showToast('The SKU group could not be saved.', true); }
  });
  document.getElementById('group-list').addEventListener('click', async event => {
    const editButton = event.target.closest('[data-edit-group]');
    if (editButton) {
      const group = Forecast.config.sku_groups.find(item => item.id === editButton.dataset.editGroup);
      if (group) openGroupModal(group);
      return;
    }
    const deleteButton = event.target.closest('[data-delete-group]');
    if (!deleteButton) return;
    Forecast.deletingGroupId = deleteButton.dataset.deleteGroup;
    setModalOpen('delete-group-modal', true);
  });
  document.getElementById('cancel-delete-group').addEventListener('click', () => { Forecast.deletingGroupId = ''; setModalOpen('delete-group-modal', false); });
  document.getElementById('confirm-delete-group').addEventListener('click', async () => {
    const groupId = Forecast.deletingGroupId;
    Forecast.config.sku_groups = Forecast.config.sku_groups.filter(item => item.id !== groupId);
    Forecast.config.starred_skus = Forecast.config.starred_skus.filter(key => key !== `group:${groupId}`);
    try { await saveConfig('Forecast SKU group removed.'); Forecast.deletingGroupId = ''; setModalOpen('delete-group-modal', false); renderSkuRules(); renderSafetyStock(); }
    catch (error) { console.error(error); showToast('The SKU group could not be removed.', true); }
  });
  document.getElementById('add-exclusions').addEventListener('click', openExclusionModal);
  document.getElementById('exclusion-business').addEventListener('change', event => {
    Forecast.exclusionDraftSkus = new Set();
    document.getElementById('exclusion-search').value = '';
    renderExclusionSkus(event.target.value);
  });
  document.getElementById('exclusion-search').addEventListener('input', event => renderExclusionSkus(document.getElementById('exclusion-business').value, event.target.value));
  document.getElementById('exclusion-skus').addEventListener('change', event => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    if (event.target.checked) Forecast.exclusionDraftSkus.add(event.target.value);
    else Forecast.exclusionDraftSkus.delete(event.target.value);
  });
  document.getElementById('close-exclusion-modal').addEventListener('click', closeExclusionModal);
  document.getElementById('cancel-exclusions').addEventListener('click', closeExclusionModal);
  document.getElementById('exclusion-modal').addEventListener('click', event => { if (event.target === event.currentTarget) closeExclusionModal(); });
  document.getElementById('save-exclusions').addEventListener('click', async () => {
    if (!Forecast.exclusionDraftSkus.size) { showToast('Select at least one SKU to exclude.', true); return; }
    Forecast.config.excluded_skus = [...new Set([...Forecast.config.excluded_skus, ...Forecast.exclusionDraftSkus])];
    try { await saveConfig('Excluded SKUs saved.'); closeExclusionModal(); renderExcludedList(); renderSafetyStock(); }
    catch (error) { console.error(error); showToast('Excluded SKUs could not be saved.', true); }
  });
  document.getElementById('excluded-list').addEventListener('click', event => {
    const button = event.target.closest('[data-delete-exclusion]');
    if (!button) return;
    Forecast.deletingExclusionSku = button.dataset.deleteExclusion;
    setModalOpen('delete-exclusion-modal', true);
  });
  document.getElementById('cancel-delete-exclusion').addEventListener('click', () => { Forecast.deletingExclusionSku = ''; setModalOpen('delete-exclusion-modal', false); });
  document.getElementById('confirm-delete-exclusion').addEventListener('click', async () => {
    const sku = Forecast.deletingExclusionSku;
    Forecast.config.excluded_skus = Forecast.config.excluded_skus.filter(item => String(item).toUpperCase() !== sku);
    try { await saveConfig('SKU returned to forecasting.'); Forecast.deletingExclusionSku = ''; setModalOpen('delete-exclusion-modal', false); renderExcludedList(); renderSafetyStock(); }
    catch (error) { console.error(error); showToast('The exclusion could not be removed.', true); }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const authInfo = await window.BKAuth.checkRoleGate(['Logistics'], '/admin.html');
  if (!authInfo) return;
  Forecast.sb = window.BKAuth.sb;
  Forecast.tenantId = authInfo.tenantId;
  try {
    const { data: company, error } = await Forecast.sb.from('companies').select('id')
      .eq('tenant_id', Forecast.tenantId).limit(1).maybeSingle();
    if (error) throw error;
    Forecast.companyId = company?.id || '';
    if (!Forecast.companyId) throw new Error('Company configuration is missing.');
    await loadReferenceData();
    bindEvents();
    setForecastView(window.location.hash === '#settings' ? 'settings' : 'forecast', false);
    await loadForecastData();
  } catch (error) {
    console.error('Forecast initialization failed:', error);
    showToast('Inventory Forecast could not be loaded. Refresh and try again.', true);
  }
});

'use strict';

(function () {
  const PAGE_SIZE = 50;
  const state = { sb: null, companyId: null, page: 0, total: 0, loading: false, query: '' };

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);

  function display(value) {
    const text = String(value || '').trim();
    return text && !/^(?:n\/?a|not applicable|none)$/i.test(text) ? esc(text) : '—';
  }

  function date(value) {
    if (!value) return '—';
    const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function depositCentavos(order) {
    let total = Math.abs(Number.parseInt(order.deposit_amount, 10) || 0);
    const labels = String(order.deduction_labels || '').split('|');
    const values = String(order.deduction_values || '').split('|');
    labels.forEach((label, index) => {
      if (label.trim().toLowerCase().includes('deposit')) {
        total += Math.round(Math.abs(Number.parseFloat(String(values[index] || '').replace(/,/g, '')) || 0) * 100);
      }
    });
    return total;
  }

  function totalSalesCentavos(order) {
    const deposit = depositCentavos(order);
    const grandTotal = Number.parseInt(order.grand_total, 10) || 0;
    const balanceDue = Number.parseInt(order.balance_due, 10) || 0;
    return Math.max(0, (grandTotal || balanceDue + deposit) + deposit);
  }

  function money(centavos) {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(centavos / 100);
  }

  function statusLabel(value, rawDoors) {
    const status = String(value || '').trim().toLowerCase();
    if (['cancelled', 'canceled'].includes(status)) return 'Cancelled';
    if (['done', 'completed', 'finished'].includes(status)) return 'Done';
    let doors = rawDoors;
    if (typeof doors === 'string') {
      try { doors = JSON.parse(doors); } catch { doors = []; }
    }
    if (Array.isArray(doors) && doors.length && doors.every(door => Boolean(door?.completed))) return 'Done';
    return 'Scheduled';
  }

  function names(order) {
    const first = String(order.customer_first_name || '').trim();
    const last = String(order.customer_last_name || '').trim();
    if (first || last) return { first, last };
    const legacy = String(order.customer_name || '').trim().split(/\s+/).filter(Boolean);
    return { first: legacy.shift() || '', last: legacy.join(' ') };
  }

  function customerKey(order) {
    const person = names(order);
    const phone = String(order.customer_phone || '').replace(/\D/g, '');
    if (phone) return `phone:${phone}`;
    return [person.first, person.last, order.customer_address || '']
      .map(value => String(value).trim().toLowerCase()).join('|');
  }

  function username(order) {
    const person = names(order);
    const first = person.first.split(/\s+/).filter(Boolean)[0] || '';
    const lastParts = person.last.split(/\s+/).filter(Boolean);
    return `${first}${lastParts.at(-1) || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function productLines(order) {
    const skus = String(order.product_skus || '').split('|').map(value => value.trim()).filter(Boolean);
    const quantities = String(order.product_qtys || '').split('|').map(value => value.trim());
    if (!skus.length && Array.isArray(order.products)) {
      order.products.forEach(product => {
        skus.push(String(product.sku || product.product_sku || '—'));
        quantities.push(String(product.qty || product.quantity || 1));
      });
    }
    if (!skus.length) return { skus: ['—'], quantities: ['—'] };
    return { skus, quantities: skus.map((_, index) => quantities[index] || '1') };
  }

  function groupOrders(orders) {
    const groups = new Map();
    orders.forEach(order => {
      const key = customerKey(order);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(order);
    });
    return [...groups.values()];
  }

  function paginationItems(totalPages, currentPage) {
    if (totalPages <= 10) return Array.from({ length: totalPages }, (_, index) => index + 1);
    const middleStart = Math.min(Math.max(currentPage - 1, 4), totalPages - 6);
    const pages = [1, 2, 3, ...Array.from({ length: 4 }, (_, index) => middleStart + index), totalPages - 2, totalPages - 1, totalPages];
    return [...new Set(pages)].reduce((items, page, index, uniquePages) => {
      if (index && page - uniquePages[index - 1] > 1) items.push('ellipsis');
      items.push(page);
      return items;
    }, []);
  }

  function customerCells(order, rowspan) {
    const person = names(order);
    const fields = [
      person.first, person.last, order.customer_address, order.customer_city,
      order.customer_province, order.customer_phone, order.customer_email
    ];
    return fields.map(value => `<td class="customer-cell" rowspan="${rowspan}">${display(value)}</td>`).join('');
  }

  function render(orders) {
    const body = $('customer-orders-body');
    if (!orders.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="16">No customer orders found.</td></tr>';
      return;
    }

    body.innerHTML = groupOrders(orders).map(group => group.map((order, index) => {
      const products = productLines(order);
      const skuHtml = products.skus.map(sku => `<div class="sku-line">${display(sku)}</div>`).join('');
      const qtyHtml = products.quantities.map(quantity => `<div class="qty-line">${display(quantity)}</div>`).join('');
      const bookingStatus = statusLabel(order.status, order.doors);
      return `<tr class="${index === 0 ? 'group-start' : 'group-continuation'}">
        ${index === 0 ? customerCells(order, group.length) : ''}
        <td class="order-number">${display(order.order_no)}</td>
        <td>${date(order.created_at)}</td>
        <td>${date(order.scheduled_date)}</td>
        <td><div class="sku-lines">${skuHtml}</div></td>
        <td class="qty-cell"><div class="sku-lines">${qtyHtml}</div></td>
        <td class="money-cell">${money(totalSalesCentavos(order))}</td>
        <td><span class="cs-status ${bookingStatus.toLowerCase()}">${bookingStatus}</span></td>
        <td class="credential-cell">${display(username(order))}</td>
        <td class="credential-cell">${display(order.customer_phone)}</td>
      </tr>`;
    }).join('')).join('') + '<tr class="table-spacer-row"><td colspan="16"></td></tr>';
  }

  function updatePagination(rowCount) {
    const start = state.total ? state.page * PAGE_SIZE + 1 : 0;
    const end = Math.min(state.page * PAGE_SIZE + rowCount, state.total);
    const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    $('record-count').textContent = `${state.total.toLocaleString()} orders`;
    $('page-summary').textContent = `${start.toLocaleString()}–${end.toLocaleString()} of ${state.total.toLocaleString()} · Page ${state.page + 1} of ${pages}`;
    $('page-numbers').innerHTML = paginationItems(pages, state.page + 1).map(item => item === 'ellipsis'
      ? '<span class="cs-page-ellipsis" aria-hidden="true">…</span>'
      : `<button class="cs-page-number${item === state.page + 1 ? ' active' : ''}" type="button" data-page="${item}"${state.loading ? ' disabled' : ''}${item === state.page + 1 ? ' aria-current="page"' : ''}>${item}</button>`).join('');
    $('previous-page').disabled = state.loading || state.page === 0;
    $('next-page').disabled = state.loading || end >= state.total;
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    $('customer-orders-body').innerHTML = '<tr><td colspan="16"><div class="loading-wrapper"><span class="spinner-cyan"></span><span>Loading customer orders...</span></div></td></tr>';
    updatePagination(0);

    const from = state.page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    try {
      let request = state.sb.from('installation_bookings')
        .select('id,order_no,customer_name,customer_first_name,customer_last_name,customer_phone,customer_email,customer_address,customer_city,customer_province,created_at,scheduled_date,product_skus,product_qtys,products,grand_total,balance_due,deposit_amount,deduction_labels,deduction_values,status,doors', { count: 'exact' })
        .eq('company_id', state.companyId)
        .not('order_no', 'ilike', 'DO-%');
      if (state.query) {
        const term = state.query.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
        if (term) {
          const pattern = `%${term}%`;
          request = request.or([
            `customer_name.ilike.${pattern}`,
            `customer_first_name.ilike.${pattern}`,
            `customer_last_name.ilike.${pattern}`,
            `customer_phone.ilike.${pattern}`,
            `customer_email.ilike.${pattern}`,
            `customer_address.ilike.${pattern}`,
            `customer_city.ilike.${pattern}`,
            `customer_province.ilike.${pattern}`,
            `order_no.ilike.${pattern}`,
            `product_skus.ilike.${pattern}`
          ].join(','));
        }
      }
      const { data, error, count } = await request
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      state.total = count || 0;
      render(data || []);
      updatePagination((data || []).length);
    } catch (error) {
      console.error(error);
      $('customer-orders-body').innerHTML = '<tr class="empty-row"><td colspan="16">Customer orders could not be loaded. Please refresh and try again.</td></tr>';
      $('record-count').textContent = 'Unable to load';
    } finally {
      state.loading = false;
      updatePagination(Math.min(PAGE_SIZE, Math.max(0, state.total - state.page * PAGE_SIZE)));
    }
  }

  async function init() {
    const auth = await window.BKAuth.checkRoleGate(['Customer Service'], '/admin.html');
    if (!auth) return;
    state.sb = window.BKAuth.sb;
    const { data: company, error } = await state.sb.from('companies')
      .select('id').eq('tenant_id', auth.tenantId).limit(1).maybeSingle();
    if (error || !company?.id) {
      $('customer-orders-body').innerHTML = '<tr class="empty-row"><td colspan="16">Company access could not be verified.</td></tr>';
      return;
    }
    state.companyId = company.id;
    $('page-numbers').addEventListener('click', event => {
      const button = event.target.closest('[data-page]');
      if (!button || state.loading) return;
      state.page = Number(button.dataset.page) - 1;
      load();
    });
    let searchTimer;
    $('customer-search').addEventListener('input', event => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        state.query = event.target.value.trim();
        state.page = 0;
        load();
      }, 250);
    });
    $('previous-page').addEventListener('click', () => { if (state.page > 0) { state.page -= 1; load(); } });
    $('next-page').addEventListener('click', () => { if ((state.page + 1) * PAGE_SIZE < state.total) { state.page += 1; load(); } });
    await load();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.BKCustomerOrders = { display, groupOrders, paginationItems, productLines, statusLabel, totalSalesCentavos, username };
})();

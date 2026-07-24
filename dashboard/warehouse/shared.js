'use strict';

window.WarehousePage = {
  sb: null,
  companyId: null,
  activeWarehouseId: null,
  fulfillmentWarehouses: [],
  allProducts: [],
  allEmployees: [],
  _bookings: [],
  get bookings() {
    return this._bookings;
  },
  set bookings(val) {
    this._bookings = (val || []).filter(b => b.order_no && b.order_no.startsWith('ORD-'));
  },

  deliveryBookings: [],

  _activeTransactions: [],
  get activeTransactions() {
    return this._activeTransactions;
  },
  set activeTransactions(val) {
    this._activeTransactions = (val || []).filter(tx => {
      if (tx.type === 'customer_order') {
        return tx.reference_id && (
          tx.reference_id.startsWith('ORD-') || 
          tx.reference_id.startsWith('RCV-') || 
          tx.reference_id.startsWith('SND-')
        );
      }
      return true;
    });
  },
  lastAction: null,

  // Callbacks
  renderPrimaryTab: null,
  primaryListId: null,
  allowedStatusTransitions: {},
  pageSpecificUploadBehavior: null,

  // 1. Loading Wrapper
  wrapActionWithLoading: async function(btn, asyncFn) {
    if (!btn || btn.disabled) return;
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" style="vertical-align: -2px; margin-right: 6px; animation: spin 1s linear infinite;"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>Processing...`;
    try {
      await asyncFn();
    } catch (err) {
      btn.disabled = false;
      btn.classList.remove('btn-loading');
      btn.innerHTML = originalHtml;
      this.showToast('Operation failed: ' + err.message, true);
    }
  },

  // 2. Undo State
  updateUndoButtonState: function() {
    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) {
      undoBtn.style.display = this.lastAction ? 'inline-flex' : 'none';
    }
  },

  // 3. Format Money
  formatMoney: function(cents) {
    const php = (cents || 0) / 100;
    return "₱" + php.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  // 4. Escape HTML
  escFulfillment: function(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  // 5. Toast
  showToast: function(msg, isError = false) {
    if (isError && window.BKFriendlyError) msg = window.BKFriendlyError(msg);
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${isError ? 'error' : 'success'}`;
    el.innerText = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  },

  // 6. Loading States
  showLoadingState: function() {
    const loading = `
      <tr>
        <td colspan="10">
          <div class="loading-wrapper">
            <div class="spinner-cyan"></div>
            <span>Loading warehouse data...</span>
          </div>
        </td>
      </tr>
    `;
    const lists = [
      'inventory-list', 
      'dispatch-list', 
      'pack-list', 
      'inspect-list', 
      'receive-list', 
      'supplier-product-list', 
      'transfer-requests-list'
    ];
    if (this.primaryListId && !lists.includes(this.primaryListId)) {
      lists.push(this.primaryListId);
    }
    for (const id of lists) {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = loading;
      }
    }
  },

  // 7. Load Warehouse Dropdown/Tabs
  loadWarehouseTabs: async function(tenantId) {
    try {
      const { data, error } = await this.sb
        .from('warehouses')
        .select('id, name, is_active')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      this.fulfillmentWarehouses = (data || []).filter(w => w.is_active);

      const dropdown = document.getElementById('wh-select-dropdown');
      if (!dropdown) return;

      if (this.fulfillmentWarehouses.length === 0) {
        dropdown.style.display = 'none';
        this.activeWarehouseId = null;
        return;
      }

      dropdown.style.display = 'inline-block';
      dropdown.innerHTML = this.fulfillmentWarehouses.map(wh => `
        <option value="${wh.id}">${this.escFulfillment(wh.name)}</option>
      `).join('');

      const storedWhId = localStorage.getItem('active_warehouse_id');
      if (storedWhId && this.fulfillmentWarehouses.some(w => w.id === storedWhId)) {
        this.activeWarehouseId = storedWhId;
      } else {
        this.activeWarehouseId = this.fulfillmentWarehouses[0]?.id || null;
      }
      dropdown.value = this.activeWarehouseId;
    } catch (err) {
      console.warn('Could not load warehouse dropdown:', err.message);
    }
  },

  // 8. Switch Warehouse
  switchWarehouse: function(whId) {
    this.activeWarehouseId = whId;
    localStorage.setItem('active_warehouse_id', whId);
    const dropdown = document.getElementById('wh-select-dropdown');
    if (dropdown && dropdown.value !== whId) {
      dropdown.value = whId;
    }
    if (window.refreshDashboard) {
      window.refreshDashboard();
    }
  },

  // 9. Load Core Products & Employees
  loadCoreData: async function(options = {}) {
    const { data: pData, error: pErr } = await this.sb
      .from('products')
      .select('id, sku, title, category, business, image_main, dealer_price, count_inventory')
      .order('sku');
    if (pErr) throw pErr;
    this.allProducts = pData || [];
    
    if (window.populateCategoryFilter) {
      window.populateCategoryFilter();
    }

    if (options.loadEmployees !== false) {
      try {
        const { data: empData } = await this.sb.from('employees').select('id, first_name, last_name');
        this.allEmployees = empData || [];
      } catch (e) {
        console.warn('Could not load employees:', e);
      }
    }
  },

  // 10. Update Badge Counts
  updateBadgeCounts: function() {
    const receiveCount = this.activeTransactions.filter(t => {
      if (!['ordered', 'returned', 'cancelled'].includes(t.status)) return false;

      const isIncoming = (t.reference_id && (t.reference_id.startsWith('RCV-') || t.reference_id.startsWith('SUP-')));
      if (isIncoming) {
        const isBooked = (this.deliveryBookings || []).some(db => db.reference_id === t.reference_id);
        return isBooked;
      }

      return t.type !== 'supplier_order';
    }).length;
    const inspectCount = [...new Set(this.activeTransactions.filter(t => t.status === 'reserved' && t.type === 'customer_order').map(t => t.reference_id))].length;
    const packCount = [...new Set(this.activeTransactions.filter(t => t.status === 'inspect' && t.type === 'customer_order').map(t => t.reference_id))].length;
    
    const dispatchCount = this.activeTransactions.filter(t => {
      if (t.status !== 'packed') return false;
      if (t.reference_id) {
        const hasUnpacked = this.activeTransactions.some(other => 
          other.reference_id === t.reference_id && 
          ['reserved', 'inspect'].includes(other.status)
        );
        if (hasUnpacked) return false;
      }
      return true;
    }).length;

    const badges = [
      { id: 'badge-count-receive', count: receiveCount },
      { id: 'badge-count-inspect', count: inspectCount },
      { id: 'badge-count-pack', count: packCount },
      { id: 'badge-count-dispatch', count: dispatchCount }
    ];

    badges.forEach(b => {
      const el = document.getElementById(b.id);
      if (el) {
        if (b.count > 0) {
          el.innerText = b.count;
          el.style.display = 'inline-block';
        } else {
          el.style.display = 'none';
        }
      }
    });
  },

  // 11. AutoSync Bookings Background Launcher
  runAutoSyncInBackground: async function() {
    try {
      const didChange = await this.runAutoSync();
      if (didChange && window.refreshDashboard) {
        await window.refreshDashboard();
      }
    } catch (err) {
      console.warn('Background warehouse sync failed:', err.message || err);
    }
  },

  // 12. Transaction Cancellation
  handleCancellationProcess: async function(id, sku, qty, prevStatus) {
    const now = new Date().toISOString();
    const { error: txErr } = await this.sb.from('inventory_transactions').update({
      status: 'cancelled',
      timestamp_cancelled: now
    }).eq('id', id);
    if (txErr) throw txErr;

    let invQ = this.sb.from('inventory').select('*').eq('sku', sku);
    if (this.activeWarehouseId) invQ = invQ.eq('warehouse_id', this.activeWarehouseId);
    else invQ = invQ.is('warehouse_id', null);
    const { data: invRow, error: invErr } = await invQ;
    if (invErr) throw invErr;
    if (!invRow || invRow.length === 0) return;

    const inv = invRow[0];
    const updates = { cancelled: (inv.cancelled || 0) + qty };
    if (prevStatus === 'packed') {
      updates.packed = Math.max(0, (inv.packed || 0) - qty);
    } else {
      updates.reserved = Math.max(0, (inv.reserved || 0) - qty);
    }

    const { error: updErr } = await this.sb.from('inventory').update(updates).eq('id', inv.id);
    if (updErr) throw updErr;
  },

  // 13. AutoSync Bookings
  runAutoSync: async function() {
    let didChange = false;
    const { data: bData, error: bErr } = await this.sb.from('installation_bookings').select('*').neq('status', 'completed');
    if (bErr) throw bErr;
    this.bookings = bData || [];

    try {
      const { data: delivData } = await this.sb.from('delivery_bookings').select('*');
      this.deliveryBookings = delivData || [];
    } catch (e) {
      console.warn('Failed to load delivery bookings in shared.js:', e);
    }

    const { data: txRefs, error: refErr } = await this.sb.from('inventory_transactions').select('reference_id, status').eq('type', 'customer_order');
    if (refErr) throw refErr;

    const existingRefs = {};
    (txRefs || []).forEach(tx => {
      if (!existingRefs[tx.reference_id]) existingRefs[tx.reference_id] = [];
      existingRefs[tx.reference_id].push(tx.status);
    });

    for (const booking of this.bookings) {
      const orderNo = booking.order_no;
      const address = booking.customer_address || '';
      const addrParts = address.split(',');
      const city = booking.customer_city ||
        (addrParts.length >= 2 ? addrParts[addrParts.length - 2].trim() : (addrParts[0]?.trim() || 'N/A'));

      if (booking.status === 'cancelled') {
        const txsToCancel = this.activeTransactions.filter(t => t.reference_id === orderNo && ['reserved', 'packed'].includes(t.status));
        for (const tx of txsToCancel) {
          await this.handleCancellationProcess(tx.id, tx.sku, tx.quantity, tx.status);
          didChange = true;
        }
        continue;
      }

      const wrongCityTxs = this.activeTransactions.filter(t =>
        t.reference_id === orderNo && t.customer_city !== city
      );
      for (const tx of wrongCityTxs) {
        await this.sb.from('inventory_transactions').update({ customer_city: city }).eq('id', tx.id);
        tx.customer_city = city;
        didChange = true;
      }

      // Sync customer_name: patch any transaction whose stored name differs from the booking
      const bookingName = booking.customer_name || '';
      if (bookingName) {
        const wrongNameTxs = this.activeTransactions.filter(t =>
          t.reference_id === orderNo && t.customer_name !== bookingName
        );
        for (const tx of wrongNameTxs) {
          await this.sb.from('inventory_transactions').update({ customer_name: bookingName }).eq('id', tx.id);
          tx.customer_name = bookingName;
          didChange = true;
        }

        // Also patch delivery_bookings if the name drifted there
        const wrongNameDb = (this.deliveryBookings || []).filter(db =>
          db.reference_id === orderNo && db.customer_name !== bookingName
        );
        for (const db of wrongNameDb) {
          await this.sb.from('delivery_bookings').update({ customer_name: bookingName }).eq('id', db.id);
          db.customer_name = bookingName;
          didChange = true;
        }
      }

      if (!existingRefs[orderNo]) {
        let items = [];
        if (booking.product_skus && booking.product_qtys) {
          const skus = booking.product_skus.split('|').map(s => s.trim().toUpperCase());
          const qtys = booking.product_qtys.split('|').map(q => parseInt(q.trim()) || 0);
          skus.forEach((sku, idx) => {
            if (sku && qtys[idx] > 0) {
              items.push({ sku, qty: qtys[idx] });
            }
          });
        }

        for (const item of items) {
          const prod = this.allProducts.find(x => x.sku === item.sku);
          if (prod && prod.count_inventory === false) {
            console.log(`Skipping inventory update for service/non-stocked item: ${item.sku}`);
            continue;
          }
          console.log(`Syncing reserved item: ${item.qty}x ${item.sku} for order ${orderNo}`);

          const txPayload = {
            sku: item.sku,
            quantity: item.qty,
            type: 'customer_order',
            status: 'reserved',
            reference_id: orderNo,
            customer_name: booking.customer_name,
            customer_city: city,
            timestamp_reserved: booking.created_at || new Date().toISOString(),
            warehouse_id: this.activeWarehouseId || null
          };
          const { error: insTxErr } = await this.sb.from('inventory_transactions').insert([txPayload]);
          if (insTxErr) {
            console.error('Error inserting transaction during sync:', insTxErr);
          } else {
            didChange = true;
          }
        }
      }
    }
    return didChange;
  }
};

// Bind global handlers for layout / tab navigation / dropdowns
window.switchTab = function(tabId) {
  const tabMap = {
    'inventory': 'summary',
    'dispatch': 'dispatch',
    'pack': 'pack',
    'inspect': 'inspect',
    'receive': 'receive',
    'order': 'order',
    'transfer': 'transfer'
  };
  const target = tabMap[tabId] || 'summary';
  window.location.href = `/dashboard/warehouse/${target}`;
};

window.switchWarehouse = function(whId) {
  window.WarehousePage.switchWarehouse(whId);
};

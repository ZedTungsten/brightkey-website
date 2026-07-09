(function() {
  'use strict';

  let activeCompanyId = null;

  async function checkIncompleteCommissions(companyId) {
    if (!companyId) return;
    const sb = window.BKAuth?.sb;
    if (!sb) return;

    try {
      // 1. Fetch bookings, assignments, commissions config, and products with narrow fields
      const [bookingsRes, configRes, productsRes, assignmentsRes] = await Promise.all([
        sb.from('installation_bookings').select('id, status, doors, product_skus, product_qtys').eq('company_id', companyId).neq('status', 'cancelled'),
        sb.from('global_settings').select('value').eq('key', 'commissions_config').eq('company_id', companyId).maybeSingle(),
        sb.from('products').select('sku, business, category, tags'),
        sb.from('commission_assignments').select('booking_id, sku, product_index, rate_label, employee_id').eq('company_id', companyId)
      ]);

      if (bookingsRes.error || configRes.error || productsRes.error || assignmentsRes.error) return;

      const bookings = bookingsRes.data || [];
      const config = configRes.data?.value || { rates: [], eligibility_rules: [] };
      const products = productsRes.data || [];
      const dbAssignments = assignmentsRes.data || [];

      const rates = config.rates || [];
      const eligibilityRules = config.eligibility_rules || [];

      // Create product lookup map
      const productMap = {};
      products.forEach(p => {
        if (p.sku) productMap[p.sku.toLowerCase()] = p;
      });

      // Create cell assignment map
      const cellAssignments = {};
      dbAssignments.forEach(row => {
        const cellKey = `${row.booking_id}_${row.sku}_${row.product_index}_${row.rate_label}`;
        if (!cellAssignments[cellKey]) {
          cellAssignments[cellKey] = [];
        }
        if (row.employee_id) {
          cellAssignments[cellKey].push(row.employee_id);
        } else {
          cellAssignments[cellKey].push('none');
        }
      });

      // Helper to check SKU eligibility
      function checkSkuEligibility(product, rules) {
        if (!rules || rules.length === 0) return false;
        for (const rule of rules) {
          if (rule.scope === 'businesses') {
            if (rule.business === 'all') return true;
            if (rule.business === product.business) {
              if (rule.category === 'all') return true;
              if (rule.category === product.category) {
                if (rule.sku === 'all') return true;
                if (rule.sku === product.sku) return true;
              }
            }
          } else if (rule.scope === 'tags') {
            if (product.tags && Array.isArray(product.tags) && product.tags.includes(rule.tag)) {
              return true;
            }
          }
        }
        return false;
      }

      let hasIncomplete = false;

      // Loop through bookings
      for (const b of bookings) {
        let doorsArr = [];
        if (typeof b.doors === 'string') {
          try { doorsArr = JSON.parse(b.doors); } catch(_) {}
        } else if (Array.isArray(b.doors)) {
          doorsArr = b.doors;
        }
        const isBookingDone = ['done', 'completed', 'finished'].includes(b.status) || (doorsArr.length > 0 && doorsArr.every(d => d.completed));
        if (!isBookingDone) continue;

        const skus = (b.product_skus || '').split(' | ');
        const qtys = (b.product_qtys || '').split(' | ');
        const numItems = Math.max(skus.length, qtys.length);

        for (let i = 0; i < numItems; i++) {
          const sku = skus[i]?.trim() || '';
          if (!sku) continue;

          // Find product details to verify eligibility
          const product = productMap[sku.toLowerCase()] || { sku, business: '', category: '', tags: [] };
          const isEligible = checkSkuEligibility(product, eligibilityRules);
          if (!isEligible) continue;

          const rowKey = `${b.id}_${sku}_${i}`;

          // Check if any dynamic rate column has no assignments
          for (const r of rates) {
            const cellKey = `${rowKey}_${r.label}`;
            const assignedIds = cellAssignments[cellKey] || [];
            const activeAssignees = assignedIds.filter(id => id !== '' && id !== 'none');
            if (activeAssignees.length === 0 && !assignedIds.includes('none')) {
              hasIncomplete = true;
              break;
            }
          }

          if (hasIncomplete) break;
        }
        if (hasIncomplete) break;
      }

      // Toggle red marks on sidebar
      const salesBadge = document.getElementById('sales-badge-dot');
      const commsBadge = document.getElementById('commissions-badge-dot');
      if (salesBadge) salesBadge.style.display = hasIncomplete ? 'inline-block' : 'none';
      if (commsBadge) commsBadge.style.display = hasIncomplete ? 'inline-block' : 'none';

      window.BKCommissionsIncomplete = hasIncomplete;
      
    } catch (e) {
      console.error('Error checking incomplete commissions:', e);
    }
  }

  window.BKRefreshCommissionsBadge = function() {
    if (activeCompanyId) {
      checkIncompleteCommissions(activeCompanyId);
    }
  };

  // 1. Sidebar HTML Template (absolute links starting with "/")
  const sidebarHTML = `
      <div class="dash-logo-container" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; flex-shrink: 0; min-height: 32px;">
        <a href="/dashboard" class="dash-logo" style="padding: 0.5rem 0.25rem; display: flex; align-items: center; gap: 0.25rem;">
          <img src="/assets/logo.svg" class="logo-extended" alt="BrightKey" style="height: 24px; display: block;" />
          <img src="/assets/favicon.svg" class="logo-contracted" alt="BrightKey" style="height: 24px; display: none;" />
        </a>
        <button id="sidebar-toggle" title="Toggle Sidebar">
          <svg id="toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px;">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
      </div>

      <!-- Skeleton Loading State -->
      <div id="sidebar-nav-skeleton" style="display: flex; flex-direction: column; gap: 0.5rem; padding: 0 0.25rem;">
        <div style="display: flex; align-items: center; gap: 0.625rem; height: 38px; padding: 0.6rem 0.5rem;">
          <div class="skeleton" style="width: 16px; height: 16px; flex-shrink: 0; border-radius: 4px;"></div>
          <div class="skeleton dash-nav-text" style="width: 70px; height: 12px; border-radius: 4px;"></div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.625rem; height: 38px; padding: 0.6rem 0.5rem;">
          <div class="skeleton" style="width: 16px; height: 16px; flex-shrink: 0; border-radius: 4px;"></div>
          <div class="skeleton dash-nav-text" style="width: 100px; height: 12px; border-radius: 4px;"></div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.625rem; height: 38px; padding: 0.6rem 0.5rem;">
          <div class="skeleton" style="width: 16px; height: 16px; flex-shrink: 0; border-radius: 4px;"></div>
          <div class="skeleton dash-nav-text" style="width: 80px; height: 12px; border-radius: 4px;"></div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.625rem; height: 38px; padding: 0.6rem 0.5rem;">
          <div class="skeleton" style="width: 16px; height: 16px; flex-shrink: 0; border-radius: 4px;"></div>
          <div class="skeleton dash-nav-text" style="width: 95px; height: 12px; border-radius: 4px;"></div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.625rem; height: 38px; padding: 0.6rem 0.5rem;">
          <div class="skeleton" style="width: 16px; height: 16px; flex-shrink: 0; border-radius: 4px;"></div>
          <div class="skeleton dash-nav-text" style="width: 110px; height: 12px; border-radius: 4px;"></div>
        </div>
      </div>

      <!-- Actual Sidebar Navigation Menu -->
      <div id="sidebar-nav-content" style="display: none; flex-direction: column; gap: 0.15rem;">
        <a href="/dashboard" class="dash-nav-item" id="nav-item-home" style="font-weight: 600;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span class="dash-nav-text">Home</span>
        </a>
        <a href="/dashboard/team" class="dash-nav-item" id="nav-item-team" style="font-weight: 600;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span class="dash-nav-text">Team</span>
        </a>
        <a href="/dashboard/attendance" class="dash-nav-item" id="nav-item-attendance" style="font-weight: 600;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <span class="dash-nav-text">Attendance</span>
        </a>
        <a href="/dashboard/payouts" class="dash-nav-item" id="nav-item-payouts" style="font-weight: 600;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12" y2="18.01"></line><path d="M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/></svg>
          <span class="dash-nav-text">Payouts</span>
        </a>
        <div style="border-bottom: 1px solid var(--border); margin: 0.25rem 0.75rem 0.4rem;"></div>

      <!-- Products -->
      <div class="dash-nav-group" id="nav-group-products" style="display: none;">
        <button class="dash-nav-parent" onclick="toggleSubmenu(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          <span class="dash-nav-text">Products</span>
          <svg class="dash-nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dash-nav-children">
          <a href="/dashboard/catalog" class="dash-nav-child" data-role="products">Catalog</a>
          <a href="/dashboard/add-products" class="dash-nav-child" data-role="products">Bulk Upload</a>
        </div>
      </div>

      <!-- Operations -->
      <div class="dash-nav-group" id="nav-group-operations" style="display: none;">
        <button class="dash-nav-parent" onclick="toggleSubmenu(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span class="dash-nav-text">Operations</span>
          <svg class="dash-nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dash-nav-children">
          <a href="/dashboard/booking" class="dash-nav-child">Book</a>
          <a href="/dashboard/orders-invoices" class="dash-nav-child">Orders & Invoices</a>
          <a href="/dashboard/booking-schedules" class="dash-nav-child">Schedules</a>
        </div>
      </div>

      <!-- Marketing -->
      <div class="dash-nav-group" id="nav-group-marketing" style="display: none;">
        <button class="dash-nav-parent" onclick="toggleSubmenu(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          <span class="dash-nav-text">Marketing</span>
          <svg class="dash-nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dash-nav-children">
          <a href="/dashboard/global-promo" class="dash-nav-child" data-role="marketing">Promos</a>
          <a class="dash-nav-child" data-role="marketing" style="opacity: 0.5; cursor: not-allowed;">Campaigns</a>
          <a class="dash-nav-child" data-role="marketing" style="opacity: 0.5; cursor: not-allowed;">Affiliates</a>
          <a class="dash-nav-child" data-role="marketing" style="opacity: 0.5; cursor: not-allowed;">Social Media Calendar</a>
          <a class="dash-nav-child" data-role="marketing" style="opacity: 0.5; cursor: not-allowed;">Resources</a>
        </div>
      </div>

      <!-- Sales -->
      <div class="dash-nav-group" id="nav-group-sales" style="display: none;">
        <button class="dash-nav-parent" onclick="toggleSubmenu(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          <span class="dash-nav-text" style="display: inline-flex; align-items: center; gap: 0.35rem;">Sales <span id="sales-badge-dot" style="display: none; width: 6px; height: 6px; border-radius: 50%; background-color: #ef4444;"></span></span>
          <svg class="dash-nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dash-nav-children">
          <a href="/dashboard/sales-goals" class="dash-nav-child" data-role="sales">Goals</a>
          <a href="/dashboard/sales-schedule" class="dash-nav-child" data-role="sales">Schedule</a>
          <a href="/dashboard/sales-commissions" class="dash-nav-child" data-role="sales" style="display: flex; align-items: center; justify-content: space-between;">
            <span>Commissions</span>
            <span id="commissions-badge-dot" style="display: none; width: 6px; height: 6px; border-radius: 50%; background-color: #ef4444;"></span>
          </a>
          <a href="/dashboard/sales-stocks" class="dash-nav-child" data-role="sales">Stocks</a>
        </div>
      </div>

      <!-- Customer Service -->
      <div class="dash-nav-group" id="nav-group-customerservice" style="display: none;">
        <button class="dash-nav-parent" onclick="toggleSubmenu(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span class="dash-nav-text">Customer Service</span>
          <svg class="dash-nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dash-nav-children">
          <a href="/dashboard/support-inbox" class="dash-nav-child" data-role="customer_service">Inbox</a>
          <a href="/dashboard/product-reviews" class="dash-nav-child" data-role="customer_service">Reviews</a>
        </div>
      </div>

      <!-- Logistics -->
      <div class="dash-nav-group" id="nav-group-logistics" style="display: none;">
        <button class="dash-nav-parent" onclick="toggleSubmenu(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          <span class="dash-nav-text">Logistics</span>
          <svg class="dash-nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dash-nav-children">
          <a href="/dashboard/warehouse/inspect" class="dash-nav-child" data-role="logistics">Warehouse</a>
          <a href="/dashboard/delivery/book" class="dash-nav-child" data-role="logistics">Delivery</a>
          <a href="/dashboard/shipping-rates" class="dash-nav-child" data-role="logistics">Shipping Rates</a>
          <a href="/dashboard/qa-guide" class="dash-nav-child" data-role="logistics">QA Guide</a>
        </div>
      </div>

      <!-- HR -->
      <div class="dash-nav-group" id="nav-group-hr" style="display: none;">
        <button class="dash-nav-parent" onclick="toggleSubmenu(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span class="dash-nav-text">HR</span>
          <svg class="dash-nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dash-nav-children">
          <a href="/dashboard/employee-directory" class="dash-nav-child" data-role="hr">Directory</a>
          <a href="/dashboard/organization-map.html" class="dash-nav-child" data-role="hr">Org Map</a>
          <a href="/dashboard/attendance-leaves" class="dash-nav-child" data-role="hr">Attendance & Leaves</a>
          <a class="dash-nav-child" data-role="hr" style="opacity: 0.5; cursor: not-allowed;">Company Events</a>
          <a href="/dashboard/payout-tracker/payout/" class="dash-nav-child" data-role="hr" style="display: flex; justify-content: space-between; align-items: center;">
            <span>Payout Tracker</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6; margin-left: 0.5rem;" title="Shared with other roles">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </a>
        </div>
      </div>

      <!-- Finance -->
      <div class="dash-nav-group" id="nav-group-finance" style="display: none;">
        <button class="dash-nav-parent" onclick="toggleSubmenu(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          <span class="dash-nav-text">Finance</span>
          <svg class="dash-nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dash-nav-children">
          <a href="/dashboard/bookkeeping" class="dash-nav-child" data-role="accounting">Bookkeeping</a>
          <a href="/dashboard/payment-accounts" class="dash-nav-child" data-role="accounting">Payment Accounts</a>
          <a href="/dashboard/general-journal" class="dash-nav-child" data-role="accounting">General Journal</a>
          <a href="/dashboard/statements/profit-and-loss" class="dash-nav-child" data-role="accounting">Statements</a>
          <a href="/dashboard/expenses/cogs" class="dash-nav-child" data-role="accounting">Expenses</a>
          <a href="/dashboard/ledgers" class="dash-nav-child" data-role="accounting">Ledgers</a>
          <a href="/dashboard/payout-tracker/payout/" class="dash-nav-child" data-role="accounting" style="display: flex; justify-content: space-between; align-items: center;">
            <span>Payout Tracker</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6; margin-left: 0.5rem;" title="Shared with other roles">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </a>
        </div>
      </div>
      </div>

      <div class="dash-sidebar-footer" style="position: relative;">
        <!-- Floating Dropdown Menu -->
        <div id="user-menu" style="display: none; position: absolute; bottom: calc(100% + 8px); left: 0; right: 0; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); z-index: 100; flex-direction: column; overflow: hidden; padding: 0.35rem 0; animation: popUp 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;">
          <a href="/dashboard/profile" class="dash-nav-item" style="border-radius:0; padding: 0.45rem 1rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>My Profile</span>
          </a>
          <a href="/dashboard/settings" class="dash-nav-item" data-role="admin-only" style="border-radius:0; padding: 0.45rem 1rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>Settings</span>
          </a>
          <a href="/dashboard/master-settings" class="dash-nav-item" data-role="master-only" style="border-radius:0; padding: 0.45rem 1rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>Master Settings</span>
          </a>
          <a href="/dashboard/integrations.html" class="dash-nav-item" data-role="management-only" style="border-radius:0; padding: 0.45rem 1rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            <span>Integrations</span>
          </a>
          <a href="#" class="dash-nav-item" data-role="management-only" style="border-radius:0; padding: 0.45rem 1rem;" onclick="event.preventDefault(); if (window.BKDialog) BKDialog.notice('Subscription settings coming soon.');">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            <span>Subscription</span>
          </a>
          <button class="dash-nav-item" onclick="BKAuth.signOut()" style="border-radius:0; padding: 0.45rem 1rem; width: 100%;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span>Log Out</span>
          </button>
        </div>

        <div class="dash-user" style="cursor: pointer; transition: background 0.2s; border-radius: var(--radius-sm);" onclick="toggleUserMenu(event)">
          <div class="dash-user-avatar" id="user-avatar">?</div>
          <div style="flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">
            <div class="dash-user-name" id="user-name">Loading…</div>
            <div class="dash-user-role" id="user-role"></div>
            <div class="dash-user-email" id="user-email"></div>
            <div id="user-status-container" style="display: flex; align-items: center; gap: 0.35rem; margin-top: 0.25rem;">
              <span id="user-status-dot" style="width: 8px; height: 8px; border-radius: 50%; display: inline-block; background-color: #71717a;"></span>
              <span id="user-status-text" style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">Time out</span>
            </div>
          </div>
        </div>
      </div>
  `;

  // 3. Inject DOM Elements and Listeners on DomContentLoaded
  function initSidebar() {
    const sidebarContainer = document.getElementById('dash-sidebar');
    if (!sidebarContainer) return;

    sidebarContainer.innerHTML = sidebarHTML;

    // Create mobile floating favicon button at lower left
    if (!document.getElementById('mobile-floating-favicon')) {
      const btn = document.createElement('button');
      btn.id = 'mobile-floating-favicon';
      btn.title = 'Open Menu';
      btn.innerHTML = `<img src="/assets/favicon.svg" alt="Menu" style="width: 24px; height: 24px; display: block;" />`;
      
      btn.style.position = 'fixed';
      btn.style.bottom = '20px';
      btn.style.left = '20px';
      btn.style.width = '48px';
      btn.style.height = '48px';
      btn.style.borderRadius = '50%';
      btn.style.background = 'var(--bg-surface, #ffffff)';
      btn.style.border = '1px solid var(--border, #E4E4E7)';
      btn.style.boxShadow = '0 4px 14px rgba(0,0,0,0.12)';
      btn.style.cursor = 'pointer';
      btn.style.display = 'none'; // displayed via CSS media query
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.zIndex = '190';
      btn.style.transition = 'transform 0.2s, box-shadow 0.2s';
      
      btn.addEventListener('mouseenter', () => {
        btn.style.transform = 'scale(1.05)';
        btn.style.boxShadow = '0 6px 20px rgba(0,0,0,0.16)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'scale(1)';
        btn.style.boxShadow = '0 4px 14px rgba(0,0,0,0.12)';
      });
      
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sidebarEl = document.getElementById('dash-sidebar');
        if (sidebarEl) {
          sidebarEl.classList.toggle('mobile-open');
        }
      });
      
      document.body.appendChild(btn);
    }

    document.addEventListener('click', (e) => {
      const sidebarEl = document.getElementById('dash-sidebar');
      const toggle = document.getElementById('mobile-floating-favicon');
      if (sidebarEl && sidebarEl.classList.contains('mobile-open')) {
        if (!sidebarEl.contains(e.target) && (!toggle || !toggle.contains(e.target))) {
          sidebarEl.classList.remove('mobile-open');
        }
      }
    });

    // Define window level methods for accordion
    window.toggleUserMenu = (e) => {
      e.stopPropagation();
      const menu = document.getElementById('user-menu');
      if (menu) {
        const isHidden = menu.style.display === 'none' || !menu.style.display;
        menu.style.display = isHidden ? 'flex' : 'none';
      }
    };

    window.toggleSubmenu = (btn) => {
      const sidebar = document.getElementById('dash-sidebar');
      if (sidebar.classList.contains('minimized') && window.innerWidth > 768) {
        return;
      }
      const group = btn.closest('.dash-nav-group');
      if (!group) return;
      const wasExpanded = group.classList.contains('expanded');
      
      document.querySelectorAll('.dash-nav-group').forEach(g => g.classList.remove('expanded'));
      
      if (!wasExpanded) {
        group.classList.add('expanded');
      }
    };

    document.addEventListener('click', () => {
      const menu = document.getElementById('user-menu');
      if (menu) menu.style.display = 'none';
    });

    const sidebar = document.getElementById('dash-sidebar');
    const layout = document.querySelector('.dash-layout');
    const toggleBtn = document.getElementById('sidebar-toggle');
    
    if (sidebar && layout && toggleBtn) {
      const isMinimized = localStorage.getItem('sidebar-minimized') === 'true';
      if (isMinimized) {
        sidebar.classList.add('minimized');
        layout.classList.add('sidebar-minimized');
      }
      
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('minimized');
        layout.classList.toggle('sidebar-minimized');
        const minimized = sidebar.classList.contains('minimized');
        localStorage.setItem('sidebar-minimized', minimized);
      });
    }

    // Resolve Active State based on current pathname
    const currentPath = window.location.pathname;
    
    // Check main links
    const homeBtn = document.getElementById('nav-item-home');
    if (homeBtn) {
      if (currentPath === '/' || currentPath === '/dashboard' || currentPath === '/dashboard.html') {
        homeBtn.classList.add('active');
      } else {
        homeBtn.classList.remove('active');
      }
    }
    const teamBtn = document.getElementById('nav-item-team');
    if (teamBtn) {
      if (currentPath === '/dashboard/team' || currentPath === '/dashboard/team.html') {
        teamBtn.classList.add('active');
      } else {
        teamBtn.classList.remove('active');
      }
    }
    const attendanceBtn = document.getElementById('nav-item-attendance');
    if (attendanceBtn) {
      if (currentPath === '/dashboard/attendance' || currentPath === '/dashboard/attendance.html') {
        attendanceBtn.classList.add('active');
      } else {
        attendanceBtn.classList.remove('active');
      }
    }
    const payoutsBtn = document.getElementById('nav-item-payouts');
    if (payoutsBtn) {
      if (currentPath === '/dashboard/payouts' || currentPath === '/dashboard/payouts.html') {
        payoutsBtn.classList.add('active');
      } else {
        payoutsBtn.classList.remove('active');
      }
    }

    // Check sub-links and auto-expand active group
    document.querySelectorAll('.dash-nav-child').forEach(link => {
      const href = link.getAttribute('href');
      if (href && (
        currentPath === href ||
        currentPath === href + '.html' ||
        (href === '/dashboard/warehouse/inspect' && currentPath.startsWith('/dashboard/warehouse/')) ||
        (href === '/dashboard/delivery/book' && currentPath.startsWith('/dashboard/delivery/')) ||
        (href === '/dashboard/payout-tracker/payout/' && currentPath.startsWith('/dashboard/payout-tracker/'))
      )) {
        link.classList.add('active');
        const group = link.closest('.dash-nav-group');
        if (group) {
          group.classList.add('expanded');
        }
      } else {
        link.classList.remove('active');
      }
    });

    // Enforce role-based access control menu visibility
    (async function checkRBAC() {
      if (!window.BKAuth) return;
      try {
        // Reuse cached auth user session
        const user = await window.BKAuth.getUser();
        if (!user) return;
        const currentUser = user;

        // Reuse cached user role
        const roleInfo = await window.BKAuth.getUserRole();
        const userRole = roleInfo?.role || null;

        let accessibleModules = roleInfo?.modules || [];
        const isOwnerOrAdmin = ['owner', 'admin'].includes(userRole);

        // Filter top-level groups based on dynamic role modules
        const GROUP_MODULE_MAP = {
          'nav-group-products': 'Products',
          'nav-group-operations': 'Operations',
          'nav-group-marketing': 'Marketing',
          'nav-group-sales': 'Sales',
          'nav-group-customerservice': 'Customer Service',
          'nav-group-logistics': 'Logistics',
          'nav-group-hr': 'HR',
          'nav-group-finance': 'Finance'
        };

        document.querySelectorAll('.dash-nav-group').forEach(group => {
          const groupId = group.id;
          const moduleName = GROUP_MODULE_MAP[groupId];
          if (!moduleName) return;

          if (isOwnerOrAdmin) {
            group.style.display = 'block';
          } else if (accessibleModules.includes(moduleName)) {
            group.style.display = 'block';
          } else {
            group.style.display = 'none';
          }
        });

        // Prioritize HR if user has access to both HR and Finance
        const hasHrAccess = isOwnerOrAdmin || accessibleModules.includes('HR');
        const hasFinanceAccess = isOwnerOrAdmin || accessibleModules.includes('Finance');
        if (hasHrAccess && hasFinanceAccess) {
          const financeGroup = document.getElementById('nav-group-finance');
          if (financeGroup) {
            const payoutTrackerLink = financeGroup.querySelector('a[href^="/dashboard/payout-tracker/"]');
            if (payoutTrackerLink) {
              payoutTrackerLink.style.display = 'none';
            }
          }
        }

        // Handle user menu options role filtering
        document.querySelectorAll('#user-menu [data-role]').forEach(el => {
          const allowedRole = el.dataset.role;
          if (allowedRole === 'admin-only') {
            if (!['owner', 'admin'].includes(userRole)) {
              el.style.display = 'none';
            } else {
              el.style.display = 'flex';
            }
          } else if (allowedRole === 'master-only') {
            if (currentUser.email !== 'johnzeustaller@gmail.com') {
              el.style.display = 'none';
            } else {
              el.style.display = 'flex';
            }
          } else if (allowedRole === 'management-only') {
            const roleLower = userRole ? userRole.toLowerCase() : '';
            if (!['owner', 'admin', 'director'].includes(roleLower)) {
              el.style.display = 'none';
            } else {
              el.style.display = 'flex';
            }
          }
        });

        // REVEAL SIDEBAR IMMEDIATELY AFTER ROLE QUERY
        const skeletonEl = document.getElementById('sidebar-nav-skeleton');
        const contentEl = document.getElementById('sidebar-nav-content');
        if (skeletonEl) skeletonEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'flex';

        // Load details, avatar, online status, and commissions asynchronously in background
        (async () => {
          if (roleInfo?.tenantId) {
            try {
              const company = await window.BKAuth.getCompany(roleInfo.tenantId);
              activeCompanyId = company?.id || null;
              if (activeCompanyId) {
                // Move expensive commissions check off the initial-load path (delay by 2s)
                setTimeout(() => {
                  checkIncompleteCommissions(activeCompanyId);
                }, 2000);
              }
            } catch (coErr) {
              console.error('Error fetching company inside sidebar:', coErr);
            }
          }
        })();

        (async () => {
          // Populate user info
          const name  = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
          const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

          const nameEl = document.getElementById('user-name');
          const emailEl = document.getElementById('user-email');
          const roleEl = document.getElementById('user-role');
          const avatarEl = document.getElementById('user-avatar');

          if (nameEl) nameEl.textContent = name;
          if (emailEl) emailEl.textContent = currentUser.email;

          let displayRole = 'Employee';
          if (userRole) {
            if (userRole.startsWith('custom_') || userRole.startsWith('access:')) {
              displayRole = 'User';
            } else if (userRole.toLowerCase() === 'hr') {
              displayRole = 'HR';
            } else if (userRole.toLowerCase() === 'crm') {
              displayRole = 'CRM';
            } else {
              displayRole = userRole.charAt(0).toUpperCase() + userRole.slice(1);
            }
          }
          if (roleEl) roleEl.textContent = displayRole;

          // Parallelize employee profile and status lookup
          const empPromise = window.BKAuth.getEmployee(currentUser.email);
          empPromise.then(empData => {
            if (avatarEl) {
              if (empData && empData.picture_link) {
                avatarEl.innerHTML = `<img src="${empData.picture_link}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;" />`;
              } else {
                avatarEl.textContent = initials;
              }
            }

            if (empData?.id) {
              window.BKAuth.getEmployeeStatus(empData.id).then(currentStatus => {
                const statusDot = document.getElementById('user-status-dot');
                const statusText = document.getElementById('user-status-text');
                if (statusDot && statusText) {
                  if (currentStatus === 'available') {
                    statusDot.style.backgroundColor = '#22c55e'; // Green
                    statusText.textContent = 'Time in';
                    statusText.style.color = '#22c55e';
                  } else if (currentStatus === 'break') {
                    statusDot.style.backgroundColor = '#f97316'; // Orange
                    statusText.textContent = 'Break';
                    statusText.style.color = '#f97316';
                  } else {
                    statusDot.style.backgroundColor = '#9ca3af'; // Gray
                    statusText.textContent = 'Time out';
                    statusText.style.color = '#9ca3af';
                  }
                }
              });
            }
          }).catch(err => {
            console.error('Sidebar info fetch error:', err);
            if (avatarEl) avatarEl.textContent = initials;
          });
        })();

      } catch (err) {
        console.error('Sidebar RBAC error:', err);
        const skeletonEl = document.getElementById('sidebar-nav-skeleton');
        const contentEl = document.getElementById('sidebar-nav-content');
        if (skeletonEl) skeletonEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'flex';
      } finally {
        // Lazy-initialize chat after idle time or first interaction
        if (window.requestIdleCallback) {
          window.requestIdleCallback(() => initChatLazy());
        } else {
          setTimeout(() => initChatLazy(), 1500);
        }
      }
    })();
  }

  function initChatLazy() {
    let initiated = false;
    function triggerInit() {
      if (initiated) return;
      initiated = true;
      document.removeEventListener('pointerdown', triggerInit);
      document.removeEventListener('keydown', triggerInit);
      document.removeEventListener('scroll', triggerInit);
      initChat();
    }
    document.addEventListener('pointerdown', triggerInit, { once: true });
    document.addEventListener('keydown', triggerInit, { once: true });
    document.addEventListener('scroll', triggerInit, { once: true });
    setTimeout(triggerInit, 3000);
  }

  async function initChat() {
    if (document.getElementById('chat-fab')) return; // already loaded

    // 1. Create and inject chat FAB (ONLY this is injected initially)
    const fab = document.createElement('button');
    fab.id = 'chat-fab';
    fab.style.cssText = 'position: fixed; bottom: 2rem; right: 2rem; border-radius: 9999px; background: var(--cyan, #06b6d4); border: none; box-shadow: 0 4px 14px rgba(6, 182, 212, 0.4); color: #ffffff; display: flex; align-items: center; justify-content: center; gap: 0.35rem; padding: 0.6rem 1.25rem; font-size: 0.85rem; font-weight: 700; cursor: pointer; z-index: 1000; transition: transform 0.2s, background-color 0.2s, box-shadow 0.2s; outline: none;';
    fab.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"></path><circle cx="8" cy="10" r="1.5" fill="currentColor" stroke="none"></circle><circle cx="12" cy="10" r="1.5" fill="currentColor" stroke="none"></circle><circle cx="16" cy="10" r="1.5" fill="currentColor" stroke="none"></circle></svg><span>Chat</span><span id="chat-fab-dot" style="display: none; width: 8px; height: 8px; border-radius: 50%; background-color: #ef4444;"></span>`;
    document.body.appendChild(fab);

    // Setup event listener to build the window on first click
    fab.onclick = () => window.BKChat.toggleChat();

    // 2. Initialize lightweight chat manager object
    window.BKChat = {
      currentUser: null,
      companyId: null,
      employeeId: null,
      activeReceiver: null,
      activeThreadId: null,
      teammatesList: [],
      inboxByEmployee: {},
      chatTone: null,
      chatToneUnlocked: false,
      messagesLimit: 25,
      messagesOffset: 0,
      hasMoreMessages: true,
      isLoadingMore: false,

      async init() {
        this.initChatTone();
        try {
          // Reuse cached user session
          this.currentUser = await window.BKAuth.getUser();
          if (!this.currentUser) return;

          // Reuse cached role info
          const roleInfo = await window.BKAuth.getUserRole();
          if (!roleInfo) return;

          // Reuse cached company
          const co = await window.BKAuth.getCompany(roleInfo.tenantId);
          this.companyId = co?.id;
          if (!this.companyId) return;

          // Reuse cached employee details
          const emp = await window.BKAuth.getEmployee(this.currentUser.email);
          this.employeeId = emp?.id;
          if (!this.employeeId) return;

          this.firstName = emp?.first_name || '';
          this.lastName = emp?.last_name || '';
          this.department = emp?.department || '';
          this.reportingTo = emp?.reporting_to || '';

          // Subscribe to a lightweight unread counter after idle / now
          await this.updateUnreadIndicators();
          this.setupLightweightRealtime();

        } catch (err) {
          console.error('Chat init error:', err);
        }
      },

      initChatTone() {
        if (this.chatTone) return;
        this.chatTone = new Audio('/assets/audio/chat-message.mp3');
        this.chatTone.preload = 'auto';

        const unlockTone = () => {
          this.chatToneUnlocked = true;
          document.removeEventListener('pointerdown', unlockTone);
          document.removeEventListener('keydown', unlockTone);
        };
        document.addEventListener('pointerdown', unlockTone, { once: true });
        document.addEventListener('keydown', unlockTone, { once: true });
      },

      playChatTone() {
        this.initChatTone();
        if (!this.chatToneUnlocked) return;
        this.chatTone.currentTime = 0;
        this.chatTone.play().catch(() => {});
      },

      shouldShowMessageTime(currentTime, previousTime) {
        if (!previousTime) return true;
        return currentTime - previousTime >= 10 * 60 * 1000;
      },

      formatMessageTime(value) {
        const date = new Date(value);
        const now = new Date();
        const sameYear = date.getFullYear() === now.getFullYear();
        const dateOptions = sameYear
          ? { month: 'short', day: 'numeric' }
          : { month: 'short', day: 'numeric', year: 'numeric' };
        const dateStr = date.toLocaleDateString([], dateOptions);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `${dateStr}, ${timeStr}`;
      },

      appendMessageTimeSeparator(container, messageId, timestamp) {
        const separator = document.createElement('div');
        separator.className = 'chat-time-separator';
        separator.setAttribute('data-time-for', messageId);
        separator.style.cssText = 'align-self: center; font-size: 0.62rem; font-weight: 400; color: var(--text-muted, #71717a); margin: 0.35rem 0 0.1rem; padding: 0 0.35rem;';
        separator.textContent = this.formatMessageTime(timestamp);
        container.appendChild(separator);
      },

      appendMessageTimeSeparatorToFragment(fragment, messageId, timestamp) {
        const separator = document.createElement('div');
        separator.className = 'chat-time-separator';
        separator.setAttribute('data-time-for', messageId);
        separator.style.cssText = 'align-self: center; font-size: 0.62rem; font-weight: 400; color: var(--text-muted, #71717a); margin: 0.35rem 0 0.1rem; padding: 0 0.35rem;';
        separator.textContent = this.formatMessageTime(timestamp);
        fragment.appendChild(separator);
      },

      showChatLoading() {
        const container = document.getElementById('chat-members-container');
        if (!container) return;
        container.innerHTML = `
          <div style="height: 100%; min-height: 180px; display: flex; align-items: center; justify-content: center; gap: 0.6rem; color: var(--text-muted, #71717a); font-size: 0.78rem; font-weight: 600;">
            <span aria-hidden="true" style="width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--border, #e4e4e7); border-top-color: var(--cyan, #06b6d4); animation: bkChatSpin 0.75s linear infinite;"></span>
            <span>Loading...</span>
          </div>
        `;
      },

      showChatList() {
        this.activeReceiver = null;
        this.activeThreadId = null;
        document.getElementById('chat-message-view').style.display = 'none';
        document.getElementById('chat-list-view').style.display = 'flex';
        this.loadTeammates();
      },

      buildChatWindow() {
        if (document.getElementById('chat-window')) return;

        if (!document.getElementById('bk-chat-spinner-style')) {
          const spinnerStyle = document.createElement('style');
          spinnerStyle.id = 'bk-chat-spinner-style';
          spinnerStyle.textContent = '@keyframes bkChatSpin { to { transform: rotate(360deg); } }';
          document.head.appendChild(spinnerStyle);
        }

        const win = document.createElement('div');
        win.id = 'chat-window';
        win.style.cssText = 'position: fixed; bottom: 6rem; right: 2rem; width: 290px; height: 460px; background: var(--bg-surface, #ffffff); border: 1px solid var(--border, #e4e4e7); border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); z-index: 1000; display: flex; flex-direction: column; overflow: hidden; font-family: var(--font, sans-serif); opacity: 0; visibility: hidden; transform: translateY(20px) scale(0.95); transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.25s; pointer-events: none;';
        win.innerHTML = `
          <!-- View 1: Teammate List -->
          <div id="chat-list-view" style="display: flex; flex-direction: column; height: 100%;">
            <div style="padding: 0.65rem 0.85rem; border-bottom: 1px solid var(--border, #e4e4e7); display: flex; justify-content: space-between; align-items: center; background: var(--bg-elevated, #f4f4f5);">
              <span style="font-size: 0.82rem; font-weight: 700; color: var(--text-primary, #09090b);">Team Members</span>
              <button id="chat-close-btn-1" style="background: none; border: none; cursor: pointer; padding: 0.25rem; color: var(--text-muted, #71717a); display: flex; align-items: center; justify-content: center; outline: none;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
            <div id="chat-members-container" style="flex: 1; overflow-y: auto; padding: 0.5rem 0;"></div>
          </div>
          <!-- View 2: Private Chat Message Window -->
          <div id="chat-message-view" style="display: none; flex-direction: column; height: 100%;">
            <div style="padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border, #e4e4e7); display: flex; align-items: center; justify-content: space-between; background: var(--bg-elevated, #f4f4f5);">
              <div style="display: flex; align-items: center; gap: 0.5rem; min-width: 0; flex: 1;">
                <button id="chat-back-btn" style="background: none; border: none; cursor: pointer; padding: 0.25rem; color: var(--text-muted, #71717a); display: flex; align-items: center; justify-content: center; outline: none; margin-right: 0.25rem; flex-shrink: 0;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
                </button>
                <div style="position: relative; flex-shrink: 0;">
                  <div id="chat-header-avatar" style="width: 32px; height: 32px; border-radius: 50%; background: var(--cyan-dim, #ecfeff); color: var(--cyan, #06b6d4); font-size: 0.8rem; font-weight: 700; display: flex; align-items: center; justify-content: center; background-size: cover; background-position: center;"></div>
                  <div id="chat-header-status-dot" style="position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--bg-surface, #ffffff); background: #9ca3af;"></div>
                </div>
                <div style="min-width: 0; flex: 1;">
                  <div id="chat-header-name" style="font-size: 0.78rem; font-weight: 700; color: var(--text-primary, #09090b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></div>
                  <div id="chat-header-status-text" style="font-size: 0.62rem; color: var(--text-secondary, #52525b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></div>
                </div>
              </div>
              <button id="chat-close-btn-2" style="background: none; border: none; cursor: pointer; padding: 0.25rem; color: var(--text-muted, #71717a); display: flex; align-items: center; justify-content: center; outline: none; flex-shrink: 0; margin-left: 0.5rem;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
            <div id="chat-messages-container" style="flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 2px; background: var(--bg-base, #fafafa);"></div>
            <form id="chat-input-form" style="padding: 0.5rem 0.75rem; border-top: 1px solid var(--border, #e4e4e7); display: flex; gap: 0.4rem; background: var(--bg-surface, #ffffff); align-items: flex-end;">
              <textarea id="chat-message-input" placeholder="Type a message..." autocomplete="off" rows="1" style="flex: 1; border: 1px solid var(--border, #e4e4e7); border-radius: 16px; padding: 0.4rem 0.75rem; font-size: 0.76rem; outline: none; background: var(--bg-surface, #ffffff); color: var(--text-primary, #09090b); transition: border-color 0.2s; resize: none; max-height: 100px; height: 32px; overflow-y: auto; font-family: inherit; line-height: 1.4; box-sizing: border-box;"></textarea>
              <button type="submit" style="background: var(--cyan, #06b6d4); border: none; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; outline: none; flex-shrink: 0; transition: background-color 0.2s; margin-bottom: 2px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(45deg); margin-right: 2px; margin-top: -1px;">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
          </div>
        `;
        document.body.appendChild(win);

        // Bind events
        document.getElementById('chat-close-btn-1').onclick = () => this.toggleChat();
        document.getElementById('chat-close-btn-2').onclick = () => this.toggleChat();
        document.getElementById('chat-back-btn').onclick = () => this.showChatList();
        document.getElementById('chat-input-form').onsubmit = (e) => this.sendChatMessage(e);

        const chatInput = document.getElementById('chat-message-input');
        if (chatInput) {
          chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              this.sendChatMessage();
            }
          });
          chatInput.addEventListener('input', function() {
            this.style.height = '32px';
            const newHeight = Math.min(this.scrollHeight, 100);
            this.style.height = newHeight + 'px';
          });
        }

        this.initChatTone();
      },

      toggleChat() {
        this.buildChatWindow();
        const chatWin = document.getElementById('chat-window');
        const isOpen = chatWin.classList.contains('open');
        
        if (isOpen) {
          chatWin.classList.remove('open');
          chatWin.style.opacity = '0';
          chatWin.style.visibility = 'hidden';
          chatWin.style.transform = 'translateY(20px) scale(0.95)';
          chatWin.style.pointerEvents = 'none';
        } else {
          chatWin.classList.add('open');
          chatWin.style.opacity = '1';
          chatWin.style.visibility = 'visible';
          chatWin.style.transform = 'translateY(0) scale(1)';
          chatWin.style.pointerEvents = 'auto';
          this.showChatList();
        }
      },

      async updateUnreadIndicators() {
        try {
          const { data, error } = await window.BKAuth.sb
            .from('chat_thread_members')
            .select('unread_count')
            .eq('employee_id', this.employeeId);
          if (error) throw error;

          let totalUnread = 0;
          if (data) {
            data.forEach(row => {
              totalUnread += row.unread_count || 0;
            });
          }

          const fabDot = document.getElementById('chat-fab-dot');
          if (fabDot) {
            fabDot.style.display = totalUnread > 0 ? 'inline-block' : 'none';
          }
          return totalUnread;
        } catch (e) {
          console.error('Error updating unread indicators:', e);
          return 0;
        }
      },

      async loadTeammates(silent = false) {
        if (!silent) {
          this.showChatLoading();
        }

        const container = document.getElementById('chat-members-container');
        if (!container) return;

        const cacheKey = `chat_inbox_cache_${this.employeeId}`;
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            this.renderInbox(parsed.inbox || [], parsed.allEmployees || [], parsed.presenceMap || {});
          } catch(e) {}
        }

        try {
          const [inboxRes, empsRes, presenceRes] = await Promise.all([
            window.BKAuth.sb.rpc('get_employee_chat_inbox'),
            window.BKAuth.sb.from('employees')
              .select('id, first_name, last_name, picture_link, status_text, department, reporting_to')
              .eq('company_id', this.companyId)
              .eq('employment_status', 'Active')
              .neq('id', this.employeeId),
            window.BKAuth.sb.from('employee_presence').select('employee_id, status')
          ]);

          if (inboxRes.error) throw inboxRes.error;
          if (empsRes.error) throw empsRes.error;

          const inbox = inboxRes.data || [];
          const allEmployees = empsRes.data || [];
          const presenceMap = {};
          if (presenceRes.data) {
            presenceRes.data.forEach(p => {
              presenceMap[p.employee_id] = p.status;
            });
          }

          // Save to local cache
          localStorage.setItem(cacheKey, JSON.stringify({ inbox, allEmployees, presenceMap }));

          // Keep tracker of thread IDs for quick open
          this.inboxByEmployee = {};
          inbox.forEach(t => {
            this.inboxByEmployee[t.other_employee_id] = t;
          });

          this.renderInbox(inbox, allEmployees, presenceMap);
        } catch (e) {
          console.error(e);
        }
      },

      renderInbox(inbox, allEmployees, presenceMap = {}) {
        const container = document.getElementById('chat-members-container');
        if (!container) return;
        container.innerHTML = '';

        const teammatesMap = {};
        allEmployees.forEach(emp => {
          teammatesMap[emp.id] = {
            id: emp.id,
            first_name: emp.first_name,
            last_name: emp.last_name,
            picture_link: emp.picture_link,
            status_text: emp.status_text || '',
            unread_count: 0,
            has_messages: false
          };
        });

        inbox.forEach(thread => {
          if (!teammatesMap[thread.other_employee_id]) {
            teammatesMap[thread.other_employee_id] = {
              id: thread.other_employee_id,
              first_name: thread.first_name,
              last_name: thread.last_name,
              picture_link: thread.picture_link,
              status_text: '',
              unread_count: 0,
              has_messages: true
            };
          }
          teammatesMap[thread.other_employee_id].status_text = thread.last_message_preview || thread.status_text || teammatesMap[thread.other_employee_id].status_text || '';
          teammatesMap[thread.other_employee_id].unread_count = thread.unread_count || 0;
          teammatesMap[thread.other_employee_id].has_messages = true;
        });

        const unifiedTeammates = Object.values(teammatesMap);

        const getPriorityScore = (t) => {
          const status = presenceMap[t.id] || 'offline';
          if (status === 'available') return 3;
          if (status === 'break') return 2;
          if (t.has_messages) return 1;
          return 0;
        };

        const sorted = [...unifiedTeammates].sort((a, b) => {
          const scoreA = getPriorityScore(a);
          const scoreB = getPriorityScore(b);
          if (scoreA !== scoreB) {
            return scoreB - scoreA;
          }
          const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
          const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
          return nameA.localeCompare(nameB);
        });

        sorted.forEach(teammate => {
          const status = presenceMap[teammate.id] || 'offline';
          const item = this.createTeammateItemElement(teammate, status);
          container.appendChild(item);
        });
      },

      createTeammateItemElement(emp, status) {
        const statusColor = status === 'available' ? '#22c55e' : status === 'break' ? '#f97316' : '#9ca3af';
        const fullName = `${emp.first_name} ${emp.last_name}`;

        const div = document.createElement('div');
        div.className = 'chat-member-item';
        div.setAttribute('data-id', emp.id);
        div.onclick = () => this.openPrivateChat(emp, status);
        
        div.style.cssText = 'display: flex; align-items: center; gap: 0.65rem; padding: 0.4rem 0.85rem; cursor: pointer; transition: background 0.15s; border-radius: 8px; margin: 0 0.5rem;';
        div.addEventListener('mouseenter', () => div.style.background = 'var(--bg-elevated, #f4f4f5)');
        div.addEventListener('mouseleave', () => div.style.background = 'none');

        const avatarWrap = document.createElement('div');
        avatarWrap.style.cssText = 'position: relative; flex-shrink: 0;';
        
        const avatar = document.createElement('div');
        avatar.style.cssText = 'width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.78rem;';

        if (emp.picture_link) {
          avatar.style.backgroundImage = `url('${emp.picture_link}')`;
          avatar.style.backgroundSize = 'cover';
          avatar.style.backgroundPosition = 'center';
        } else {
          avatar.style.background = 'var(--cyan-dim, #ecfeff)';
          avatar.style.color = 'var(--cyan, #06b6d4)';
          avatar.textContent = emp.first_name[0] + (emp.last_name ? emp.last_name[0] : '');
        }

        const dot = document.createElement('div');
        dot.className = 'status-dot';
        dot.style.cssText = `position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--bg-surface, #ffffff); background-color: ${statusColor};`;

        avatarWrap.appendChild(avatar);
        avatarWrap.appendChild(dot);

        const info = document.createElement('div');
        info.style.cssText = 'flex: 1; min-width: 0;';

        const nameEl = document.createElement('div');
        nameEl.className = 'member-name';
        nameEl.style.cssText = 'font-size: 0.78rem; font-weight: 600; color: var(--text-primary, #09090b); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 0.35rem;';
        nameEl.textContent = fullName;

        if (emp.unread_count > 0) {
          const unreadBadge = document.createElement('span');
          unreadBadge.style.cssText = 'background: #ef4444; color: #fff; border-radius: 10px; font-size: 0.58rem; padding: 0.05rem 0.3rem; font-weight: 700;';
          unreadBadge.textContent = emp.unread_count;
          nameEl.appendChild(unreadBadge);
        }

        const textStatus = document.createElement('div');
        textStatus.className = 'status-text';
        textStatus.style.cssText = 'font-size: 0.65rem; color: var(--text-secondary, #52525b); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
        textStatus.textContent = emp.status_text || '';

        info.appendChild(nameEl);
        info.appendChild(textStatus);

        div.appendChild(avatarWrap);
        div.appendChild(info);
        return div;
      },

      async openPrivateChat(teammate, status) {
        this.activeReceiver = teammate;
        this.activeReceiverStatus = status;
        this.messagesLimit = 25;
        this.messagesOffset = 0;
        this.hasMoreMessages = true;
        this.isLoadingMore = false;

        const cached = JSON.parse(localStorage.getItem(`chat_inbox_cache_${this.employeeId}`));
        const foundThread = cached?.inbox?.find(t => t.other_employee_id === teammate.id);
        this.activeThreadId = foundThread?.thread_id || null;

        document.getElementById('chat-list-view').style.display = 'none';
        document.getElementById('chat-message-view').style.display = 'flex';

        const nameEl = document.getElementById('chat-header-name');
        nameEl.textContent = `${teammate.first_name} ${teammate.last_name}`;

        const statusText = document.getElementById('chat-header-status-text');
        statusText.textContent = teammate.status_text || '';

        const avatarEl = document.getElementById('chat-header-avatar');
        avatarEl.innerHTML = '';
        if (teammate.picture_link) {
          avatarEl.style.backgroundImage = `url('${teammate.picture_link}')`;
          avatarEl.style.backgroundSize = 'cover';
          avatarEl.style.backgroundPosition = 'center';
          avatarEl.textContent = '';
        } else {
          avatarEl.style.backgroundImage = 'none';
          avatarEl.style.background = 'var(--cyan-dim, #ecfeff)';
          avatarEl.style.color = 'var(--cyan, #06b6d4)';
          avatarEl.textContent = teammate.first_name[0] + teammate.last_name[0];
        }

        const dotEl = document.getElementById('chat-header-status-dot');
        dotEl.style.backgroundColor = status === 'available' ? '#22c55e' : status === 'break' ? '#f97316' : '#9ca3af';

        const container = document.getElementById('chat-messages-container');
        container.innerHTML = '';

        // Bind scroll to load older messages
        container.onscroll = () => {
          if (container.scrollTop === 0 && this.hasMoreMessages && !this.isLoadingMore) {
            this.loadOlderMessages();
          }
        };

        if (this.activeThreadId) {
          window.BKAuth.sb.rpc('mark_chat_thread_read', { p_thread_id: this.activeThreadId }).then(() => {
            this.updateUnreadIndicators();
          });
        }

        document.getElementById('chat-message-input').value = '';
        await this.fetchMessages();
      },

      async loadOlderMessages() {
        await this.fetchMessages(true);
      },

      showScrollLoadingIndicator() {
        const container = document.getElementById('chat-messages-container');
        if (!container) return;
        const loader = document.createElement('div');
        loader.id = 'chat-scroll-loader';
        loader.style.cssText = 'text-align: center; padding: 0.5rem; font-size: 0.65rem; color: var(--text-muted);';
        loader.textContent = 'Loading older messages...';
        container.insertBefore(loader, container.firstChild);
      },

      removeScrollLoadingIndicator() {
        const loader = document.getElementById('chat-scroll-loader');
        if (loader) loader.remove();
      },

      async fetchMessages(loadMore = false) {
        if (!this.activeReceiver) return;

        if (loadMore) {
          this.isLoadingMore = true;
          this.showScrollLoadingIndicator();
        } else {
          this.messagesOffset = 0;
          this.hasMoreMessages = true;
        }

        try {
          const { data, error } = await window.BKAuth.sb
            .from('employee_chats')
            .select('id, sender_id, receiver_id, message, created_at, thread_id')
            .or(`and(sender_id.eq.${this.employeeId},receiver_id.eq.${this.activeReceiver.id}),and(sender_id.eq.${this.activeReceiver.id},receiver_id.eq.${this.employeeId})`)
            .order('created_at', { ascending: false })
            .range(this.messagesOffset, this.messagesOffset + this.messagesLimit - 1);

          if (error) throw error;

          const fetchedCount = data?.length || 0;
          if (fetchedCount < this.messagesLimit) {
            this.hasMoreMessages = false;
          }

          this.removeScrollLoadingIndicator();

          const container = document.getElementById('chat-messages-container');
          if (!container) return;

          const messages = (data || []).reverse();
          const oldScrollHeight = container.scrollHeight;

          if (!loadMore) {
            container.innerHTML = '';
          }

          let previousMessageTime = null;
          const fragment = document.createDocumentFragment();

          messages.forEach((msg, idx) => {
            const messageTime = new Date(msg.created_at).getTime();
            if (idx === 0 || this.shouldShowMessageTime(messageTime, previousMessageTime)) {
              this.appendMessageTimeSeparatorToFragment(fragment, msg.id, msg.created_at);
            }

            const isSelf = msg.sender_id === this.employeeId;
            const msgRow = document.createElement('div');
            msgRow.setAttribute('data-msg-id', msg.id);
            msgRow.setAttribute('data-msg-time', String(messageTime));
            msgRow.style.cssText = `display: flex; flex-direction: column; align-items: ${isSelf ? 'flex-end' : 'flex-start'}; width: 100%;`;

            const bubble = document.createElement('div');
            bubble.style.cssText = `padding: 0.45rem 0.75rem; border-radius: 16px; font-size: 0.76rem; line-height: 1.4; max-width: 75%; word-break: break-word;`;

            if (isSelf) {
              bubble.style.background = 'var(--cyan, #06b6d4)';
              bubble.style.color = '#ffffff';
              bubble.style.borderBottomRightRadius = '4px';
            } else {
              bubble.style.background = 'var(--bg-elevated, #e4e4e7)';
              bubble.style.color = 'var(--text-primary, #09090b)';
              bubble.style.borderBottomLeftRadius = '4px';
            }
            bubble.textContent = msg.message;

            msgRow.appendChild(bubble);
            fragment.appendChild(msgRow);
            previousMessageTime = messageTime;

            if (msg.thread_id) {
              this.activeThreadId = msg.thread_id;
            }
          });

          if (loadMore) {
            container.insertBefore(fragment, container.firstChild);
            container.scrollTop = container.scrollHeight - oldScrollHeight;
          } else {
            container.appendChild(fragment);
            container.scrollTop = container.scrollHeight;
          }

          this.messagesOffset += fetchedCount;
          this.isLoadingMore = false;

        } catch (e) {
          console.error('Error fetching messages:', e);
          this.isLoadingMore = false;
        }
      },

      async sendChatMessage(event, manualText) {
        if (event) event.preventDefault();
        const input = document.getElementById('chat-message-input');
        if (!input) return;
        const text = manualText !== undefined ? manualText : input.value.trim();
        if (!text || !this.activeReceiver) return;

        if (manualText === undefined) {
          input.value = '';
          input.style.height = '32px';
        }

        // Optimistic append bubble
        const container = document.getElementById('chat-messages-container');
        let msgRow = null;
        if (container) {
          const renderedMessages = container.querySelectorAll('[data-msg-time]');
          const lastMessage = renderedMessages[renderedMessages.length - 1];
          const now = new Date();
          const nowTime = now.getTime();
          const lastMessageTime = lastMessage ? Number(lastMessage.getAttribute('data-msg-time')) : null;
          const pendingTimeId = `pending-${nowTime}`;

          if (this.shouldShowMessageTime(nowTime, lastMessageTime)) {
            this.appendMessageTimeSeparator(container, pendingTimeId, now);
          }

          msgRow = document.createElement('div');
          msgRow.className = 'chat-pending-message';
          msgRow.setAttribute('data-msg-time', String(nowTime));
          msgRow.style.cssText = 'display: flex; flex-direction: column; align-items: flex-end; width: 100%;';

          const bubble = document.createElement('div');
          bubble.style.cssText = 'padding: 0.45rem 0.75rem; border-radius: 16px; font-size: 0.76rem; line-height: 1.4; max-width: 75%; word-break: break-word; background: var(--cyan, #06b6d4); color: #ffffff; border-bottom-right-radius: 4px;';
          bubble.textContent = text;

          msgRow.appendChild(bubble);
          container.appendChild(msgRow);
          container.scrollTop = container.scrollHeight;
        }

        try {
          const { data, error } = await window.BKAuth.sb.rpc('send_employee_chat', {
            p_receiver_id: this.activeReceiver.id,
            p_message: text
          });
          if (error) throw error;

          // Remove optimistic bubble and refresh messages
          if (msgRow) msgRow.remove();
          await this.fetchMessages();

        } catch (e) {
          console.error('Error sending message:', e);
          if (msgRow) {
            const errorEl = document.createElement('div');
            errorEl.style.cssText = 'font-size: 0.58rem; color: #ef4444; margin-top: 0.15rem; padding: 0 0.25rem;';
            errorEl.textContent = 'Failed sending. ';

            const retryLink = document.createElement('span');
            retryLink.style.cssText = 'text-decoration: underline; cursor: pointer;';
            retryLink.textContent = 'Try again.';
            retryLink.onclick = () => {
              msgRow.remove();
              this.sendChatMessage(null, text);
            };
            errorEl.appendChild(retryLink);
            msgRow.appendChild(errorEl);
          }
        }
      },

      appendMessageBubbleDirectly(msg) {
        const container = document.getElementById('chat-messages-container');
        if (!container) return;

        const messageTime = new Date(msg.created_at).getTime();
        const renderedMessages = container.querySelectorAll('[data-msg-time]');
        const lastMessage = renderedMessages[renderedMessages.length - 1];
        const lastMessageTime = lastMessage ? Number(lastMessage.getAttribute('data-msg-time')) : null;

        if (this.shouldShowMessageTime(messageTime, lastMessageTime)) {
          this.appendMessageTimeSeparator(container, msg.id, msg.created_at);
        }

        const isSelf = msg.sender_id === this.employeeId;
        const msgRow = document.createElement('div');
        msgRow.setAttribute('data-msg-id', msg.id);
        msgRow.setAttribute('data-msg-time', String(messageTime));
        msgRow.style.cssText = `display: flex; flex-direction: column; align-items: ${isSelf ? 'flex-end' : 'flex-start'}; width: 100%;`;

        const bubble = document.createElement('div');
        bubble.style.cssText = `padding: 0.45rem 0.75rem; border-radius: 16px; font-size: 0.76rem; line-height: 1.4; max-width: 75%; word-break: break-word;`;

        if (isSelf) {
          bubble.style.background = 'var(--cyan, #06b6d4)';
          bubble.style.color = '#ffffff';
          bubble.style.borderBottomRightRadius = '4px';
        } else {
          bubble.style.background = 'var(--bg-elevated, #e4e4e7)';
          bubble.style.color = 'var(--text-primary, #09090b)';
          bubble.style.borderBottomLeftRadius = '4px';
        }
        bubble.textContent = msg.message;

        msgRow.appendChild(bubble);
        container.appendChild(msgRow);
        container.scrollTop = container.scrollHeight;
        this.messagesOffset += 1;
      },      setupLightweightRealtime() {
        if (this.lightweightChannel) return;
        try {
          this.lightweightChannel = window.BKAuth.sb
            .channel('public:chat_unread_presence')
            .on('postgres_changes', { 
              event: '*', 
              schema: 'public', 
              table: 'chat_thread_members', 
              filter: `employee_id=eq.${this.employeeId}` 
            }, payload => {
              this.updateUnreadIndicators();
              const chatWin = document.getElementById('chat-window');
              const isOpen = chatWin && chatWin.classList.contains('open');
              const listView = document.getElementById('chat-list-view');
              const isListOpen = isOpen && listView && listView.style.display !== 'none';
              if (isListOpen) {
                this.loadTeammates(true);
              }
            })
            .on('postgres_changes', {
              event: 'INSERT',
              schema: 'public',
              table: 'employee_chats',
              filter: `receiver_id=eq.${this.employeeId}`
            }, payload => {
              this.playChatTone();
              const newMsg = payload.new;
              if (newMsg && this.activeReceiver && newMsg.sender_id === this.activeReceiver.id) {
                this.appendMessageBubbleDirectly(newMsg);
                if (newMsg.thread_id) {
                  window.BKAuth.sb.rpc('mark_chat_thread_read', { p_thread_id: newMsg.thread_id }).then(() => {
                    this.updateUnreadIndicators();
                  });
                }
              }
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_logs' }, payload => {
              const newLog = payload.new;
              if (!newLog) return;

              // Update user's sidebar status immediately if it is the current employee
              if (this.employeeId && newLog.employee_id === this.employeeId) {
                const statusDot = document.getElementById('user-status-dot');
                const statusText = document.getElementById('user-status-text');
                if (statusDot && statusText) {
                  if (newLog.status === 'available') {
                    statusDot.style.backgroundColor = '#22c55e'; // Green
                    statusText.textContent = 'Time in';
                    statusText.style.color = '#22c55e';
                  } else if (newLog.status === 'break') {
                    statusDot.style.backgroundColor = '#f97316'; // Orange
                    statusText.textContent = 'Break';
                    statusText.style.color = '#f97316';
                  } else {
                    statusDot.style.backgroundColor = '#9ca3af'; // Gray
                    statusText.textContent = 'Time out';
                    statusText.style.color = '#9ca3af';
                  }
                }
              }

              const chatWin = document.getElementById('chat-window');
              const isOpen = chatWin && chatWin.classList.contains('open');
              if (isOpen) {
                const memberItem = document.querySelector(`.chat-member-item[data-id="${newLog.employee_id}"]`);
                if (memberItem) {
                  const dot = memberItem.querySelector('.status-dot');
                  const statusColor = newLog.status === 'available' ? '#22c55e' : newLog.status === 'break' ? '#f97316' : '#9ca3af';
                  if (dot) dot.style.backgroundColor = statusColor;
                }
                if (this.activeReceiver && newLog.employee_id === this.activeReceiver.id) {
                  const dotEl = document.getElementById('chat-header-status-dot');
                  if (dotEl) {
                    dotEl.style.backgroundColor = newLog.status === 'available' ? '#22c55e' : newLog.status === 'break' ? '#f97316' : '#9ca3af';
                  }
                }
              }
            })
            .subscribe();
        } catch (err) {
          console.warn('Lightweight realtime setup failed:', err);
        }
      }
    };

    window.BKChat.init();
  }  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebar);
  } else {
    initSidebar();
  }

})();

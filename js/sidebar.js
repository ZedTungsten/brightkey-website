(function() {
  'use strict';

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
          <a href="/dashboard/invoices" class="dash-nav-child">Invoices</a>
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
          <span class="dash-nav-text">Sales</span>
          <svg class="dash-nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dash-nav-children">
          <a class="dash-nav-child" data-role="sales" style="opacity: 0.5; cursor: not-allowed;">CRM</a>
          <a class="dash-nav-child" data-role="sales" style="opacity: 0.5; cursor: not-allowed;">Goals</a>
          <a class="dash-nav-child" data-role="sales" style="opacity: 0.5; cursor: not-allowed;">Calculators</a>
          <a class="dash-nav-child" data-role="sales" style="opacity: 0.5; cursor: not-allowed;">Resources</a>
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
          <a href="/dashboard/fulfillment" class="dash-nav-child" data-role="logistics">Fulfillment</a>
          <a href="/dashboard/shipping-rates" class="dash-nav-child" data-role="logistics">Shipping Rates</a>
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
          <a href="/dashboard/onboarding" class="dash-nav-child" data-role="hr">Onboarding</a>
          <a class="dash-nav-child" data-role="hr" style="opacity: 0.5; cursor: not-allowed;">Company Events</a>
          <a class="dash-nav-child" data-role="hr" style="opacity: 0.5; cursor: not-allowed;">Announcements</a>
          <a class="dash-nav-child" data-role="hr" style="opacity: 0.5; cursor: not-allowed;">KPI</a>
          <a class="dash-nav-child" data-role="hr" style="opacity: 0.5; cursor: not-allowed;">Salary Tracker</a>
          <a class="dash-nav-child" data-role="hr" style="opacity: 0.5; cursor: not-allowed;">Inbox</a>
          <a class="dash-nav-child" data-role="hr" style="opacity: 0.5; cursor: not-allowed;">Resources</a>
          <a class="dash-nav-child" data-role="hr" style="opacity: 0.5; cursor: not-allowed;">Reports</a>
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
          <a href="/dashboard/financial-statement" class="dash-nav-child" data-role="accounting">Financial Statements</a>
          <a href="/dashboard/ledgers" class="dash-nav-child" data-role="accounting">Ledgers</a>
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
          <a href="#" class="dash-nav-item" data-role="management-only" style="border-radius:0; padding: 0.45rem 1rem;" onclick="alert('Subscription settings coming soon!')">
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

    // Check sub-links and auto-expand active group
    document.querySelectorAll('.dash-nav-child').forEach(link => {
      const href = link.getAttribute('href');
      if (href && (currentPath === href || currentPath === href + '.html')) {
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
        const user = await window.BKAuth.sb.auth.getUser();
        if (!user || !user.data || !user.data.user) return;
        const currentUser = user.data.user;

        const roleInfo = await window.BKAuth.getUserRole();
        const userRole = roleInfo?.role || null;

        let accessibleModules = [];
        const isOwnerOrAdmin = ['owner', 'admin'].includes(userRole);

        if (!isOwnerOrAdmin && userRole) {
          if (userRole.startsWith('access:')) {
            accessibleModules = userRole.substring(7).split(',').map(s => s.trim());
          } else {
            try {
              const { data: dbRole } = await window.BKAuth.sb
                .from('dashboard_roles')
                .select('accessible_modules')
                .eq('name', userRole)
                .maybeSingle();
              if (dbRole && Array.isArray(dbRole.accessible_modules)) {
                accessibleModules = dbRole.accessible_modules;
              }
            } catch (err) {
              console.error('Sidebar dynamic role fetch error:', err);
            }
          }
        }

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

        // Populate user info
        const name  = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
        const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

        let profilePictureUrl = null;
        try {
          const { data: empData } = await window.BKAuth.sb
            .from('employees')
            .select('picture_link')
            .eq('id', currentUser.id)
            .maybeSingle();
          if (empData && empData.picture_link) {
            profilePictureUrl = empData.picture_link;
          }
        } catch (err) {
          console.error('Sidebar profile picture fetch error:', err);
        }

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

        const avatarEl = document.getElementById('user-avatar');
        const nameEl = document.getElementById('user-name');
        const roleEl = document.getElementById('user-role');
        const emailEl = document.getElementById('user-email');

        if (avatarEl) {
          if (profilePictureUrl) {
            avatarEl.innerHTML = `<img src="${profilePictureUrl}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;" />`;
          } else {
            avatarEl.textContent = initials;
          }
        }
        if (nameEl) nameEl.textContent = name;
        if (roleEl) roleEl.textContent = displayRole;
        if (emailEl) emailEl.textContent = currentUser.email;

      } catch (err) {
        console.error('Sidebar RBAC error:', err);
      } finally {
        const skeletonEl = document.getElementById('sidebar-nav-skeleton');
        const contentEl = document.getElementById('sidebar-nav-content');
        if (skeletonEl) skeletonEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'flex';
      }
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebar);
  } else {
    initSidebar();
  }

})();

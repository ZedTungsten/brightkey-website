(function() {
  'use strict';

  // 1. Inject Sidebar Styles
  const sidebarStyles = `
    .dash-layout {
      display: grid;
      grid-template-columns: 240px 1fr;
      min-height: 100vh;
      transition: grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .dash-layout.sidebar-minimized {
      grid-template-columns: 64px 1fr;
    }

    /* Sidebar */
    .dash-sidebar {
      background: var(--bg-surface, #FFFFFF);
      border-right: 1px solid var(--border, #E4E4E7);
      padding: 1.5rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      position: sticky;
      top: 0;
      height: 100vh;
      transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s, background 0.3s;
      overflow-x: hidden;
      overflow-y: auto;
      box-sizing: border-box;
    }
    .dash-sidebar * {
      box-sizing: border-box;
    }
    .dash-sidebar.minimized {
      padding: 1.5rem 0.5rem;
    }
    .dash-sidebar.minimized .dash-logo-text {
      display: none;
    }
    .dash-sidebar.minimized .dash-logo {
      justify-content: center;
      padding: 0.5rem 0;
    }
    .dash-logo {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1.2rem;
      font-weight: 800;
      color: var(--text-primary, #09090B);
      text-decoration: none;
      padding: 0.5rem 0.75rem;
      margin-bottom: 0;
      white-space: nowrap;
      transition: all 0.3s;
    }
    .dash-logo span { color: var(--blue, #2563EB); }

    #sidebar-toggle {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-muted, #A1A1AA);
      padding: 0.4rem;
      border-radius: var(--radius-sm, 4px);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    #sidebar-toggle:hover {
      background: var(--bg-elevated, #F4F4F5);
      color: var(--text-primary, #09090B);
    }
    #toggle-icon {
      transition: transform 0.3s ease;
    }
    .dash-sidebar.minimized #toggle-icon {
      transform: rotate(180deg);
    }

    .dash-nav-label {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted, #A1A1AA);
      padding: 0.5rem 0.75rem 0.25rem;
      margin-top: 0.5rem;
      white-space: nowrap;
      transition: opacity 0.2s;
    }
    .dash-sidebar.minimized .dash-nav-label {
      opacity: 0;
      height: 0;
      padding: 0;
      margin: 0;
      overflow: hidden;
    }

    .dash-nav-item {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.6rem 0.75rem;
      border-radius: var(--radius-sm, 4px);
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-secondary, #52525B);
      text-decoration: none;
      transition: all var(--transition, 0.15s ease);
      cursor: pointer;
      border: none;
      background: none;
      width: 100%;
      text-align: left;
    }
    .dash-nav-item:hover { background: var(--bg-elevated, #F4F4F5); color: var(--text-primary, #09090B); }
    .dash-nav-item.active { background: var(--blue-dim, rgba(37,99,235,0.08)); color: var(--blue-light, #2563EB); }
    .dash-nav-item svg { width: 16px; height: 16px; flex-shrink: 0; }

    .dash-sidebar.minimized .dash-nav-item {
      justify-content: center;
      padding: 0.6rem 0;
    }
    .dash-sidebar.minimized .dash-nav-item span {
      display: none;
    }

    /* Nested Sidebar Navigation */
    .dash-nav-group {
      margin-bottom: 0.15rem;
      transition: all 0.3s;
    }
    .dash-nav-parent {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.6rem 0.75rem;
      border-radius: var(--radius-sm, 4px);
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-secondary, #52525B);
      text-decoration: none;
      transition: all var(--transition, 0.15s ease);
      cursor: pointer;
      border: none;
      background: none;
      width: 100%;
      text-align: left;
      position: relative;
    }
    .dash-nav-parent:hover { background: var(--bg-elevated, #F4F4F5); color: var(--text-primary, #09090B); }
    .dash-nav-parent svg { width: 16px; height: 16px; flex-shrink: 0; }
    .dash-nav-chevron {
      margin-left: auto;
      width: 12px !important;
      height: 12px !important;
      transition: transform 0.2s;
    }
    .dash-nav-group.expanded .dash-nav-parent {
      color: var(--text-primary, #09090B);
    }
    .dash-nav-group.expanded .dash-nav-chevron {
      transform: rotate(180deg);
    }
    .dash-nav-children {
      display: none;
      flex-direction: column;
      gap: 0.15rem;
      padding-left: 2.25rem;
      margin-top: 0.15rem;
      margin-bottom: 0.25rem;
    }
    .dash-nav-group.expanded .dash-nav-children {
      display: flex;
    }
    .dash-nav-child {
      display: flex;
      align-items: center;
      padding: 0.45rem 0.75rem;
      border-radius: var(--radius-sm, 4px);
      font-size: 0.82rem;
      font-weight: 500;
      color: var(--text-secondary, #52525B);
      text-decoration: none;
      transition: all var(--transition, 0.15s ease);
      cursor: pointer;
    }
    .dash-nav-child:hover { background: var(--bg-elevated, #F4F4F5); color: var(--text-primary, #09090B); }
    .dash-nav-child.active { background: var(--blue-dim, rgba(37,99,235,0.08)); color: var(--blue-light, #2563EB); }

    /* Minimized state for nested menu */
    @media (min-width: 769px) {
      .dash-sidebar.minimized .dash-nav-group {
        position: relative;
      }
      .dash-sidebar.minimized .dash-nav-parent {
        justify-content: center;
        padding: 0.6rem 0;
      }
      .dash-sidebar.minimized .dash-nav-chevron,
      .dash-sidebar.minimized .dash-nav-text {
        display: none;
      }
      .dash-sidebar.minimized .dash-nav-children {
        display: none !important;
        position: absolute;
        left: 100%;
        top: 0;
        background: var(--bg-surface, #FFFFFF);
        border: 1px solid var(--border, #E4E4E7);
        border-radius: var(--radius-md, 8px);
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
        padding: 0.5rem;
        min-width: 180px;
        z-index: 1000;
        margin-left: 0.5rem;
        flex-direction: column;
        gap: 0.15rem;
      }
      .dash-sidebar.minimized .dash-nav-group:hover .dash-nav-children {
        display: flex !important;
      }
      .dash-sidebar.minimized .dash-nav-child {
        padding: 0.45rem 0.75rem;
      }
    }

    .dash-sidebar-footer {
      margin-top: auto;
      border-top: 1px solid var(--border, #E4E4E7);
      padding-top: 1rem;
    }
    .dash-user {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.5rem 0.75rem;
    }
    .dash-user-avatar {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: var(--blue-dim, rgba(37,99,235,0.08));
      border: 1px solid rgba(37,99,235,0.3);
      display: grid;
      place-items: center;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--blue-light, #2563EB);
      flex-shrink: 0;
    }
    .dash-user-name { font-size: 0.82rem; font-weight: 600; color: var(--text-primary, #09090B); }
    .dash-user-email { font-size: 0.72rem; color: var(--text-muted, #A1A1AA); }

    .dash-sidebar.minimized .dash-user-name,
    .dash-sidebar.minimized .dash-user-email {
      display: none;
    }
    .dash-sidebar.minimized .dash-user {
      justify-content: center;
      padding: 0.5rem 0;
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = sidebarStyles;
  document.head.appendChild(styleEl);

  // 2. Sidebar HTML Template (absolute links starting with "/")
  const sidebarHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; flex-shrink: 0; min-height: 32px;">
        <a href="/dashboard" class="dash-logo" style="padding: 0.5rem 0.25rem; display: flex; align-items: center; gap: 0.25rem;">
          <span style="font-weight: 800; color: var(--text-primary); flex-shrink: 0;">B<span style="color: var(--blue);">K</span></span>
          <span class="dash-logo-text" style="font-weight: 800; color: var(--text-primary);">right<span>Key</span></span>
        </a>
        <button id="sidebar-toggle" title="Toggle Sidebar">
          <svg id="toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px;">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
      </div>

      <a href="/dashboard" class="dash-nav-item" id="nav-item-home" style="margin-bottom: 0.5rem;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span class="dash-nav-text">Home</span>
      </a>

      <!-- Products -->
      <div class="dash-nav-group" id="nav-group-products">
        <button class="dash-nav-parent" onclick="toggleSubmenu(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          <span class="dash-nav-text">Products</span>
          <svg class="dash-nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dash-nav-children">
          <a href="/dashboard/catalog" class="dash-nav-child" data-role="logistics">Catalog</a>
          <a href="/dashboard/add-products" class="dash-nav-child" data-role="logistics">Bulk Upload</a>
        </div>
      </div>

      <!-- Operations -->
      <div class="dash-nav-group" id="nav-group-operations">
        <button class="dash-nav-parent" onclick="toggleSubmenu(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span class="dash-nav-text">Operations</span>
          <svg class="dash-nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dash-nav-children">
          <a href="/dashboard/booking" class="dash-nav-child">Book</a>
          <a class="dash-nav-child" style="opacity: 0.5; cursor: not-allowed;">Schedules</a>
        </div>
      </div>

      <!-- Marketing -->
      <div class="dash-nav-group" id="nav-group-marketing">
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
      <div class="dash-nav-group" id="nav-group-sales">
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
      <div class="dash-nav-group" id="nav-group-customerservice">
        <button class="dash-nav-parent" onclick="toggleSubmenu(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span class="dash-nav-text">Customer Service</span>
          <svg class="dash-nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dash-nav-children">
          <a href="/dashboard/support-inbox" class="dash-nav-child" data-role="hr">Inbox</a>
          <a href="/dashboard/product-reviews" class="dash-nav-child" data-role="marketing">Reviews</a>
        </div>
      </div>

      <!-- Logistics -->
      <div class="dash-nav-group" id="nav-group-logistics">
        <button class="dash-nav-parent" onclick="toggleSubmenu(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          <span class="dash-nav-text">Logistics</span>
          <svg class="dash-nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dash-nav-children">
          <a href="/dashboard/fulfillment" class="dash-nav-child" data-role="logistics">Fulfillment</a>
          <a class="dash-nav-child" data-role="logistics" style="opacity: 0.5; cursor: not-allowed;">Shipping Rates</a>
        </div>
      </div>

      <!-- HR -->
      <div class="dash-nav-group" id="nav-group-hr">
        <button class="dash-nav-parent" onclick="toggleSubmenu(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span class="dash-nav-text">HR</span>
          <svg class="dash-nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dash-nav-children">
          <a href="/dashboard/employee-directory" class="dash-nav-child" data-role="hr">Directory</a>
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
      <div class="dash-nav-group" id="nav-group-finance">
        <button class="dash-nav-parent" onclick="toggleSubmenu(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          <span class="dash-nav-text">Finance</span>
          <svg class="dash-nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dash-nav-children">
          <a href="/dashboard/general-journal" class="dash-nav-child" data-role="accounting">General Journal</a>
          <a class="dash-nav-child" data-role="accounting" style="opacity: 0.5; cursor: not-allowed;">Ledgers</a>
          <a class="dash-nav-child" data-role="accounting" style="opacity: 0.5; cursor: not-allowed;">Reports</a>
        </div>
      </div>

      <div class="dash-sidebar-footer" style="position: relative;">
        <!-- Floating Dropdown Menu -->
        <div id="user-menu" style="display: none; position: absolute; bottom: calc(100% + 8px); left: 0; right: 0; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); z-index: 100; flex-direction: column; overflow: hidden; animation: popUp 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;">
          <a href="/dashboard/users" class="dash-nav-item" data-role="admin-only" style="border-radius:0; border-bottom: 1px solid var(--border); padding: 0.75rem 1rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            <span>Users</span>
          </a>
          <a href="#" class="dash-nav-item" style="border-radius:0; border-bottom: 1px solid var(--border); padding: 0.75rem 1rem;" onclick="alert('Settings coming soon!')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>Settings</span>
          </a>
          <a href="#" class="dash-nav-item" style="border-radius:0; border-bottom: 1px solid var(--border); padding: 0.75rem 1rem;" onclick="alert('Integrations coming soon!')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.55 4.24a1.79 1.79 0 0 0-2.5 1.54v12.44a1.79 1.79 0 0 0 2.5 1.54l8.95-5.15a1.78 1.78 0 0 0 0-3.07Z"/></svg>
            <span>Integrations</span>
          </a>
          <a href="#" class="dash-nav-item" style="border-radius:0; border-bottom: 1px solid var(--border); padding: 0.75rem 1rem;" onclick="alert('Subscription settings coming soon!')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            <span>Subscription</span>
          </a>
          <button class="dash-nav-item" onclick="BKAuth.signOut()" style="border-radius:0; padding: 0.75rem 1rem; width: 100%;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span>Log Out</span>
          </button>
        </div>

        <div class="dash-user" style="cursor: pointer; transition: background 0.2s; border-radius: var(--radius-sm);" onclick="toggleUserMenu(event)">
          <div class="dash-user-avatar" id="user-avatar">?</div>
          <div style="flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">
            <div class="dash-user-name" id="user-name">Loading…</div>
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
        const userRole = roleInfo?.role || 'staff';

        // Filter child links
        document.querySelectorAll('.dash-nav-child').forEach(el => {
          const allowedRole = el.dataset.role;
          if (!allowedRole) return;
          if (['owner', 'admin'].includes(userRole)) {
            el.style.display = 'flex';
          } else if (userRole === allowedRole) {
            el.style.display = 'flex';
          } else {
            el.style.display = 'none';
          }
        });

        // Hide group if no visible children
        document.querySelectorAll('.dash-nav-group').forEach(group => {
          const children = Array.from(group.querySelectorAll('.dash-nav-child'));
          const hasVisibleChildren = children.length === 0 || children.some(el => el.style.display !== 'none');
          if (!hasVisibleChildren) {
            group.style.display = 'none';
          } else {
            group.style.display = 'block';
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
          }
        });

        // Populate user info
        const name  = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
        const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

        const avatarEl = document.getElementById('user-avatar');
        const nameEl = document.getElementById('user-name');
        const emailEl = document.getElementById('user-email');

        if (avatarEl) avatarEl.textContent = initials;
        if (nameEl) nameEl.textContent = name;
        if (emailEl) emailEl.textContent = currentUser.email;

      } catch (err) {
        console.error('Sidebar RBAC error:', err);
      }
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebar);
  } else {
    initSidebar();
  }

})();

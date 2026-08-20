'use strict';

(function () {
  const SUPABASE_URL = 'https://ymjlosnxuhsybkzkoofq.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltamxvc254dWhzeWJremtvb2ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY1MzYsImV4cCI6MjA4OTk4MjUzNn0.srhk9SVvFuZRcfeRGbVDGPr5pYrFhs8vzcOiMK3A91w';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  const state = { data: null, loading: false };
  const $ = id => document.getElementById(id);
  const FEATURE_LABELS = {
    pan_tilt_zoom: 'Pan, Tilt & Zoom (PTZ)',
    face_recognition_3d: '3D Face Recognition',
    type_co2: 'CO₂ Gas Type',
    type_abc: 'ABC Dry Chemical',
    type_dry_chemical: 'Dry Chemical Powder',
    type_foam: 'Foam Spray',
    pressure_gauge: 'Pressure Gauge Indicator',
    wifi_connect: 'WiFi Connectivity'
  };

  function safeImage(value) {
    const source = String(value || '').trim();
    if (/^https?:\/\//i.test(source) || /^\/(?!\/)/.test(source)) return source;
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(source)) return source;
    return '';
  }

  function formatDate(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function label(value) {
    if (FEATURE_LABELS[value]) return FEATURE_LABELS[value];
    return String(value || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, character => character.toUpperCase())
      .replace(/\bPin\b/g, 'PIN')
      .replace(/\bRfid\b/g, 'RFID')
      .replace(/\bUsb\b/g, 'USB')
      .replace(/\b3d\b/gi, '3D')
      .replace(/\bWifi\b/g, 'WiFi')
      .replace(/\bPoe\b/g, 'PoE')
      .replace(/\bAi\b/g, 'AI');
  }

  function status(booking) {
    const value = String(booking.status || '').toLowerCase();
    if (['cancelled', 'canceled'].includes(value)) return { text: 'Cancelled', className: 'cancelled' };
    let doors = booking.doors;
    if (typeof doors === 'string') { try { doors = JSON.parse(doors); } catch { doors = []; } }
    if (['done', 'completed', 'finished'].includes(value) || (Array.isArray(doors) && doors.length && doors.every(door => door?.completed))) {
      return { text: 'Done', className: 'done' };
    }
    return { text: 'Scheduled', className: '' };
  }

  function imageBox(source, className) {
    const box = document.createElement('div');
    box.className = className;
    const validSource = safeImage(source);
    if (!validSource) { box.textContent = 'No image'; return box; }
    const image = document.createElement('img');
    image.src = validSource;
    image.alt = '';
    image.loading = 'lazy';
    image.addEventListener('error', () => box.replaceChildren(document.createTextNode('No image')));
    box.appendChild(image);
    return box;
  }

  function populatedEntries(values) {
    return Object.entries(values || {}).filter(([, value]) => value !== null && value !== '' && value !== false);
  }

  function readableValue(value) {
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  function checkIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M20 6 9 17l-5-5');
    svg.appendChild(path);
    return svg;
  }

  function featureList(entries) {
    const list = document.createElement('ul');
    list.className = 'feature-list';
    if (!entries.length) {
      const empty = document.createElement('li');
      empty.className = 'details-empty';
      empty.textContent = 'No features available.';
      list.appendChild(empty);
      return list;
    }
    entries.forEach(([key, value]) => {
      const item = document.createElement('li');
      const valueText = readableValue(value).trim();
      item.appendChild(checkIcon());
      item.appendChild(document.createTextNode(
        valueText.toLowerCase() === 'x' ? label(key) : `${label(key)} (${valueText})`
      ));
      list.appendChild(item);
    });
    return list;
  }

  function specsList(entries) {
    const grid = document.createElement('div');
    grid.className = 'details-grid';
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'details-empty';
      empty.textContent = 'No specifications available.';
      grid.appendChild(empty);
      return grid;
    }
    entries.forEach(([key, value]) => {
      const row = document.createElement('div');
      row.className = 'details-row';
      const name = document.createElement('span');
      const content = document.createElement('strong');
      name.textContent = label(key);
      content.textContent = readableValue(value);
      row.append(name, content);
      grid.appendChild(row);
    });
    return grid;
  }

  function details(product) {
    const features = populatedEntries(product?.features);
    const specifications = populatedEntries(product?.specifications);
    if (!features.length && !specifications.length) return null;
    const disclosure = document.createElement('details');
    disclosure.className = 'product-details';
    const summary = document.createElement('summary');
    summary.textContent = 'Features and specs';
    const tabs = document.createElement('div');
    tabs.className = 'drawer-tabs details-tabs';
    tabs.setAttribute('role', 'tablist');
    const panels = document.createElement('div');
    panels.className = 'details-panels';
    const availableTabs = [
      { name: 'Features', entries: features, content: featureList },
      { name: 'Specs', entries: specifications, content: specsList }
    ];
    const selectTab = selectedName => {
      tabs.querySelectorAll('.tab-btn').forEach(button => {
        const selected = button.dataset.tab === selectedName;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-selected', String(selected));
      });
      panels.querySelectorAll('.details-panel').forEach(panel => {
        panel.hidden = panel.dataset.panel !== selectedName;
      });
    };
    availableTabs.forEach((tab, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `tab-btn${index === 0 ? ' active' : ''}`;
      button.dataset.tab = tab.name;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(index === 0));
      button.textContent = tab.name;
      button.addEventListener('click', () => selectTab(tab.name));
      const panel = document.createElement('div');
      panel.className = 'details-panel';
      panel.dataset.panel = tab.name;
      panel.setAttribute('role', 'tabpanel');
      panel.hidden = index !== 0;
      panel.appendChild(tab.content(tab.entries));
      tabs.appendChild(button);
      panels.appendChild(panel);
    });
    disclosure.append(summary, tabs, panels);
    return disclosure;
  }

  function purchaseProduct(item) {
    const row = document.createElement('article');
    row.className = 'purchase-product';
    const product = item.product || {};
    row.appendChild(imageBox(product.image, 'product-image'));
    const info = document.createElement('div');
    info.className = 'product-info';
    const title = document.createElement('h2');
    title.textContent = product.title || item.sku || 'Product';
    const sku = document.createElement('span');
    sku.className = 'product-sku';
    sku.textContent = item.sku || '—';
    const quantity = document.createElement('p');
    quantity.className = 'product-qty';
    quantity.textContent = `Quantity: ${item.quantity || 1}`;
    info.append(title, sku, quantity);
    const productDetails = details(product);
    if (productDetails) info.appendChild(productDetails);
    row.appendChild(info);
    return row;
  }

  function renderPurchases() {
    const list = $('purchase-list');
    const purchases = state.data?.purchases || [];
    $('purchase-count').textContent = `${purchases.length} order${purchases.length === 1 ? '' : 's'}`;
    list.replaceChildren();
    if (!purchases.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      const heading = document.createElement('h2');
      const copy = document.createElement('p');
      heading.textContent = 'No purchases found';
      copy.textContent = 'Orders linked to your registered phone number will appear here.';
      empty.append(heading, copy);
      list.appendChild(empty);
      return;
    }
    purchases.forEach(purchase => {
      const card = document.createElement('article');
      card.className = 'purchase-card';
      const header = document.createElement('header');
      header.className = 'purchase-header';
      const reference = document.createElement('div');
      const order = document.createElement('strong');
      const dates = document.createElement('small');
      order.textContent = purchase.order_no || 'Order';
      dates.textContent = `Booked ${formatDate(purchase.booking_date)} · Install ${formatDate(purchase.installation_date)}`;
      reference.append(order, dates);
      const bookingStatus = status(purchase);
      const pill = document.createElement('span');
      pill.className = `status-pill ${bookingStatus.className}`.trim();
      pill.textContent = bookingStatus.text;
      header.append(reference, pill);
      const items = document.createElement('div');
      items.className = 'purchase-items';
      (purchase.items || []).forEach(item => items.appendChild(purchaseProduct(item)));
      card.append(header, items);
      list.appendChild(card);
    });
  }

  function renderCatalog() {
    const gallery = $('product-gallery');
    gallery.replaceChildren();
    (state.data?.catalog || []).forEach(product => {
      const card = document.createElement('a');
      card.className = 'gallery-card';
      card.href = product.slug ? `/products/${encodeURIComponent(product.slug)}` : '#';
      card.appendChild(imageBox(product.image, 'gallery-image'));
      const copy = document.createElement('div');
      copy.className = 'gallery-copy';
      const title = document.createElement('strong');
      const sku = document.createElement('span');
      title.textContent = product.title || product.sku || 'Product';
      sku.textContent = product.sku || 'View product';
      copy.append(title, sku);
      card.appendChild(copy);
      gallery.appendChild(card);
    });
  }

  function render() {
    const customer = state.data?.customer || {};
    $('customer-greeting').textContent = `Hello, ${customer.first_name || 'Customer'}`;
    $('affiliate-code').textContent = customer.affiliate_code || '—';
    renderPurchases();
    renderCatalog();
  }

  function showLogin() {
    $('portal-shell').hidden = true;
    $('login-screen').hidden = false;
    $('login-password').value = '';
  }

  function showPortal() {
    $('login-screen').hidden = true;
    $('portal-shell').hidden = false;
  }

  async function loadPortal() {
    if (state.loading) return;
    state.loading = true;
    showPortal();
    $('portal-loading').hidden = false;
    $('portal-error').hidden = true;
    document.querySelectorAll('.portal-view').forEach(view => { view.hidden = true; });
    try {
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) { showLogin(); return; }
      const response = await fetch('/api/customer-portal-data', { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) { await sb.auth.signOut(); showLogin(); return; }
      if (!response.ok) throw new Error(payload.error || 'Portal request failed');
      state.data = payload;
      render();
      document.querySelectorAll('.portal-view').forEach(view => { view.hidden = false; });
      switchView('purchases');
    } catch (error) {
      console.error('Customer portal load failed:', error);
      $('portal-error').hidden = false;
    } finally {
      $('portal-loading').hidden = true;
      state.loading = false;
    }
  }

  function switchView(name) {
    document.querySelectorAll('.portal-view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function login(event) {
    event.preventDefault();
    const button = $('login-button');
    const error = $('login-error');
    error.hidden = true;
    button.disabled = true;
    button.textContent = 'Signing in…';
    try {
      const response = await fetch('/api/customer-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: $('login-username').value, password: $('login-password').value })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Sign in failed');
      const { error: sessionError } = await sb.auth.setSession({ access_token: payload.access_token, refresh_token: payload.refresh_token });
      if (sessionError) throw sessionError;
      await loadPortal();
    } catch (loginError) {
      console.error('Customer sign-in failed:', loginError);
      error.textContent = loginError.message && !/database|supabase|token|auth/i.test(loginError.message)
        ? loginError.message
        : 'Sign in could not be completed. Check your details and try again.';
      error.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = 'Sign in';
    }
  }

  async function logout() {
    closeProfileMenu();
    await sb.auth.signOut();
    state.data = null;
    showLogin();
  }

  function closeProfileMenu() {
    $('profile-dropdown').hidden = true;
    $('profile-button').setAttribute('aria-expanded', 'false');
  }

  function toggleProfileMenu() {
    const willOpen = $('profile-dropdown').hidden;
    $('profile-dropdown').hidden = !willOpen;
    $('profile-button').setAttribute('aria-expanded', String(willOpen));
  }

  function initNavigation() {
    const mobile = document.querySelector('.mobile-nav');
    document.querySelectorAll('.portal-sidebar .nav-button').forEach(button => {
      const clone = button.cloneNode(true);
      mobile.appendChild(clone);
    });
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-view]');
      if (button) switchView(button.dataset.view);
    });
  }

  async function init() {
    initNavigation();
    $('login-form').addEventListener('submit', login);
    $('profile-button').addEventListener('click', event => {
      event.stopPropagation();
      toggleProfileMenu();
    });
    $('profile-logout').addEventListener('click', logout);
    document.addEventListener('click', event => {
      if (!event.target.closest('.profile-menu')) closeProfileMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeProfileMenu();
        $('profile-button').focus();
      }
    });
    $('retry-button').addEventListener('click', loadPortal);
    $('copy-affiliate').addEventListener('click', async () => {
      const code = $('affiliate-code').textContent;
      try { await navigator.clipboard.writeText(code); $('copy-status').textContent = 'Code copied.'; }
      catch { $('copy-status').textContent = 'Select and copy the code above.'; }
    });
    showLogin();
    await sb.auth.signOut({ scope: 'local' });
  }

  document.addEventListener('DOMContentLoaded', init);
  window.BKCustomerPortal = { safeImage, status };
})();

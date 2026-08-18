'use strict';

(function () {
  const SUPABASE_URL = 'https://ymjlosnxuhsybkzkoofq.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltamxvc254dWhzeWJremtvb2ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY1MzYsImV4cCI6MjA4OTk4MjUzNn0.srhk9SVvFuZRcfeRGbVDGPr5pYrFhs8vzcOiMK3A91w';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  const state = { data: null, loading: false };
  const $ = id => document.getElementById(id);

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
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
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

  function details(product) {
    const values = [
      ...Object.entries(product?.specifications || {}),
      ...Object.entries(product?.features || {})
    ].filter(([, value]) => value !== null && value !== '' && value !== false);
    if (!values.length) return null;
    const disclosure = document.createElement('details');
    disclosure.className = 'product-details';
    const summary = document.createElement('summary');
    summary.textContent = 'Specifications and features';
    const grid = document.createElement('div');
    grid.className = 'details-grid';
    values.slice(0, 20).forEach(([key, value]) => {
      const row = document.createElement('div');
      row.className = 'details-row';
      const name = document.createElement('span');
      const content = document.createElement('strong');
      name.textContent = label(key);
      content.textContent = typeof value === 'object' ? JSON.stringify(value) : String(value);
      row.append(name, content);
      grid.appendChild(row);
    });
    disclosure.append(summary, grid);
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
    await sb.auth.signOut();
    state.data = null;
    showLogin();
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
    $('logout-button').addEventListener('click', logout);
    $('mobile-logout').addEventListener('click', logout);
    $('retry-button').addEventListener('click', loadPortal);
    $('copy-affiliate').addEventListener('click', async () => {
      const code = $('affiliate-code').textContent;
      try { await navigator.clipboard.writeText(code); $('copy-status').textContent = 'Code copied.'; }
      catch { $('copy-status').textContent = 'Select and copy the code above.'; }
    });
    const { data } = await sb.auth.getSession();
    if (data?.session) await loadPortal(); else showLogin();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.BKCustomerPortal = { safeImage, status };
})();

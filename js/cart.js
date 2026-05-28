/**
 * BrightKey - cart.js
 * Handles local storage cart management, cart page rendering, and flyout cart drawer UI.
 */

'use strict';

function getCart() {
  const cart = localStorage.getItem('bk_cart');
  return cart ? JSON.parse(cart) : [];
}

function saveCart(cart) {
  localStorage.setItem('bk_cart', JSON.stringify(cart));
  updateCartBadge();
  renderCartDrawer();
  renderCart();
}

function addToCart(product) {
  // product = { id, title, slug, price, image, quantity }
  const cart = getCart();
  const existing = cart.find(item => item.id === product.id);

  if (existing) {
    existing.quantity += product.quantity;
  } else {
    cart.push(product);
  }

  saveCart(cart);
  openCartDrawer();
  checkFreeGiftsForItem(product.id, product.sku); // async: adds any matching free gift
}

function removeFromCart(productId) {
  const cart = getCart();
  const filtered = cart.filter(item => item.id !== productId && item.triggerId !== productId);
  saveCart(filtered);
}

function updateQuantity(productId, newQuantity) {
  const cart = getCart();
  const item = cart.find(i => i.id === productId);
  if (item) {
    item.quantity = Math.max(1, newQuantity);
    saveCart(cart);
  }
}

function clearCart() {
  localStorage.removeItem('bk_cart');
  updateCartBadge();
  renderCartDrawer();
  renderCart();
}

function getCartTotal() {
  const cart = getCart();
  return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
}

function updateCartBadge() {
  const cart = getCart();
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const badge = document.getElementById('cart-count');
  if (badge) {
    badge.innerText = totalItems;
    badge.style.display = totalItems > 0 ? 'flex' : 'none';
  }
}

// ── Main Cart Page UI Rendering ──────────────────────────────────────────────

function renderCart() {
  const emptyDiv = document.getElementById('empty-cart');
  const contentDiv = document.getElementById('cart-content');
  if (!emptyDiv || !contentDiv) return; // Not on the main cart page

  const cart = getCart();
  
  if (cart.length === 0) {
    emptyDiv.style.display = 'block';
    contentDiv.style.display = 'none';
    return;
  }

  emptyDiv.style.display = 'none';
  contentDiv.style.display = 'block';

  const itemsContainer = document.getElementById('cart-items');
  if (!itemsContainer) return;
  itemsContainer.innerHTML = '';

  const isProductsPage = window.location.pathname.includes('/products/');
  const pathPrefix = isProductsPage ? '../' : '';

  cart.forEach(item => {
    const itemTotal = (item.price * item.quantity) / 100;
    const priceStr = item.isFreeGift
      ? `<span style="color:var(--cyan);font-weight:600;font-size:0.9rem;">Free</span>`
      : `<span>₱${(item.price/100).toLocaleString('en-PH', {minimumFractionDigits:2})}</span>`;
    const totalStr = item.isFreeGift
      ? `<span style="color:var(--cyan);font-weight:600;font-size:1.1rem;">Free</span>`
      : `<p style="font-weight:600; font-size:1.1rem;">₱${itemTotal.toLocaleString('en-PH', {minimumFractionDigits:2})}</p>`;
    const qtyBlock = item.isFreeGift
      ? `<span style="font-size:0.85rem;color:var(--text-muted);padding:0 0.5rem;">Free gift</span>`
      : `<div style="display:flex; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow:hidden; height:40px;">
           <button onclick="changeQty('${item.id}', -1)" style="padding: 0 0.75rem; background: var(--bg-surface); border:none; cursor:pointer; color:var(--text-primary); font-size:1.1rem;">-</button>
           <input type="number" value="${item.quantity}" readonly style="width: 40px; border:none; border-left:1px solid var(--border); border-right:1px solid var(--border); text-align:center; font-family:inherit; font-size:0.95rem; background:transparent; color:var(--text-primary);" />
           <button onclick="changeQty('${item.id}', 1)" style="padding: 0 0.75rem; background: var(--bg-surface); border:none; cursor:pointer; color:var(--text-primary); font-size:1.1rem;">+</button>
         </div>`;

    itemsContainer.innerHTML += `
      <div style="display:flex; padding: 1.5rem; border-bottom: 1px solid var(--border); gap: 1.5rem; align-items:center; flex-wrap:wrap;">
        <div style="width: 80px; height: 80px; border: 1px solid var(--border); border-radius: var(--radius-sm); padding:0.25rem; background:#fff; flex-shrink:0;">
          <img src="${item.image}" alt="${item.title}" style="width:100%; height:100%; object-fit:contain;" />
        </div>

        <div style="flex: 1; min-width:200px;">
          <a href="${pathPrefix}products/${item.slug}" style="font-weight:600; font-size:1.1rem; color:var(--text-primary); text-decoration:none;">${item.title}</a>
          <p style="color:var(--text-secondary); margin-top:0.25rem; font-size:0.9rem;">${priceStr}</p>
        </div>

        ${qtyBlock}

        <div style="min-width: 100px; text-align:right;">
          ${totalStr}
        </div>

        <button onclick="removeItem('${item.id}')" style="background:transparent; border:none; color:var(--text-secondary); cursor:pointer; padding:0.5rem;" title="Remove Item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      </div>
    `;
  });

  const subtotal = getCartTotal() / 100;
  const subtotalEl = document.getElementById('cart-drawer-subtotal');
  if (subtotalEl) {
    subtotalEl.innerText = `₱${subtotal.toLocaleString('en-PH', {minimumFractionDigits:2})}`;
  }

  applyActiveCouponIfExists();
  renderCrossSellRecommendations();
}

window.changeQty = (id, delta) => {
  const cart = getCart();
  const item = cart.find(i => i.id === id);
  if (item) {
    const newQty = item.quantity + delta;
    if (newQty > 0) {
      updateQuantity(id, newQty);
    } else {
      removeFromCart(id);
    }
  }
};

window.removeItem = (id) => {
  removeFromCart(id);
};

window.renderCart = renderCart;

// ── Cart Drawer UI Injection & Management ─────────────────────────────────────

let drawerOverlay = null;

function isCartOrCheckoutPage() {
  const path = window.location.pathname;
  return /\/(cart|checkout)(\.html)?$/.test(path);
}

function injectCartDrawer() {
  if (isCartOrCheckoutPage()) return;
  if (document.getElementById('cart-drawer-overlay')) return;

  const isProductsPage = window.location.pathname.includes('/products/');
  const pathPrefix = isProductsPage ? '../' : '';

  drawerOverlay = document.createElement('div');
  drawerOverlay.id = 'cart-drawer-overlay';
  drawerOverlay.className = 'cart-drawer-overlay';
  drawerOverlay.innerHTML = `
    <div class="cart-drawer" role="dialog" aria-modal="true" aria-label="Shopping Cart Drawer">
      <div class="cart-drawer__header">
        <h3 class="cart-drawer__title">Shopping Cart</h3>
        <button class="cart-drawer__close" aria-label="Close cart" onclick="closeCartDrawer()">&times;</button>
      </div>
      <!-- Free Shipping Progress Bar -->
      <div id="fs-bar-wrap" style="display:none; padding: 0.75rem 1.25rem; border-bottom: 1px solid var(--border);">
        <p id="fs-bar-msg" style="font-size:0.8rem; color:var(--cyan); font-weight:600; text-align:center; margin:0 0 0.45rem;"></p>
        <div style="background:var(--border); border-radius:999px; height:6px; overflow:hidden;">
          <div id="fs-bar-fill" style="height:100%; width:0%; background:var(--cyan); border-radius:999px; transition:width 0.4s ease;"></div>
        </div>
      </div>
      <div class="cart-drawer__body" id="cart-drawer-items">
        <!-- Rendered items go here -->
      </div>
      <div class="cart-drawer__footer">
        <!-- Recommended Add-ons -->
        <div id="cart-drawer-cross-sell" style="margin-bottom: 0.8rem; display: none;"></div>
        <!-- Coupon Code Form -->
        <div style="padding: 0.4rem 0 0.8rem; margin-bottom: 0.8rem;">
          <div style="display:flex; gap:0.5rem;">
            <input type="text" id="coupon-input" placeholder="Discount code" style="flex:1; padding:0.45rem 0.75rem; font-size:0.85rem; border:1px solid var(--border); border-radius:var(--radius-sm); background:transparent; color:var(--text-primary);" />
            <button class="btn btn-cyan btn-sm" id="btn-apply-coupon" onclick="applyCartCoupon(event)" style="padding:0.45rem 1rem; font-size:0.85rem; border-radius:var(--radius-sm);">Apply</button>
          </div>
          <div id="coupon-status" style="font-size:0.75rem; margin-top:0.4rem; display:none; font-weight:600;"></div>
        </div>

        <div class="cart-drawer__summary" style="font-size:0.95rem;">
          <span class="cart-drawer__subtotal-label">Subtotal</span>
          <span class="cart-drawer__subtotal-val" id="cart-drawer-subtotal" style="font-size:0.95rem;">₱0.00</span>
        </div>

        <div class="cart-drawer__summary" id="cart-drawer-discount-row" style="display:none; margin-top:0.5rem; align-items:flex-start; font-size:0.95rem;">
          <span class="cart-drawer__subtotal-label" id="cart-drawer-discount-label" style="display:flex; flex-direction:column; line-height:1.2;">
            <span>Order discount</span>
          </span>
          <span class="cart-drawer__subtotal-val" id="cart-drawer-discount-val" style="font-weight:normal; color:var(--text-primary); font-size:0.95rem;">-₱0.00</span>
        </div>

        <div class="cart-drawer__summary" style="margin-top:0.35rem; font-size:0.95rem;">
          <span class="cart-drawer__subtotal-label" style="font-weight:normal;">Shipping</span>
          <span class="cart-drawer__subtotal-val" style="font-weight:normal; color:var(--text-secondary); font-size:0.95rem;">Calculated at next step</span>
        </div>

        <div class="cart-drawer__summary" id="cart-drawer-total-row" style="display:none; margin-top:0.5rem; border-top:1px solid var(--border); padding-top:0.5rem; font-size:0.95rem;">
          <span class="cart-drawer__subtotal-label" style="font-weight:700; color:var(--text-primary);">Total</span>
          <span class="cart-drawer__subtotal-val" id="cart-drawer-total-val" style="font-size:0.95rem; font-weight:700;">₱0.00</span>
        </div>

        <div id="cart-drawer-savings-row" style="display:none; align-items:center; gap:0.35rem; color:var(--text-primary); font-size:0.8rem; font-weight:700; margin-top:0.05rem; margin-bottom:0.75rem; text-transform:uppercase;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
          <span>TOTAL SAVINGS <span id="cart-drawer-savings-val">₱0.00</span></span>
        </div>
        <div class="cart-drawer__actions">
          <a href="javascript:void(0)" onclick="handleCheckoutClick(event)" class="btn btn-cyan btn-lg text-center" style="width:100%;">Proceed to Checkout</a>
          <a href="${pathPrefix}cart.html" class="btn btn-outline text-center" style="width:100%;">View Full Cart</a>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(drawerOverlay);

  // Close on backdrop click
  drawerOverlay.addEventListener('click', (e) => {
    if (e.target === drawerOverlay) {
      closeCartDrawer();
    }
  });

  // Close on ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCartDrawer();
    }
  });

  renderCartDrawer();
}

function openCartDrawer(e) {
  if (e) e.preventDefault();
  
  if (isCartOrCheckoutPage()) {
    if (e) window.location.href = e.currentTarget.href;
    return;
  }

  if (!drawerOverlay) {
    injectCartDrawer();
  }
  
  renderCartDrawer();
  document.getElementById('cart-drawer-overlay').classList.add('open');
  document.body.style.overflow = 'hidden'; // Prevent page scrolling
}

function closeCartDrawer() {
  const drawer = document.getElementById('cart-drawer-overlay');
  if (drawer) {
    drawer.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function renderCartDrawer() {
  const itemsContainer = document.getElementById('cart-drawer-items');
  const subtotalVal = document.getElementById('cart-drawer-subtotal');
  
  if (!itemsContainer) return;

  const cart = getCart();
  const isProductsPage = window.location.pathname.includes('/products/');
  const pathPrefix = isProductsPage ? '../' : '';

  if (cart.length === 0) {
    itemsContainer.innerHTML = `
      <div class="cart-drawer__empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted);"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
        <p>Your cart is empty.</p>
        <a href="${pathPrefix}products.html" class="btn btn-cyan btn-sm" onclick="closeCartDrawer()">Browse Products</a>
      </div>
    `;
    subtotalVal.innerText = '₱0.00';
    
    // Hide drawer action buttons if empty
    const footer = document.querySelector('.cart-drawer__footer');
    if (footer) {
      footer.style.display = 'none';
    }
    updateFreeShippingBar();
    return;
  }

  // Show footer if cart is not empty
  const footer = document.querySelector('.cart-drawer__footer');
  if (footer) {
    footer.style.display = 'block';
  }

  let html = '';
  cart.forEach(item => {
    const itemPrice = item.price / 100;
    const priceDisplay = item.isFreeGift
      ? `<span style="color:var(--cyan);font-weight:600;font-size:0.85rem;">Free</span>`
      : `<p class="cart-drawer__item-price">₱${itemPrice.toLocaleString('en-PH', {minimumFractionDigits:2})}</p>`;
    const qtyDisplay = item.isFreeGift
      ? `<span style="font-size:0.75rem;color:var(--text-muted);">Free gift</span>`
      : `<div class="cart-drawer__item-qty">
           <button class="cart-drawer__item-qty-btn" onclick="changeDrawerQty('${item.id}', -1)">-</button>
           <input class="cart-drawer__item-qty-input" type="number" value="${item.quantity}" readonly />
           <button class="cart-drawer__item-qty-btn" onclick="changeDrawerQty('${item.id}', 1)">+</button>
         </div>`;
    html += `
      <div class="cart-drawer__item">
        <img class="cart-drawer__item-img" src="${item.image}" alt="${item.title}" />
        <div class="cart-drawer__item-info">
          <a class="cart-drawer__item-title" href="${pathPrefix}products/${item.slug}">${item.title}</a>
          ${priceDisplay}
          ${qtyDisplay}
        </div>
        <button class="cart-drawer__item-remove" onclick="removeDrawerItem('${item.id}')" title="Remove item">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;
  });

  itemsContainer.innerHTML = html;

  const subtotal = getCartTotal() / 100;
  subtotalVal.innerText = `₱${subtotal.toLocaleString('en-PH', {minimumFractionDigits:2})}`;

  updateFreeShippingBar();
  applyActiveCouponIfExists();
  renderCrossSellRecommendations();
}

window.changeDrawerQty = (id, delta) => {
  const cart = getCart();
  const item = cart.find(i => i.id === id);
  if (item) {
    const newQty = item.quantity + delta;
    if (newQty > 0) {
      updateQuantity(id, newQty);
    } else {
      removeFromCart(id);
    }
  }
  updateFreeShippingBar();
};

window.removeDrawerItem = (id) => {
  removeFromCart(id);
  updateFreeShippingBar();
};

window.closeCartDrawer = closeCartDrawer;
window.openCartDrawer = openCartDrawer;

// Wire up navbar cart toggle button globally
function setupCartToggleListener() {
  if (isCartOrCheckoutPage()) return;
  const cartBtn = document.querySelector('a[aria-label="Cart"], a[href$="cart.html"], .cart-toggle-btn');
  if (cartBtn) {
    const newBtn = cartBtn.cloneNode(true);
    cartBtn.parentNode.replaceChild(newBtn, cartBtn);
    newBtn.addEventListener('click', openCartDrawer);
  }
}

// Initialise on load
document.addEventListener('DOMContentLoaded', () => {
  updateCartBadge();
  injectCartDrawer();
  setupCartToggleListener();
  renderCart();
  
  // Re-run listener setup to catch any late injected buttons
  setTimeout(setupCartToggleListener, 500);
});

// ── Free Shipping Progress Bar ────────────────────────────────────────────────

let _freeShippingConfig = undefined;

async function getFreeShippingConfig() {
  if (_freeShippingConfig !== undefined) return _freeShippingConfig;
  try {
    await ensureSupabase();
    const sb = getSupabaseClient();
    if (!sb) { _freeShippingConfig = null; return null; }
    const { data } = await sb.from('global_settings').select('value').eq('key', 'free_shipping').single();
    _freeShippingConfig = data?.value || null;
  } catch { _freeShippingConfig = null; }
  return _freeShippingConfig;
}

async function triggerConfetti(element) {
  if (!element) return;
  try {
    if (!window.confetti) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Confetti load failed'));
        document.head.appendChild(script);
      });
    }
    if (window.confetti) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return; // Only trigger if visible on screen
      const x = (rect.left + rect.width / 2) / window.innerWidth;
      const y = (rect.top + rect.height / 2) / window.innerHeight;
      
      window.confetti({
        particleCount: 50,
        spread: 45,
        origin: { x, y },
        colors: ['#06b6d4', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'],
        zIndex: 99999
      });
    }
  } catch (err) {
    console.error('Failed to trigger confetti:', err);
  }
}

async function updateFreeShippingBar() {
  const wrap = document.getElementById('fs-bar-wrap');
  const msg  = document.getElementById('fs-bar-msg');
  const fill = document.getElementById('fs-bar-fill');
  if (!wrap) return;

  // Read cart state synchronously before any await to avoid stale reads
  const cart          = getCart();
  const subtotalCents = getCartTotal();
  const businesses    = [...new Set(cart.map(i => i.business).filter(Boolean))];

  const config = await getFreeShippingConfig();
  if (!config) { wrap.style.display = 'none'; return; }

  let threshold = null;

  // Business-specific override takes precedence
  for (const biz of businesses) {
    const bizCfg = (config.businesses || []).find(b => b.name === biz && b.enabled && b.threshold > 0);
    if (bizCfg) { threshold = bizCfg.threshold; break; }
  }

  // Fall back to storewide
  if (threshold === null && config.storewide_enabled && config.threshold > 0) {
    threshold = config.threshold;
  }

  if (!threshold) { wrap.style.display = 'none'; return; }

  // threshold is stored in cents (same convention as product prices)
  const remaining = Math.max(0, (threshold - subtotalCents) / 100);
  const pct       = Math.min(100, (subtotalCents / threshold) * 100);

  wrap.style.display = 'block';
  fill.style.width   = `${pct}%`;

  if (remaining <= 0) {
    const wasEligibleBefore = msg.textContent === `You are eligible for free shipping!`;
    msg.textContent = `You are eligible for free shipping!`;
    
    // Trigger confetti if newly eligible and not yet triggered in this session
    if (!wasEligibleBefore && !sessionStorage.getItem('bk_fs_confetti_triggered')) {
      sessionStorage.setItem('bk_fs_confetti_triggered', 'true');
      // Delay slightly to ensure transition is complete and drawer layout has settled
      setTimeout(() => triggerConfetti(msg), 300);
    }
  } else {
    const fmt = remaining.toLocaleString('en-PH', { minimumFractionDigits: 2 });
    msg.textContent = `Add ₱${fmt} more to get free shipping!`;
  }
}

// ── Free Gift Logic ───────────────────────────────────────────────────────────

let _freeGiftsConfig = undefined;

async function getFreeGiftsConfig() {
  if (_freeGiftsConfig !== undefined) return _freeGiftsConfig;
  try {
    await ensureSupabase();
    const sb = getSupabaseClient();
    if (!sb) { _freeGiftsConfig = null; return null; }
    const { data } = await sb.from('global_settings').select('value').eq('key', 'free_gifts').single();
    _freeGiftsConfig = data?.value || null;
  } catch { _freeGiftsConfig = null; }
  return _freeGiftsConfig;
}

async function checkFreeGiftsForItem(cartItemId, sku) {
  const rules = await getFreeGiftsConfig();
  if (!rules || !rules.length) return;
  const cart = getCart();
  let changed = false;
  for (const rule of rules) {
    if (!rule.enabled || rule.trigger_sku !== sku) continue;
    const giftCartId = `free-gift-${rule.gift_sku}`;
    if (cart.find(i => i.id === giftCartId)) continue;
    cart.push({
      id: giftCartId,
      title: rule.gift_title,
      slug: rule.gift_slug,
      price: 0,
      image: rule.gift_image,
      quantity: 1,
      isFreeGift: true,
      triggerId: cartItemId
    });
    changed = true;
  }
  if (changed) saveCart(cart);
}

// ── Coupon Verification & Applicability Logic ─────────────────────────────────

async function ensureSupabase() {
  if (window.supabase) return window.supabase;
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    script.onload = () => resolve(window.supabase);
    document.head.appendChild(script);
  });
}

function getSupabaseClient() {
  const SUPABASE_URL = 'https://ymjlosnxuhsybkzkoofq.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltamxvc254dWhzeWJremtvb2ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY1MzYsImV4cCI6MjA4OTk4MjUzNn0.srhk9SVvFuZRcfeRGbVDGPr5pYrFhs8vzcOiMK3A91w';
  if (window.supabaseClient) return window.supabaseClient;
  if (window.supabase) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    return window.supabaseClient;
  }
  return null;
}

window.applyCartCoupon = async (e) => {
  if (e) e.preventDefault();
  const input = document.getElementById('coupon-input');
  const status = document.getElementById('coupon-status');
  if (!input || !status) return;

  const code = input.value.trim().toUpperCase();
  if (!code) {
    status.style.display = 'block';
    status.style.color = 'var(--danger, #ef4444)';
    status.innerText = 'Please enter a coupon code.';
    return;
  }

  status.style.display = 'block';
  status.style.color = 'var(--text-secondary)';
  status.innerText = 'Applying...';

  localStorage.setItem('bk_applied_coupon', code);
  await applyActiveCouponIfExists();
};

window.removeCartCoupon = () => {
  localStorage.removeItem('bk_applied_coupon');
  const input = document.getElementById('coupon-input');
  if (input) input.value = '';
  const status = document.getElementById('coupon-status');
  if (status) {
    status.style.display = 'none';
    status.innerText = '';
  }
  const discRow = document.getElementById('cart-drawer-discount-row');
  if (discRow) discRow.style.display = 'none';
  const totalRow = document.getElementById('cart-drawer-total-row');
  if (totalRow) totalRow.style.display = 'none';
  const savingsRow = document.getElementById('cart-drawer-savings-row');
  if (savingsRow) savingsRow.style.display = 'none';
  
  renderCartDrawer();
};

async function applyActiveCouponIfExists() {
  const code = localStorage.getItem('bk_applied_coupon');
  const status = document.getElementById('coupon-status');
  const discRow = document.getElementById('cart-drawer-discount-row');
  const discLabel = document.getElementById('cart-drawer-discount-label');
  const discVal = document.getElementById('cart-drawer-discount-val');
  const totalRow = document.getElementById('cart-drawer-total-row');
  const totalVal = document.getElementById('cart-drawer-total-val');
  const input = document.getElementById('coupon-input');

  if (!code) {
    if (discRow) discRow.style.display = 'none';
    if (totalRow) totalRow.style.display = 'none';
    return;
  }



  try {
    await ensureSupabase();
    const sb = getSupabaseClient();
    if (!sb) {
      if (status) {
        status.style.display = 'block';
        status.style.color = 'var(--danger, #ef4444)';
        status.innerText = 'The promo code is invalid.';
      }
      return;
    }

    // Fetch coupon details
    const { data: coupon, error } = await sb
      .from('coupons')
      .select('*')
      .eq('code', code)
      .single();

    if (error || !coupon) {
      localStorage.removeItem('bk_applied_coupon');
      if (status) {
        status.style.display = 'block';
        status.style.color = 'var(--danger, #ef4444)';
        status.innerText = 'The promo code is invalid.';
      }
      if (discRow) discRow.style.display = 'none';
      if (totalRow) totalRow.style.display = 'none';
      return;
    }

    // Validate validity dates
    const now = Date.now();
    if (coupon.start_date && new Date(coupon.start_date).getTime() > now) {
      localStorage.removeItem('bk_applied_coupon');
      if (status) {
        status.style.display = 'block';
        status.style.color = 'var(--danger, #ef4444)';
        status.innerText = 'The promo code is invalid.';
      }
      return;
    }
    if (coupon.end_date && new Date(coupon.end_date).getTime() < now) {
      localStorage.removeItem('bk_applied_coupon');
      if (status) {
        status.style.display = 'block';
        status.style.color = 'var(--danger, #ef4444)';
        status.innerText = 'The promo code is invalid.';
      }
      return;
    }

    // Load Cart Items and fetch database info for scope check
    const cart = getCart();
    if (cart.length === 0) return;

    const uuids = [];
    const rawSkus = [];
    
    cart.forEach(item => {
      if (!item.id) return;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      const match = item.id.match(uuidRegex);
      if (match) {
        uuids.push(match[0]);
        const suffix = item.id.substring(match[0].length + 1);
        if (suffix) {
          rawSkus.push(suffix);
        }
      } else {
        rawSkus.push(item.id);
      }
    });

    let dbProducts = [];
    let pErr = null;

    if (uuids.length > 0 && rawSkus.length > 0) {
      const { data, error } = await sb
        .from('products')
        .select('id, sku, business, category')
        .or(`id.in.(${uuids.map(id => `"${id}"`).join(',')}),sku.in.(${rawSkus.map(s => `"${s}"`).join(',')})`);
      dbProducts = data;
      pErr = error;
    } else if (uuids.length > 0) {
      const { data, error } = await sb
        .from('products')
        .select('id, sku, business, category')
        .in('id', uuids);
      dbProducts = data;
      pErr = error;
    } else if (rawSkus.length > 0) {
      const { data, error } = await sb
        .from('products')
        .select('id, sku, business, category')
        .in('sku', rawSkus);
      dbProducts = data;
      pErr = error;
    }

    if (pErr || !dbProducts) {
      if (status) {
        status.style.display = 'block';
        status.style.color = 'var(--danger, #ef4444)';
        status.innerText = 'The promo code is invalid.';
      }
      return;
    }

    const dbProductMap = {};
    dbProducts.forEach(p => { 
      if (p.id) dbProductMap[p.id.toUpperCase()] = p;
      if (p.sku) dbProductMap[p.sku.toUpperCase()] = p; 
      if (p.id && p.sku) dbProductMap[`${p.id.toUpperCase()}-${p.sku.toUpperCase()}`] = p;
    });

    // Validate applicability & calculate discounts
    let totalEligibleSubtotal = 0;
    
    // Normalized arrays from database
    const appBiz = (coupon.applicable_businesses || []).map(b => b.trim().toLowerCase());
    const appCat = (coupon.applicable_categories || []).map(c => c.trim().toLowerCase());
    const appSkus = (coupon.applicable_skus || []).map(s => s.trim().toUpperCase());

    const isCouponTargeted = appBiz.length > 0 || appCat.length > 0 || appSkus.length > 0;

    cart.forEach(item => {
      const itemSkuUpper = item.id ? item.id.toUpperCase() : '';
      const dbProd = dbProductMap[itemSkuUpper];

      let eligible = false;
      if (!isCouponTargeted) {
        eligible = true; // Storewide (applies to all items)
      } else if (dbProd) {
        // Business match
        if (dbProd.business && appBiz.includes(dbProd.business.toLowerCase())) {
          eligible = true;
        }
        // Category match
        if (dbProd.category && appCat.includes(dbProd.category.toLowerCase())) {
          eligible = true;
        }
        // SKU match
        if (appSkus.includes(itemSkuUpper)) {
          eligible = true;
        }
      } else {
        // Targeted coupon but item not found in DB - check if SKU matches directly
        if (appSkus.includes(itemSkuUpper)) {
          eligible = true;
        }
      }

      if (eligible) {
        totalEligibleSubtotal += (item.price * item.quantity);
      }
    });

    if (totalEligibleSubtotal === 0) {
      if (status) {
        status.style.display = 'block';
        status.style.color = 'var(--danger, #ef4444)';
        status.innerText = 'The promo code is invalid.';
      }
      if (discRow) discRow.style.display = 'none';
      if (totalRow) totalRow.style.display = 'none';
      return;
    }

    // Calculate discount amount in centavos
    let discountCentavos = 0;
    const discountValNum = parseFloat(coupon.discount_value);

    if (coupon.discount_type === 'percentage') {
      discountCentavos = Math.round(totalEligibleSubtotal * (discountValNum / 100));
    } else {
      // Fixed discount is converted to centavos (assumed value stored in pesos)
      discountCentavos = Math.round(discountValNum * 100);
    }

    // Caps discount at eligible subtotal
    discountCentavos = Math.min(discountCentavos, totalEligibleSubtotal);

    const subtotalCentavos = getCartTotal();
    const finalTotalCentavos = Math.max(0, subtotalCentavos - discountCentavos);

    // Format & Render Display (Pill formatting matching mockup)
    if (status) {
      status.style.display = 'block';
      status.style.color = 'var(--text-primary)';
      status.innerHTML = `
        <div style="background:var(--bg-base, rgba(120, 120, 120, 0.1)); border:1px solid var(--border); border-radius:4px; padding:0.25rem 0.5rem; display:inline-flex; align-items:center; gap:0.35rem; font-size:0.8rem; font-weight:600; color:var(--text-primary); text-transform:uppercase; margin-top:0.4rem;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.7;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
          <span>${code}</span>
          <button onclick="removeCartCoupon();" style="background:none; border:none; padding:0; cursor:pointer; font-size:14px; font-weight:bold; color:var(--text-secondary); display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; margin-left:0.2rem;" aria-label="Remove coupon">&times;</button>
        </div>
      `;
    }

    if (input) {
      input.value = '';
    }

    if (discRow && discLabel && discVal) {
      discLabel.innerHTML = `
        <span>Order discount</span>
        <span style="font-size:0.75rem; color:var(--text-secondary); font-weight:normal; display:flex; align-items:center; gap:0.25rem; margin-top:0.15rem; text-transform:uppercase;">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
          <span>${code}</span>
        </span>
      `;
      discVal.innerText = `-₱${(discountCentavos / 100).toLocaleString('en-PH', {minimumFractionDigits: 2})}`;
      discRow.style.display = 'flex';
    }

    if (totalRow && totalVal) {
      totalVal.innerText = `₱${(finalTotalCentavos / 100).toLocaleString('en-PH', {minimumFractionDigits: 2})}`;
      totalRow.style.display = 'flex';
    }

    const savingsRow = document.getElementById('cart-drawer-savings-row');
    const savingsVal = document.getElementById('cart-drawer-savings-val');
    if (savingsRow && savingsVal) {
      savingsVal.innerText = `₱${(discountCentavos / 100).toLocaleString('en-PH', {minimumFractionDigits: 2})}`;
      savingsRow.style.display = 'flex';
    }

  } catch (err) {
    console.error(err);
    if (status) {
      status.style.display = 'block';
      status.style.color = 'var(--danger, #ef4444)';
      status.innerText = 'An error occurred during verification.';
    }
  }
}

// ── Upsell & Cross-sell Settings & Functions ───────────────────────────────

let _upsellCrossSellConfig = undefined;

async function getUpsellCrossSellConfig() {
  if (_upsellCrossSellConfig !== undefined) return _upsellCrossSellConfig;
  try {
    await ensureSupabase();
    const sb = getSupabaseClient();
    if (!sb) { _upsellCrossSellConfig = null; return null; }
    const { data } = await sb.from('global_settings').select('value').eq('key', 'upsell_cross_sell').single();
    _upsellCrossSellConfig = data?.value || null;
  } catch (err) {
    console.error('getUpsellCrossSellConfig error:', err);
    _upsellCrossSellConfig = null;
  }
  return _upsellCrossSellConfig;
}

function isRuleActive(rule) {
  if (!rule || !rule.enabled) return false;
  if (rule.indefinite) return true;
  const now = Date.now();
  if (rule.active_from && new Date(rule.active_from).getTime() > now) return false;
  if (rule.active_to && new Date(rule.active_to).getTime() < now) return false;
  return true;
}

async function getCartProductDetails() {
  const cart = getCart();
  if (cart.length === 0) return [];
  const uuids = [];
  const rawSkus = [];
  cart.forEach(item => {
    if (!item.id) return;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const match = item.id.match(uuidRegex);
    if (match) {
      uuids.push(match[0]);
      const suffix = item.id.substring(match[0].length + 1);
      if (suffix) {
        rawSkus.push(suffix);
      }
    } else {
      rawSkus.push(item.id);
    }
  });

  try {
    await ensureSupabase();
    const sb = getSupabaseClient();
    if (!sb) return [];
    
    let dbProducts = [];
    if (uuids.length > 0 && rawSkus.length > 0) {
      const { data } = await sb
        .from('products')
        .select('id, sku, title, slug, image_main, sale_price, price')
        .or(`id.in.(${uuids.map(id => `"${id}"`).join(',')}),sku.in.(${rawSkus.map(s => `"${s}"`).join(',')})`);
      dbProducts = data || [];
    } else if (uuids.length > 0) {
      const { data } = await sb
        .from('products')
        .select('id, sku, title, slug, image_main, sale_price, price')
        .in('id', uuids);
      dbProducts = data || [];
    } else if (rawSkus.length > 0) {
      const { data } = await sb
        .from('products')
        .select('id, sku, title, slug, image_main, sale_price, price')
        .in('sku', rawSkus);
      dbProducts = data || [];
    }
    return dbProducts;
  } catch (err) {
    console.error('Error fetching cart product details:', err);
    return [];
  }
}

async function renderCrossSellRecommendations() {
  const drawerContainer = document.getElementById('cart-drawer-cross-sell');
  const mainContainer = document.getElementById('cross-sell-container');
  
  if (!drawerContainer && !mainContainer) return;

  try {
    const cart = getCart();
    if (cart.length === 0) {
      if (drawerContainer) drawerContainer.style.display = 'none';
      if (mainContainer) mainContainer.style.display = 'none';
      return;
    }

    const dbProducts = await getCartProductDetails();
    const dbProductMap = {};
    dbProducts.forEach(p => {
      if (p.id) dbProductMap[p.id.toUpperCase()] = p;
      if (p.sku) dbProductMap[p.sku.toUpperCase()] = p;
    });

    const cartSkus = new Set();
    cart.forEach(item => {
      if (!item.id) return;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      const match = item.id.match(uuidRegex);
      
      if (match) {
        const uuidPart = match[0].toUpperCase();
        const suffixPart = item.id.substring(match[0].length + 1).toUpperCase();
        const dbProd = dbProductMap[uuidPart];
        if (dbProd && dbProd.sku) {
          cartSkus.add(dbProd.sku.toUpperCase());
        }
        if (suffixPart) {
          cartSkus.add(suffixPart);
        }
      } else {
        const skuUpper = item.id.toUpperCase();
        cartSkus.add(skuUpper);
        const dbProd = dbProductMap[skuUpper];
        if (dbProd && dbProd.sku) {
          cartSkus.add(dbProd.sku.toUpperCase());
        }
      }
    });

    const config = await getUpsellCrossSellConfig();
    if (!config || !config.crosssell_rules || config.crosssell_rules.length === 0) {
      if (drawerContainer) drawerContainer.style.display = 'none';
      if (mainContainer) mainContainer.style.display = 'none';
      return;
    }

    const activeRules = config.crosssell_rules.filter(r => isRuleActive(r));
    const triggeredRules = activeRules.filter(r => cartSkus.has(r.trigger_sku.toUpperCase()));

    const recommendedSkus = [];
    triggeredRules.forEach(rule => {
      rule.addon_skus.forEach(sku => {
        const skuUpper = sku.toUpperCase();
        if (!cartSkus.has(skuUpper) && !recommendedSkus.includes(skuUpper)) {
          recommendedSkus.push(skuUpper);
        }
      });
    });

    if (recommendedSkus.length === 0) {
      if (drawerContainer) drawerContainer.style.display = 'none';
      if (mainContainer) mainContainer.style.display = 'none';
      return;
    }

    await ensureSupabase();
    const sb = getSupabaseClient();
    if (!sb) return;

    const { data: addOnProds } = await sb
      .from('products')
      .select('id, sku, title, slug, image_main, sale_price, price')
      .in('sku', recommendedSkus);

    if (!addOnProds || addOnProds.length === 0) {
      if (drawerContainer) drawerContainer.style.display = 'none';
      if (mainContainer) mainContainer.style.display = 'none';
      return;
    }

    // Render HTML
    const isProductsPage = window.location.pathname.includes('/products/');
    const pathPrefix = isProductsPage ? '../' : '';

    let html = `
      <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--text-secondary); margin-bottom:0.5rem; letter-spacing:0.05em; display:flex; align-items:center; gap:0.25rem;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        <span>Recommended Add-ons</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:0.5rem;">
    `;

    addOnProds.forEach(prod => {
      const price = (prod.sale_price || prod.price) / 100;
      const formattedPrice = `₱${price.toLocaleString('en-PH', {minimumFractionDigits:2})}`;
      const imgUrl = prod.image_main || 'assets/og-image.png';

      html += `
        <div style="display:flex; align-items:center; gap:0.75rem; background:rgba(120,120,120,0.05); border:1px solid var(--border); border-radius:var(--radius-sm); padding:0.5rem;">
          <img src="${imgUrl}" alt="${prod.title}" style="width:40px; height:40px; object-fit:contain; border-radius:3px; background:#fff; flex-shrink:0;" />
          <div style="flex:1; min-width:0;">
            <div style="font-size:0.8rem; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${prod.title}</div>
            <div style="font-size:0.8rem; color:var(--cyan); font-weight:600; margin-top:0.1rem;">${formattedPrice}</div>
          </div>
          <button class="btn btn-cyan btn-xs" onclick="addCrossSellItemToCart('${prod.sku}')" style="padding:0.25rem 0.5rem; font-size:0.75rem; border-radius:var(--radius-sm); font-weight:600;">Add</button>
        </div>
      `;
    });

    html += `</div>`;

    if (drawerContainer) {
      drawerContainer.innerHTML = html;
      drawerContainer.style.display = 'block';
    }
    if (mainContainer) {
      mainContainer.innerHTML = html;
      mainContainer.style.display = 'block';
    }

  } catch (err) {
    console.error('Error rendering cross-sell recommendations:', err);
  }
}

window.addCrossSellItemToCart = async (sku) => {
  try {
    await ensureSupabase();
    const sb = getSupabaseClient();
    if (!sb) return;
    const { data: prod } = await sb.from('products').select('*').eq('sku', sku).single();
    if (!prod) return;
    
    addToCart({
      id: prod.id,
      title: prod.title,
      slug: prod.slug,
      price: prod.sale_price || prod.price,
      image: prod.image_main || 'assets/og-image.png',
      quantity: 1,
      sku: prod.sku
    });
  } catch (err) {
    console.error('Error adding cross-sell item to cart:', err);
  }
};

window.handleCheckoutClick = async (event) => {
  console.log("Upsell check: handleCheckoutClick triggered.");
  if (event) event.preventDefault();
  
  const isProductsPage = window.location.pathname.includes('/products/');
  const pathPrefix = isProductsPage ? '../' : '';

  const cart = getCart();
  console.log("Upsell check: Cart content:", cart);
  if (cart.length === 0) {
    console.log("Upsell check: Cart is empty, redirecting to checkout.");
    window.location.href = pathPrefix + 'checkout.html';
    return;
  }

  try {
    const config = await getUpsellCrossSellConfig();
    console.log("Upsell check: Config loaded:", config);
    if (!config || !config.upsell_rules || config.upsell_rules.length === 0) {
      console.log("Upsell check: No upsell rules defined in config, redirecting to checkout.");
      window.location.href = pathPrefix + 'checkout.html';
      return;
    }

    const activeRules = config.upsell_rules.filter(r => isRuleActive(r));
    console.log("Upsell check: Active Rules:", activeRules);
    if (activeRules.length === 0) {
      console.log("Upsell check: No active upsell rules for current date/enabled state, redirecting to checkout.");
      window.location.href = pathPrefix + 'checkout.html';
      return;
    }

    const dbProducts = await getCartProductDetails();
    console.log("Upsell check: DB Products details fetched:", dbProducts);
    const dbProductMap = {};
    dbProducts.forEach(p => {
      if (p.id) dbProductMap[p.id.toUpperCase()] = p;
      if (p.sku) dbProductMap[p.sku.toUpperCase()] = p;
    });

    const cartSkus = new Set();
    cart.forEach(item => {
      if (!item.id) return;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      const match = item.id.match(uuidRegex);
      
      if (match) {
        const uuidPart = match[0].toUpperCase();
        const suffixPart = item.id.substring(match[0].length + 1).toUpperCase();
        const dbProd = dbProductMap[uuidPart];
        if (dbProd && dbProd.sku) {
          cartSkus.add(dbProd.sku.toUpperCase());
        }
        if (suffixPart) {
          cartSkus.add(suffixPart);
        }
      } else {
        const skuUpper = item.id.toUpperCase();
        cartSkus.add(skuUpper);
        const dbProd = dbProductMap[skuUpper];
        if (dbProd && dbProd.sku) {
          cartSkus.add(dbProd.sku.toUpperCase());
        }
      }
    });
    console.log("Upsell check: Cart SKUs Set:", Array.from(cartSkus));

    let matchedRule = null;
    for (const rule of activeRules) {
      const triggerUpper = rule.trigger_sku.toUpperCase();
      const upsellUpper = rule.upsell_sku.toUpperCase();
      console.log(`Upsell check: Checking rule: Trigger=${triggerUpper}, Upsell=${upsellUpper}`);
      if (cartSkus.has(triggerUpper) && !cartSkus.has(upsellUpper)) {
        matchedRule = rule;
        console.log("Upsell check: Rule matched!", rule);
        break;
      }
    }

    if (!matchedRule) {
      console.log("Upsell check: No active rules match the SKUs in cart, redirecting to checkout.");
      window.location.href = pathPrefix + 'checkout.html';
      return;
    }

    await ensureSupabase();
    const sb = getSupabaseClient();
    if (!sb) {
      console.log("Upsell check: Supabase client not available, redirecting to checkout.");
      window.location.href = pathPrefix + 'checkout.html';
      return;
    }

    const { data: products } = await sb
      .from('products')
      .select('id, sku, title, slug, image_main, sale_price, price')
      .in('sku', [matchedRule.trigger_sku, matchedRule.upsell_sku]);
    console.log("Upsell check: Trigger/Upsell products query result:", products);

    if (!products || products.length === 0) {
      console.log("Upsell check: Could not fetch product details from DB for trigger/upsell SKU, redirecting to checkout.");
      window.location.href = pathPrefix + 'checkout.html';
      return;
    }

    const triggerProd = products.find(p => p.sku.toUpperCase() === matchedRule.trigger_sku.toUpperCase());
    const upsellProd = products.find(p => p.sku.toUpperCase() === matchedRule.upsell_sku.toUpperCase());
    console.log("Upsell check: Trigger product:", triggerProd, "Upsell product:", upsellProd);

    if (!triggerProd || !upsellProd) {
      console.log("Upsell check: Trigger or Upsell product details missing, redirecting to checkout.");
      window.location.href = pathPrefix + 'checkout.html';
      return;
    }

    console.log("Upsell check: Showing modal...");
    showUpsellUpgradeModal(matchedRule, triggerProd, upsellProd, pathPrefix);

  } catch (err) {
    console.error('Error in handleCheckoutClick:', err);
    window.location.href = pathPrefix + 'checkout.html';
  }
};

function showUpsellUpgradeModal(rule, prod1, prod2, pathPrefix) {
  const existing = document.getElementById('upsell-upgrade-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'upsell-upgrade-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999999;
    padding: 1.5rem;
  `;

  const prod1Price = (prod1.sale_price || prod1.price) / 100;
  const prod2PriceBase = (prod2.sale_price || prod2.price) / 100;
  const prod2PriceAdjusted = prod2PriceBase + (rule.price_adjustment / 100);

  const prod1Formatted = `₱${prod1Price.toLocaleString('en-PH', {minimumFractionDigits:2})}`;
  const prod2Formatted = `₱${prod2PriceAdjusted.toLocaleString('en-PH', {minimumFractionDigits:2})}`;
  const prod2Scratched = `₱${prod2PriceBase.toLocaleString('en-PH', {minimumFractionDigits:2})}`;

  const prod1Img = prod1.image_main || 'assets/og-image.png';
  const prod2Img = prod2.image_main || 'assets/og-image.png';

  modal.innerHTML = `
    <div style="background: var(--bg-surface, #1e1e1e); border: 1px solid var(--border); border-radius: var(--radius-lg, 8px); max-width: 500px; width: 100%; padding: 2rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); text-align: center; position: relative; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;">
      <h3 style="margin-top: 0; margin-bottom: 0.5rem; font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">Upgrade Available</h3>
      <p style="font-size: 0.95rem; color: var(--text-secondary); margin-bottom: 1.5rem;">${rule.body}</p>
      
      <!-- Compare Layout -->
      <div style="display: flex; align-items: center; justify-content: center; gap: 1.5rem; margin-bottom: 2rem;">
        <!-- Trigger Product -->
        <div style="flex: 1; min-width: 0;">
          <div style="width: 100px; height: 100px; margin: 0 auto 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.25rem; background: #fff;">
            <img src="${prod1Img}" alt="${prod1.title}" style="width: 100%; height: 100%; object-fit: contain;" />
          </div>
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${prod1.title}">${prod1.title}</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.2rem;">${prod1Formatted}</div>
        </div>

        <!-- Arrow -->
        <div style="font-size: 2rem; color: var(--cyan); line-height: 1;">&rarr;</div>

        <!-- Upgrade Product -->
        <div style="flex: 1; min-width: 0;">
          <div style="width: 100px; height: 100px; margin: 0 auto 0.75rem; border: 1px solid var(--cyan); border-radius: var(--radius-sm); padding: 0.25rem; background: #fff;">
            <img src="${prod2Img}" alt="${prod2.title}" style="width: 100%; height: 100%; object-fit: contain;" />
          </div>
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--cyan); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${prod2.title}">${prod2.title}</div>
          <div style="font-size: 0.85rem; margin-top: 0.2rem; display: flex; align-items: center; justify-content: center; gap: 0.4rem; flex-wrap: wrap;">
            <span style="text-decoration: line-through; color: var(--text-muted);">${prod2Scratched}</span>
            <span style="font-weight: 700; color: #10b981;">${prod2Formatted}</span>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1.5rem;">
        <button id="btn-upgrade-now" class="btn btn-cyan btn-lg" style="width: 100%; font-weight: 700;">Upgrade Now</button>
        <button id="btn-skip-upgrade" class="btn btn-outline btn-lg" style="width: 100%;">Skip to Checkout</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('btn-skip-upgrade').onclick = () => {
    modal.remove();
    window.location.href = pathPrefix + 'checkout.html';
  };

  document.getElementById('btn-upgrade-now').onclick = () => {
    try {
      upgradeCartItem(prod1.sku, prod2, rule.price_adjustment);
      modal.remove();
      window.location.href = pathPrefix + 'checkout.html';
    } catch (err) {
      console.error(err);
      window.location.href = pathPrefix + 'checkout.html';
    }
  };
}

function upgradeCartItem(triggerSku, targetProd, adjustmentCentavos) {
  const cart = getCart();
  
  let indexToReplace = -1;
  for (let i = 0; i < cart.length; i++) {
    const item = cart[i];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const match = item.id ? item.id.match(uuidRegex) : null;
    let itemSku = item.id;
    if (match) {
      const suffix = item.id.substring(match[0].length + 1);
      if (suffix) itemSku = suffix;
    }
    
    if (itemSku && itemSku.toUpperCase() === triggerSku.toUpperCase()) {
      indexToReplace = i;
      break;
    }
  }

  if (indexToReplace !== -1) {
    const originalItem = cart[indexToReplace];
    const originalQty = originalItem.quantity;
    
    const finalPrice = (targetProd.sale_price || targetProd.price) + adjustmentCentavos;
    
    const upgradedItem = {
      id: targetProd.id,
      title: targetProd.title,
      slug: targetProd.slug,
      price: finalPrice,
      image: targetProd.image_main || 'assets/og-image.png',
      quantity: originalQty,
      sku: targetProd.sku
    };

    cart[indexToReplace] = upgradedItem;

    checkFreeGiftsForItem(upgradedItem.id, upgradedItem.sku);
    saveCart(cart);
  }
}


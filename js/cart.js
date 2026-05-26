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
  
  // Automatically open the drawer
  openCartDrawer();
}

function removeFromCart(productId) {
  const cart = getCart();
  const filtered = cart.filter(item => item.id !== productId);
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
    
    itemsContainer.innerHTML += `
      <div style="display:flex; padding: 1.5rem; border-bottom: 1px solid var(--border); gap: 1.5rem; align-items:center; flex-wrap:wrap;">
        <div style="width: 80px; height: 80px; border: 1px solid var(--border); border-radius: var(--radius-sm); padding:0.25rem; background:#fff; flex-shrink:0;">
          <img src="${item.image}" alt="${item.title}" style="width:100%; height:100%; object-fit:contain;" />
        </div>
        
        <div style="flex: 1; min-width:200px;">
          <a href="${pathPrefix}products/${item.slug}" style="font-weight:600; font-size:1.1rem; color:var(--text-primary); text-decoration:none;">${item.title}</a>
          <p style="color:var(--text-secondary); margin-top:0.25rem; font-size:0.9rem;">₱${(item.price/100).toLocaleString('en-PH', {minimumFractionDigits:2})}</p>
        </div>
        
        <div style="display:flex; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow:hidden; height:40px;">
          <button onclick="changeQty('${item.id}', -1)" style="padding: 0 0.75rem; background: var(--bg-surface); border:none; cursor:pointer; color:var(--text-primary); font-size:1.1rem;">-</button>
          <input type="number" value="${item.quantity}" readonly style="width: 40px; border:none; border-left:1px solid var(--border); border-right:1px solid var(--border); text-align:center; font-family:inherit; font-size:0.95rem; background:transparent; color:var(--text-primary);" />
          <button onclick="changeQty('${item.id}', 1)" style="padding: 0 0.75rem; background: var(--bg-surface); border:none; cursor:pointer; color:var(--text-primary); font-size:1.1rem;">+</button>
        </div>
        
        <div style="min-width: 100px; text-align:right;">
          <p style="font-weight:600; font-size:1.1rem;">₱${itemTotal.toLocaleString('en-PH', {minimumFractionDigits:2})}</p>
        </div>
        
        <button onclick="removeItem('${item.id}')" style="background:transparent; border:none; color:var(--text-secondary); cursor:pointer; padding:0.5rem;" title="Remove Item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      </div>
    `;
  });

  const subtotal = getCartTotal() / 100;
  const subtotalEl = document.getElementById('cart-subtotal');
  if (subtotalEl) {
    subtotalEl.innerText = `₱${subtotal.toLocaleString('en-PH', {minimumFractionDigits:2})}`;
  }
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

function injectCartDrawer() {
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
      <div class="cart-drawer__body" id="cart-drawer-items">
        <!-- Rendered items go here -->
      </div>
      <div class="cart-drawer__footer">
        <!-- Coupon Code Form -->
        <div style="padding: 0.8rem 0; margin-bottom: 0.8rem;">
          <div style="display:flex; gap:0.5rem;">
            <input type="text" id="coupon-input" placeholder="Coupon Code" style="flex:1; padding:0.45rem 0.75rem; font-size:0.85rem; border:1px solid var(--border); border-radius:var(--radius-sm); background:transparent; color:var(--text-primary); text-transform:uppercase;" />
            <button class="btn btn-cyan btn-sm" id="btn-apply-coupon" onclick="applyCartCoupon(event)" style="padding:0.45rem 1rem; font-size:0.85rem; border-radius:var(--radius-sm);">Apply</button>
          </div>
          <div id="coupon-status" style="font-size:0.75rem; margin-top:0.4rem; display:none; font-weight:600;"></div>
        </div>

        <div class="cart-drawer__summary" style="font-size: 1.1rem;">
          <span class="cart-drawer__subtotal-label">Subtotal</span>
          <span class="cart-drawer__subtotal-val" id="cart-drawer-subtotal">₱0.00</span>
        </div>
        
        <div class="cart-drawer__summary" id="cart-drawer-discount-row" style="display:none; margin-top: 0.5rem; align-items: flex-start; font-size: 1.1rem;">
          <span class="cart-drawer__subtotal-label" id="cart-drawer-discount-label" style="display:flex; flex-direction:column; line-height:1.2;">
            <span>Order discount</span>
          </span>
          <span class="cart-drawer__subtotal-val" id="cart-drawer-discount-val" style="font-weight:normal; color:var(--text-primary);">-₱0.00</span>
        </div>

        <div class="cart-drawer__summary" style="margin-top:0.35rem;">
          <span class="cart-drawer__subtotal-label" style="color:var(--text-secondary); font-weight:normal;">Shipping</span>
          <span class="cart-drawer__subtotal-val" style="font-weight:normal; color:var(--text-secondary); font-size:0.85rem;">Calculated at next step</span>
        </div>
        
        <div class="cart-drawer__summary" id="cart-drawer-total-row" style="display:none; margin-top:0.5rem; font-weight:700; border-top:1px solid var(--border); padding-top:0.5rem; font-size: 1.4rem;">
          <span class="cart-drawer__subtotal-label">Total</span>
          <span class="cart-drawer__subtotal-val" id="cart-drawer-total-val">₱0.00</span>
        </div>

        <div id="cart-drawer-savings-row" style="display:none; align-items:center; gap:0.35rem; color:var(--text-primary); font-size:0.8rem; font-weight:700; margin-top:0.15rem; text-transform:uppercase;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
          <span>TOTAL SAVINGS <span id="cart-drawer-savings-val">₱0.00</span></span>
        </div>
        <div class="cart-drawer__actions">
          <a href="${pathPrefix}checkout.html" class="btn btn-cyan btn-lg text-center" style="width:100%;">Proceed to Checkout</a>
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
  
  // Do not show drawer if we are already on cart or checkout pages
  const path = window.location.pathname;
  if (path.endsWith('cart.html') || path.endsWith('checkout.html')) {
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
    html += `
      <div class="cart-drawer__item">
        <img class="cart-drawer__item-img" src="${item.image}" alt="${item.title}" />
        <div class="cart-drawer__item-info">
          <a class="cart-drawer__item-title" href="${pathPrefix}products/${item.slug}">${item.title}</a>
          <p class="cart-drawer__item-price">₱${itemPrice.toLocaleString('en-PH', {minimumFractionDigits:2})}</p>
          <div class="cart-drawer__item-qty">
            <button class="cart-drawer__item-qty-btn" onclick="changeDrawerQty('${item.id}', -1)">-</button>
            <input class="cart-drawer__item-qty-input" type="number" value="${item.quantity}" readonly />
            <button class="cart-drawer__item-qty-btn" onclick="changeDrawerQty('${item.id}', 1)">+</button>
          </div>
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

  applyActiveCouponIfExists();
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
};

window.removeDrawerItem = (id) => {
  removeFromCart(id);
};

window.closeCartDrawer = closeCartDrawer;
window.openCartDrawer = openCartDrawer;

// Wire up navbar cart toggle button globally
function setupCartToggleListener() {
  // Target the cart anchor link in the navbar
  const cartBtn = document.querySelector('a[aria-label="Cart"], a[href$="cart.html"], .cart-toggle-btn');
  if (cartBtn) {
    // Clone node to clear existing listeners if any
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

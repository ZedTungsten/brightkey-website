/**
 * BrightKey - cart.js
 * Handles local storage cart management and flyout cart drawer UI.
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
  
  // If we are on the main cart page, update its display too
  if (typeof renderCart === 'function') {
    renderCart();
  }
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
  if (typeof renderCart === 'function') {
    renderCart();
  }
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
        <div class="cart-drawer__summary">
          <span class="cart-drawer__subtotal-label">Subtotal</span>
          <span class="cart-drawer__subtotal-val" id="cart-drawer-subtotal">₱0.00</span>
        </div>
        <div class="cart-drawer__note">
          Shipping & taxes calculated at checkout
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
  
  // Re-run listener setup to catch any late injected buttons
  setTimeout(setupCartToggleListener, 500);
});

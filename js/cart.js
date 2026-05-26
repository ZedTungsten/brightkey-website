/**
 * BrightKey - cart.js
 * Handles local storage cart management.
 */

'use strict';

function getCart() {
  const cart = localStorage.getItem('bk_cart');
  return cart ? JSON.parse(cart) : [];
}

function saveCart(cart) {
  localStorage.setItem('bk_cart', JSON.stringify(cart));
  updateCartBadge();
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

// Initialise badge on load if exists
document.addEventListener('DOMContentLoaded', updateCartBadge);

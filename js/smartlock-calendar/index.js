'use strict';

// Supabase config
const SB_URL = 'https://ymjlosnxuhsybkzkoofq.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltamxvc254dWhzeWJremtvb2ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY1MzYsImV4cCI6MjA4OTk4MjUzNn0.srhk9SVvFuZRcfeRGbVDGPr5pYrFhs8vzcOiMK3A91w';
let sb;

// State variables
let currentInstaller = null; // { id, first_name, last_name, company_id, password }
let dbBookings = [];
let deliveryBookingsMap = {};
let installerPayoutSettings = null;

const defaultChecklist = [
  { text: "Door opens and closes smoothly without obstruction", indent: false },
  { text: "Smart lock operates properly (locking and unlocking)", indent: false },
  { text: "Smart lock is successfully connected to the mobile app", indent: false },
  { text: "I know how to create an account on the app", indent: true },
  { text: "I have registered RFID card on the device", indent: true },
  { text: "All components, including the camera, screen, handle, keypad, mechanical unlock, and deadbolt, are free of defects", indent: false },
  { text: "Screws and fasteners are securely installed", indent: false },
  { text: "I have been invited to leave a review for LOOCK Cavite and has consented to taking a photo with the device for documentation", indent: false },
  { text: "Warranty coverage: 1 year on factory defects, 7 days on installation warranty (excludes user-caused damage, service may apply)", indent: false }
];
let bookingChecklist = [...defaultChecklist];
let bookingMediaRequirements = [];

let selectedBooking = null;
let activeDate = new Date(); // selected day
let currentYear = activeDate.getFullYear();
let currentMonth = activeDate.getMonth();

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

let confirmResolver = null;
window.promptAddLabor = async function(doorIdx) {
  window.currentAddonLaborDoorIdx = doorIdx;
  const btn = document.querySelector(`button[onclick="promptAddLabor(${doorIdx})"]`);
  const originalText = btn ? btn.innerText : '';
  if (btn) {
    btn.innerText = 'Processing...';
    btn.disabled = true;
  }

  try {
    const { data: products, error } = await sb
      .from('products')
      .select('id, installation_price, company_id')
      .eq('sku', 'ADD-ON LABOR');

    if (error) throw error;
    
    const p = products && products.length > 0 ? (products.find(prod => prod.company_id === currentInstaller.company_id) || products.find(prod => !prod.company_id)) : null;

    if (!p) {
      throw new Error("SKU 'ADD-ON LABOR' not found in catalog.");
    }

    const priceCents = p.installation_price || 0;
    const pricePhp = priceCents / 100;
    window.currentAddonLaborPriceCents = priceCents;

    const formattedPrice = pricePhp.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
    document.getElementById('confirm-message').innerHTML = `This is for nails, material misdeclaration, and extra welding jobs. Make sure the customer is informed first before adding.<br/><br/><strong style="color:var(--text-primary); font-size:1rem; display:block; margin-top:0.5rem;">Price: ${formattedPrice}</strong>`;

    // Show confirm-modal
    document.getElementById('confirm-modal').style.display = 'flex';
    
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  } catch (err) {
    console.error(err);
    showToast('The labor item could not be loaded. Please check your connection and try again.', true);
  } finally {
    if (btn) {
      btn.innerText = originalText;
      btn.disabled = false;
    }
  }
};

window.closeConfirmModal = function(result) {
  document.getElementById('confirm-modal').style.display = 'none';
  if (confirmResolver) {
    confirmResolver(result);
    confirmResolver = null;
  }
};

window.submitAddLabor = async function() {
  closeConfirmModal(true);
  const priceCents = window.currentAddonLaborPriceCents || 0;
  const pricePhp = priceCents / 100;
  const doorIdx = window.currentAddonLaborDoorIdx;
  await performAddLabor(pricePhp, doorIdx);
};

window.performAddLabor = async function(pricePhp, doorIdx) {
  if (!selectedBooking) return;
  const priceCents = Math.round(pricePhp * 100);

  // 1. Get existing products array
  let productsArr = [];
  if (typeof selectedBooking.products === 'string') {
    try { productsArr = JSON.parse(selectedBooking.products); } catch(_) {}
  } else if (Array.isArray(selectedBooking.products)) {
    productsArr = [...selectedBooking.products];
  }

  // Append ADD-ON LABOR product
  productsArr.push({
    sku: 'ADD-ON LABOR',
    name: 'ADD-ON LABOR',
    title: 'ADD-ON LABOR',
    qty: 1,
    price: priceCents,
    lineTotal: priceCents,
    doorIndex: doorIdx
  });

  // 2. Parse existing pipe-separated product fields
  const skus = (selectedBooking.product_skus || '').split(' | ').filter(Boolean);
  const names = (selectedBooking.product_names || '').split(' | ').filter(Boolean);
  const qtys = (selectedBooking.product_qtys || '').split(' | ').filter(Boolean);
  const prices = (selectedBooking.product_unit_prices || '').split(' | ').filter(Boolean);
  const totals = (selectedBooking.product_totals || '').split(' | ').filter(Boolean);

  skus.push('ADD-ON LABOR');
  names.push('ADD-ON LABOR');
  qtys.push('1');
  prices.push(pricePhp.toFixed(2));
  totals.push(pricePhp.toFixed(2));

  // 3. Compute new financial totals
  const newSubtotal = (selectedBooking.subtotal || 0) + priceCents;
  const newGrandTotal = (selectedBooking.grand_total || 0) + priceCents;
  const newBalance = (selectedBooking.balance_due || 0) + priceCents;

  const updatePayload = {
    products: productsArr,
    product_skus: skus.join(' | '),
    product_names: names.join(' | '),
    product_qtys: qtys.join(' | '),
    product_unit_prices: prices.join(' | '),
    product_totals: totals.join(' | '),
    subtotal: newSubtotal,
    grand_total: newGrandTotal,
    balance_due: newBalance
  };

  try {
    const { error } = await sb
      .from('installation_bookings')
      .update(updatePayload)
      .eq('id', selectedBooking.id);

    if (error) throw error;

    // Update local memory states
    const idx = dbBookings.findIndex(b => b.id === selectedBooking.id);
    if (idx !== -1) {
      dbBookings[idx] = { ...dbBookings[idx], ...updatePayload };
      selectedBooking = dbBookings[idx];
    }

    // Cache update
    localStorage.setItem(`bk_cache_${currentInstaller.id}`, JSON.stringify({
      data: dbBookings,
      timestamp: new Date().toISOString()
    }));

    showToast('SKU: ADD-ON LABOR added successfully!');
    
    // Refresh details modal
    openDetailsModal(selectedBooking.id);
  } catch (err) {
    console.error('Failed to add ADD-ON LABOR:', err);
    showToast('The labor item could not be added. Please try again.', true);
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Initialize Supabase
  if (window.supabase) {
    sb = window.supabase.createClient(SB_URL, SB_KEY);
  }

  // 2. Check if installer is already saved in session/local storage
  const savedInstaller = localStorage.getItem('bk_active_installer');
  if (savedInstaller) {
    try {
      currentInstaller = JSON.parse(savedInstaller);
      document.getElementById('display-installer-name').innerText = `${currentInstaller.first_name} ${currentInstaller.last_name}`;
      populateProfile();
      populateTrackerMonthSelect();
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app-screen').style.display = 'flex';
      
      // Load cached data first (offline availability)
      loadCachedBookings();
      
      // Try to sync with remote DB
      await syncData();
    } catch (_) {
      localStorage.removeItem('bk_active_installer');
    }
  }
});

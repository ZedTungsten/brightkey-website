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
      .select('installation_price, company_id')
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
    showToast(err.message, true);
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
    showToast('Failed to add labor: ' + err.message, true);
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

// --- Authentication Logic ---
async function handleLogin(e) {
  e.preventDefault();
  const enteredPass = document.getElementById('login-pass').value;
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit-btn');

  errorEl.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.innerText = 'Verifying...';

  try {
    // Fetch all active employees with full details
    const { data: employees, error } = await sb
      .from('employees')
      .select('id, first_name, last_name, contact_number, emergency_contact_number, company_id, assignment, email, department, title, employment_status')
      .eq('employment_status', 'Active');

    if (error) throw error;

    // Filter and verify installer password
    const cleanEntered = enteredPass.trim().toLowerCase();
    const matchingInstaller = (employees || []).find(emp => {
      const empAssigns = (emp.assignment || '').split(',').map(s => s.trim().toLowerCase());
      if (!empAssigns.includes('installer')) return false;

      const firstInit = (emp.first_name || '').trim().charAt(0).toLowerCase();
      const lastInit = (emp.last_name || '').trim().charAt(0).toLowerCase();
      const emergencyPhone = (emp.emergency_contact_number || '').replace(/[^0-9]/g, '');
      const last4 = emergencyPhone.slice(-4);

      const derivedPass = `${firstInit}${lastInit}${last4}`;
      return cleanEntered === derivedPass;
    });

    if (matchingInstaller) {
      currentInstaller = matchingInstaller;
      localStorage.setItem('bk_active_installer', JSON.stringify(matchingInstaller));
      document.getElementById('display-installer-name').innerText = `${currentInstaller.first_name} ${currentInstaller.last_name}`;
      populateProfile();
      populateTrackerMonthSelect();
      
      // Slide screen transition
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app-screen').style.display = 'flex';

      // Sync data
      loadCachedBookings();
      await syncData();
    } else {
      errorEl.style.display = 'block';
    }
  } catch (err) {
    console.error('Login error:', err);
    errorEl.innerText = 'Network error: Failed to reach database.';
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Login';
  }
}

function handleLogout() {
  localStorage.removeItem('bk_active_installer');
  localStorage.removeItem(`bk_cache_${currentInstaller?.id}`);
  currentInstaller = null;
  dbBookings = [];
  document.getElementById('login-pass').value = '';
  document.getElementById('app-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  
  // Reset view to Calendar
  const calendarTab = document.getElementById('calendar-view');
  const trackerTab = document.getElementById('job-tracker-view');
  const profileTab = document.getElementById('profile-view');
  const payoutsTab = document.getElementById('payouts-view');
  calendarTab.style.display = 'flex';
  trackerTab.style.display = 'none';
  profileTab.style.display = 'none';
  payoutsTab.style.display = 'none';
  
  const menuItems = document.querySelectorAll('.drawer-menu-list .drawer-menu-item');
  menuItems.forEach(item => {
    if (item.getAttribute('onclick').includes('calendar')) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

function toggleSidebar(show) {
  const overlay = document.getElementById('sidebar-drawer-overlay');
  if (show) {
    overlay.style.display = 'block';
    overlay.offsetHeight; // force reflow
    overlay.classList.add('open');
  } else {
    overlay.classList.remove('open');
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 200);
  }
}

function switchView(view) {
  const calendarTab = document.getElementById('calendar-view');
  const trackerTab = document.getElementById('job-tracker-view');
  const profileTab = document.getElementById('profile-view');
  const payoutsTab = document.getElementById('payouts-view');
  const menuItems = document.querySelectorAll('.drawer-menu-list .drawer-menu-item');
  
  calendarTab.style.display = view === 'calendar' ? 'flex' : 'none';
  trackerTab.style.display = view === 'job-tracker' ? 'flex' : 'none';
  profileTab.style.display = view === 'profile' ? 'flex' : 'none';
  payoutsTab.style.display = view === 'payouts' ? 'flex' : 'none';

  if (view === 'job-tracker') {
    drawJobTracker();
  } else if (view === 'profile') {
    populateProfile();
  } else if (view === 'payouts') {
    drawPayouts();
  }
  
  // Close sidebar drawer after switching view
  toggleSidebar(false);

  menuItems.forEach(item => {
    if (item.getAttribute('onclick').includes(view)) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  toggleSidebar(false);
}

function populateProfile() {
  if (!currentInstaller) return;
  document.getElementById('profile-full-name').textContent = `${currentInstaller.first_name || ''} ${currentInstaller.last_name || ''}`;
  document.getElementById('profile-title').textContent = currentInstaller.title || currentInstaller.assignment || 'Installer';
  document.getElementById('profile-dept').textContent = currentInstaller.department || 'Operations';
  document.getElementById('profile-status').textContent = currentInstaller.employment_status || 'Active';
  document.getElementById('profile-email').textContent = currentInstaller.email || '—';
  document.getElementById('profile-phone').textContent = currentInstaller.contact_number || '—';
}

function getInstallerRoleForBooking(b, myId) {
  let isLead = false;
  let isAssist = false;

  // 1. Check doors installers
  let doorsArr = [];
  if (b.doors) {
    if (typeof b.doors === 'string') {
      try { doorsArr = JSON.parse(b.doors); } catch(_) {}
    } else if (Array.isArray(b.doors)) {
      doorsArr = b.doors;
    }
  }

  let foundInDoors = false;
  for (let door of doorsArr) {
    const dInsts = door.installers || [];
    const myIndex = dInsts.findIndex(inst => inst.id === myId);
    if (myIndex !== -1) {
      foundInDoors = true;
      const inst = dInsts[myIndex];
      if (inst.role === 'assist') {
        isAssist = true;
      } else if (inst.role === 'lead') {
        isLead = true;
      } else {
        // Fallback for old data without roles: first installer is lead, rest are assist
        if (myIndex === 0) isLead = true;
        else isAssist = true;
      }
    }
  }

  if (foundInDoors) {
    return isLead ? 'lead' : 'assist';
  }

  // 2. Check booking-level installers
  let bInsts = [];
  if (b.installers) {
    if (typeof b.installers === 'string') {
      try { bInsts = JSON.parse(b.installers); } catch(_) {}
    } else if (Array.isArray(b.installers)) {
      bInsts = b.installers;
    }
  }

  const myBIndex = bInsts.findIndex(inst => inst.id === myId);
  if (myBIndex !== -1) {
    const inst = bInsts[myBIndex];
    if (inst.role === 'assist') return 'assist';
    if (inst.role === 'lead') return 'lead';
    return myBIndex === 0 ? 'lead' : 'assist';
  }

  // 3. Check installer_id mapping
  if (b.installer_id) {
    const ids = b.installer_id.split(' | ');
    const myIdIdx = ids.indexOf(myId);
    if (myIdIdx !== -1) {
      return myIdIdx === 0 ? 'lead' : 'assist';
    }
  }

  return null;
}

function getInstallerAssignedSkus(b, myId) {
  let doorsArr = [];
  if (b.doors) {
    if (typeof b.doors === 'string') {
      try { doorsArr = JSON.parse(b.doors); } catch(_) {}
    } else if (Array.isArray(b.doors)) {
      doorsArr = b.doors;
    }
  }

  let bInsts = [];
  if (b.installers) {
    if (typeof b.installers === 'string') {
      try { bInsts = JSON.parse(b.installers); } catch(_) {}
    } else if (Array.isArray(b.installers)) {
      bInsts = b.installers;
    }
  }
  const isBookingLevelInstaller = bInsts.some(inst => inst && inst.id === myId) || 
                                  (b.installer_id && b.installer_id.split(' | ').includes(myId));

  const assignedSkus = [];

  let productsArr = [];
  if (b.products) {
    if (typeof b.products === 'string') {
      try { productsArr = JSON.parse(b.products); } catch(_) {}
    } else if (Array.isArray(b.products)) {
      productsArr = b.products;
    }
  }
  const skus = (b.product_skus || '').split(' | ');
  const names = (b.product_names || '').split(' | ');
  const rowCount = Math.max(productsArr.length, doorsArr.length, skus.length);

  const anyDoorHasAttachedProducts = doorsArr.some(d => Array.isArray(d.products) && d.products.length > 0);
  const isSingleDoorGrouping = (doorsArr.length === 1 && productsArr.length > 0);
  const skuOccurrenceCount = new Map();

  const bookingHasDoorLevelInstallers = doorsArr.some(d => d && Array.isArray(d.installers) && d.installers.some(inst => inst && (inst.id || inst.name)));

  for (let i = 0; i < rowCount; i++) {
    const door = doorsArr[i];
    
    let isAssignedToThisDoor = false;
    if (door && Array.isArray(door.installers)) {
      isAssignedToThisDoor = door.installers.some(inst => inst && inst.id === myId);
    } else if (bookingHasDoorLevelInstallers) {
      isAssignedToThisDoor = false;
    } else {
      isAssignedToThisDoor = isBookingLevelInstaller;
    }

    if (isAssignedToThisDoor) {
      if (anyDoorHasAttachedProducts && door) {
        const attachedSkus = door.products || [];
        attachedSkus.forEach(sku => {
          const matchingProds = productsArr.filter(p => p.sku === sku);
          const occurrenceIndex = skuOccurrenceCount.get(sku) || 0;
          const matchedProd = matchingProds[occurrenceIndex];
          if (matchedProd && !matchedProd.cancelled) {
            assignedSkus.push(matchedProd.sku);
          }
          skuOccurrenceCount.set(sku, occurrenceIndex + 1);
        });
      } else if (isSingleDoorGrouping) {
        productsArr.forEach(p => {
          if (p.sku !== 'ADD-ON LABOR' && !p.cancelled) {
            assignedSkus.push(p.sku);
          }
        });
      } else {
        if (productsArr[i] && !productsArr[i].cancelled) {
          assignedSkus.push(productsArr[i].sku);
        } else if (skus[i]) {
          assignedSkus.push(skus[i]);
        }
      }
    } else {
      if (anyDoorHasAttachedProducts && door) {
        const attachedSkus = door.products || [];
        attachedSkus.forEach(sku => {
          const occurrenceIndex = skuOccurrenceCount.get(sku) || 0;
          skuOccurrenceCount.set(sku, occurrenceIndex + 1);
        });
      }
    }
  }

  return assignedSkus.join(' | ');
}

function getInstallerAssignedDoorsForBooking(b, myId) {
  let doorsArr = [];
  if (b.doors) {
    if (typeof b.doors === 'string') {
      try { doorsArr = JSON.parse(b.doors); } catch(_) {}
    } else if (Array.isArray(b.doors)) {
      doorsArr = b.doors;
    }
  }

  let bInsts = [];
  if (b.installers) {
    if (typeof b.installers === 'string') {
      try { bInsts = JSON.parse(b.installers); } catch(_) {}
    } else if (Array.isArray(b.installers)) {
      bInsts = b.installers;
    }
  }

  const isBookingLevelInstaller = bInsts.some(inst => inst && inst.id === myId) || 
                                  (b.installer_id && b.installer_id.split(' | ').includes(myId));

  const bookingHasDoorLevelInstallers = doorsArr.some(d => d && Array.isArray(d.installers) && d.installers.some(inst => inst && (inst.id || inst.name)));

  const assignedDoors = [];

  // If there are no doors defined, treat the booking itself as one implicit door
  if (doorsArr.length === 0) {
    if (isBookingLevelInstaller) {
      let roles = [];
      const matchedBInsts = bInsts.filter(inst => inst && inst.id === myId);
      if (matchedBInsts.length > 0) {
        matchedBInsts.forEach(inst => {
          const r = inst.role || 'lead';
          if (!roles.includes(r)) roles.push(r);
        });
      } else if (b.installer_id) {
        const ids = b.installer_id.split(' | ');
        const myIdIdx = ids.indexOf(myId);
        if (myIdIdx !== -1) {
          roles.push(myIdIdx === 0 ? 'lead' : 'assist');
        }
      }
      
      if (roles.length === 0) {
        roles.push('lead');
      }
      
      let productsArr = [];
      if (b.products) {
        if (typeof b.products === 'string') {
          try { productsArr = JSON.parse(b.products); } catch(_) {}
        } else if (Array.isArray(b.products)) {
          productsArr = b.products;
        }
      }
      const skus = (b.product_skus || '').split(' | ').filter(Boolean);
      const activeSkus = productsArr.length > 0 
        ? productsArr.filter(p => !p.cancelled && p.sku !== 'ADD-ON LABOR').map(p => p.sku)
        : skus;

      assignedDoors.push({
        doorName: 'Standard Installation',
        completed: b.status === 'done' || b.status === 'completed' || b.status === 'finished',
        roles: roles,
        skus: activeSkus
      });
    }
    return assignedDoors;
  }

  let productsArr = [];
  if (b.products) {
    if (typeof b.products === 'string') {
      try { productsArr = JSON.parse(b.products); } catch(_) {}
    } else if (Array.isArray(b.products)) {
      productsArr = b.products;
    }
  }
  const skus = (b.product_skus || '').split(' | ');
  const anyDoorHasAttachedProducts = doorsArr.some(d => Array.isArray(d.products) && d.products.length > 0);
  const isSingleDoorGrouping = (doorsArr.length === 1 && productsArr.length > 0);
  const skuOccurrenceCount = new Map();

  doorsArr.forEach((door, index) => {
    let isAssignedToThisDoor = false;
    let roles = [];

    if (door && Array.isArray(door.installers)) {
      const matchedInsts = door.installers.filter(inst => inst && inst.id === myId);
      if (matchedInsts.length > 0) {
        isAssignedToThisDoor = true;
        matchedInsts.forEach(inst => {
          const r = inst.role || 'lead';
          if (!roles.includes(r)) roles.push(r);
        });
      }
    } else if (bookingHasDoorLevelInstallers) {
      isAssignedToThisDoor = false;
    } else {
      isAssignedToThisDoor = isBookingLevelInstaller;
      const matchedBInsts = bInsts.filter(inst => inst && inst.id === myId);
      if (matchedBInsts.length > 0) {
        matchedBInsts.forEach(inst => {
          const r = inst.role || 'lead';
          if (!roles.includes(r)) roles.push(r);
        });
      } else if (b.installer_id) {
        const ids = b.installer_id.split(' | ');
        const myIdIdx = ids.indexOf(myId);
        if (myIdIdx !== -1) {
          roles.push(myIdIdx === 0 ? 'lead' : 'assist');
        }
      }
    }

    if (isAssignedToThisDoor) {
      const doorSkus = [];
      if (anyDoorHasAttachedProducts && door) {
        const attachedSkus = door.products || [];
        attachedSkus.forEach(sku => {
          const matchingProds = productsArr.filter(p => p.sku === sku);
          const occurrenceIndex = skuOccurrenceCount.get(sku) || 0;
          const matchedProd = matchingProds[occurrenceIndex];
          if (matchedProd && !matchedProd.cancelled) {
            doorSkus.push(matchedProd.sku);
          }
          skuOccurrenceCount.set(sku, occurrenceIndex + 1);
        });
      } else if (isSingleDoorGrouping) {
        productsArr.forEach(p => {
          if (p.sku !== 'ADD-ON LABOR' && !p.cancelled) {
            doorSkus.push(p.sku);
          }
        });
      } else {
        if (productsArr[index] && !productsArr[index].cancelled) {
          doorSkus.push(productsArr[index].sku);
        } else if (skus[index]) {
          doorSkus.push(skus[index]);
        }
      }

      assignedDoors.push({
        doorName: door.name || `Door ${index + 1}`,
        completed: !!door.completed,
        roles: roles,
        skus: doorSkus
      });
    } else {
      if (anyDoorHasAttachedProducts && door) {
        const attachedSkus = door.products || [];
        attachedSkus.forEach(sku => {
          const occurrenceIndex = skuOccurrenceCount.get(sku) || 0;
          skuOccurrenceCount.set(sku, occurrenceIndex + 1);
        });
      }
    }
  });

  return assignedDoors;
}

function populateTrackerMonthSelect() {
  const select = document.getElementById('tracker-month-select');
  const paySelect = document.getElementById('payouts-month-select');
  if (!select && !paySelect) return;
  
  const options = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const optVal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const optText = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    options.push({ val: optVal, text: optText });
  }

  if (select) {
    select.innerHTML = '';
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.val;
      opt.textContent = o.text;
      select.appendChild(opt);
    });
  }

  if (paySelect) {
    paySelect.innerHTML = '';
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.val;
      opt.textContent = o.text;
      paySelect.appendChild(opt);
    });
  }
}

function drawJobTracker() {
  if (!currentInstaller) return;
  const select = document.getElementById('tracker-month-select');
  if (!select) return;
  
  const targetMonthKey = select.value; // e.g. "2026-06"
  const myId = currentInstaller.id;

  let leadCount = 0;
  let assistCount = 0;
  let listHtml = '';

  // Filter from dbBookings
  const monthBookings = dbBookings.filter(b => {
    if (!b.scheduled_date) return false;
    const d = new Date(b.scheduled_date);
    const bookingMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return bookingMonthKey === targetMonthKey;
  });

  // Sort by scheduled_date earliest first
  monthBookings.sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));

  monthBookings.forEach(b => {
    const assignedDoors = getInstallerAssignedDoorsForBooking(b, myId);
    assignedDoors.forEach(d => {
      if (d.roles.includes('lead')) {
        leadCount++;
      } else if (d.roles.includes('assist')) {
        assistCount++;
      }

      const date = new Date(b.scheduled_date);
      const dateLabel = `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
      
      const statusBadge = d.completed 
        ? `<span style="font-size:0.68rem; font-weight:700; background:#D1FAE5; color:#065F46; padding:0.15rem 0.4rem; border-radius:4px; text-transform:uppercase;">Completed</span>`
        : `<span style="font-size:0.68rem; font-weight:700; background:#FEF3C7; color:#92400E; padding:0.15rem 0.4rem; border-radius:4px; text-transform:uppercase;">Scheduled</span>`;
      
      let roleBadgesHtml = '';
      if (d.roles.includes('lead')) {
        roleBadgesHtml += `<span style="font-size:0.68rem; font-weight:700; background:#CFFAFE; color:#0891B2; padding:0.15rem 0.4rem; border-radius:4px; text-transform:uppercase;">Lead</span>`;
      }
      if (d.roles.includes('assist')) {
        roleBadgesHtml += `<span style="font-size:0.68rem; font-weight:700; background:#F3F4F6; color:#374151; padding:0.15rem 0.4rem; border-radius:4px; text-transform:uppercase;">Assist</span>`;
      }
      if (d.roles.includes('service')) {
        roleBadgesHtml += `<span style="font-size:0.68rem; font-weight:700; background:#F3E8FF; color:#7E22CE; padding:0.15rem 0.4rem; border-radius:4px; text-transform:uppercase;">Service</span>`;
      }

      const isDayOff = b.product_skus === 'Day off' || (b.order_no && b.order_no.startsWith('DO-'));
      const displayLabel = isDayOff ? 'Day off' : `${b.customer_name || 'Client'} (${d.doorName})`;
      const skuLabel = d.skus.join(' | ') || 'No Lock';

      listHtml += `
        <div style="background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.85rem; display: flex; flex-direction: column; gap: 0.5rem; cursor: pointer;" onclick="openDetailsModal('${b.id}')">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">${b.order_no || 'Job'}</span>
            <div style="display: flex; gap: 0.35rem; align-items: center;">
              ${roleBadgesHtml}
              ${statusBadge}
            </div>
          </div>
          <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary);">${escapeHtml(displayLabel)}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.15rem;">
            <span>${dateLabel}</span>
            <span style="font-weight: 600; color: var(--cyan-light);">${escapeHtml(skuLabel)}</span>
          </div>
        </div>
      `;
    });
  });

  if (!listHtml) {
    listHtml = `<div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.88rem; font-style: italic;">No job assignments recorded for this month.</div>`;
  }

  document.getElementById('tracker-lead-count').textContent = leadCount;
  document.getElementById('tracker-assist-count').textContent = assistCount;
  document.getElementById('tracker-total-count').textContent = leadCount + assistCount;
  document.getElementById('tracker-job-list').innerHTML = listHtml;
}

function drawPayouts() {
  if (!currentInstaller) return;
  const select = document.getElementById('payouts-month-select');
  if (!select) return;
  
  const targetMonthKey = select.value;
  const myId = currentInstaller.id;

  // Get configuration settings
  const config = installerPayoutSettings || {
    installations_before_crediting: 15,
    lead_credit: 1.0,
    assist_credit: 0.5,
    lead_rate: 1000,
    assist_rate: 500,
    extra_services: [
      { sku: 'BASEPLATE-M', rate: 700 },
      { sku: 'BASEPLATE-S', rate: 700 }
    ]
  };

  const thresholdVal = config.installations_before_crediting || 15;
  const leadWeight = config.lead_credit !== undefined ? config.lead_credit : 1.0;
  const assistWeight = config.assist_credit !== undefined ? config.assist_credit : 0.5;
  const leadRateVal = config.lead_rate || 1000;
  const assistRateVal = config.assist_rate || 500;
  const extraServicesList = (config.extra_services || []).map(es => {
    let sku = es.sku || es.name || '';
    if (sku === 'Welding Baseplate Metal') sku = 'BASEPLATE-M';
    if (sku === 'Welding Baseplate Stainless') sku = 'BASEPLATE-S';
    return { sku, rate: es.rate };
  });

  // Update threshold settings labels in UI
  document.getElementById('payout-lead-weight').textContent = leadWeight.toFixed(1);
  document.getElementById('payout-assist-weight').textContent = assistWeight.toFixed(1);
  document.getElementById('payout-target-threshold').textContent = thresholdVal + ' Counts';

  // 1. Gather all bookings for selected month
  const monthBookings = dbBookings.filter(b => {
    if (!b.scheduled_date) return false;
    const d = new Date(b.scheduled_date);
    const bookingMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return bookingMonthKey === targetMonthKey;
  });

  const doorJobs = [];
  monthBookings.forEach(b => {
    const assignedDoors = getInstallerAssignedDoorsForBooking(b, myId);
    assignedDoors.forEach(d => {
      if (d.completed) {
        doorJobs.push({
          completed_at: d.completed_at || b.updated_at || b.created_at || b.scheduled_date,
          roles: d.roles,
          skus: d.skus,
          scheduled_date: b.scheduled_date
        });
      }
    });
  });

  // Sort doorJobs chronologically by scheduled_date
  doorJobs.sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));

  let leadCount = 0;
  let assistCount = 0;
  let serviceEarnings = 0;
  const serviceCounts = {};

  let runningCredit = 0;
  let thresholdEarnings = 0;

  doorJobs.forEach(job => {
    let weight = 0;
    if (job.roles.includes('lead')) {
      leadCount++;
      weight = leadWeight;
    } else if (job.roles.includes('assist')) {
      assistCount++;
      weight = assistWeight;
    }

    if (job.roles.includes('service')) {
      job.skus.forEach(sku => {
        const matchedService = extraServicesList.find(es => es.sku === sku);
        if (matchedService) {
          serviceCounts[sku] = (serviceCounts[sku] || 0) + 1;
          serviceEarnings += matchedService.rate;
        }
      });
    }

    const previousCredit = runningCredit;
    const newCredit = previousCredit + weight;
    if (newCredit > thresholdVal) {
      const extraCredit = weight;
      thresholdEarnings += extraCredit * leadRateVal;
    }
    runningCredit = newCredit;
  });

  const totalCredit = runningCredit;
  
  // Update Threshold Progress
  const thresholdSummary = `${totalCredit.toFixed(1)} / ${thresholdVal} Counts`;
  document.getElementById('payout-threshold-summary').textContent = thresholdSummary;
  document.getElementById('payout-lead-count').textContent = leadCount;
  document.getElementById('payout-assist-count').textContent = assistCount;
  document.getElementById('payout-accumulated-credit').textContent = totalCredit.toFixed(1);

  // Render gamified progress bar
  const percent = Math.min(100, Math.max(0, (totalCredit / thresholdVal) * 100));
  const fillEl = document.getElementById('payout-threshold-fill');
  const percentEl = document.getElementById('payout-threshold-percent');
  if (fillEl) fillEl.style.width = `${percent}%`;
  if (percentEl) percentEl.textContent = `${Math.round(percent)}%`;

  // 2. Calculate threshold earnings (extra works past threshold)
  let thresholdEarningsDetailsHtml = '';

  if (totalCredit > thresholdVal) {
    const extraCredit = thresholdEarnings / leadRateVal;

    thresholdEarningsDetailsHtml = `
      <div style="display:flex; justify-content:space-between;">
        <span>Extra Credits:</span>
        <strong>+${extraCredit.toFixed(1)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--text-muted);">
        <span>Lead Payout Rate (1.0 cr):</span>
        <span>₱${leadRateVal.toLocaleString()}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--text-muted);">
        <span>Assist Payout Rate (0.5 cr):</span>
        <span>₱${assistRateVal.toLocaleString()}</span>
      </div>
    `;
  } else {
    thresholdEarningsDetailsHtml = `<div style="font-style:italic; color:var(--text-muted); font-size:0.8rem;">Threshold not reached yet (${totalCredit.toFixed(1)} / ${thresholdVal}).</div>`;
  }

  document.getElementById('payout-extra-total').textContent = `₱${thresholdEarnings.toLocaleString()}`;
  document.getElementById('payout-extra-details').innerHTML = thresholdEarningsDetailsHtml;

  // 3. Render flat services payout
  let servicesDetailsHtml = '';
  if (Object.keys(serviceCounts).length > 0) {
    Object.entries(serviceCounts).forEach(([sku, count]) => {
      const matched = extraServicesList.find(es => es.sku === sku);
      const rate = matched ? matched.rate : 0;
      const subtotal = count * rate;
      servicesDetailsHtml += `
        <div style="display:flex; justify-content:space-between;">
          <span>${escapeHtml(sku)} (${count} x ₱${rate.toLocaleString()}):</span>
          <strong>₱${subtotal.toLocaleString()}</strong>
        </div>
      `;
    });
  } else {
    servicesDetailsHtml = `<div style="font-style:italic; color:var(--text-muted); font-size:0.8rem;">No extra paid services recorded this month.</div>`;
  }

  document.getElementById('payout-services-total').textContent = `₱${serviceEarnings.toLocaleString()}`;
  document.getElementById('payout-services-details').innerHTML = servicesDetailsHtml;

  // 4. Grand Total
  const grandTotal = thresholdEarnings + serviceEarnings;
  document.getElementById('payout-grand-total').textContent = `₱${grandTotal.toLocaleString()}`;
}

// --- Offline Caching & Sync ---
function loadCachedBookings() {
  if (!currentInstaller) return;
  const cacheKey = `bk_cache_${currentInstaller.id}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const { data, timestamp } = JSON.parse(cached);
      dbBookings = data || [];
      updateSyncBanner(true, new Date(timestamp));
      drawCalendar();
      drawAgenda();
    } catch (_) {}
  }

  const cachedChecklist = localStorage.getItem('bk_booking_checklist');
  if (cachedChecklist) {
    try {
      bookingChecklist = JSON.parse(cachedChecklist);
    } catch (_) {}
  }

  const cachedMediaReqs = localStorage.getItem('bk_booking_media_requirements');
  if (cachedMediaReqs) {
    try {
      bookingMediaRequirements = JSON.parse(cachedMediaReqs);
    } catch (_) {}
  }

  const cachedDelivery = localStorage.getItem('bk_delivery_bookings_map');
  if (cachedDelivery) {
    try {
      deliveryBookingsMap = JSON.parse(cachedDelivery);
    } catch (_) {}
  }

  const cachedPayoutSettings = localStorage.getItem('bk_installer_payout_settings');
  if (cachedPayoutSettings) {
    try {
      installerPayoutSettings = JSON.parse(cachedPayoutSettings);
    } catch (_) {}
  }
}

async function syncData() {
  if (!currentInstaller || !sb) return;

  const banner = document.getElementById('sync-status');
  const bannerText = document.getElementById('sync-text');
  bannerText.innerText = 'Syncing calendar...';
  banner.classList.remove('offline');

  try {
    // Fetch fresh installer record
    const { data: freshEmp } = await sb
      .from('employees')
      .select('id, first_name, last_name, contact_number, emergency_contact_number, company_id, assignment, email, department, title, employment_status')
      .eq('id', currentInstaller.id)
      .maybeSingle();
    if (freshEmp) {
      currentInstaller = freshEmp;
      localStorage.setItem('bk_active_installer', JSON.stringify(freshEmp));
      document.getElementById('display-installer-name').innerText = `${currentInstaller.first_name} ${currentInstaller.last_name}`;
      populateProfile();
    }

    // Fetch booking checklist
    const { data: checklistRes } = await sb
      .from('global_settings')
      .select('value')
      .eq('key', 'booking_checklist')
      .eq('company_id', currentInstaller.company_id)
      .maybeSingle();

    if (checklistRes && checklistRes.value && Array.isArray(checklistRes.value)) {
      bookingChecklist = checklistRes.value;
    } else {
      bookingChecklist = defaultChecklist;
    }
    localStorage.setItem('bk_booking_checklist', JSON.stringify(bookingChecklist));

    // Fetch booking media requirements
    try {
      const { data: mediaReqsRes } = await sb
        .from('global_settings')
        .select('value')
        .eq('key', 'booking_media_requirements')
        .eq('company_id', currentInstaller.company_id)
        .maybeSingle();

      if (mediaReqsRes && mediaReqsRes.value && Array.isArray(mediaReqsRes.value)) {
        bookingMediaRequirements = mediaReqsRes.value;
      } else {
        bookingMediaRequirements = [];
      }
      localStorage.setItem('bk_booking_media_requirements', JSON.stringify(bookingMediaRequirements));
    } catch (mediaErr) {
      console.error('Error syncing media requirements:', mediaErr);
    }

    // Fetch installer payout settings
    try {
      const { data: payoutSettingsRes } = await sb
        .from('global_settings')
        .select('value')
        .eq('key', 'installer_payout_settings')
        .eq('company_id', currentInstaller.company_id)
        .maybeSingle();

      if (payoutSettingsRes && payoutSettingsRes.value) {
        installerPayoutSettings = payoutSettingsRes.value;
      } else {
        installerPayoutSettings = {
          installations_before_crediting: 15,
          lead_credit: 1.0,
          assist_credit: 0.5,
          lead_rate: 1000,
          assist_rate: 500,
          extra_services: [
            { sku: 'BASEPLATE-M', rate: 700 },
            { sku: 'BASEPLATE-S', rate: 700 }
          ]
        };
      }
      localStorage.setItem('bk_installer_payout_settings', JSON.stringify(installerPayoutSettings));
    } catch (payoutSettingsErr) {
      console.error('Error syncing installer payout settings:', payoutSettingsErr);
    }

    // Fetch bookings for this company
    const { data, error } = await sb
      .from('installation_bookings')
      .select('*')
      .eq('company_id', currentInstaller.company_id);

    if (error) throw error;

    // Fetch delivery bookings to map order_no/reference_id to status
    try {
      const { data: delivData } = await sb
        .from('delivery_bookings')
        .select('reference_id, status')
        .eq('company_id', currentInstaller.company_id);
      deliveryBookingsMap = {};
      if (delivData) {
        delivData.forEach(d => {
          deliveryBookingsMap[d.reference_id] = d.status;
        });
      }
      localStorage.setItem('bk_delivery_bookings_map', JSON.stringify(deliveryBookingsMap));
    } catch (delivErr) {
      console.error('Error syncing delivery bookings map:', delivErr);
    }

    // Filter bookings client side where installer is assigned to the booking or any of its doors
    const myId = currentInstaller.id;
    dbBookings = (data || []).filter(b => {
      // Skip cancelled bookings
      if (b.status === 'cancelled') return false;

      // Check direct list
      let list = [];
      if (b.installers) {
        if (typeof b.installers === 'string') {
          try { list = JSON.parse(b.installers); } catch(_) {}
        } else if (Array.isArray(b.installers)) {
          list = b.installers;
        }
      }
      if (list.some(inst => inst.id === myId)) return true;

      // Check installer_id string mapping
      if (b.installer_id && b.installer_id.split(' | ').includes(myId)) return true;

      // Check per-door installers
      let doorsArr = [];
      if (b.doors) {
        if (typeof b.doors === 'string') {
          try { doorsArr = JSON.parse(b.doors); } catch(_) {}
        } else if (Array.isArray(b.doors)) {
          doorsArr = b.doors;
        }
      }
      const hasDoorMatch = doorsArr.some(d => {
        const dInsts = d.installers || [];
        return dInsts.some(inst => inst.id === myId);
      });
      
      return hasDoorMatch;
    });

    // Save to cache
    const cacheObj = {
      data: dbBookings,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem(`bk_cache_${currentInstaller.id}`, JSON.stringify(cacheObj));

    updateSyncBanner(false, new Date());
    drawCalendar();
    drawAgenda();
    drawJobTracker();
  } catch (err) {
    console.error('Sync failed:', err);
    updateSyncBanner(true);
  }
}

function updateSyncBanner(isOffline, timestamp = null) {
  const banner = document.getElementById('sync-status');
  const bannerText = document.getElementById('sync-text');
  const timeEl = document.getElementById('sync-time');

  if (isOffline) {
    banner.classList.add('offline');
    bannerText.innerText = 'Offline Mode';
    if (timestamp) {
      timeEl.innerText = 'Synced: ' + timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      timeEl.innerText = '';
    }
  } else {
    banner.classList.remove('offline');
    bannerText.innerText = 'Connected & Synced';
    if (timestamp) {
      timeEl.innerText = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }
}

// --- Calendar Rendering ---
function changeMonth(direction) {
  currentMonth += direction;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  } else if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  drawCalendar();
}

function drawCalendar() {
  document.getElementById('month-title').innerText = `${MONTH_NAMES[currentMonth]} ${currentYear}`;
  const container = document.getElementById('days-container');
  container.innerHTML = '';

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Pad previous month days
  for (let i = 0; i < firstDay; i++) {
    container.insertAdjacentHTML('beforeend', '<div class="day-cell other-month"></div>');
  }

  const today = new Date();

  // Populate month days
  for (let day = 1; day <= totalDays; day++) {
    const cellDate = new Date(currentYear, currentMonth, day);
    const dateStr = formatDateISO(cellDate);

    // Check if selected
    const isSelected = formatDateISO(activeDate) === dateStr;
    // Check if today
    const isToday = formatDateISO(today) === dateStr;

    // Find how many installations on this day
    const dayBookings = dbBookings.filter(b => b.scheduled_date === dateStr).sort((a, b) => {
      const aAfternoon = isAfternoon(a.scheduled_time);
      const bAfternoon = isAfternoon(b.scheduled_time);
      if (aAfternoon && !bAfternoon) return 1;
      if (!aAfternoon && bAfternoon) return -1;
      return 0;
    });
    const hasInstallations = dayBookings.length > 0;

    let underlineHtml = '';
    if (hasInstallations) {
      underlineHtml = '<div style="display:flex; justify-content:center; gap:2px; width:24px; position:absolute; bottom:6px; height:3px;">';
      dayBookings.forEach(b => {
        let doorsArr = [];
        if (typeof b.doors === 'string') {
          try { doorsArr = JSON.parse(b.doors); } catch(_) {}
        } else if (Array.isArray(b.doors)) {
          doorsArr = b.doors;
        }
        const isDone = doorsArr.length > 0 && doorsArr.every(d => d.completed);
        const hasUploadedMedia = doorsArr.length > 0 && doorsArr.every(d => d.media_urls && d.media_urls.length > 0);
        
        const isEvent = b.product_skus === 'Backjob' || b.product_skus === 'Ocular' || b.product_skus === 'Day off';
        let color = isAfternoon(b.scheduled_time) ? '#2563eb' : '#f97316'; // default blue/light orange
        if (isEvent) {
          color = '#991b1b'; // deep red for events
        } else if (isDone) {
          color = hasUploadedMedia ? '#22c55e' : '#eab308'; // green/yellow
        }
        underlineHtml += `<div style="flex:1; background:${color}; height:100%; border-radius:2.5px;"></div>`;
      });
      underlineHtml += '</div>';
    }

    const cellClass = `day-cell${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}${hasInstallations ? ' has-installations' : ''}`;
    
    container.insertAdjacentHTML('beforeend', `
      <div class="${cellClass}" onclick="selectDay(${day})">
        ${day}
        ${underlineHtml}
      </div>
    `);
  }
}

function selectDay(day) {
  activeDate = new Date(currentYear, currentMonth, day);
  drawCalendar();
  drawAgenda();
}

function drawAgenda() {
  const list = document.getElementById('agenda-list');
  const title = document.getElementById('agenda-header-title');
  const dateStr = formatDateISO(activeDate);
  
  const friendlyDate = activeDate.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  title.innerText = `Installations for ${friendlyDate}`;
  list.innerHTML = '';

  const dayBookings = dbBookings.filter(b => b.scheduled_date === dateStr).sort((a, b) => {
    const aAfternoon = isAfternoon(a.scheduled_time);
    const bAfternoon = isAfternoon(b.scheduled_time);
    if (aAfternoon && !bAfternoon) return 1;
    if (!aAfternoon && bAfternoon) return -1;
    return 0;
  });

  if (dayBookings.length === 0) {
    list.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 2rem 0; font-size:0.88rem;">No installations scheduled for this day.</div>';
    return;
  }

  dayBookings.forEach(b => {
    const addressParts = (b.customer_address || '').split(',');
    const cityStr = addressParts.length >= 2 ? addressParts[addressParts.length - 2].trim() : 'N/A';
    const timeVal = b.scheduled_time || 'AM Slot';

    let doorsArr = [];
    if (typeof b.doors === 'string') {
      try { doorsArr = JSON.parse(b.doors); } catch(_) {}
    } else if (Array.isArray(b.doors)) {
      doorsArr = b.doors;
    }

    let productsArr = [];
    if (typeof b.products === 'string') {
      try { productsArr = JSON.parse(b.products); } catch(_) {}
    } else if (Array.isArray(b.products)) {
      productsArr = b.products;
    }
    const skus = (b.product_skus || '').split(' | ');
    const names = (b.product_names || '').split(' | ');

    const hardwareProducts = productsArr.filter(p => p.sku !== 'ADD-ON LABOR');
    const hardwareSkus = skus.filter(s => s.trim() !== 'ADD-ON LABOR');
    const hardwareNames = names.filter(n => n.trim() !== 'ADD-ON LABOR');
    
    const anyDoorHasAttachedProducts = doorsArr.some(d => Array.isArray(d.products) && d.products.length > 0);

    const agendaRowCount = (doorsArr.length === 1)
      ? 1
      : (anyDoorHasAttachedProducts 
          ? doorsArr.length 
          : Math.max(doorsArr.length, hardwareProducts.length, hardwareSkus.length));

    const lines = [];
    for (let i = 0; i < agendaRowCount; i++) {
      const door = doorsArr[i];
      
      let sku = '';
      let isCancelled = false;

      if (anyDoorHasAttachedProducts) {
        const attachedSkusList = door?.products || [];
        sku = attachedSkusList.join(', ') || 'N/A';
        isCancelled = attachedSkusList.length > 0 && attachedSkusList.every(itemSku => {
          const pMatch = productsArr.find(p => p.sku === itemSku);
          return pMatch?.cancelled || false;
        });
      } else if (doorsArr.length === 1) {
        const allSkusList = hardwareProducts.length > 0 ? hardwareProducts.map(p => p.sku) : hardwareSkus;
        sku = allSkusList.join(', ') || 'N/A';
        isCancelled = hardwareProducts.length > 0 && hardwareProducts.every(p => p.cancelled || false);
      } else {
        const currentSku = hardwareProducts[i]?.sku || hardwareSkus[i] || 'N/A';
        sku = currentSku;
        isCancelled = hardwareProducts[i]?.cancelled || false;
      }

      if (isCancelled) continue; // Skip cancelled products from being counted as active installations

      let doorInstallers = [];
      if (door && Array.isArray(door.installers)) {
        doorInstallers = door.installers;
      } else {
        if (b.installers) {
          if (typeof b.installers === 'string') {
            try { doorInstallers = JSON.parse(b.installers); } catch(_) {}
          } else if (Array.isArray(b.installers)) {
            doorInstallers = b.installers;
          }
        } else if (b.installer_name) {
          doorInstallers = b.installer_name.split(' | ').map(name => ({ name }));
        }
      }
      const installersText = doorInstallers.length > 0 
        ? doorInstallers.map(inst => {
            const name = formatInstallerName(inst.name || inst);
            return inst.role ? `[${inst.role.charAt(0).toUpperCase() + inst.role.slice(1)}] ${name}` : name;
          }).join(', ')
        : 'Unassigned';

      const doorDone = door?.completed || false;
      const statusIcon = doorDone 
        ? `<svg viewBox="0 0 24 24" style="width: 0.85em; height: 0.85em; fill: none; stroke: var(--success); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; display: inline-block; vertical-align: middle; margin-right: 0.25rem;"><polyline points="20 6 9 17 4 12"/></svg>`
        : `<span style="color: var(--text-muted); margin-right: 0.35rem; font-weight: 700; display: inline-block; vertical-align: middle;">—</span>`;

      lines.push(`
        <div style="display: flex; align-items: center; margin-bottom: 0.15rem; line-height: 1.25;">
          ${statusIcon}
          <span>${escapeHtml(installersText)} - ${escapeHtml(sku)}</span>
        </div>
      `);
    }
    const installerSkuListHtml = lines.length > 0 ? lines.join('') : 'Smart Lock Service';


    const isDone = doorsArr.length > 0 && doorsArr.every(d => {
      const attachedSkus = d.products || [];
      const allProductsCancelled = attachedSkus.length > 0 && attachedSkus.every(sku => {
        const matchedProd = productsArr.find(p => p.sku === sku);
        return matchedProd ? !!matchedProd.cancelled : false;
      });
      return d.completed || allProductsCancelled;
    });

    const hasMedia = doorsArr.some(d => {
      const attachedSkus = d.products || [];
      const allProductsCancelled = attachedSkus.length > 0 && attachedSkus.every(sku => {
        const matchedProd = productsArr.find(p => p.sku === sku);
        return matchedProd ? !!matchedProd.cancelled : false;
      });
      return (d.media_urls && d.media_urls.length > 0) || allProductsCancelled;
    });

    const isEvent = b.product_skus === 'Backjob' || b.product_skus === 'Ocular' || b.product_skus === 'Day off';
    const hasCompleteMedia = doorsArr.length > 0 && doorsArr.every(d => {
      const attachedSkus = d.products || [];
      const allProductsCancelled = attachedSkus.length > 0 && attachedSkus.every(sku => {
        const matchedProd = productsArr.find(p => p.sku === sku);
        return matchedProd ? !!matchedProd.cancelled : false;
      });
      if (allProductsCancelled) return true;

      if (isEvent || !bookingMediaRequirements || bookingMediaRequirements.length === 0) {
        return d.media_urls && d.media_urls.length > 0;
      }
      return bookingMediaRequirements.every(req => {
        if (req.label === 'Work Permit' && !b.needs_work_permit) {
          return true;
        }
        return d.required_media && d.required_media[req.label];
      });
    });

    const isDayOff = b.product_skus === 'Day off';
    let cardClass = isDayOff ? 'booking-card day-off' : (isAfternoon(timeVal) ? 'booking-card afternoon' : 'booking-card morning');
    if (isDone) {
      cardClass += ' completed-booking';
    }
    if (isDone && hasCompleteMedia) {
      cardClass += ' all-media-done';
    }

    let badgesHtml = '';
    if (isDone || hasMedia) {
      badgesHtml = `<div style="display:flex; gap:0.35rem; align-items:center; margin-bottom:0.25rem;">`;
      if (isDone) {
        badgesHtml += `
          <div style="width:20px; height:20px; background:#22C55E; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; color:#fff;" title="Installation Done">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
        `;
      }
      if (hasMedia) {
        badgesHtml += `
          <div style="width:20px; height:20px; background:#22C55E; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; color:#fff;" title="Media Uploaded">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          </div>
        `;
      }
      badgesHtml += `</div>`;
    }

    const isDeviceReceived = deliveryBookingsMap[b.order_no] === 'delivered';
    let deviceBadgeHtml = '';
    if (isDeviceReceived) {
      deviceBadgeHtml = `
        <span style="font-size:0.68rem; font-weight:700; background:#F97316; color:#fff; padding:0.15rem 0.4rem; border-radius:4px; text-transform:uppercase; letter-spacing:0.02em; line-height:1.2;">
          Device Received
        </span>
      `;
    }

    list.insertAdjacentHTML('beforeend', `
      <div class="${cardClass}" onclick="openDetailsModal('${b.id}')">
        <div class="booking-card-top">
          <span class="booking-time">${escapeHtml(timeVal)}</span>
          ${deviceBadgeHtml}
        </div>
        ${badgesHtml}
        <div class="booking-client">${escapeHtml((isEvent && (!b.customer_name || b.customer_name.toLowerCase() === 'none')) ? b.product_skus : b.customer_name)}</div>
        <div class="booking-city">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          ${escapeHtml(cityStr)}
        </div>
        <div class="booking-details-summary">
          ${installerSkuListHtml}
        </div>
      </div>
    `);
  });
}

// --- Modal Sheets & Lightbox ---
function openDetailsModal(bookingId) {
  const b = dbBookings.find(booking => booking.id === bookingId);
  if (!b) return;

  selectedBooking = b;

  const isDeviceReceived = deliveryBookingsMap[b.order_no] === 'delivered';
  const badgeEl = document.getElementById('det-device-received-badge');
  if (badgeEl) {
    badgeEl.style.display = isDeviceReceived ? 'inline-block' : 'none';
  }

  document.getElementById('det-date').innerText = b.scheduled_date ? formatDateFriendly(b.scheduled_date) : 'N/A';
  document.getElementById('det-time').innerText = b.scheduled_time || 'AM Slot';
  document.getElementById('det-name').innerText = b.customer_name || 'N/A';
  document.getElementById('det-phone').innerText = b.customer_phone || 'N/A';
  
  const addressParts = (b.customer_address || '').split(',').map(p => p.trim());
  let location = 'N/A';
  let cleanAddress = b.customer_address || 'N/A';

  if (addressParts.length >= 2) {
    const lastPart = addressParts[addressParts.length - 1];
    const cleanProvince = lastPart.replace(/\s*\d+$/, '').trim(); 
    const cityPart = addressParts[addressParts.length - 2];
    
    location = `${cityPart}, ${cleanProvince}`;

    const streetParts = addressParts.slice(0, -2);
    if (streetParts.length > 0) {
      cleanAddress = streetParts.join(', ');
    }
  }
  
  document.getElementById('det-location').innerText = location;
  document.getElementById('det-address').innerText = cleanAddress;

  const mapPinEl = document.getElementById('det-map-pin');
  if (b.google_map_pin_url) {
    mapPinEl.innerHTML = `<a href="${b.google_map_pin_url}" target="_blank">Open Google Maps Pin ↗</a>`;
  } else {
    mapPinEl.innerText = 'No link provided';
  }

  document.getElementById('det-notes').innerText = b.notes || 'N/A';

  const grandTotalVal = b.grand_total || 0;
  const collectTotalGroup = document.getElementById('det-collect-total-group');
  if (collectTotalGroup) {
    if (b.show_total_to_installers !== false) {
      collectTotalGroup.style.display = 'flex';
      document.getElementById('det-collect-total').innerText = (grandTotalVal / 100).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
    } else {
      collectTotalGroup.style.display = 'none';
    }
  }

  // Attachments frontage & map
  const attachmentsGroup = document.getElementById('det-attachments-group');
  const frontageCard = document.getElementById('det-frontage-card');
  const frontageImg = document.getElementById('det-frontage-img');
  const mapCard = document.getElementById('det-map-card');
  const mapImg = document.getElementById('det-map-img');
  const permitCard = document.getElementById('det-permit-card');
  const permitImg = document.getElementById('det-permit-img');

  let hasAttachments = false;

  if (b.frontage_image_url) {
    frontageCard.style.display = 'flex';
    frontageImg.src = b.frontage_image_url;
    hasAttachments = true;
  } else {
    frontageCard.style.display = 'none';
  }

  if (b.map_image_url) {
    mapCard.style.display = 'flex';
    mapImg.src = b.map_image_url;
    hasAttachments = true;
  } else {
    mapCard.style.display = 'none';
  }

  if (b.work_permit_image_url) {
    permitCard.style.display = 'flex';
    permitImg.src = b.work_permit_image_url;
    hasAttachments = true;
  } else {
    permitCard.style.display = 'none';
  }

  if (attachmentsGroup) {
    attachmentsGroup.style.display = hasAttachments ? 'flex' : 'none';
  }

  // Parse doors specifications
  const doorsContainer = document.getElementById('det-doors-container');
  doorsContainer.innerHTML = '';

  let doorsArr = [];
  if (typeof b.doors === 'string') {
    try { doorsArr = JSON.parse(b.doors); } catch(_) {}
  } else if (Array.isArray(b.doors)) {
    doorsArr = b.doors;
  }

  let productsArr = [];
  if (typeof b.products === 'string') {
    try { productsArr = JSON.parse(b.products); } catch(_) {}
  } else if (Array.isArray(b.products)) {
    productsArr = b.products;
  }

  const skus = (b.product_skus || '').split(' | ');
  const names = (b.product_names || '').split(' | ');

  const hardwareProducts = productsArr.filter(p => p.sku !== 'ADD-ON LABOR');
  const hardwareSkus = skus.filter(s => s.trim() !== 'ADD-ON LABOR');
  const hardwareNames = names.filter(n => n.trim() !== 'ADD-ON LABOR');

  // Check if any door has attached products (new style)
  const anyDoorHasAttachedProducts = doorsArr.some(d => Array.isArray(d.products) && d.products.length > 0);

  const rowCount = (doorsArr.length === 1)
    ? 1
    : (anyDoorHasAttachedProducts 
        ? doorsArr.length 
        : Math.max(doorsArr.length, hardwareProducts.length, hardwareSkus.length));

  if (rowCount === 0) {
    doorsContainer.innerHTML = '<span style="color:var(--text-muted); font-size:0.82rem;">No specifications found.</span>';
  } else {
    for (let i = 0; i < rowCount; i++) {
      const door = doorsArr[i];
      
      let sku = '';
      let titleHtml = '';
      let isCancelled = false;

      if (anyDoorHasAttachedProducts) {
        const attachedSkusList = door?.products || [];
        sku = attachedSkusList.join(', ') || 'N/A';
        const doorTitles = attachedSkusList.map(itemSku => {
          const pMatch = productsArr.find(p => p.sku === itemSku);
          let t = itemSku;
          if (pMatch) {
            t = pMatch.name || pMatch.title || itemSku;
          } else {
            const idx = skus.indexOf(itemSku);
            if (idx !== -1) {
              t = names[idx] || itemSku;
            }
          }
          return `<strong>${escapeHtml(itemSku)}</strong> - ${escapeHtml(t)}`;
        });
        titleHtml = doorTitles.map(tHtml => `<div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.4rem;">${tHtml}</div>`).join('');
        isCancelled = attachedSkusList.length > 0 && attachedSkusList.every(itemSku => {
          const pMatch = productsArr.find(p => p.sku === itemSku);
          return pMatch?.cancelled || false;
        });
      } else if (doorsArr.length === 1) {
        // Combine all products to Door 1
        const allSkusList = hardwareProducts.length > 0 ? hardwareProducts.map(p => p.sku) : hardwareSkus;
        sku = allSkusList.join(', ') || 'N/A';
        
        const doorTitles = allSkusList.map(itemSku => {
          const pMatch = productsArr.find(p => p.sku === itemSku);
          let t = itemSku;
          if (pMatch) {
            t = pMatch.title || pMatch.name || itemSku;
          } else {
            const idx = skus.indexOf(itemSku);
            if (idx !== -1) {
              t = names[idx] || itemSku;
            }
          }
          return `<strong>${escapeHtml(itemSku)}</strong> - ${escapeHtml(t)}`;
        });
        
        titleHtml = doorTitles.map(tHtml => `<div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.4rem;">${tHtml}</div>`).join('');
        isCancelled = hardwareProducts.length > 0 && hardwareProducts.every(p => p.cancelled || false);
      } else {
        const currentSku = hardwareProducts[i]?.sku || hardwareSkus[i] || 'N/A';
        sku = currentSku;
        let currentTitle = hardwareProducts[i]?.title || hardwareNames[i] || 'N/A';
        if (currentTitle === 'N/A' || currentTitle === currentSku) {
          currentTitle = '';
        }
        titleHtml = `<div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.4rem;"><strong>${escapeHtml(sku)}</strong>${currentTitle ? ` - ${escapeHtml(currentTitle)}` : ''}</div>`;
        isCancelled = hardwareProducts[i]?.cancelled || false;
      }

      const doorMaterial = door?.doorMaterial || 'N/A';
      const jambMaterial = door?.jambMaterial || 'N/A';
      const swing = door?.swing || 'N/A';

      // Photo thumbnails
      let photosHtml = '';
      if (door?.photos && door.photos.length > 0) {
        photosHtml = `
          <div class="photo-strip">
            ${door.photos.map(url => `
              <img class="photo-thumb" src="${url}" alt="Door Photo" onclick="openLightbox('${url}')" />
            `).join('')}
          </div>
        `;
      }

      let doorInstallers = [];
      if (door && Array.isArray(door.installers)) {
        doorInstallers = door.installers;
      } else {
        if (b.installers) {
          if (typeof b.installers === 'string') {
            try { doorInstallers = JSON.parse(b.installers); } catch(_) {}
          } else if (Array.isArray(b.installers)) {
            doorInstallers = b.installers;
          }
        } else if (b.installer_name) {
          doorInstallers = b.installer_name.split(' | ').map(name => ({ name }));
        }
      }
      const assignedText = doorInstallers.length > 0 
        ? doorInstallers.map(inst => formatInstallerName(inst.name || inst)).join(', ') 
        : 'Unassigned';

      const isAssignedToThisDoor = doorInstallers.some(inst => {
        if (inst.id === currentInstaller.id) return true;
        const cleanInstallerName = `${currentInstaller.first_name} ${currentInstaller.last_name}`.trim().toLowerCase();
        const cleanInstName = (inst.name || '').trim().toLowerCase();
        if (cleanInstName && (cleanInstallerName.includes(cleanInstName) || cleanInstName.includes(cleanInstallerName))) return true;
        return false;
      });

      // Check if this specific door has addon labor
      const doorHasAddonLabor = productsArr.some(p => p.sku === 'ADD-ON LABOR' && (p.doorIndex === i || (p.doorIndex === undefined && i === 0)));

      const doorCardClass = isCancelled 
        ? 'door-specs-card unassigned' 
        : (isAssignedToThisDoor ? 'door-specs-card assigned' : 'door-specs-card unassigned');
      
      const cardStyle = isCancelled ? 'opacity: 0.6;' : '';

      let doneButtonHtml = '';
      if (isCancelled) {
        doneButtonHtml = `
          <div style="position: absolute; top: 0.85rem; right: 1rem; display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-end;">
            <span style="font-size: 0.83rem; font-weight: 700; background: var(--danger); color: #fff; padding: 0.3rem 0.7rem; border-radius: var(--radius-sm); text-transform: uppercase;">Cancelled</span>
          </div>
        `;
      } else if (isAssignedToThisDoor) {
        const isEvent = selectedBooking.product_skus === 'Backjob' || selectedBooking.product_skus === 'Ocular' || selectedBooking.product_skus === 'Day off';
        if (door?.completed) {
          doneButtonHtml = `
            <div style="position: absolute; top: 0.85rem; right: 1rem; display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-end;">
              <span style="font-size: 0.83rem; font-weight: 700; background: #6b7280; color: #fff; padding: 0.3rem 0.7rem; border-radius: var(--radius-sm); text-transform: uppercase; display:inline-flex; align-items:center; gap:0.25rem;"><svg aria-hidden="true" viewBox="0 0 24 24" style="width:1em;height:1em;display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><polyline points="20 6 9 17 4 12"/></svg>Completed</span>
              <button type="button" class="btn btn-sm" style="width: auto; font-size: 0.83rem; padding: 0.3rem 0.7rem; border-radius: var(--radius-sm); background: var(--cyan); color: #fff; border: none; cursor: pointer;" onclick="openUploadModal(${i})">Upload Media</button>
            </div>
          `;
        } else {
          const clickAction = isEvent ? `markEventDoorDone(${i}, this)` : `openChecklistModal(${i})`;
          doneButtonHtml = `
            <div style="position: absolute; top: 0.85rem; right: 1rem; display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-end;">
              <button type="button" class="btn btn-sm" style="width: auto; font-size: 0.83rem; padding: 0.3rem 0.7rem; border-radius: var(--radius-sm); background: var(--success); color: #fff; border: none; cursor: pointer;" onclick="${clickAction}">Done</button>
            </div>
          `;
        }
      }

      let addonLaborBottomHtml = '';
      if (doorHasAddonLabor) {
        addonLaborBottomHtml = `
          <div style="margin-top: 0.5rem; display: flex; justify-content: flex-end; align-items: center;">
            <span style="font-size: 0.68rem; font-weight: 700; background: #FEF08A; color: #854D0E; padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); text-transform: uppercase; letter-spacing: 0.05em; display: inline-flex; align-items: center;">
              Added Labor
            </span>
          </div>
        `;
      } else if (isAssignedToThisDoor && !isCancelled) {
        addonLaborBottomHtml = `
          <div style="margin-top: 0.5rem; display: flex; justify-content: flex-end; align-items: center;">
            <button type="button" class="btn btn-sm" style="width: auto; font-size: 0.83rem; padding: 0.3rem 0.7rem; border-radius: var(--radius-sm); background: var(--cyan-light); color: #fff; border: none; cursor: pointer;" onclick="promptAddLabor(${i})">Add Labor</button>
          </div>
        `;
      }

      let signatureHtml = '';
      if (door?.completed && door.signature) {
        signatureHtml = `
          <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.2rem;">
            <span class="info-lbl" style="font-size:0.6rem;">Customer Signature Logged</span>
            <img src="${door.signature}" alt="Customer Signature" style="max-height: 40px; width: auto; align-self: flex-start; background: #fff; border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer;" onclick="openChecklistModal(${i}, true)" />
          </div>
        `;
      }

      let finishedMediaHtml = '';
      const mediaUrls = (door?.media_urls && door.media_urls.length > 0) ? door.media_urls : [];
      let mediaStripHtml = '';
      if (mediaUrls.length > 0) {
        mediaStripHtml = `
          <div class="photo-strip">
            ${mediaUrls.map(url => {
              const isVid = /\.(mp4|mov|webm)(\?|$)/i.test(url);
              if (isVid) {
                return `
                  <div class="photo-thumb" style="display:flex; align-items:center; justify-content:center; background:#000; color:#fff; cursor:pointer; position:relative; width: 70px; height: 70px; border-radius: var(--radius-sm); border: 1px solid var(--border);" onclick="openLightbox('${url}')">
                    <svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:currentColor;stroke:none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </div>
                `;
              } else {
                return `<img class="photo-thumb" src="${url}" alt="Finished Media" onclick="openLightbox('${url}')" />`;
              }
            }).join('')}
          </div>
        `;
      } else {
        mediaStripHtml = `<div style="font-size:0.75rem; color:var(--text-muted); text-align:center; padding:0.25rem 0; font-weight:normal;">No media uploaded yet.</div>`;
      }

      finishedMediaHtml = `
        <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.3rem;">
          <span class="info-lbl" style="font-size:0.65rem;">Installer Uploaded Media</span>
          ${mediaStripHtml}
        </div>
      `;

      doorsContainer.insertAdjacentHTML('beforeend', `
        <div class="${doorCardClass}" style="${cardStyle}">
          ${doneButtonHtml}
          <div style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.25rem; letter-spacing: 0.05em;">
            ${escapeHtml(assignedText)}
          </div>
          <h5>Door ${i + 1}</h5>
          ${titleHtml}
          <div class="door-details-grid">
            <div>
              <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase;">Door</div>
              <strong>${escapeHtml(doorMaterial)}</strong>
            </div>
            <div>
              <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase;">Jamb</div>
              <strong>${escapeHtml(jambMaterial)}</strong>
            </div>
            <div>
              <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase;">Swing</div>
              <strong>${escapeHtml(swing)}</strong>
            </div>
          </div>
          ${photosHtml}
          ${signatureHtml}
          ${finishedMediaHtml}
          ${addonLaborBottomHtml}
        </div>
      `);
    }
  }

  document.getElementById('details-modal').style.display = 'flex';
}

function closeDetailsModal() {
  document.getElementById('details-modal').style.display = 'none';
}

window.openLightbox = function(url) {
  const modal = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-img');
  const vid = document.getElementById('lightbox-video');
  
  const isVid = /\.(mp4|mov|webm)(\?|$)/i.test(url);
  if (isVid) {
    img.style.display = 'none';
    img.src = '';
    vid.src = url;
    vid.style.display = 'block';
  } else {
    vid.style.display = 'none';
    vid.src = '';
    img.src = url;
    img.style.display = 'block';
  }
  modal.style.display = 'flex';
};

window.closeLightbox = function() {
  const modal = document.getElementById('lightbox-modal');
  modal.style.display = 'none';
  const vid = document.getElementById('lightbox-video');
  if (vid) {
    vid.pause();
    vid.src = '';
  }
};

// --- Helper Formatters ---
function formatDateISO(dateObj) {
  const y = dateObj.getFullYear();
  const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const d = dateObj.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isAfternoon(timeStr) {
  if (!timeStr) return false;
  const lower = timeStr.toLowerCase();
  return lower.includes('pm') || lower.includes('afternoon');
}

function formatDateFriendly(dateStr) {
  const date = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatInstallerName(nameStr) {
  if (!nameStr) return 'None Assigned';
  if (typeof nameStr !== 'string') {
    nameStr = nameStr.name || '';
  }
  if (!nameStr) return 'None Assigned';
  const delimiter = nameStr.includes('|') ? '|' : (nameStr.includes(',') ? ',' : null);
  if (delimiter) {
    return nameStr.split(delimiter)
      .map(n => formatInstallerName(n.trim()))
      .filter(Boolean)
      .join(', ');
  }
  let cleaned = nameStr.replace(/\s*\([^)]*\)/g, '').trim();
  if (!cleaned) return '';
  const parts = cleaned.split(/\s+/);
  if (parts.length <= 1) return cleaned;
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  const initial = lastName ? ` ${lastName.charAt(0).toUpperCase()}.` : '';
  return `${firstName}${initial}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- Checklist & Signature Canvas Verification ---
let canvas, ctx;
let isDrawing = false;
let signatureIndex = null;

function initSignatureCanvas() {
  canvas = document.getElementById('signature-canvas');
  if (!canvas) return;

  canvas.width = canvas.offsetWidth || canvas.parentElement.clientWidth || 380;
  canvas.height = canvas.offsetHeight || 130;

  ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#09090B';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);

  canvas.addEventListener('touchstart', startDrawingTouch);
  canvas.addEventListener('touchmove', drawTouch);
  canvas.addEventListener('touchend', stopDrawing);

  isDrawing = false;
}

function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function getTouchPos(e) {
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches[0];
  return {
    x: (touch.clientX - rect.left) * (canvas.width / rect.width),
    y: (touch.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function startDrawing(e) {
  isDrawing = true;
  const pos = getMousePos(e);
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  e.preventDefault();
}

function startDrawingTouch(e) {
  isDrawing = true;
  const pos = getTouchPos(e);
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  e.preventDefault();
}

function draw(e) {
  if (!isDrawing) return;
  const pos = getMousePos(e);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  e.preventDefault();
  validateChecklist();
}

function drawTouch(e) {
  if (!isDrawing) return;
  const pos = getTouchPos(e);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  e.preventDefault();
  validateChecklist();
}

function stopDrawing() {
  isDrawing = false;
}

window.clearSignature = function() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  validateChecklist();
}

function isCanvasBlank() {
  if (!canvas) return true;
  const blank = document.createElement('canvas');
  blank.width = canvas.width;
  blank.height = canvas.height;
  return canvas.toDataURL() === blank.toDataURL();
}

window.validateChecklist = function() {
  const checkboxes = document.querySelectorAll('.checklist-item');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  const signed = !isCanvasBlank();

  const submitBtn = document.getElementById('btn-submit-checklist');
  if (submitBtn) {
    submitBtn.disabled = !(allChecked && signed);
  }
}

window.markEventDoorDone = async function(doorIndex, buttonEl) {
  if (!selectedBooking) return;
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.innerText = 'Completing...';
  }

  try {
    // Fetch fresh doors array from DB first to prevent concurrent overwrite
    const { data: freshBooking, error: fetchErr } = await sb
      .from('installation_bookings')
      .select('doors')
      .eq('id', selectedBooking.id)
      .single();

    if (fetchErr) throw fetchErr;

    let doorsArr = [];
    if (freshBooking && freshBooking.doors) {
      if (typeof freshBooking.doors === 'string') {
        try { doorsArr = JSON.parse(freshBooking.doors); } catch(_) {}
      } else if (Array.isArray(freshBooking.doors)) {
        doorsArr = freshBooking.doors;
      }
    }

    while (doorsArr.length <= doorIndex) {
      doorsArr.push({
        doorMaterial: 'N/A',
        jambMaterial: 'N/A',
        swing: 'N/A',
        completed: false,
        signature: null,
        media_urls: []
      });
    }

    const door = doorsArr[doorIndex];
    if (!door) return;

    door.completed = true;
    door.completed_at = new Date().toISOString();
    door.signature = null;
    door.checklist = [];

    const isDone = doorsArr.length > 0 && doorsArr.every(d => d.completed);
    const updatePayload = { doors: doorsArr };
    if (isDone) {
      updatePayload.status = 'completed';
    }

    const { error } = await sb
      .from('installation_bookings')
      .update(updatePayload)
      .eq('id', selectedBooking.id);

    if (error) throw error;

    const idx = dbBookings.findIndex(b => b.id === selectedBooking.id);
    if (idx !== -1) {
      dbBookings[idx].doors = doorsArr;
      selectedBooking.doors = doorsArr;
    }

    localStorage.setItem(`bk_cache_${currentInstaller.id}`, JSON.stringify({
      data: dbBookings,
      timestamp: new Date().toISOString()
    }));

    showToast('Event marked as completed.');
    openDetailsModal(selectedBooking.id); // Refresh details modal
    drawAgenda(); // Refresh lists
  } catch (err) {
    console.error('Failed to complete event:', err);
    showToast('Failed to complete: ' + err.message, true);
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.innerText = 'Done';
    }
  }
};

window.openChecklistModal = function(doorIndex, isReadOnly = false) {
  signatureIndex = doorIndex;
  
  // Add stacked-under visual effect to details modal
  const detModal = document.getElementById('details-modal');
  if (detModal) {
    detModal.classList.add('stacked-under');
  }

  // Populate customer name and installation date
  const custNameEl = document.getElementById('checklist-customer-name');
  const instDateEl = document.getElementById('checklist-install-date');
  
  let doorsArr = [];
  if (selectedBooking) {
    if (typeof selectedBooking.doors === 'string') {
      try { doorsArr = JSON.parse(selectedBooking.doors); } catch(_) {}
    } else if (Array.isArray(selectedBooking.doors)) {
      doorsArr = selectedBooking.doors;
    }
  }
  const door = doorsArr[doorIndex];

  if (custNameEl && selectedBooking) {
    custNameEl.innerText = selectedBooking.customer_name || 'N/A';
  }

  if (isReadOnly && door && door.completed_at) {
    if (instDateEl) {
      instDateEl.innerText = formatDateFriendly(door.completed_at);
    }
  } else {
    if (instDateEl && selectedBooking) {
      instDateEl.innerText = selectedBooking.scheduled_date ? formatDateFriendly(selectedBooking.scheduled_date) : 'N/A';
    }
  }

  const checklistContainer = document.getElementById('checklist-items-container');
  if (checklistContainer) {
    if (isReadOnly && door && Array.isArray(door.checklist)) {
      checklistContainer.innerHTML = door.checklist.map(ch => {
        return `
          <label style="display:flex; align-items:flex-start; gap:0.55rem; cursor:pointer;${ch.indent ? ' margin-left:1.2rem;' : ''}">
            <input type="checkbox" class="checklist-item" style="margin-top:0.15rem;" ${ch.checked ? 'checked' : ''} disabled />
            <span>${escapeHtml(ch.item || '')}</span>
          </label>
        `;
      }).join('');
    } else {
      checklistContainer.innerHTML = bookingChecklist.map((ch, idx) => {
        return `
          <label style="display:flex; align-items:flex-start; gap:0.55rem; cursor:pointer;${ch.indent ? ' margin-left:1.2rem;' : ''}">
            <input type="checkbox" class="checklist-item" style="margin-top:0.15rem;" onchange="validateChecklist()" />
            <span>${escapeHtml(ch.text || '')}</span>
          </label>
        `;
      }).join('');
    }
  }

  document.getElementById('checklist-modal').style.display = 'flex';

  const canvasEl = document.getElementById('signature-canvas');
  const previewImgEl = document.getElementById('signature-preview-img');
  const actionsEl = document.getElementById('checklist-actions');
  const viewActionsEl = document.getElementById('checklist-view-actions');

  if (isReadOnly && door && door.signature) {
    if (canvasEl) canvasEl.style.display = 'none';
    if (previewImgEl) {
      previewImgEl.src = door.signature;
      previewImgEl.style.display = 'block';
    }
    if (actionsEl) actionsEl.style.display = 'none';
    if (viewActionsEl) viewActionsEl.style.display = 'flex';
  } else {
    if (canvasEl) canvasEl.style.display = 'block';
    if (previewImgEl) {
      previewImgEl.src = '';
      previewImgEl.style.display = 'none';
    }
    if (actionsEl) actionsEl.style.display = 'flex';
    if (viewActionsEl) viewActionsEl.style.display = 'none';

     const submitBtn = document.getElementById('btn-submit-checklist');
     if (submitBtn) {
       submitBtn.innerHTML = 'Submit';
       submitBtn.style.background = 'var(--success)';
       submitBtn.style.borderColor = 'var(--success)';
       submitBtn.style.color = '#fff';
     }

    setTimeout(() => {
      initSignatureCanvas();
      clearSignature();
    }, 150);
  }
};

window.closeChecklistModal = function() {
  document.getElementById('checklist-modal').style.display = 'none';
  
  // Remove stacked-under visual effect from details modal
  const detModal = document.getElementById('details-modal');
  if (detModal) {
    detModal.classList.remove('stacked-under');
  }

  // Re-enable checkboxes for future uses
  document.querySelectorAll('.checklist-item').forEach(cb => {
    cb.disabled = false;
  });

  signatureIndex = null;
};

window.submitChecklist = async function() {
  if (!selectedBooking || signatureIndex === null) return;
  
  const submitBtn = document.getElementById('btn-submit-checklist');
  submitBtn.disabled = true;
  submitBtn.innerText = 'Submitting...';

  try {
    // Fetch fresh doors array from DB first to prevent concurrent overwrite
    const { data: freshBooking, error: fetchErr } = await sb
      .from('installation_bookings')
      .select('doors')
      .eq('id', selectedBooking.id)
      .single();

    if (fetchErr) throw fetchErr;

    let doorsArr = [];
    if (freshBooking && freshBooking.doors) {
      if (typeof freshBooking.doors === 'string') {
        try { doorsArr = JSON.parse(freshBooking.doors); } catch(_) {}
      } else if (Array.isArray(freshBooking.doors)) {
        doorsArr = freshBooking.doors;
      }
    }

    while (doorsArr.length <= signatureIndex) {
      doorsArr.push({
        doorMaterial: 'N/A',
        jambMaterial: 'N/A',
        swing: 'N/A',
        completed: false,
        signature: null,
        media_urls: []
      });
    }

    const door = doorsArr[signatureIndex];
    if (!door) return;

    const dataUrl = canvas.toDataURL('image/png');

    door.completed = true;
    door.signature = dataUrl;
    door.completed_at = new Date().toISOString();
    door.checklist = Array.from(document.querySelectorAll('.checklist-item')).map((cb, idx) => {
      return {
        item: cb.nextElementSibling ? cb.nextElementSibling.innerText.trim() : '',
        checked: cb.checked,
        indent: bookingChecklist[idx]?.indent || false
      };
    });

    const isDone = doorsArr.length > 0 && doorsArr.every(d => d.completed);
    const updatePayload = { doors: doorsArr };
    if (isDone) {
      updatePayload.status = 'completed';
    }

    const { error } = await sb
      .from('installation_bookings')
      .update(updatePayload)
      .eq('id', selectedBooking.id);

    if (error) throw error;

    // Update local memory
    const idx = dbBookings.findIndex(b => b.id === selectedBooking.id);
    if (idx !== -1) {
      dbBookings[idx].doors = doorsArr;
      selectedBooking.doors = doorsArr;
    }

    // Cache update
    localStorage.setItem(`bk_cache_${currentInstaller.id}`, JSON.stringify({
      data: dbBookings,
      timestamp: new Date().toISOString()
    }));

    // Transition button to "Submitted" success state (green, checkmark)
    submitBtn.style.background = 'var(--success, #22C55E)';
    submitBtn.style.borderColor = 'var(--success, #22C55E)';
    submitBtn.style.color = '#fff';
    submitBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>Submitted`;

    showToast('Installation verified and marked as done.');
    
    setTimeout(() => {
      closeChecklistModal();
      openDetailsModal(selectedBooking.id); // Refresh details modal
      drawAgenda(); // Refresh lists
    }, 800);
  } catch (err) {
    console.error('Failed to submit done verification:', err);
    showToast('Submission failed: ' + err.message, true);
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Submit';
    submitBtn.style.background = 'var(--success)';
    submitBtn.style.borderColor = 'var(--success)';
    submitBtn.style.color = '#fff';
  }
};

function showToast(msg, isError = false) {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    document.body.appendChild(c);
  }
  const el = document.createElement('div');
  el.className = 'toast toast-' + (isError ? 'error' : 'success');
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// --- Media Upload Modal Logic ---
let uploadDoorIndex = null;
let slotFiles = {}; // idx -> { file: File, url: string, progress: number }
let otherFiles = []; // array of { name: string, url: string, progress: number }

function getActiveReqs() {
  if (!selectedBooking) return [];
  const isEvent = selectedBooking.product_skus === 'Backjob' || selectedBooking.product_skus === 'Ocular' || selectedBooking.product_skus === 'Day off';
  return (isEvent ? [] : bookingMediaRequirements).filter(req => {
    if (req.label === 'Work Permit' && !selectedBooking.needs_work_permit) return false;
    return true;
  });
}

window.openUploadModal = function(doorIndex) {
  uploadDoorIndex = doorIndex;
  slotFiles = {};
  otherFiles = [];

  let doorsArr = [];
  if (typeof selectedBooking.doors === 'string') {
    try { doorsArr = JSON.parse(selectedBooking.doors); } catch(_) {}
  } else if (Array.isArray(selectedBooking.doors)) {
    doorsArr = selectedBooking.doors;
  }
  const door = doorsArr[doorIndex];
  if (!door) return;

  // Populate existing required media from DB
  const activeReqs = getActiveReqs();
  if (door.required_media) {
    if (activeReqs && activeReqs.length > 0) {
      activeReqs.forEach((item, idx) => {
        const savedUrl = door.required_media[item.label];
        if (savedUrl) {
          slotFiles[idx] = { url: savedUrl, progress: 100 };
        }
      });
    }
  }

  // Populate existing other media from DB
  if (door.other_media && Array.isArray(door.other_media)) {
    door.other_media.forEach(url => {
      const fileName = url.split('/').pop().split('_').slice(1).join('_') || 'Uploaded Media';
      otherFiles.push({ name: fileName, url: url, progress: 100 });
    });
  }

  document.getElementById('other-media-input').value = '';
  document.getElementById('btn-submit-upload').disabled = true;
  document.getElementById('upload-progress-container').style.display = 'none';

  // Render required media checklist dynamically
  renderRequiredMediaChecklist();
  renderOtherMediaList();
  validateAndToggleSubmit();
  
  const detModal = document.getElementById('details-modal');
  if (detModal) detModal.classList.add('stacked-under');
  
  document.getElementById('upload-modal').style.display = 'flex';
};

window.closeUploadModal = function() {
  document.getElementById('upload-modal').style.display = 'none';
  const detModal = document.getElementById('details-modal');
  if (detModal) detModal.classList.remove('stacked-under');
  uploadDoorIndex = null;
};

function renderRequiredMediaChecklist() {
  const container = document.getElementById('required-media-list');
  const section = document.getElementById('required-media-section');
  if (!container) return;

  const activeReqs = getActiveReqs();
  if (!activeReqs || activeReqs.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'flex';
  container.innerHTML = '';

  activeReqs.forEach((item, idx) => {
    const itemRow = document.createElement('div');

    let typeText = 'Img/Vid';
    let acceptTypes = 'image/png, image/jpeg, image/jpg, video/mp4, video/quicktime, .mov';
    if (item.type === 'image') {
      typeText = 'Img Only';
      acceptTypes = 'image/png, image/jpeg, image/jpg';
    } else if (item.type === 'video') {
      typeText = 'Vid Only';
      acceptTypes = 'video/mp4, video/quicktime, .mov';
    }

    const guideHtml = item.guide_url
      ? `<span onclick="event.stopPropagation(); openLightbox('${escapeHtml(item.guide_url)}')" style="display:inline-flex; align-items:center; color:var(--cyan-light); cursor:pointer; padding: 2px;" title="View Guide">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
         </span>`
      : '';

    const currentFile = slotFiles[idx];
    if (currentFile) {
      if (currentFile.progress < 100) {
        // Uploading state
        itemRow.innerHTML = `
          <div style="position:relative; aspect-ratio:1; display:flex; flex-direction:column; justify-content:space-between; padding:0.5rem; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-surface); overflow:hidden;">
            <div style="display:flex; justify-content:space-between; gap:0.25rem; align-items:flex-start;">
              <span style="font-size:0.72rem; font-weight:700; color:var(--text-primary); line-height:1.1; max-height:2.2em; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(item.label)}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.25rem; align-items:center; justify-content:center; flex:1;">
              <span style="font-size:0.68rem; font-weight:700; color:var(--text-secondary);">${currentFile.progress}%</span>
              <div style="width:80%; height:4px; background:var(--border); border-radius:2px; overflow:hidden;">
                <div style="width:${currentFile.progress}%; height:100%; background:var(--cyan); transition:width 0.15s;"></div>
              </div>
            </div>
          </div>
        `;
      } else {
        // Uploaded state
        const isImg = /\.(png|jpg|jpeg|gif|webp|heif|heic)(\?|$)/i.test(currentFile.url);
        const bgStyle = isImg 
          ? `background: linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.6)), url('${currentFile.url}') no-repeat center; background-size: cover;` 
          : `background: linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.7)), #111;`;
        
        const mediaPlayIcon = isImg ? '' : `
          <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); display:flex; align-items:center; justify-content:center; width:30px; height:30px; background:rgba(0,0,0,0.5); border-radius:50%; color:#fff; pointer-events:none;">
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;stroke:none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
        `;

        itemRow.innerHTML = `
          <div style="position:relative; aspect-ratio:1; display:flex; flex-direction:column; justify-content:space-between; padding:0.5rem; border:1px solid var(--border); border-radius:var(--radius-sm); ${bgStyle} overflow:hidden; cursor:pointer;" onclick="openLightbox('${currentFile.url}')">
            <button type="button" onclick="event.stopPropagation(); removeSlotFile(${idx});" style="position:absolute; top:4px; right:4px; width:20px; height:20px; border-radius:50%; background:rgba(220,53,69,0.95); border:none; color:#fff; font-size:0.85rem; font-weight:700; display:flex; align-items:center; justify-content:center; cursor:pointer; line-height:1; z-index:10; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">×</button>
            <div style="font-size:0.72rem; font-weight:700; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,0.8); line-height:1.1; max-height:2.2em; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; pointer-events:none;">${escapeHtml(item.label)}</div>
            ${mediaPlayIcon}
            <div style="font-size:0.65rem; color:rgba(255,255,255,0.8); font-weight:600; text-shadow:0 1px 2px rgba(0,0,0,0.8); pointer-events:none;">Uploaded</div>
          </div>
        `;
      }
    } else {
      // Empty / upload trigger state
      const guideBg = item.guide_url 
        ? `background: linear-gradient(rgba(255,255,255,0.85), rgba(255,255,255,0.85)), url('${item.guide_url}') no-repeat center; background-size: cover;`
        : `background: var(--bg-surface);`;

      itemRow.innerHTML = `
        <div style="position:relative; aspect-ratio:1; display:flex; flex-direction:column; justify-content:space-between; padding:0.5rem; border:1px dashed var(--border); border-radius:var(--radius-sm); ${guideBg} overflow:hidden; cursor:pointer;" onclick="document.getElementById('slot-file-input-${idx}').click()">
          <div style="display:flex; justify-content:space-between; gap:0.25rem; align-items:flex-start; z-index:2;">
            <span style="font-size:0.72rem; font-weight:700; color:var(--text-primary); line-height:1.1; max-height:2.2em; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; text-shadow:0 1px 2px rgba(255,255,255,0.8);">${escapeHtml(item.label)}</span>
            ${guideHtml}
          </div>
          <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; gap:0.15rem; color:var(--text-primary); z-index:2;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="filter:drop-shadow(0 1px 2px rgba(255,255,255,0.8));"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            <span style="font-size:0.68rem; font-weight:700; filter:drop-shadow(0 1px 2px rgba(255,255,255,0.8));">Upload</span>
          </div>
          <div style="font-size:0.62rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; z-index:2; text-shadow:0 1px 2px rgba(255,255,255,0.8);">${typeText}</div>
          <input type="file" id="slot-file-input-${idx}" style="display:none;" accept="${acceptTypes}" onchange="handleSlotFileSelect(event, ${idx})" />
        </div>
      `;
    }
    container.appendChild(itemRow.firstElementChild);
  });
}

window.handleSlotFileSelect = async function(event, idx) {
  const file = event.target.files[0];
  if (!file) return;

  const activeReqs = getActiveReqs();
  const requirement = activeReqs[idx];
  const lowerName = file.name.toLowerCase();

  // Type checking
  if (requirement.type === 'image') {
    const isImg = file.type.startsWith('image/') || lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg');
    if (!isImg) {
      showToast('Invalid file format. Image required.', true);
      event.target.value = '';
      return;
    }
  } else if (requirement.type === 'video') {
    const isVid = file.type.startsWith('video/') || lowerName.endsWith('.mp4') || lowerName.endsWith('.mov');
    if (!isVid) {
      showToast('Invalid file format. Video required.', true);
      event.target.value = '';
      return;
    }
  }

  // Video duration check (max 60 seconds)
  if (file.type.startsWith('video/') || lowerName.endsWith('.mp4') || lowerName.endsWith('.mov')) {
    const checkDuration = () => {
      return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        tempVideo.src = url;
        tempVideo.onloadedmetadata = function() {
          URL.revokeObjectURL(url);
          resolve(tempVideo.duration <= 60);
        };
      });
    };

    const isValidDuration = await checkDuration();
    if (!isValidDuration) {
      showToast('Required video must be 1 minute or less.', true);
      event.target.value = '';
      return;
    }
  }

  // Create local slot info and render progress immediately
  slotFiles[idx] = { file: file, progress: 0 };
  renderRequiredMediaChecklist();
  validateAndToggleSubmit();

  // Start automatic upload
  uploadSlotFile(idx);
};

async function uploadSlotFile(idx) {
  const slot = slotFiles[idx];
  if (!slot || !slot.file) return;

  const file = slot.file;
  const cleanCustomerName = (selectedBooking.customer_name || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
  const folderName = `${selectedBooking.id}_${cleanCustomerName}`;
  const ext = file.name.split('.').pop();
  const path = `companies/${currentInstaller.company_id}/reviews/finished_installations/${folderName}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  try {
    let progress = 0;
    const progressInterval = setInterval(() => {
      if (progress < 90) {
        progress += 10;
        if (slotFiles[idx]) {
          slotFiles[idx].progress = progress;
          renderRequiredMediaChecklist();
        }
      }
    }, 150);

    const { data, error } = await sb.storage.from('brightkey-assets').upload(path, file, {
      cacheControl: '3600',
      upsert: false
    });

    clearInterval(progressInterval);

    if (error) throw error;

    const { data: { publicUrl } } = sb.storage.from('brightkey-assets').getPublicUrl(path);

    slotFiles[idx] = { url: publicUrl, progress: 100 };
    renderRequiredMediaChecklist();

    await saveCurrentMediaState();
  } catch (err) {
    console.error(`Upload error for slot ${idx}:`, err);
    showToast(`Upload failed for ${file.name}: ${err.message}`, true);
    delete slotFiles[idx];
    renderRequiredMediaChecklist();
    validateAndToggleSubmit();
  }
}

window.removeSlotFile = async function(idx) {
  delete slotFiles[idx];
  renderRequiredMediaChecklist();
  await saveCurrentMediaState();
};

function renderOtherMediaList() {
  const container = document.getElementById('other-media-list');
  if (!container) return;
  container.innerHTML = '';

  otherFiles.forEach((file, idx) => {
    const itemRow = document.createElement('div');

    if (file.progress < 100) {
      // Uploading state
      itemRow.innerHTML = `
        <div style="position:relative; aspect-ratio:1; display:flex; flex-direction:column; justify-content:space-between; padding:0.5rem; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-surface); overflow:hidden;">
          <div style="font-size:0.72rem; font-weight:700; color:var(--text-primary); line-height:1.1; max-height:2.2em; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(file.name)}</div>
          <div style="display:flex; flex-direction:column; gap:0.25rem; align-items:center; justify-content:center; flex:1;">
            <span style="font-size:0.68rem; font-weight:700; color:var(--text-secondary);">${file.progress}%</span>
            <div style="width:80%; height:4px; background:var(--border); border-radius:2px; overflow:hidden;">
              <div style="width:${file.progress}%; height:100%; background:var(--cyan); transition:width 0.15s;"></div>
            </div>
          </div>
        </div>
      `;
    } else {
      // Uploaded state
      const isImg = /\.(png|jpg|jpeg|gif|webp|heif|heic)(\?|$)/i.test(file.url);
      const bgStyle = isImg 
        ? `background: linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.6)), url('${file.url}') no-repeat center; background-size: cover;` 
        : `background: linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.7)), #111;`;
      
      const mediaPlayIcon = isImg ? '' : `
        <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); display:flex; align-items:center; justify-content:center; width:30px; height:30px; background:rgba(0,0,0,0.5); border-radius:50%; color:#fff; pointer-events:none;">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;stroke:none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      `;

      itemRow.innerHTML = `
        <div style="position:relative; aspect-ratio:1; display:flex; flex-direction:column; justify-content:space-between; padding:0.5rem; border:1px solid var(--border); border-radius:var(--radius-sm); ${bgStyle} overflow:hidden; cursor:pointer;" onclick="openLightbox('${file.url}')">
          <button type="button" onclick="event.stopPropagation(); removeOtherFile(${idx});" style="position:absolute; top:4px; right:4px; width:20px; height:20px; border-radius:50%; background:rgba(220,53,69,0.95); border:none; color:#fff; font-size:0.85rem; font-weight:700; display:flex; align-items:center; justify-content:center; cursor:pointer; line-height:1; z-index:10; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">×</button>
          <div style="font-size:0.72rem; font-weight:700; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,0.8); line-height:1.1; max-height:2.2em; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; pointer-events:none;">${escapeHtml(file.name)}</div>
          ${mediaPlayIcon}
          <div style="font-size:0.65rem; color:rgba(255,255,255,0.8); font-weight:600; text-shadow:0 1px 2px rgba(0,0,0,0.8); pointer-events:none;">Uploaded</div>
        </div>
      `;
    }

    container.appendChild(itemRow.firstElementChild);
  });
}

window.handleOtherMediaSelect = async function(event) {
  const files = Array.from(event.target.files);
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'video/mp4', 'video/quicktime', '.mov'];

  for (const file of files) {
    if (otherFiles.length >= 5) {
      showToast('Maximum 5 other media files allowed.', true);
      break;
    }

    const lowerName = file.name.toLowerCase();
    const isAllowed = file.type.startsWith('image/') || file.type.startsWith('video/') ||
                      allowedTypes.some(ext => lowerName.endsWith(ext));

    if (!isAllowed) {
      showToast(`${file.name} format is not supported.`, true);
      continue;
    }

    if (file.type.startsWith('video/') || lowerName.endsWith('.mp4') || lowerName.endsWith('.mov')) {
      const checkDuration = () => {
        return new Promise((resolve) => {
          const url = URL.createObjectURL(file);
          const tempVideo = document.createElement('video');
          tempVideo.preload = 'metadata';
          tempVideo.src = url;
          tempVideo.onloadedmetadata = function() {
            URL.revokeObjectURL(url);
            resolve(tempVideo.duration <= 30);
          };
        });
      };

      const isValidDuration = await checkDuration();
      if (!isValidDuration) {
        showToast(`${file.name} exceeds 30 seconds limit for other videos.`, true);
        continue;
      }
    }

    const otherIdx = otherFiles.length;
    otherFiles.push({ name: file.name, progress: 0 });
    renderOtherMediaList();
    validateAndToggleSubmit();

    uploadOtherFile(file, otherIdx);
  }
};

async function uploadOtherFile(file, otherIdx) {
  const cleanCustomerName = (selectedBooking.customer_name || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
  const folderName = `${selectedBooking.id}_${cleanCustomerName}`;
  const ext = file.name.split('.').pop();
  const path = `companies/${currentInstaller.company_id}/reviews/finished_installations/${folderName}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  try {
    let progress = 0;
    const progressInterval = setInterval(() => {
      if (progress < 90) {
        progress += 10;
        if (otherFiles[otherIdx]) {
          otherFiles[otherIdx].progress = progress;
          renderOtherMediaList();
        }
      }
    }, 150);

    const { data, error } = await sb.storage.from('brightkey-assets').upload(path, file, {
      cacheControl: '3600',
      upsert: false
    });

    clearInterval(progressInterval);

    if (error) throw error;

    const { data: { publicUrl } } = sb.storage.from('brightkey-assets').getPublicUrl(path);

    if (otherFiles[otherIdx]) {
      otherFiles[otherIdx].url = publicUrl;
      otherFiles[otherIdx].progress = 100;
    }
    renderOtherMediaList();

    await saveCurrentMediaState();
  } catch (err) {
    console.error(`Upload error for other file ${otherIdx}:`, err);
    showToast(`Upload failed for ${file.name}: ${err.message}`, true);
    otherFiles.splice(otherIdx, 1);
    renderOtherMediaList();
    validateAndToggleSubmit();
  }
}

window.removeOtherFile = async function(idx) {
  otherFiles.splice(idx, 1);
  renderOtherMediaList();
  await saveCurrentMediaState();
};

function validateAndToggleSubmit() {
  const submitBtn = document.getElementById('btn-submit-upload');
  if (!submitBtn) return;

  const anySlotUploading = Object.values(slotFiles).some(slot => slot && slot.progress < 100);
  const anyOtherUploading = otherFiles.some(f => f.progress < 100);

  submitBtn.disabled = anySlotUploading || anyOtherUploading;
}

async function saveCurrentMediaState() {
  if (!selectedBooking || uploadDoorIndex === null) return;

  try {
    // Fetch fresh doors array from DB first to prevent concurrent overwrite
    const { data: freshBooking, error: fetchErr } = await sb
      .from('installation_bookings')
      .select('doors')
      .eq('id', selectedBooking.id)
      .single();

    if (fetchErr) throw fetchErr;

    let doorsArr = [];
    if (freshBooking && freshBooking.doors) {
      if (typeof freshBooking.doors === 'string') {
        try { doorsArr = JSON.parse(freshBooking.doors); } catch(_) {}
      } else if (Array.isArray(freshBooking.doors)) {
        doorsArr = freshBooking.doors;
      }
    }

    const door = doorsArr[uploadDoorIndex];
    if (!door) return;

    // 1. Build door.required_media
    const activeReqs = getActiveReqs();
    door.required_media = {};
    activeReqs.forEach((item, idx) => {
      const slot = slotFiles[idx];
      if (slot && slot.url) {
        door.required_media[item.label] = slot.url;
      }
    });

    // 2. Build door.other_media
    door.other_media = [];
    otherFiles.forEach(item => {
      if (item && item.url) {
        door.other_media.push(item.url);
      }
    });

    // 3. Maintain flat door.media_urls for downstream views compatibility
    door.media_urls = [
      ...Object.values(door.required_media),
      ...door.other_media
    ];

    const isDone = doorsArr.length > 0 && doorsArr.every(d => d.completed);
    const updatePayload = { doors: doorsArr };
    if (isDone) {
      updatePayload.status = 'completed';
    }

    const { error } = await sb
      .from('installation_bookings')
      .update(updatePayload)
      .eq('id', selectedBooking.id);

    if (error) throw error;

    const idx = dbBookings.findIndex(b => b.id === selectedBooking.id);
    if (idx !== -1) {
      dbBookings[idx].doors = doorsArr;
      selectedBooking.doors = doorsArr;
    }

    localStorage.setItem(`bk_cache_${currentInstaller.id}`, JSON.stringify({
      data: dbBookings,
      timestamp: new Date().toISOString()
    }));

    validateAndToggleSubmit();
  } catch (err) {
    console.error('Failed to auto-save media state to database:', err);
    showToast('Auto-save failed: ' + err.message, true);
  }
};

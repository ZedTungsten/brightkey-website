/* ============================================================
   BrightKey — main.js
   Shared scripts: nav, scroll reveal, toasts, modals, etc.
   ============================================================ */

'use strict';

// ── Read URL query parameter for coupon_code ──────────────────
(function checkCouponQueryParam() {
  const params = new URLSearchParams(window.location.search);
  const coupon = params.get('coupon_code');
  if (coupon) {
    localStorage.setItem('bk_applied_coupon', coupon.trim().toUpperCase());
  }
})();

// ── Active nav link ─────────────────────────────────────────
(function setActiveNav() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
})();

// ── Mobile nav toggle ───────────────────────────────────────
(function initMobileNav() {
  const toggle = document.querySelector('.nav__toggle');
  const links  = document.querySelector('.nav__links');
  const cta    = document.querySelector('.nav__cta');

  if (!toggle) return;

  toggle.addEventListener('click', () => {
    const isOpen = toggle.classList.toggle('open');
    links?.classList.toggle('mobile-open', isOpen);
    cta?.classList.toggle('mobile-open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!toggle.contains(e.target) && !links?.contains(e.target)) {
      toggle.classList.remove('open');
      links?.classList.remove('mobile-open');
      cta?.classList.remove('mobile-open');
    }
  });

  // Close on nav link click (mobile)
  links?.querySelectorAll('.nav__link').forEach(link => {
    link.addEventListener('click', () => {
      toggle.classList.remove('open');
      links.classList.remove('mobile-open');
      cta?.classList.remove('mobile-open');
    });
  });
})();

// ── Scroll reveal ───────────────────────────────────────────
(function initReveal() {
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
})();

// ── Toast notifications ─────────────────────────────────────
const Toast = (() => {
  let container = document.getElementById('toast-container');

  function ensureContainer() {
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  function show(message, type = 'success', duration = 3000) {
    const c     = ensureContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    c.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return { show, success: m => show(m, 'success'), error: m => show(m, 'error') };
})();

window.Toast = Toast;

// ── Modal helpers ───────────────────────────────────────────
const Modal = (() => {
  function open(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Close on overlay click
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close(id);
    });
  }

  function close(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Wire up data-modal-open / data-modal-close buttons
  document.querySelectorAll('[data-modal-open]').forEach(btn => {
    btn.addEventListener('click', () => open(btn.dataset.modalOpen));
  });

  document.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', () => close(btn.dataset.modalClose));
  });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(el => {
        close(el.id);
      });
    }
  });

  return { open, close };
})();

window.Modal = Modal;

// ── Styled decision dialogs ─────────────────────────────────
const BKDialog = (() => {
  let overlay;
  let activeResolve;

  function ensure() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'bk-dialog-overlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:10000;background:rgba(9,9,11,0.48);backdrop-filter:blur(4px);align-items:center;justify-content:center;padding:1rem;';
    overlay.innerHTML = `
      <div role="dialog" aria-modal="true" aria-labelledby="bk-dialog-title" style="background:var(--bg-surface,#fff);border:1px solid var(--border,#e5e7eb);border-radius:8px;box-shadow:var(--shadow-lg,0 24px 48px rgba(15,23,42,0.18));width:min(420px,100%);overflow:hidden;">
        <div style="padding:1.25rem 1.5rem;border-bottom:1px solid var(--border,#e5e7eb);">
          <div id="bk-dialog-title" style="font-size:0.95rem;font-weight:700;color:var(--text-primary,#09090b);"></div>
        </div>
        <div style="padding:1.25rem 1.5rem;display:flex;flex-direction:column;gap:1rem;">
          <div id="bk-dialog-message" style="font-size:0.86rem;line-height:1.55;color:var(--text-secondary,#52525b);white-space:pre-line;"></div>
          <input id="bk-dialog-input" type="text" style="display:none;width:100%;padding:0.65rem 0.75rem;border:1px solid var(--border,#d4d4d8);border-radius:6px;background:#fff;color:#09090b;font-size:0.9rem;outline:none;" />
        </div>
        <div style="padding:1rem 1.5rem;border-top:1px solid var(--border,#e5e7eb);background:var(--bg-elevated,#f8fafc);display:flex;justify-content:flex-end;gap:0.75rem;">
          <button type="button" id="bk-dialog-cancel" class="btn btn-outline">Cancel</button>
          <button type="button" id="bk-dialog-ok" class="btn btn-primary">Continue</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) finish(null);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.style.display === 'flex') finish(null);
    });
    overlay.querySelector('#bk-dialog-cancel').addEventListener('click', () => finish(null));
    overlay.querySelector('#bk-dialog-ok').addEventListener('click', () => {
      const input = overlay.querySelector('#bk-dialog-input');
      finish(input.style.display === 'none' ? true : input.value);
    });
    return overlay;
  }

  function finish(value) {
    if (!overlay || overlay.style.display === 'none') return;
    overlay.style.display = 'none';
    document.body.style.overflow = '';
    const resolve = activeResolve;
    activeResolve = null;
    if (resolve) resolve(value);
  }

  function open({ title, message, okText = 'Continue', cancelText = 'Cancel', defaultValue = '', input = false, danger = false }) {
    const el = ensure();
    el.querySelector('#bk-dialog-title').textContent = title || 'Confirm Action';
    el.querySelector('#bk-dialog-message').textContent = message || '';
    const inputEl = el.querySelector('#bk-dialog-input');
    inputEl.style.display = input ? 'block' : 'none';
    inputEl.value = defaultValue || '';
    const cancelBtn = el.querySelector('#bk-dialog-cancel');
    const okBtn = el.querySelector('#bk-dialog-ok');
    cancelBtn.textContent = cancelText;
    okBtn.textContent = okText;
    okBtn.style.background = danger ? 'var(--danger,#dc2626)' : '';
    okBtn.style.borderColor = danger ? 'var(--danger,#dc2626)' : '';
    okBtn.style.color = danger ? '#fff' : '';
    el.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    if (input) setTimeout(() => inputEl.focus(), 0);
    return new Promise(resolve => {
      activeResolve = resolve;
    });
  }

  return {
    notice(message, title = 'Notice') {
      return open({ title, message, okText: 'OK', cancelText: 'Close' });
    },
    async ask({ title = 'Confirm Action', message = '', okText = 'Continue', cancelText = 'Cancel', danger = false } = {}) {
      return (await open({ title, message, okText, cancelText, danger })) === true;
    },
    async input({ title = 'Enter Value', message = '', defaultValue = '', okText = 'Save', cancelText = 'Cancel' } = {}) {
      const value = await open({ title, message, defaultValue, okText, cancelText, input: true });
      return typeof value === 'string' ? value : null;
    }
  };
})();

window.BKDialog = BKDialog;

// ── Smooth anchor scrolling ─────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const navHeight = parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--nav-height')) || 64;
    const top = target.getBoundingClientRect().top + window.scrollY - navHeight - 16;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});

// ── Floating pill nav on scroll ──────────────────────────────
(function navScrollEffect() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const threshold = 10;
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > threshold);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // run on load in case page is already scrolled
})();

var SUPABASE_URL    = window.SUPABASE_URL || 'https://ymjlosnxuhsybkzkoofq.supabase.co';
var SUPABASE_ANON   = window.SUPABASE_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltamxvc254dWhzeWJremtvb2ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY1MzYsImV4cCI6MjA4OTk4MjUzNn0.srhk9SVvFuZRcfeRGbVDGPr5pYrFhs8vzcOiMK3A91w';
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON = SUPABASE_ANON;

/**
 * Returns a lightweight Supabase REST helper.
 * Usage:
 *   const db = createSupabaseClient();
 *   await db.insert('contact_submissions', { name, email, message });
 */
function createSupabaseClient() {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON,
    'Authorization': `Bearer ${SUPABASE_ANON}`,
    'Prefer': 'return=minimal',
  };

  async function insert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Supabase error: ${res.status}`);
    }
    return res;
  }

  async function select(table, params = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      headers: { ...headers, 'Prefer': 'return=representation' },
    });
    if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
    return res.json();
  }

  return { insert, select };
}

window.createSupabaseClient = createSupabaseClient;

// ── Bunny.net image helper ──────────────────────────────────
// Replace BUNNY_ZONE with your Pull Zone hostname.
const BUNNY_ZONE = 'https://your-zone.b-cdn.net';

/**
 * Returns an optimised Bunny.net image URL.
 * @param {string} path   – path relative to Pull Zone root
 * @param {object} opts   – { width, height, quality, format }
 */
function bunnyImage(path, { width, height, quality = 85, format = 'webp' } = {}) {
  const params = new URLSearchParams();
  if (width)   params.set('width',   width);
  if (height)  params.set('height',  height);
  if (quality) params.set('quality', quality);
  if (format)  params.set('format',  format);
  const qs = params.toString();
  return `${BUNNY_ZONE}${path}${qs ? '?' + qs : ''}`;
}

window.bunnyImage = bunnyImage;

// ── Form validation helper ──────────────────────────────────
function validateField(input) {
  const value = input.value.trim();
  let error = '';

  if (input.required && !value) {
    error = 'This field is required.';
  } else if (input.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    error = 'Please enter a valid email address.';
  } else if (input.minLength > 0 && value.length < input.minLength) {
    error = `Minimum ${input.minLength} characters required.`;
  }

  const hint = input.parentElement.querySelector('.form-error');
  if (hint) hint.textContent = error;
  input.classList.toggle('error', !!error);
  return !error;
}

function validateForm(form) {
  const inputs = form.querySelectorAll('[required], [data-validate]');
  let valid = true;
  inputs.forEach(input => {
    if (!validateField(input)) valid = false;
  });
  return valid;
}

window.validateField = validateField;
window.validateForm  = validateForm;

// ── Inline validation on blur ───────────────────────────────
document.querySelectorAll('input[required], textarea[required]').forEach(input => {
  input.addEventListener('blur', () => validateField(input));
  input.addEventListener('input', () => {
    if (input.classList.contains('error')) validateField(input);
  });
});

// ── Current year in footer ──────────────────────────────────
const yearEl = document.getElementById('current-year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ── Grainient Animated Background ───────────────────────────
// Removed as requested to disable grain/gradient effects across the site.

// ── Dynamically Load cart.js globally ───────────────────────────
(function loadCartScript() {
  if (typeof getCart !== 'undefined') return;
  if (document.querySelector('script[src*="cart.js"]')) return;
  const script = document.createElement('script');
  script.src = '/js/cart.js';
  document.head.appendChild(script);
})();

// ── Theater Mode Image Viewer ──────────────────────────────────
window.showTheaterImage = function(url) {
  let overlay = document.getElementById('bk-theater-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'bk-theater-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(9,9,11,0.9); z-index:100000; display:flex; align-items:center; justify-content:center; cursor:zoom-out; opacity:0; transition:opacity 0.2s ease;';
    overlay.innerHTML = `
      <img id="bk-theater-img" src="" style="max-width:90%; max-height:90%; object-fit:contain; border-radius:8px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5); transform:scale(0.95); transition:transform 0.2s ease;" />
      <button style="position:absolute; top:1.5rem; right:1.5rem; background:none; border:none; color:white; font-size:2rem; cursor:pointer; font-weight:300; line-height:1;">&times;</button>
    `;
    overlay.onclick = function() {
      overlay.style.opacity = '0';
      overlay.querySelector('#bk-theater-img').style.transform = 'scale(0.95)';
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 200);
    };
    document.body.appendChild(overlay);
  }

  const img = overlay.querySelector('#bk-theater-img');
  img.src = url;
  overlay.style.display = 'flex';
  
  setTimeout(() => {
    overlay.style.opacity = '1';
    img.style.transform = 'scale(1)';
  }, 10);
};

// ── Hybrid Stale Session Autorefresh (Visibility change + Idle timer) ──
(function initStaleSessionAutorefresh() {
  // Only activate on dashboard path urls
  if (!window.location.pathname.includes('/dashboard')) return;

  let lastInteractionTime = Date.now();
  const idleRefreshThreshold = 10 * 60 * 1000; // 10 minutes of complete inactivity
  const idleCheckInterval = 30 * 1000; // Check every 30 seconds
  const skipRefocusRefresh = /^\/dashboard\/ship\/send\/?$/.test(window.location.pathname);

  // List of events indicating user activity
  const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
  activityEvents.forEach(evtName => {
    document.addEventListener(evtName, () => {
      lastInteractionTime = Date.now();
    }, { passive: true });
  });

  // 1. Visibility change handler: Immediately refresh when tab is focused/opened
  document.addEventListener('visibilitychange', () => {
    if (!skipRefocusRefresh && document.visibilityState === 'visible') {
      triggerPageRefresh();
    }
  });

  // 2. Window focus handler: Refresh when user switches back to the browser window
  window.addEventListener('focus', () => {
    if (!skipRefocusRefresh) triggerPageRefresh();
  });

  // 3. Background interval loop: Auto-refresh if user has been completely idle
  setInterval(() => {
    const idleDuration = Date.now() - lastInteractionTime;
    if (idleDuration >= idleRefreshThreshold) {
      // Check if user is currently typing/editing an input field
      const activeEl = document.activeElement;
      const isUserEditing = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable
      );

      if (!isUserEditing) {
        triggerPageRefresh();
      }
    }
  }, idleCheckInterval);

  // Helper function to safely execute page-level refresh routines
  function triggerPageRefresh() {
    // Reset idle timer to avoid repeating multiple queries immediately
    lastInteractionTime = Date.now();

    // Context-dependent refresh functions
    if (window.refreshDashboard && typeof window.refreshDashboard === 'function') {
      window.refreshDashboard();
    } else if (window.WarehousePage && typeof window.WarehousePage.runAutoSyncInBackground === 'function') {
      window.WarehousePage.runAutoSyncInBackground();
    } else if (window.DeliveryApp && typeof window.DeliveryApp.loadData === 'function') {
      window.DeliveryApp.loadData();
    } else if (window.BookkeepingApp && typeof window.BookkeepingApp.loadTransactions === 'function') {
      window.BookkeepingApp.loadTransactions();
    } else if (window.AttendanceApp && typeof window.AttendanceApp.loadData === 'function') {
      window.AttendanceApp.loadData();
    } else if (window.App && typeof window.App.loadData === 'function') {
      window.App.loadData();
    } else if (window.BKRefreshShipmentsBadge && typeof window.BKRefreshShipmentsBadge === 'function') {
      window.BKRefreshShipmentsBadge();
    }
  }
})();

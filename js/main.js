/* ============================================================
   BrightKey — main.js
   Shared scripts: nav, scroll reveal, toasts, modals, etc.
   ============================================================ */

'use strict';

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

// ── Sticky nav shadow on scroll ─────────────────────────────
(function navScrollEffect() {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  window.addEventListener('scroll', () => {
    nav.style.borderBottomColor = window.scrollY > 10
      ? 'rgba(42,42,61,0.8)'
      : 'var(--border)';
  }, { passive: true });
})();

// ── Supabase client factory ─────────────────────────────────
// Replace with your real project URL and anon key.
const SUPABASE_URL    = 'https://ymjlosnxuhsybkzkoofq.supabase.co';
const SUPABASE_ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltamxvc254dWhzeWJremtvb2ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY1MzYsImV4cCI6MjA4OTk4MjUzNn0.srhk9SVvFuZRcfeRGbVDGPr5pYrFhs8vzcOiMK3A91w';

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

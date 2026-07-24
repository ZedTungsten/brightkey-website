/* ============================================================
   BrightKey — footer.js
   Unified Footer Component: Renders the standard site footer
   across all public pages dynamically.
   ============================================================ */

(function initUnifiedFooter() {
  'use strict';

  if (/^\/dashboard(?:\/|$)/.test(window.location.pathname)) {
    const removeDashboardFooters = () => {
      document.querySelectorAll('footer.footer, footer.catalog-footer, footer#site-footer')
        .forEach(footer => footer.remove());
    };
    removeDashboardFooters();
    document.addEventListener('DOMContentLoaded', removeDashboardFooters, { once: true });
    return;
  }

  const UNIFIED_FOOTER_HTML = `
    <div class="container">
      <div class="footer__grid">
        <div class="footer__brand">
          <a href="/" class="nav__logo"><img src="/assets/logo.svg?v=2" alt="Brightkey" /></a>
          <p>Digital Transformation Partner. Smart software and security solutions for Philippine small businesses.</p>
          <div class="footer__social" style="margin-top:1.5rem;">
            <a href="#" aria-label="Facebook">
              <svg viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            </a>
            <a href="#" aria-label="LinkedIn">
              <svg viewBox="0 0 24 24"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
            </a>
            <a href="#" aria-label="Instagram">
              <svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
            </a>
          </div>
        </div>
        <div class="footer__col">
          <h4>Products</h4>
          <ul class="footer__links">
            <li><a href="/products#accounting" class="footer__link">Accounting Software</a></li>
            <li><a href="/products#hr"          class="footer__link">HR Software</a></li>
            <li><a href="/products#lms"         class="footer__link">LMS</a></li>
            <li><a href="/products#iot"         class="footer__link">IoT Integration</a></li>
            <li><a href="/products#hardware"    class="footer__link">Security Hardware</a></li>
          </ul>
        </div>
        <div class="footer__col">
          <h4>Company</h4>
          <ul class="footer__links">
            <li><a href="/about"   class="footer__link">About Us</a></li>
            <li><a href="/contact" class="footer__link">Contact</a></li>
            <li><a href="/contact" class="footer__link">Get a Quote</a></li>
          </ul>
        </div>
        <div class="footer__col">
          <h4>Legal</h4>
          <ul class="footer__links">
            <li><a href="/privacy-policy" class="footer__link">Privacy Policy</a></li>
            <li><a href="/terms-of-use"   class="footer__link">Terms of Use</a></li>
            <li><a href="/admin"           class="footer__link">Employee Login</a></li>
          </ul>
        </div>
      </div>

      <div class="footer__bottom">
        <span>&copy; <span id="current-year">${new Date().getFullYear()}</span> Brightkey. All rights reserved.</span>
        <span>Made in the Philippines</span>
      </div>
    </div>
  `;

  function renderFooter() {
    let footerEl = document.querySelector('footer.footer')
      || document.querySelector('footer.catalog-footer')
      || document.querySelector('footer#site-footer')
      || document.querySelector('footer');

    if (!footerEl) {
      footerEl = document.createElement('footer');
      document.body.appendChild(footerEl);
    }

    footerEl.className = 'footer';

    const isCatalog = footerEl.classList.contains('catalog-footer');
    const isExplicit = footerEl.hasAttribute('data-unified-footer');
    const isEmpty = !footerEl.children.length || Boolean(footerEl.querySelector('.catalog-footer__inner'));

    if (isCatalog || isExplicit || isEmpty) {
      footerEl.innerHTML = UNIFIED_FOOTER_HTML;
    } else {
      const yearEl = footerEl.querySelector('#current-year') || footerEl.querySelector('#catalog-year');
      if (yearEl) {
        yearEl.textContent = String(new Date().getFullYear());
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderFooter);
  } else {
    renderFooter();
  }

  window.BKUnifiedFooter = {
    render: renderFooter,
    html: UNIFIED_FOOTER_HTML
  };
})();

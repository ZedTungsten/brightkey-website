/* ============================================================
   BrightKey — dashboard page freshness guard
   Requires a full page refresh after a dashboard tab is 30 minutes old.
   ============================================================ */

(function initDashboardPageFreshness() {
  'use strict';

  if (!/^\/dashboard(?:\/|$)/.test(window.location.pathname)) return;

  const STALE_AFTER_MS = 30 * 60 * 1000;
  const CHECK_INTERVAL_MS = 30 * 1000;
  const loadedAt = Date.now();
  let promptVisible = false;

  function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);
    if (options.className) element.className = options.className;
    if (options.text) element.textContent = options.text;
    return element;
  }

  function showRefreshPrompt() {
    if (promptVisible || Date.now() - loadedAt < STALE_AFTER_MS) return;
    promptVisible = true;

    const overlay = createElement('div', { className: 'bk-stale-page-overlay' });
    overlay.id = 'bk-stale-page-overlay';

    const dialog = createElement('div', { className: 'bk-stale-page-dialog' });
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'bk-stale-page-title');
    dialog.setAttribute('aria-describedby', 'bk-stale-page-message');

    const content = createElement('div', { className: 'bk-stale-page-content' });
    const title = createElement('h2', {
      className: 'bk-stale-page-title',
      text: 'Refresh required'
    });
    title.id = 'bk-stale-page-title';

    const message = createElement('p', {
      className: 'bk-stale-page-message',
      text: 'Please refresh your window for the latest data.'
    });
    message.id = 'bk-stale-page-message';

    const actions = createElement('div', { className: 'bk-stale-page-actions' });
    const refreshButton = createElement('button', {
      className: 'btn btn-primary bk-stale-page-refresh',
      text: 'Refresh'
    });
    refreshButton.type = 'button';
    refreshButton.addEventListener('click', () => window.location.reload());

    content.append(title, message);
    actions.appendChild(refreshButton);
    dialog.append(content, actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.body.classList.add('bk-stale-page-open');
    refreshButton.focus();
  }

  function checkFreshness() {
    if (Date.now() - loadedAt >= STALE_AFTER_MS) showRefreshPrompt();
  }

  const style = document.createElement('style');
  style.textContent = `
    body.bk-stale-page-open { overflow: hidden !important; }
    .bk-stale-page-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: rgba(9, 9, 11, 0.48);
      backdrop-filter: blur(4px);
    }
    .bk-stale-page-dialog {
      width: min(420px, 100%);
      overflow: hidden;
      border: 1px solid var(--border, #e5e7eb);
      border-radius: 8px;
      background: var(--bg-surface, #fff);
      box-shadow: var(--shadow-lg, 0 24px 48px rgba(15, 23, 42, 0.18));
    }
    .bk-stale-page-content { padding: 1.5rem; }
    .bk-stale-page-title {
      margin: 0 0 0.5rem;
      color: var(--text-primary, #09090b);
      font-size: 1rem;
      font-weight: 700;
    }
    .bk-stale-page-message {
      margin: 0;
      color: var(--text-secondary, #52525b);
      font-size: 0.86rem;
      line-height: 1.55;
    }
    .bk-stale-page-actions {
      display: flex;
      justify-content: flex-end;
      padding: 1rem 1.5rem;
      border-top: 1px solid var(--border, #e5e7eb);
      background: var(--bg-elevated, #f8fafc);
    }
    .bk-stale-page-refresh { min-width: 96px; }
  `;
  document.head.appendChild(style);

  window.setInterval(checkFreshness, CHECK_INTERVAL_MS);
  window.addEventListener('focus', checkFreshness);
  window.addEventListener('pageshow', checkFreshness);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkFreshness();
  });
}());

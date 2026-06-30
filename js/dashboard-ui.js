'use strict';

// Keyframe injections for animations if not already present
if (!document.getElementById('bkui-styles')) {
  const style = document.createElement('style');
  style.id = 'bkui-styles';
  style.textContent = `
    @keyframes toastIn {
      from { transform: translate(-50%, -20px); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }
    @keyframes toastOut {
      from { transform: translate(-50%, 0); opacity: 1; }
      to { transform: translate(-50%, -20px); opacity: 0; }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    @keyframes scaleIn {
      from { transform: scale(0.9); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    @keyframes spin {
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

window.BKUI = {
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  formatPHP(cents) {
    const php = (cents || 0) / 100;
    return "₱" + php.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  toast(message, isError = false) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = `
        position: fixed;
        top: 1.5rem;
        left: 50%;
        transform: translateX(-50%);
        z-index: 99999;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${isError ? 'error' : 'success'}`;
    el.style.cssText = `
      background: var(--bg-surface, #ffffff);
      border: 1px solid var(--border, #e2e8f0);
      padding: 0.75rem 1.25rem;
      border-radius: var(--radius-md, 8px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      font-size: 0.85rem;
      font-weight: 500;
      animation: toastIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: auto;
    `;
    if (isError) {
      el.style.borderColor = 'var(--danger, #ef4444)';
      el.style.color = 'var(--danger, #ef4444)';
    } else {
      el.style.borderColor = 'var(--success, #10b981)';
      el.style.color = 'var(--success, #10b981)';
    }
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'toastOut 0.2s forwards';
      setTimeout(() => el.remove(), 200);
    }, 3500);
  },

  async withLoadingButton(btn, asyncFn) {
    if (!btn || btn.disabled) return;
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" style="vertical-align: -2px; margin-right: 6px; animation: spin 1s linear infinite;"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>Processing...`;
    try {
      await asyncFn();
    } finally {
      btn.disabled = false;
      btn.classList.remove('btn-loading');
      btn.innerHTML = originalHtml;
    }
  },

  openConfirmModal({ title, message, onConfirm }) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.4);
      backdrop-filter: blur(4px);
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.15s ease-out;
    `;
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: var(--bg-surface, #ffffff);
      border: 1px solid var(--border, #e2e8f0);
      border-radius: var(--radius-lg, 12px);
      padding: 1.5rem;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.15);
      animation: scaleIn 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
    `;
    dialog.innerHTML = `
      <h3 style="font-size: 1.1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; margin-top: 0;">${this.escapeHtml(title)}</h3>
      <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.4; margin-bottom: 1.5rem; margin-top: 0;">${this.escapeHtml(message)}</p>
      <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
        <button type="button" class="btn-cancel" style="padding: 0.5rem 1rem; font-size: 0.82rem; font-weight: 600; border: 1px solid var(--border); border-radius: 6px; background: transparent; cursor: pointer; color: var(--text-secondary);">Cancel</button>
        <button type="button" class="btn-confirm" style="padding: 0.5rem 1rem; font-size: 0.82rem; font-weight: 600; border: none; border-radius: 6px; background: var(--cyan, #06b6d4); color: #fff; cursor: pointer;">Confirm</button>
      </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const close = () => {
      overlay.style.animation = 'fadeOut 0.15s forwards';
      setTimeout(() => overlay.remove(), 150);
    };

    overlay.querySelector('.btn-cancel').onclick = close;
    overlay.querySelector('.btn-confirm').onclick = async () => {
      const confirmBtn = overlay.querySelector('.btn-confirm');
      await this.withLoadingButton(confirmBtn, async () => {
        await onConfirm();
        close();
      });
    };
  }
};

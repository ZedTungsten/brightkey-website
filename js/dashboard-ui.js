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

// Shared payslip document renderer used by Payout Tracker and Smartlock Calendar.
(function registerPayslipRenderer() {
  function esc(value) {
    const node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  }

  function peso(value) {
    return `₱${(Number(value) || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  function createBreakdownRow(type, description, amount) {
    const formattedDescription = esc(description).replace(/\n/g, '<br>');
    return `<tr>
      <td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;font-weight:600;vertical-align:top;">${esc(type)}</td>
      <td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;color:#4b5563;line-height:1.5;vertical-align:top;">${formattedDescription}</td>
      <td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;width:120px;vertical-align:top;">${peso(amount)}</td>
    </tr>`;
  }

  function createSheet(options = {}) {
    const profile = options.profile || {};
    const template = options.template || {};
    const logoUrl = options.logoUrl || '';
    const companyAddress = [profile.companyAddressLine1, profile.companyAddressLine2].filter(Boolean).map(esc).join('<br>');
    const companyContact = [profile.email, profile.phone].filter(Boolean).map(esc).join('<br>');
    const signature = template.signatureUrl
      ? `<img src="${esc(template.signatureUrl)}" alt="Signature" style="max-height:100px;max-width:170px;object-fit:contain;display:block;">`
      : '<div style="height:100px;width:150px;"></div>';
    const scheduleRows = [...(options.scheduleRows || [])]
      .sort((a, b) => Number(a.day) - Number(b.day) || Number(a.order) - Number(b.order));
    const scheduleHtml = scheduleRows.map(item => `<div style="display:flex;justify-content:space-between;padding:0.5rem 0;font-size:0.85rem;border-bottom:1px dashed #e5e7eb;">
      <span style="font-weight:500;color:#4b5563;">${esc(item.label)}</span>
      <span style="font-weight:700;color:#111827;font-variant-numeric:tabular-nums;margin-right:12px;">${peso(item.value)}</span>
    </div>`).join('');

    const sheet = document.createElement('div');
    sheet.innerHTML = `<div style="display:flex;flex-direction:column;justify-content:space-between;min-height:250mm;box-sizing:border-box;background:#fff;color:#111827;padding:3rem 3rem 2.5rem 3rem;">
      <div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:1rem;margin-bottom:1.5rem;">
          <div>${logoUrl ? `<img src="${esc(logoUrl)}" alt="Logo" style="max-height:48px;max-width:150px;display:block;margin-bottom:0.5rem;filter:grayscale(1);">` : ''}</div>
          <div style="text-align:right;font-size:0.7rem;line-height:1.25;color:#4b5563;">
            <strong style="display:block;margin-bottom:3px;color:#111827;font-size:0.7rem;font-weight:800;">${esc(profile.companyName || 'Brightkey Solutions')}</strong>
            ${companyAddress}<br>${companyContact}
          </div>
        </div>
        <div style="text-align:center;margin-bottom:1.5rem;">
          <div style="font-size:1.6rem;font-weight:900;letter-spacing:1px;color:#111827;text-transform:uppercase;">Payslip</div>
          <div style="font-size:0.95rem;color:#4b5563;margin-top:0.1rem;"><strong>${esc(options.monthText)}</strong></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;background:#f9fafb;padding:0.85rem;border-radius:6px;margin-bottom:1.5rem;border:1px solid #e5e7eb;">
          <div>
            <div style="margin-bottom:0.4rem;"><span style="font-size:0.65rem;text-transform:uppercase;color:#6b7280;font-weight:600;display:block;">Employee Name</span><strong style="font-size:0.8rem;color:#111827;">${esc(options.employeeName)}</strong></div>
            <div><span style="font-size:0.65rem;text-transform:uppercase;color:#6b7280;font-weight:600;display:block;">Department</span><strong style="font-size:0.8rem;color:#111827;">${esc(options.department || '—')}</strong></div>
          </div>
          <div>
            <div style="margin-bottom:0.4rem;"><span style="font-size:0.65rem;text-transform:uppercase;color:#6b7280;font-weight:600;display:block;">Reporting To</span><strong style="font-size:0.8rem;color:#111827;">${esc(options.reportingTo || '—')}</strong></div>
            <div><span style="font-size:0.65rem;text-transform:uppercase;color:#6b7280;font-weight:600;display:block;">Position / Title</span><strong style="font-size:0.8rem;color:#111827;">${esc(options.position || '—')}</strong></div>
          </div>
        </div>
        <div style="margin-bottom:2rem;">
          <div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;">Earnings &amp; Adjustments Breakdown</div>
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead><tr style="background:#f3f4f6;text-align:left;">
              <th style="padding:0.5rem 0.75rem;border-bottom:1px solid #d1d5db;font-weight:700;">Type</th>
              <th style="padding:0.5rem 0.75rem;border-bottom:1px solid #d1d5db;font-weight:700;">Description</th>
              <th style="padding:0.5rem 0.75rem;border-bottom:1px solid #d1d5db;text-align:right;font-weight:700;width:120px;">Amount</th>
            </tr></thead>
            <tbody>${options.breakdownRowsHtml || ''}</tbody>
          </table>
        </div>
        <div style="margin-bottom:2rem;max-width:400px;margin-left:auto;">
          <div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;border-bottom:1px solid #111827;padding-bottom:0.25rem;">Payout Schedule Allocation</div>
          ${scheduleHtml}
          <div style="display:flex;justify-content:space-between;padding:0.75rem 0;font-size:1rem;font-weight:800;border-top:2px solid #111827;">
            <span>TOTAL PAYOUT</span><span style="font-variant-numeric:tabular-nums;margin-right:12px;">${peso(options.totalPayout)}</span>
          </div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto;padding-top:2rem;">
        <div style="font-size:0.72rem;color:#6b7280;max-width:320px;line-height:1.2;">This payslip is generated through Brightkey ERP and serves as an official payroll record. Any concerns regarding computation should be reported within seven (7) days of issuance.</div>
        <div style="display:flex;flex-direction:column;align-items:center;width:180px;">
          <div style="height:105px;display:flex;align-items:center;justify-content:center;width:100%;">${signature}</div>
          <div style="font-size:0.85rem;font-weight:700;border-top:1px solid #111827;width:100%;text-align:center;padding-top:0.25rem;margin-top:0.25rem;">${esc(template.signatoryName || 'Authorized Signatory')}</div>
          <div style="font-size:0.72rem;color:#6b7280;width:100%;text-align:center;">Authorized Signatory</div>
        </div>
      </div>
    </div>`;
    return sheet;
  }

  async function downloadSheet(sheet, filename) {
    if (!sheet || typeof html2pdf !== 'function') {
      throw new Error('The payslip generator is unavailable.');
    }

    // Capture from one fixed, off-screen A4 workspace. Rendering detached nodes
    // can inherit the active page's scroll offset and create a large blank area.
    const captureHost = document.createElement('div');
    captureHost.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      'width:190mm',
      'margin:0',
      'padding:0',
      'background:#fff',
      'font-size:16px',
      'line-height:normal',
      'pointer-events:none',
      'z-index:-2147483647'
    ].join(';');
    sheet.style.cssText = 'width:190mm;margin:0;padding:0;background:#fff;';
    captureHost.appendChild(sheet);
    document.body.appendChild(captureHost);

    try {
      await html2pdf().set({
        margin: [10, 10, 10, 10],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          scrollX: 0,
          scrollY: 0,
          windowWidth: captureHost.scrollWidth,
          windowHeight: captureHost.scrollHeight
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }).from(sheet).save();
    } finally {
      captureHost.remove();
    }
  }

  window.BKPayslipRenderer = { createSheet, createBreakdownRow, downloadSheet, peso };
})();

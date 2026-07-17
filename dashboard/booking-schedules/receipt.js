    'use strict';

    // Open receipt using the saved invoice_template as single source of truth
    async function openViewReceipt() {
      if (!selectedBooking) return;
      const b = selectedBooking;

      const pipe = (str) => str ? str.split('|').map(s => s.trim()).filter(Boolean) : [];
      const esc  = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const fmtPHP = (v) => `₱ ${parseFloat(v||0).toLocaleString('en-PH',{minimumFractionDigits:2})}`;
      const fmtCents = (c) => `₱ ${((c||0)/100).toLocaleString('en-PH',{minimumFractionDigits:2})}`;

      // Fetch company invoice_template config (single source of truth)
      let cfg = {};
      try {
        const { data: setting } = await sb
          .from('global_settings')
          .select('value')
          .eq('key', 'invoice_template')
          .eq('company_id', currentCompanyId)
          .maybeSingle();
        if (setting && setting.value) cfg = setting.value;
      } catch(e) { console.warn('Could not load invoice template config:', e); }

      // Build items rows (one per product)
      const skus   = pipe(b.product_skus);
      const names  = pipe(b.product_names);
      const qtys   = pipe(b.product_qtys);
      const prices = pipe(b.product_unit_prices);
      const totals = pipe(b.product_totals);
      let itemsHtml = '';
      const rowCount = Math.max(skus.length, names.length, qtys.length);
      for (let i = 0; i < rowCount; i++) {
        const sku  = (skus[i]  || '').trim();
        const name = (names[i] || '').trim();
        let particulars;
        if (!name || name === sku)                           particulars = esc(sku);
        else if (name.startsWith(sku + ' - ') || name.startsWith(sku + '-')) particulars = esc(name);
        else                                                  particulars = esc(sku ? `${sku} - ${name}` : name);
        itemsHtml += `<tr>
          <td>${particulars}</td>
          <td align="right">${fmtPHP(prices[i] || 0)}</td>
          <td align="center">${esc(qtys[i] || 1)}</td>
          <td align="right">${fmtPHP(totals[i] || 0)}</td>
        </tr>`;
      }
      if (!itemsHtml) itemsHtml = `<tr><td colspan="4" align="center" style="color:#aaa;padding:1.5rem 0;">No items</td></tr>`;

      // Build charges / deductions rows
      const cLabels = pipe(b.charge_labels);
      const cVals   = pipe(b.charge_values);
      let chargesHtml = '';
      if (cLabels.length > 0 && cVals.some(v => parseFloat(v) > 0)) {
        chargesHtml = `<tr class="others-row">
          <td align="right" class="summary-label move-right">OTHERS:</td>
          <td class="summary-middle">${cLabels.map(esc).join('<br>')}</td>
          <td align="right" class="summary-value">${cVals.map(fmtPHP).join('<br>')}</td>
        </tr>`;
      }
      const dLabels = pipe(b.deduction_labels);
      const dVals   = pipe(b.deduction_values);
      let deductionsHtml = '';
      if (dLabels.length > 0 && dVals.some(v => parseFloat(v) > 0)) {
        deductionsHtml = `<tr class="less-row">
          <td align="right" class="summary-label move-right">LESS:</td>
          <td class="summary-middle">${dLabels.map(esc).join('<br>')}</td>
          <td align="right" class="summary-value">${dVals.map(v => `-₱ ${parseFloat(v).toLocaleString('en-PH',{minimumFractionDigits:2})}`).join('<br>')}</td>
        </tr>`;
      }

      // Terms HTML from config
      const terms = Array.isArray(cfg.terms) ? cfg.terms.filter(Boolean) : [];
      const termsHtml = terms.length > 0
        ? terms.map(t => {
            if (t.includes(':')) { const [l,...r]=t.split(':'); return `<div class="term-line"><strong>${esc(l)}:</strong>${esc(r.join(':'))}</div>`; }
            return `<div class="term-line">${esc(t)}</div>`;
          }).join('')
        : '<div class="term-line">No special terms specified.</div>';

      const receiptDate = b.scheduled_date
        ? new Date(b.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })
        : new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });

      const orderNo = esc(b.order_no || '');

      const w = window.open('', '_blank');

      if (cfg.template) {
        let html = cfg.template;
        // Config substitutions
        html = html.replace(/\{\{headerColor1\}\}/g, cfg.headerColor1 || '#454545');
        html = html.replace(/\{\{headerColor2\}\}/g, cfg.headerColor2 || '#2d2d2d');
        html = html.replace(/\{\{textColor\}\}/g,    cfg.textColor    || '#575757');
        html = html.replace(/\{\{lineColor\}\}/g,    cfg.lineColor    || '#9a9a9a');
        html = html.replace(/\{\{logo\}\}/g,         cfg.logo         || '../assets/og-image.png');
        html = html.replace(/\{\{companyName\}\}/g,  cfg.companyName  || 'Company Name');
        html = html.replace(/\{\{companyAddress\}\}/g, (cfg.companyAddress || '').replace(/\n/g, '<br>'));
        html = html.replace(/\{\{companyEmail\}\}/g, cfg.companyEmail || '');
        html = html.replace(/\{\{thankYouText\}\}/g, cfg.thankYouText || 'THANK YOU FOR YOUR BUSINESS!');
        // Data substitutions
        html = html.replace(/\{\{orderno\}\}/g,     orderNo);
        html = html.replace(/\{\{fullname\}\}/g,    esc(b.customer_name));
        html = html.replace(/\{\{contact\}\}/g,     esc(b.customer_phone || b.customer_email || 'n/a'));
        html = html.replace(/\{\{email\}\}/g,       esc(b.customer_email || 'n/a'));
        html = html.replace(/\{\{address\}\}/g,     esc(b.customer_address));
        html = html.replace(/\{\{datetoday\}\}/g,   receiptDate);
        html = html.replace(/\{\{items\}\}/g,       itemsHtml);
        html = html.replace(/\{\{itemtotal\}\}/g,   fmtCents(b.subtotal));
        html = html.replace(/\{\{addcharge\}\}/g,   chargesHtml);
        html = html.replace(/\{\{deduct\}\}/g,      deductionsHtml);
        html = html.replace(/\{\{grandtotall\}\}/g, fmtCents(b.grand_total));
        html = html.replace(/\{\{terms\}\}/g,       termsHtml);
        // Inject html2pdf + action buttons before </body>
        const actionScript = `
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
  <style>
    .receipt-actions{display:flex;justify-content:center;gap:12px;margin:30px auto;max-width:794px;padding:0 20px;font-family:"Inter",sans-serif;}
    .action-btn{padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;border:none;transition:all 0.2s;display:inline-flex;align-items:center;gap:8px;}
    .action-btn.btn-save{background:#2563eb;color:white;}.action-btn.btn-save:hover{background:#1d4ed8;}
    .action-btn.btn-print{background:#4b5563;color:white;}.action-btn.btn-print:hover{background:#374151;}
    @media print{.receipt-actions{display:none!important;}}
  </style>
  <div class="receipt-actions">
    <button class="action-btn btn-save" onclick="saveAsPdf()"><svg aria-hidden="true" viewBox="0 0 24 24" style="width:1em;height:1em;display:inline-block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Save as PDF</button>
    <button class="action-btn btn-print" onclick="window.print()"><svg aria-hidden="true" viewBox="0 0 24 24" style="width:1em;height:1em;display:inline-block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Print Receipt</button>
  </div>
  <script>
    async function saveAsPdf() {
      const el = document.querySelector('.receipt-page');
      const wr = document.querySelector('.receipt-preview-wrapper');
      if (wr) { wr.style.padding='0'; wr.style.background='#ffffff'; }
      if (el) { el.style.margin='0'; }
      const btn = document.querySelector('.btn-save');
      const orig = btn.innerHTML;
      btn.textContent='Compiling...';
      btn.disabled=true;
      try {
        await html2pdf().set({
          margin:[0,-1.3,0,1.3], filename:'${orderNo}.pdf',
          image:{type:'jpeg',quality:0.98},
          html2canvas:{scale:2,useCORS:true,scrollY:0},
          jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}
        }).from(el).save();
      } catch(e){console.error(e);} finally {
        if (wr) { wr.style.padding=''; wr.style.background=''; }
        if (el) { el.style.margin=''; }
        btn.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" style="width:1em;height:1em;display:inline-block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><polyline points="20 6 9 17 4 12"/></svg>Saved';
        setTimeout(()=>{btn.innerHTML=orig;btn.disabled=false;},3000);
      }
    }
  <\/script>`;
        html = html.replace('</body>', actionScript + '\n</body>');
        if (w) { w.document.open(); w.document.write(html); w.document.close(); }
      } else {
        if (w) {
          w.document.write(`<!DOCTYPE html><html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:1rem;"><h2>Receipt Template Not Configured</h2><p>Go to <a href="/dashboard/orders-invoices">Dashboard → Orders & Invoices</a> and click <strong>Save Template Settings</strong>.</p></body></html>`);
          w.document.close();
        }
      }
    }

        // Lightbox actions
    function openLightbox(src) {
      const modal = document.getElementById('lightbox-modal');
      const img = document.getElementById('lightbox-img');
      const vid = document.getElementById('lightbox-video');
      
      const isVid = /\.(mp4|mov|webm)(\?|$)/i.test(src);
      if (isVid) {
        img.style.display = 'none';
        img.src = '';
        vid.src = src;
        vid.style.display = 'block';
      } else {
        vid.style.display = 'none';
        vid.src = '';
        img.src = src;
        img.style.display = 'block';
      }
      modal.classList.add('open');
    }

    function closeLightbox() {
      const modal = document.getElementById('lightbox-modal');
      modal.classList.remove('open');
      const vid = document.getElementById('lightbox-video');
      if (vid) {
        vid.pause();
        vid.src = '';
      }
    }

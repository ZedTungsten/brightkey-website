    'use strict';

    /* ── Supabase constants (from main.js) ── */
    const SB_URL  = (typeof SUPABASE_URL  !== 'undefined') ? SUPABASE_URL  : '';
    const SB_ANON = (typeof SUPABASE_ANON !== 'undefined') ? SUPABASE_ANON : '';

    const CATEGORIES = [
      'Commission','Customer','Distribution','Due From Owner','Due From Staff',
      'Due To','Installer','Loan','OPMMI','Owner Equity','Salary','Supplier','Other'
    ];

    /* ── Entry number: BK-AA0001 → rolls AA9999 → AB0000 ── */
    function fmtEntry(n) {
      if (n < 0) {
        return `BK-SS${Math.abs(n)}`;
      }
      let li, num;
      if (n <= 9999) {
        li = 0; num = n;
      } else {
        const off = n - 10000;
        li  = 1 + Math.floor(off / 10000);
        num = off % 10000;
      }
      const c1 = String.fromCharCode(65 + Math.floor(li / 26));
      const c2 = String.fromCharCode(65 + (li % 26));
      return `BK-${c1}${c2}${String(num).padStart(4, '0')}`;
    }

    function parseEntry(str) {
      if (!str) return null;
      const s = String(str).trim().toUpperCase();
      let match = s.match(/^BK-SS(\d+)$/);
      if (match) {
        return -parseInt(match[1], 10);
      }
      match = s.match(/^BK-([A-Z]{2})(\d{4})$/);
      if (match) {
        const c1 = match[1].charCodeAt(0) - 65;
        const c2 = match[1].charCodeAt(1) - 65;
        const num = parseInt(match[2], 10);
        const li = c1 * 26 + c2;
        if (li === 0) {
          return num;
        } else {
          return 10000 + (li - 1) * 10000 + num;
        }
      }
      const p = parseInt(s, 10);
      return isNaN(p) ? null : p;
    }

    /* ── PHP formatter ── */
    function php(v) {
      if (v === null || v === undefined || v === '') return '—';
      return '₱' + Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    /* ── HTML escape ── */
    function esc(s) {
      return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    /* ── Supabase REST helpers ── */
    async function getRestHeaders() {
      let token = SB_ANON;
      if (window.BKAuth && window.BKAuth.sb) {
        const { data: { session } } = await window.BKAuth.sb.auth.getSession();
        if (session) token = session.access_token;
      }
      return {
        'Content-Type': 'application/json',
        'apikey': SB_ANON,
        'Authorization': `Bearer ${token}`
      };
    }

    async function sbGet(path, extraHeaders = {}) {
      const headers = await getRestHeaders();
      const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { ...headers, 'Prefer': 'return=representation', ...extraHeaders } });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || `Supabase ${r.status}`); }
      return r.json();
    }
    async function sbPost(table, body) {
      const headers = await getRestHeaders();
      const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
        method: 'POST', headers: { ...headers, 'Prefer': 'return=representation' }, body: JSON.stringify(body)
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || `Insert ${r.status}`); }
      return r.json();
    }
    async function sbPatch(table, filter, body) {
      const headers = await getRestHeaders();
      const r = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
        method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error(`Update ${r.status}`);
    }
    async function sbDelete(table, filter) {
      const headers = await getRestHeaders();
      const r = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
        method: 'DELETE', headers: { ...headers, 'Prefer': 'return=minimal' }
      });
      if (!r.ok) throw new Error(`Delete ${r.status}`);
    }

    /* ════════════════════════════════════════════
       JournalApp
    ════════════════════════════════════════════ */
    const JournalApp = {
      accounts:  [],
      entries:   [],
      totalCount: 0,
      page:      1,
      pageSize:  50,
      activeOrphanId:      null,
      activeOrphanAccount: null,
      companyId: null,
      tenantId: null,
      stagedAttachments:   [],
      /* ── Edit mode state ── */
      editMode:       false,
      pendingChanges: {},
      pendingDeletes: new Set(),
      userIp:         'unknown',
      deviceInfo:     'unknown',
      /* ── Account filter state ── */
      selectedAccounts: new Set(),
      /* ── Sort + page size ── */
      sortBy:   'date',
      sortDir:  'desc', // 'asc' or 'desc'
      pageSize: 30,
      prioritizeSnapshot: false,

      /* ── Boot ── */
      async init() {
        let sb;
        if (window.BKAuth) {
          const authInfo = await window.BKAuth.checkRoleGate(['Finance'], '../admin.html');
          if (!authInfo) return;
          sb = window.BKAuth.sb;
          this.tenantId = authInfo.tenantId;

          try {
            // Fetch company ID for BrightKey subdomain
            const { data: companyData } = await sb
              .from('companies')
              .select('id')
              .eq('subdomain', 'brightkey')
              .limit(1);
            if (companyData && companyData.length > 0) {
              this.companyId = companyData[0].id;
            }
          } catch (err) {
            console.error('Error loading company:', err);
          }
        }
        this.setTodayDate();
        this.populateCatSelects();
        this.bindForm();
        this.bindAccountsPanel();
        this.bindFilters();
        this.bindOrphanPop();
        this.bindEditMode();
        this.bindLogs();
        document.getElementById('clear-form-btn').addEventListener('click', () => this.clearForm());
        document.getElementById('ss-create-btn').addEventListener('click', () => this.createSnapshot());
        document.getElementById('export-csv-btn').addEventListener('click', () => this.exportToCSV());
        // Detect IP + browser silently
        this.detectUser();
        await this.loadAccounts();
        await this.loadEntries();
        await this.refreshNextBadge();
        await this.loadYears();
      },

      setTodayDate() {
        document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
      },

      populateCatSelects() {
        const sel = document.getElementById('new-acct-cat');
        sel.innerHTML = '';
        CATEGORIES.forEach(c => {
          const o = document.createElement('option');
          o.value = o.textContent = c;
          sel.appendChild(o);
        });
        const createOpt = document.createElement('option');
        createOpt.value = '__create_new__';
        createOpt.textContent = '+ Create New';
        sel.appendChild(createOpt);
      },

      clearForm() {
        const keepFields = document.getElementById('keep-fields-chk')?.checked;
        const toReset = keepFields
          ? ['f-amount','f-desc1','f-desc2']
          : ['f-credit-acct','f-debit-acct','f-amount','f-desc1','f-desc2'];
        toReset.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });
        this.stagedAttachments = [];
        this.renderAttachmentPreviews();
        this.hideFormAlert();
      },

      async compressImage(file, quality = 0.7) {
        if (!file.type.startsWith('image/')) {
          return file;
        }
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, img.width, img.height);
              canvas.toBlob((blob) => {
                try {
                  if (blob) {
                    const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                      type: 'image/jpeg',
                      lastModified: Date.now()
                    });
                    resolve(compressedFile);
                  } else {
                    resolve(file);
                  }
                } catch (err) {
                  console.warn("File constructor error, falling back to blob decoration:", err);
                  try {
                    blob.name = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
                    resolve(blob);
                  } catch (fallbackErr) {
                    resolve(file);
                  }
                }
              }, 'image/jpeg', quality);
            };
            img.onerror = () => resolve(file);
          };
          reader.onerror = () => resolve(file);
        });
      },

      async handleAttachmentSelect(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;

        if (this.stagedAttachments.length + files.length > 5) {
          Toast.error('You can upload a maximum of 5 attachments.');
          event.target.value = '';
          return;
        }

        const statusEl = document.getElementById('attachment-status');
        if (statusEl) {
          statusEl.textContent = `Processing files... (${this.stagedAttachments.length}/5)`;
        }

        for (let file of files) {
          try {
            const compressed = await this.compressImage(file);
            this.stagedAttachments.push({
              name: compressed.name,
              file: compressed,
              type: compressed.type
            });
          } catch (err) {
            console.error('File compression failed, using original:', err);
            this.stagedAttachments.push({
              name: file.name,
              file: file,
              type: file.type
            });
          }
        }

        event.target.value = '';
        this.renderAttachmentPreviews();
      },

      removeStagedAttachment(index) {
        this.stagedAttachments.splice(index, 1);
        this.renderAttachmentPreviews();
      },

      renderAttachmentPreviews() {
        const container = document.getElementById('attachment-preview-container');
        const statusEl = document.getElementById('attachment-status');
        if (!container) return;

        container.innerHTML = '';
        if (statusEl) {
          statusEl.textContent = `${this.stagedAttachments.length}/5 files selected`;
        }

        this.stagedAttachments.forEach((item, idx) => {
          const div = document.createElement('div');
          div.setAttribute('style', 'position: relative; display: flex; align-items: center; gap: 0.5rem; background: var(--bg-surface-elevated, #242424); border: 1px solid var(--border); padding: 0.4rem 0.6rem; border-radius: 4px; font-size: 0.78rem; max-width: 180px;');

          const icon = item.type.startsWith('image/')
            ? '<svg aria-hidden="true" viewBox="0 0 24 24" style="width:1em;height:1em;display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>'
            : '<svg aria-hidden="true" viewBox="0 0 24 24" style="width:1em;height:1em;display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

          div.innerHTML = `
            <span>${icon}</span>
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;" title="${esc(item.name)}">${esc(item.name)}</span>
            <button type="button" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1rem; line-height: 1; padding: 0 0.2rem; display: flex; align-items: center;" onclick="JournalApp.removeStagedAttachment(${idx})" title="Remove"><svg aria-hidden="true" viewBox="0 0 24 24" style="width:1em;height:1em;display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          `;
          container.appendChild(div);
        });
      },

      /* ── Load accounts ── */
      async loadAccounts() {
        try {
          let url = 'journal_accounts?select=id,name,category&order=category.asc,name.asc';
          if (this.companyId && this.companyId !== 'undefined' && this.companyId !== 'null') {
            url = `journal_accounts?select=id,name,category&company_id=eq.${this.companyId}&order=category.asc,name.asc`;
          }
          this.accounts = await sbGet(url);
          this.populateDropdowns();
          this.renderAcctsList();
        } catch(e) {
          Toast.error('Failed to load accounts: ' + e.message);
        }
      },

      grouped() {
        const g = {};
        this.accounts.forEach(a => { (g[a.category] = g[a.category] || []).push(a); });
        return g;
      },

      populateDropdowns() {
        const g = this.grouped();
        const catKeys = Object.keys(g).sort();

        const fillGrouped = (selId, placeholder) => {
          const sel = document.getElementById(selId);
          const prev = sel.value;
          sel.innerHTML = `<option value="">${placeholder}</option>`;
          catKeys.forEach(cat => {
            const og = document.createElement('optgroup');
            og.label = cat;
            g[cat].forEach(a => {
              const o = document.createElement('option');
              o.value = o.textContent = a.name;
              og.appendChild(o);
            });
            sel.appendChild(og);
          });
          if (prev) sel.value = prev;
        };

        fillGrouped('f-credit-acct', 'Select account…');
        fillGrouped('f-debit-acct',  'Select account…');

        /* flat filter checkbox list */
        this.renderAccountFilter();

        /* orphan reassign dropdown */
        const oSel = document.getElementById('orphan-reassign-sel');
        oSel.innerHTML = '';
        this.accounts.forEach(a => {
          const o = document.createElement('option');
          o.value = o.textContent = a.name;
          oSel.appendChild(o);
        });
      },

      renderAcctsList() {
        const c = document.getElementById('accts-list');
        if (!this.accounts.length) { c.innerHTML = '<div class="tbl-state">No accounts yet.</div>'; return; }
        const g = this.grouped();
        let html = '';
        Object.keys(g).sort().forEach(cat => {
          html += `<div class="acct-group-label">${esc(cat)}</div>`;
          g[cat].forEach(a => {
            html += `
              <div class="acct-row" id="acr-${a.id}">
                <span class="acct-row__name">${esc(a.name)}</span>
                <span class="acct-row__cat">${esc(a.category)}</span>
                <div class="acct-row__actions">
                  <button class="btn btn-ghost btn-sm" type="button" onclick="JournalApp.editAcct(${a.id})" title="Edit">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="btn btn-ghost btn-sm" type="button" onclick="JournalApp.removeAcct(${a.id},'${esc(a.name)}')" title="Remove" style="color:var(--danger);">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </div>
              </div>`;
          });
        });
        c.innerHTML = html;
      },

      editAcct(id) {
        const a = this.accounts.find(x => x.id === id);
        if (!a) return;
        const row = document.getElementById(`acr-${id}`);
        if (!row) return;
        const opts = CATEGORIES.map(c => `<option value="${c}"${c===a.category?' selected':''}>${c}</option>`).join('');
        row.innerHTML = `
          <input type="text" class="form-input" id="ean-${id}" value="${esc(a.name)}" style="flex:1;" />
          <select class="form-select" id="eac-${id}" style="width:150px;">${opts}</select>
          <div class="acct-row__actions">
            <button class="btn btn-cyan btn-sm" type="button" onclick="JournalApp.saveAcctEdit(${id})">Save</button>
            <button class="btn btn-ghost btn-sm" type="button" onclick="JournalApp.renderAcctsList()">Cancel</button>
          </div>`;
        document.getElementById(`ean-${id}`)?.focus();
      },

      async saveAcctEdit(id) {
        const name = document.getElementById(`ean-${id}`)?.value.trim();
        const cat  = document.getElementById(`eac-${id}`)?.value;
        if (!name) { Toast.error('Name cannot be empty.'); return; }
        try {
          await sbPatch('journal_accounts', `id=eq.${id}`, { name, category: cat });
          Toast.success('Account updated.');
          await this.loadAccounts();
          this.renderTable();
        } catch(e) { Toast.error('Update failed: ' + e.message); }
      },

      async removeAcct(id, name) {
        const ok = await BKDialog.ask({
          title: 'Remove Account',
          message: `Remove "${name}"?\n\nRows using this account will be flagged as unknown.`,
          okText: 'Remove',
          danger: true
        });
        if (!ok) return;
        try {
          await sbDelete('journal_accounts', `id=eq.${id}`);
          Toast.success(`"${name}" removed.`);
          await this.loadAccounts();
          this.renderTable();
        } catch(e) { Toast.error('Delete failed: ' + e.message); }
      },

      /* ── Accounts panel ── */
      bindAccountsPanel() {
        const toggle = document.getElementById('accounts-toggle');
        const panel  = document.getElementById('accounts-panel');
        toggle.addEventListener('click', () => {
          const open = panel.style.display === 'none';
          panel.style.display = open ? 'block' : 'none';
          toggle.classList.toggle('open', open);
        });

        document.getElementById('new-acct-cat').addEventListener('change', function() {
          const newCatInput = document.getElementById('new-cat-name');
          const isCreate = this.value === '__create_new__';
          newCatInput.style.display = isCreate ? '' : 'none';
          if (isCreate) newCatInput.focus();
        });

        document.getElementById('add-acct-btn').addEventListener('click', async () => {
          const name = document.getElementById('new-acct-name').value.trim();
          let cat = document.getElementById('new-acct-cat').value;
          if (cat === '__create_new__') {
            const newCat = document.getElementById('new-cat-name').value.trim();
            if (!newCat) { Toast.error('Category name is required.'); return; }
            cat = newCat;
            if (!CATEGORIES.includes(cat)) {
              CATEGORIES.splice(CATEGORIES.indexOf('Other'), 0, cat);
            }
          }
          if (!name) { Toast.error('Account name is required.'); return; }
          try {
            await sbPost('journal_accounts', { name, category: cat, company_id: this.companyId });
            document.getElementById('new-acct-name').value = '';
            document.getElementById('new-cat-name').value = '';
            document.getElementById('new-cat-name').style.display = 'none';
            this.populateCatSelects();
            Toast.success(`"${name}" added.`);
            await this.loadAccounts();
          } catch(e) { Toast.error('Failed: ' + e.message); }
        });
      },

      /* ── Form submit ── */
      bindForm() {
        document.getElementById('entry-form').addEventListener('submit', async e => {
          e.preventDefault();
          await this.submitEntry();
        });
      },

      async submitEntry() {
        const btn = document.getElementById('submit-btn');
        const date      = document.getElementById('f-date').value;
        const creditAcc = document.getElementById('f-credit-acct').value;
        const debitAcc  = document.getElementById('f-debit-acct').value;
        const amount    = parseFloat(document.getElementById('f-amount').value);
        const desc1     = document.getElementById('f-desc1').value.trim() || null;
        const desc2     = document.getElementById('f-desc2').value.trim() || null;

        if (!date)                   return this.showFormAlert('Date is required.');
        if (!creditAcc)              return this.showFormAlert('Credit account is required.');
        if (!debitAcc)               return this.showFormAlert('Debit account is required.');
        if (creditAcc === debitAcc)  return this.showFormAlert('Credit and debit accounts must be different.');
        if (!amount || amount <= 0)  return this.showFormAlert('Amount must be greater than zero.');

        this.hideFormAlert();
        btn.disabled = true;
        btn.classList.add('btn-loading');

        try {
          const entryNum = await this.getNextEntryNum();
          const [yr, mo] = date.split('-').map(Number);
          const uploadedUrls = [];
          if (this.stagedAttachments && this.stagedAttachments.length > 0) {
            const entryLabel = fmtEntry(entryNum);
            const supabaseClient = window.BKAuth ? window.BKAuth.sb : null;
            if (!supabaseClient) {
              throw new Error('Supabase client is not initialized.');
            }

            for (let i = 0; i < this.stagedAttachments.length; i++) {
              const item = this.stagedAttachments[i];
              const ext = item.name.split('.').pop().toLowerCase();
              const filename = `${entryLabel}-${String(i + 1).padStart(2, '0')}.${ext}`;
              const path = `companies/${this.companyId}/bookkeeping/${filename}`;
              
              const { data, error } = await supabaseClient.storage
                .from('brightkey-internal')
                .upload(path, item.file, { upsert: true });
                
              if (error) {
                throw new Error(`File upload failed: ${error.message}`);
              }

              // Private bucket: generate a long-lived signed URL (10 years)
              const TEN_YEARS = 315360000;
              const { data: signedData, error: signErr } = await supabaseClient.storage
                .from('brightkey-internal')
                .createSignedUrl(path, TEN_YEARS);
              if (signErr) throw new Error(`Signing failed: ${signErr.message}`);
              uploadedUrls.push(signedData.signedUrl);
            }
          }

          await sbPost('general_journal', [
            { company_id: this.companyId, entry_number: entryNum, year: yr, month: mo, date, account: debitAcc,  debit: amount, credit: null, description_1: desc1, description_2: desc2, attachments: uploadedUrls },
            { company_id: this.companyId, entry_number: entryNum, year: yr, month: mo, date, account: creditAcc, debit: null, credit: amount, description_1: desc1, description_2: desc2, attachments: uploadedUrls },
          ]);

          Toast.success(`Entry ${fmtEntry(entryNum)} added.`);
          this.clearForm();
          await this.loadEntries();
          await this.refreshNextBadge();
          await this.loadYears();
        } catch(e) {
          this.showFormAlert(e.message);
        } finally {
          btn.disabled = false;
          btn.classList.remove('btn-loading');
        }
      },

      showFormAlert(msg) {
        const el = document.getElementById('form-alert');
        el.textContent = msg;
        el.style.display = 'block';
      },
      hideFormAlert() {
        document.getElementById('form-alert').style.display = 'none';
      },

      async getNextEntryNum() {
        // Fetch only the largest positive entry number to avoid counting negative snapshot numbers
        let url = 'general_journal?select=entry_number&entry_number=gt.0&order=entry_number.desc&limit=1';
        if (this.companyId && this.companyId !== 'undefined' && this.companyId !== 'null') {
          url = `general_journal?select=entry_number&entry_number=gt.0&company_id=eq.${this.companyId}&order=entry_number.desc&limit=1`;
        }
        const rows = await sbGet(url);
        if (!rows.length) return 1;
        const max = parseInt(rows[0].entry_number, 10) || 0;
        return max <= 0 ? 1 : max + 1;
      },

      async refreshNextBadge() {
        try {
          const n = await this.getNextEntryNum();
          document.getElementById('next-entry-badge').textContent = `Next: ${fmtEntry(n)}`;
        } catch(_) {}
      },

      /* ── Filters ── */
      bindFilters() {
        const apply = () => { this.page = 1; this.loadEntries(); };
        const today = new Date().toISOString().slice(0, 10);
        const addDays = (dateStr, n) => {
          const d = new Date(dateStr); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
        };
        const fromEl = document.getElementById('f-date-from');
        const toEl   = document.getElementById('f-date-to');

        const resetDates = () => {
          const defaultFrom = addDays(today, -45);
          toEl.value = today;
          fromEl.value = defaultFrom;
          toEl.setAttribute('min', defaultFrom);
          toEl.setAttribute('max', today);
          fromEl.removeAttribute('min');
          fromEl.setAttribute('max', today);
        };

        // Auto-select default 45-day range on load
        resetDates();

        fromEl.addEventListener('change', () => {
          const from = fromEl.value;
          if (from) {
            toEl.setAttribute('min', from);
            toEl.setAttribute('max', today);
            if (toEl.value && toEl.value < from) {
              toEl.value = '';
            }
          } else {
            toEl.removeAttribute('min');
            toEl.setAttribute('max', today);
          }
          apply();
        });

        toEl.addEventListener('change', () => {
          const to = toEl.value;
          if (to) {
            fromEl.setAttribute('max', to);
            if (fromEl.value && fromEl.value > to) {
              fromEl.value = '';
            }
          } else {
            fromEl.removeAttribute('min');
            fromEl.setAttribute('max', today);
          }
          apply();
        });

        let timer;
        document.getElementById('f-search').addEventListener('input', () => {
          clearTimeout(timer); timer = setTimeout(apply, 350);
        });

        const prioChk = document.getElementById('prioritize-snapshot-chk');
        if (prioChk) {
          prioChk.addEventListener('change', (e) => {
            this.prioritizeSnapshot = e.target.checked;
            apply();
          });
        }

        document.getElementById('clear-filters-btn').addEventListener('click', () => {
          resetDates();
          document.getElementById('f-search').value = '';
          const pChk = document.getElementById('prioritize-snapshot-chk');
          if (pChk) {
            pChk.checked = false;
            this.prioritizeSnapshot = false;
          }
          this.selectedAccounts.clear();
          this.updateAccountFilterBtn();
          this.renderAccountFilter();
          apply();
        });
        this.bindAccountFilter();
      },

      /* ── Multi-checkbox account filter ── */
      bindAccountFilter() {
        const btn   = document.getElementById('acct-filter-btn');
        const panel = document.getElementById('acct-filter-panel');
        const apply = () => { this.page = 1; this.loadEntries(); };

        btn.addEventListener('click', e => {
          e.stopPropagation();
          panel.classList.toggle('open');
        });
        document.addEventListener('click', e => {
          if (!document.getElementById('acct-filter-wrap').contains(e.target)) {
            panel.classList.remove('open');
          }
        });
        document.getElementById('acct-sel-all').addEventListener('click', e => {
          e.stopPropagation();
          this.selectedAccounts.clear();
          this.renderAccountFilter();
          this.updateAccountFilterBtn();
          apply();
        });
        document.getElementById('acct-clear-all').addEventListener('click', e => {
          e.stopPropagation();
          this.selectedAccounts = new Set(['__NONE__']);
          this.renderAccountFilter();
          this.updateAccountFilterBtn();
          apply();
        });
      },

      renderAccountFilter() {
        const list = document.getElementById('acct-filter-list');
        if (!list) return;
        if (!this.selectedAccounts) this.selectedAccounts = new Set(); // safety guard
        const apply = () => { this.page = 1; this.loadEntries(); };
        // Group by category
        const groups = {};
        this.accounts.forEach(a => {
          if (!groups[a.category]) groups[a.category] = [];
          groups[a.category].push(a);
        });
        list.innerHTML = Object.entries(groups).map(([cat, accts]) => `
          <label class="acct-filter-group" style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
            <input type="checkbox" class="group-cb" data-group="${esc(cat)}" />
            ${esc(cat)}
          </label>
          ${accts.map(a => `
            <label class="acct-filter-item">
              <input type="checkbox" data-acct="${esc(a.name)}" data-group="${esc(cat)}"
                ${this.selectedAccounts.size === 0 || (this.selectedAccounts.has(a.name) && !this.selectedAccounts.has('__NONE__')) ? 'checked' : ''} />
              ${esc(a.name)}
            </label>`).join('')}`).join('');

        // Bind individual checkboxes
        list.querySelectorAll('input[data-acct]').forEach(cb => {
          cb.addEventListener('change', () => {
            const all = [...list.querySelectorAll('input[data-acct]')];
            const checked = all.filter(c => c.checked).map(c => c.dataset.acct);
            const unchecked = all.filter(c => !c.checked).map(c => c.dataset.acct);

            if (unchecked.length === 0) {
              this.selectedAccounts.clear(); // All checked = no filter
            } else if (checked.length === 0) {
              this.selectedAccounts = new Set(['__NONE__']); // None checked
            } else {
              this.selectedAccounts = new Set(checked);
            }
            this.updateAccountFilterBtn();
            this.updateGroupCheckboxes();
            apply();
          });
        });

        // Bind group checkboxes
        list.querySelectorAll('input.group-cb').forEach(gcb => {
          gcb.addEventListener('change', (e) => {
            const cat = gcb.dataset.group;
            const items = list.querySelectorAll(`input[data-acct][data-group="${esc(cat)}"]`);
            const shouldCheck = e.target.checked;
            items.forEach(cb => cb.checked = shouldCheck);
            
            // Re-evaluate total selection
            const all = [...list.querySelectorAll('input[data-acct]')];
            const checked = all.filter(c => c.checked).map(c => c.dataset.acct);
            const unchecked = all.filter(c => !c.checked).map(c => c.dataset.acct);

            if (unchecked.length === 0) {
              this.selectedAccounts.clear();
            } else if (checked.length === 0) {
              this.selectedAccounts = new Set(['__NONE__']);
            } else {
              this.selectedAccounts = new Set(checked);
            }
            this.updateAccountFilterBtn();
            this.updateGroupCheckboxes();
            apply();
          });
        });

        this.updateGroupCheckboxes();

        const count = document.getElementById('acct-filter-count');
        if (count) {
          if (this.selectedAccounts.size === 0) count.textContent = '';
          else if (this.selectedAccounts.has('__NONE__')) count.textContent = '0 selected';
          else count.textContent = `${this.selectedAccounts.size} selected`;
        }
      },

      updateGroupCheckboxes() {
        const list = document.getElementById('acct-filter-list');
        if (!list) return;
        list.querySelectorAll('input.group-cb').forEach(gcb => {
          const cat = gcb.dataset.group;
          const items = [...list.querySelectorAll(`input[data-acct][data-group="${esc(cat)}"]`)];
          if (!items.length) return;
          const checkedCount = items.filter(i => i.checked).length;
          
          if (checkedCount === 0) {
            gcb.checked = false;
            gcb.indeterminate = false;
          } else if (checkedCount === items.length) {
            gcb.checked = true;
            gcb.indeterminate = false;
          } else {
            gcb.checked = false;
            gcb.indeterminate = true;
          }
        });
      },

      updateAccountFilterBtn() {
        const btn   = document.getElementById('acct-filter-btn');
        const label = document.getElementById('acct-filter-label');
        if (!btn || !label) return;
        if (this.selectedAccounts.size === 0) {
          label.textContent = 'All accounts';
          btn.classList.remove('has-selection');
        } else if (this.selectedAccounts.has('__NONE__')) {
          label.textContent = '0 accounts';
          btn.classList.add('has-selection');
        } else {
          label.textContent = `${this.selectedAccounts.size} account${this.selectedAccounts.size > 1 ? 's' : ''}`;
          btn.classList.add('has-selection');
        }
      },

      getFilters() {
        return {
          year:             '',
          month:            '',
          dateFrom:         document.getElementById('f-date-from').value,
          dateTo:           document.getElementById('f-date-to').value,
          selectedAccounts: this.selectedAccounts,
          search:           document.getElementById('f-search').value.trim(),
          prioritizeSnapshot: this.prioritizeSnapshot
        };
      },

      buildQS(f, opts = {}) {
        const p = new URLSearchParams();
        if (this.companyId && this.companyId !== 'undefined' && this.companyId !== 'null') p.set('company_id', `eq.${this.companyId}`);
        if (opts.select) p.set('select', opts.select); else p.set('select', '*');
        if (!opts.noOrder) {
          const dir = this.sortDir === 'asc' ? 'asc' : 'desc';
          if (this.sortBy === 'entry_number') {
            p.set('order', `entry_number.${dir},date.${dir},id.${dir}`);
          } else {
            p.set('order', `date.${dir},entry_number.${dir},id.${dir}`);
          }
        }
        const dateFrom = opts.dateFrom !== undefined ? opts.dateFrom : f.dateFrom;
        const dateTo = opts.dateTo !== undefined ? opts.dateTo : f.dateTo;
        const hasDateRange = dateFrom || dateTo;
        if (!hasDateRange) {
          if (f.year)  p.set('year',  `eq.${f.year}`);
          if (f.month) p.set('month', `eq.${f.month}`);
        }
        if (dateFrom) p.append('date', `gte.${dateFrom}`);
        if (dateTo)   p.append('date', `lte.${dateTo}`);
        if (f.selectedAccounts && f.selectedAccounts.size > 0) {
          const escapedAccounts = [...f.selectedAccounts].map(acc => {
            const escaped = acc.replace(/"/g, '\\"');
            return `"${escaped}"`;
          }).join(',');
          p.set('account', `in.(${escapedAccounts})`);
        }
        if (f.search) {
          const entryNum = parseEntry(f.search);
          if (entryNum !== null) {
            p.set('or', `(account.ilike.*${f.search}*,description_1.ilike.*${f.search}*,description_2.ilike.*${f.search}*,entry_number.eq.${entryNum})`);
          } else {
            let cleanSearch = f.search.toUpperCase();
            if (cleanSearch.startsWith('BK-')) cleanSearch = cleanSearch.replace('BK-', '');
            const entryNumWithPrefix = parseEntry('BK-' + cleanSearch);
            if (entryNumWithPrefix !== null) {
              p.set('or', `(account.ilike.*${f.search}*,description_1.ilike.*${f.search}*,description_2.ilike.*${f.search}*,entry_number.eq.${entryNumWithPrefix})`);
            } else {
              p.set('or', `(account.ilike.*${f.search}*,description_1.ilike.*${f.search}*,description_2.ilike.*${f.search}*)`);
            }
          }
        }
        if (opts.limit  !== undefined) p.set('limit',  opts.limit);
        if (opts.offset !== undefined) p.set('offset', opts.offset);
        return p.toString();
      },

      /* ── Load entries ── */
      // Filter-only query string (no select/order/limit) — used by aggregate totals
      buildFilterQS(f, opts = {}) {
        const p = new URLSearchParams();
        if (this.companyId && this.companyId !== 'undefined' && this.companyId !== 'null') p.set('company_id', `eq.${this.companyId}`);
        const dateFrom = opts.dateFrom !== undefined ? opts.dateFrom : f.dateFrom;
        const dateTo = opts.dateTo !== undefined ? opts.dateTo : f.dateTo;
        const hasDateRange = dateFrom || dateTo;
        if (!hasDateRange) {
          if (f.year)  p.set('year',  `eq.${f.year}`);
          if (f.month) p.set('month', `eq.${f.month}`);
        }
        if (dateFrom) p.append('date', `gte.${dateFrom}`);
        if (dateTo)   p.append('date', `lte.${dateTo}`);
        if (f.selectedAccounts && f.selectedAccounts.size > 0) {
          const escapedAccounts = [...f.selectedAccounts].map(acc => {
            const escaped = acc.replace(/"/g, '\\"');
            return `"${escaped}"`;
          }).join(',');
          p.set('account', `in.(${escapedAccounts})`);
        }
        if (f.search) {
          const entryNum = parseEntry(f.search);
          if (entryNum !== null) {
            p.set('or', `(account.ilike.*${f.search}*,description_1.ilike.*${f.search}*,description_2.ilike.*${f.search}*,entry_number.eq.${entryNum})`);
          } else {
            let cleanSearch = f.search.toUpperCase();
            if (cleanSearch.startsWith('BK-')) cleanSearch = cleanSearch.replace('BK-', '');
            const entryNumWithPrefix = parseEntry('BK-' + cleanSearch);
            if (entryNumWithPrefix !== null) {
              p.set('or', `(account.ilike.*${f.search}*,description_1.ilike.*${f.search}*,description_2.ilike.*${f.search}*,entry_number.eq.${entryNumWithPrefix})`);
            } else {
              p.set('or', `(account.ilike.*${f.search}*,description_1.ilike.*${f.search}*,description_2.ilike.*${f.search}*)`);
            }
          }
        }
        return p.toString();
      },

      /* ── Helper: getQueryFilterString ── */
      async getQueryFilterString(f) {
        if (!f.prioritizeSnapshot) {
          return {
            filter: 'entry_number=gt.0',
            dateFrom: f.dateFrom,
            dateTo: f.dateTo
          };
        }

        try {
          let ssUrl = 'general_journal?select=year,month,entry_number&entry_number=lt.0';
          if (this.companyId && this.companyId !== 'undefined' && this.companyId !== 'null') {
            ssUrl += `&company_id=eq.${this.companyId}`;
          }
          
          const snapshots = await sbGet(ssUrl);
          
          if (snapshots && snapshots.length > 0) {
            const getMonthsInRange = (dFrom, dTo) => {
              const months = [];
              if (!dFrom || !dTo) return months;
              const start = new Date(dFrom);
              const end = new Date(dTo);
              let curr = new Date(start.getFullYear(), start.getMonth(), 1);
              while (curr <= end) {
                months.push({ year: curr.getFullYear(), month: curr.getMonth() + 1 });
                curr.setMonth(curr.getMonth() + 1);
              }
              return months;
            };

            const touched = getMonthsInRange(f.dateFrom, f.dateTo);
            const activeSnapshots = snapshots.filter(s => 
              touched.some(t => t.year === s.year && t.month === s.month)
            );

            if (activeSnapshots.length > 0) {
              const ssNums = activeSnapshots.map(s => s.entry_number);
              const ssConditions = activeSnapshots.map(s => `and(year.eq.${s.year},month.eq.${s.month})`).join(',');

              let adjustedFrom = f.dateFrom;
              let adjustedTo = f.dateTo;

              if (f.dateFrom) {
                const fromDateObj = new Date(f.dateFrom);
                const fromYr = fromDateObj.getFullYear();
                const fromMo = fromDateObj.getMonth() + 1;
                const hasStartSnap = activeSnapshots.some(s => s.year === fromYr && s.month === fromMo);
                if (hasStartSnap) {
                  adjustedFrom = `${fromYr}-${String(fromMo).padStart(2, '0')}-01`;
                }
              }

              if (f.dateTo) {
                const toDateObj = new Date(f.dateTo);
                const toYr = toDateObj.getFullYear();
                const toMo = toDateObj.getMonth() + 1;
                const hasEndSnap = activeSnapshots.some(s => s.year === toYr && s.month === toMo);
                if (hasEndSnap) {
                  const lastDay = new Date(toYr, toMo, 0).getDate();
                  adjustedTo = `${toYr}-${String(toMo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
                }
              }

              return {
                filter: `or=(entry_number.in.(${ssNums.join(',')}),and(entry_number.gt.0,not.or(${ssConditions})))`,
                dateFrom: adjustedFrom,
                dateTo: adjustedTo
              };
            }
          }
        } catch (err) {
          console.error('Failed to resolve snapshots:', err);
        }

        return {
          filter: 'entry_number=gt.0',
          dateFrom: f.dateFrom,
          dateTo: f.dateTo
        };
      },

      async exportToCSV() {
        const btn = document.getElementById('export-csv-btn');
        if (!btn) return;
        const origText = btn.innerHTML;
        btn.disabled = true;
        btn.textContent = 'Exporting…';

        try {
          const f = this.getFilters();
          const { filter: ssFilter, dateFrom, dateTo } = await this.getQueryFilterString(f);
          const filterQS = this.buildFilterQS(f, { dateFrom, dateTo });

          // Fetch all matching rows without pagination limit/offset, sorted by date & entry_number
          const dir = this.sortDir === 'asc' ? 'asc' : 'desc';
          let order = `date.${dir},entry_number.${dir},id.${dir}`;
          if (this.sortBy === 'entry_number') {
            order = `entry_number.${dir},date.${dir},id.${dir}`;
          }
          const url = `general_journal?${filterQS}&${ssFilter}&order=${order}`;
          const rows = await sbGet(url, { 'Range': '0-99999', 'Range-Unit': 'items' });

          if (!rows.length) {
            Toast.error('No matching records to export.');
            return;
          }

          // Build CSV content
          const csvRows = [];
          
          // Calculate totals
          let sumD = 0, sumC = 0;
          rows.forEach(r => {
            sumD += parseFloat(r.debit || 0);
            sumC += parseFloat(r.credit || 0);
          });
          const diff = sumD - sumC;
          const nowStr = new Date().toLocaleString();

          // Metadata header rows
          csvRows.push(['Export Date & Time', `"${nowStr}"`].join(','));
          csvRows.push(['Total Debit', `"${php(sumD)}"`].join(','));
          csvRows.push(['Total Credit', `"${php(sumC)}"`].join(','));
          csvRows.push(['Difference', `"${(diff < 0 ? '-' : '') + php(Math.abs(diff))}"`].join(','));
          csvRows.push([]); // Empty line separator

          // Headers
          csvRows.push(['#', 'Entry', 'Date', 'Account', 'Debit', 'Credit', 'Desc 1', 'Desc 2'].join(','));

          rows.forEach((r, idx) => {
            const entryLabel = fmtEntry(r.entry_number);
            const dateStr = r.date || '';
            const accountStr = r.account || '';
            const debitVal = r.debit !== null && r.debit !== undefined ? r.debit : '';
            const creditVal = r.credit !== null && r.credit !== undefined ? r.credit : '';
            const desc1 = r.description_1 || '';
            const desc2 = r.description_2 || '';

            // Helper to escape values for CSV
            const escVal = (val) => {
              const str = String(val ?? '');
              if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
              }
              return str;
            };

            csvRows.push([
              idx + 1,
              escVal(entryLabel),
              escVal(dateStr),
              escVal(accountStr),
              debitVal,
              creditVal,
              escVal(desc1),
              escVal(desc2)
            ].join(','));
          });

          const csvContent = "\uFEFF" + csvRows.join("\n"); // UTF-8 BOM for Excel support
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          const urlObj = URL.createObjectURL(blob);
          link.setAttribute('href', urlObj);

          // Filename based on date range or general
          let filename = 'general_journal';
          if (dateFrom && dateTo) {
            filename += `_${dateFrom}_to_${dateTo}`;
          } else if (dateFrom) {
            filename += `_from_${dateFrom}`;
          } else if (dateTo) {
            filename += `_to_${dateTo}`;
          }
          link.setAttribute('download', `${filename}.csv`);
          link.style.visibility = 'hidden';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(urlObj);
          Toast.success(`Exported ${rows.length} rows successfully.`);
        } catch (err) {
          console.error(err);
          Toast.error('Export failed: ' + err.message);
        } finally {
          btn.disabled = false;
          btn.innerHTML = origText;
        }
      },

      /* ── Helper: createSnapshot ── */
      async createSnapshot() {
        const monthSelect = document.getElementById('ss-month');
        const yearSelect  = document.getElementById('ss-year');
        const btn         = document.getElementById('ss-create-btn');
        if (!monthSelect || !yearSelect || !btn) return;

        const M = parseInt(monthSelect.value, 10);
        const Y = parseInt(yearSelect.value, 10);
        if (!M || !Y) { Toast.error('Please select month and year.'); return; }

        btn.disabled = true;
        btn.textContent = 'Creating...';

        try {
          // 1. Fetch all regular/individual entries for this month and year (where entry_number > 0)
          let url = `general_journal?select=account,debit,credit&year=eq.${Y}&month=eq.${M}&entry_number=gt.0`;
          if (this.companyId) {
            url += `&company_id=eq.${this.companyId}`;
          }
          const entries = await sbGet(url);

          if (!entries.length) {
            Toast.error('No journal entries found for the selected month/year.');
            btn.disabled = false;
            btn.textContent = 'Create Snapshot';
            return;
          }

          // 2. Consolidate by account: sum debits and credits separately
          const consolidated = {};
          entries.forEach(e => {
            const acc = e.account;
            const deb = parseFloat(e.debit || 0);
            const crd = parseFloat(e.credit || 0);
            if (!consolidated[acc]) {
              consolidated[acc] = { debit: 0, credit: 0 };
            }
            consolidated[acc].debit += deb;
            consolidated[acc].credit += crd;
          });

          const snapshotRows = [];
          const snapEntryNum = -((Y % 100) * 100 + M);
          // Last day of month
          const lastDayStr = new Date(Y, M, 0).toISOString().slice(0, 10);

          Object.entries(consolidated).forEach(([account, totals]) => {
            const roundedDebit = parseFloat(totals.debit.toFixed(2));
            const roundedCredit = parseFloat(totals.credit.toFixed(2));

            if (roundedDebit > 0) {
              snapshotRows.push({
                company_id: this.companyId,
                entry_number: snapEntryNum,
                year: Y,
                month: M,
                date: lastDayStr,
                account: account,
                debit: roundedDebit,
                credit: null,
                description_1: 'Monthly Consolidated Snapshot',
                description_2: null,
                attachments: []
              });
            }
            if (roundedCredit > 0) {
              snapshotRows.push({
                company_id: this.companyId,
                entry_number: snapEntryNum,
                year: Y,
                month: M,
                date: lastDayStr,
                account: account,
                debit: null,
                credit: roundedCredit,
                description_1: 'Monthly Consolidated Snapshot',
                description_2: null,
                attachments: []
              });
            }
          });

          if (!snapshotRows.length) {
            Toast.error('No non-zero balances found to snapshot.');
            btn.disabled = false;
            btn.textContent = 'Create Snapshot';
            return;
          }

          // 3. Delete existing snapshot for this month and year
          let snapFilter = `entry_number=eq.${snapEntryNum}`;
          if (this.companyId && this.companyId !== 'undefined' && this.companyId !== 'null') {
            snapFilter += `&company_id=eq.${this.companyId}`;
          }
          await sbDelete('general_journal', snapFilter);

          // 4. Insert new snapshot rows
          await sbPost('general_journal', snapshotRows);

          Toast.success(`Snapshot created successfully as ${fmtEntry(snapEntryNum)}.`);
          await this.loadEntries();
        } catch (err) {
          console.error(err);
          Toast.error('Failed to create snapshot: ' + err.message);
        } finally {
          btn.disabled = false;
          btn.textContent = 'Create Snapshot';
        }
      },

      async loadEntries() {
        const tbody = document.getElementById('j-tbody');
        const cols = this.editMode ? 10 : 9;

        // Dynamically set min-height on .table-wrap based on pageSize to prevent jumping
        const wrap = document.querySelector('.table-wrap');
        if (wrap) {
          const expectedHeight = (this.pageSize * 37.6) + 33;
          wrap.style.minHeight = `${expectedHeight}px`;
        }

        // Render skeleton rows matching this.pageSize to keep the layout height stable
        let skeletonHtml = '';
        for (let i = 0; i < this.pageSize; i++) {
          skeletonHtml += `
            <tr class="skeleton-row">
              <td class="num"><div class="skeleton-shimmer" style="width: 16px; height: 12px; border-radius: 4px;"></div></td>
              <td class="entry-num"><div class="skeleton-shimmer" style="width: 70px; height: 12px; border-radius: 4px;"></div></td>
              <td><div class="skeleton-shimmer" style="width: 75px; height: 12px; border-radius: 4px;"></div></td>
              <td><div class="skeleton-shimmer" style="width: 130px; height: 12px; border-radius: 4px;"></div></td>
              <td><div class="skeleton-shimmer" style="width: 60px; height: 12px; border-radius: 4px;"></div></td>
              <td><div class="skeleton-shimmer" style="width: 60px; height: 12px; border-radius: 4px;"></div></td>
              <td><div class="skeleton-shimmer" style="width: 120px; height: 12px; border-radius: 4px;"></div></td>
              <td><div class="skeleton-shimmer" style="width: 100px; height: 12px; border-radius: 4px;"></div></td>
              <td style="text-align:center;"><div class="skeleton-shimmer" style="width: 20px; height: 12px; border-radius: 4px; margin:0 auto;"></div></td>
              ${this.editMode ? '<td class="delete-col"><div class="skeleton-shimmer" style="width: 20px; height: 12px; border-radius: 4px; margin:0 auto;"></div></td>' : ''}
            </tr>
          `;
        }
        tbody.innerHTML = skeletonHtml;

        const f = this.getFilters();
        const offset = (this.page - 1) * this.pageSize;
        try {
          const { filter: ssFilter, dateFrom, dateTo } = await this.getQueryFilterString(f);
          const filterQS = this.buildFilterQS(f, { dateFrom, dateTo });

          const totalUrl = `general_journal?select=debit,credit&${filterQS}&${ssFilter}`;
          const all = await sbGet(
            totalUrl,
            { 'Range': '0-49999', 'Range-Unit': 'items' }
          );
          let sumD = 0, sumC = 0;
          all.forEach(r => { sumD += parseFloat(r.debit || 0); sumC += parseFloat(r.credit || 0); });
          const rowCount = all.length;
          this.totalCount = rowCount;
          const diff = sumD - sumC;
          document.getElementById('total-debit').textContent  = php(sumD);
          document.getElementById('total-credit').textContent = php(sumC);
          const diffEl = document.getElementById('total-diff');
          diffEl.textContent = (diff < 0 ? '-' : '') + php(Math.abs(diff));
          diffEl.style.color = diff === 0 ? '' : diff > 0 ? '#0e7490' : '#dc2626';
          document.getElementById('total-count').textContent  = `${rowCount} row${rowCount !== 1 ? 's' : ''}`;

          /* page */
          const pageQS = this.buildQS(f, { limit: this.pageSize, offset, dateFrom, dateTo });
          const pageUrl = `general_journal?${pageQS}&${ssFilter}`;
          this.entries = await sbGet(pageUrl);
          this.renderTable();
          this.renderPagination();
        } catch(e) {
          const tblHeight = (this.pageSize * 37.6);
          tbody.innerHTML = `<tr><td colspan="${cols}" class="tbl-state error" style="height: ${tblHeight}px; vertical-align: middle; text-align: center;">Error: ${esc(e.message)}</td></tr>`;
        }
      },

      renderTable() {
        this.updateHeaderSortIndicators();
        const tbody  = document.getElementById('j-tbody');
        const known  = new Set(this.accounts.map(a => a.name));
        const off    = (this.page - 1) * this.pageSize;
        const cols   = this.editMode ? 10 : 9;

        // Dynamically set min-height on .table-wrap based on pageSize to prevent jumping
        const wrap = document.querySelector('.table-wrap');
        if (wrap) {
          const expectedHeight = (this.pageSize * 37.6) + 33;
          wrap.style.minHeight = `${expectedHeight}px`;
        }

        if (!this.entries.length) {
          const tblHeight = (this.pageSize * 37.6);
          tbody.innerHTML = `<tr><td colspan="${cols}" class="tbl-state" style="height: ${tblHeight}px; vertical-align: middle; text-align: center;">No entries found.</td></tr>`;
          return;
        }

        tbody.innerHTML = this.entries.map((r, i) => {
          const isDel   = this.pendingDeletes.has(r.entry_number);
          const chgs    = this.pendingChanges[r.id] || {};
          const hasDiff = Object.keys(chgs).length > 0;
          // Merge staged changes into display values
          const d = { ...r };
          Object.entries(chgs).forEach(([k, v]) => { d[k] = v.new; });

          const orphan = !known.has(d.account) && !isDel;

          let rowCls = '';
          if (isDel)        rowCls = 'row-pending-delete';
          else if (hasDiff) rowCls = 'row-pending-edit';
          else if (orphan)  rowCls = 'row-orphan';

          const oa = orphan && !this.editMode
            ? ` onclick="JournalApp.openOrphanPop(event,${r.id},'${esc(d.account)}')" title="Unknown account — click to fix"` : '';

          const ec = (col) => (!isDel && this.editMode) ? ` data-col="${col}" data-id="${r.id}"` : '';

          const delCell = this.editMode ? `
            <td class="delete-col">
              ${isDel
                ? `<button class="btn btn-ghost btn-sm" style="color:var(--cyan);padding:0 6px;" onclick="JournalApp.unmarkDelete(${r.entry_number})" title="Undo delete">&#8617;</button>`
                : `<button class="btn btn-ghost btn-sm" style="color:var(--danger);padding:0 6px;" onclick="JournalApp.markDelete(${r.entry_number})" title="Remove entry"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg></button>`}
            </td>` : '';

          const atts = r.attachments || [];
          const docsHtml = atts.map((url) => {
            const isPdf = url.toLowerCase().endsWith('.pdf');
            const icon = isPdf
              ? '<svg aria-hidden="true" viewBox="0 0 24 24" style="width:1em;height:1em;display:inline-block;vertical-align:-0.15em;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
              : '<svg aria-hidden="true" viewBox="0 0 24 24" style="width:1em;height:1em;display:inline-block;vertical-align:-0.15em;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
            const title = isPdf ? 'PDF Receipt' : 'Image Receipt';
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" title="${title}" style="text-decoration:none; margin: 0 4px; font-size: 0.95rem;">${icon}</a>`;
          }).join('');

          return `<tr class="${rowCls}" data-id="${r.id}" data-entry="${r.entry_number}"${oa}>
            <td class="num" style="color:var(--text-muted);font-size:0.72rem;">${off + i + 1}</td>
            <td class="entry-num"${ec('entry_number')}>${fmtEntry(d.entry_number)}</td>
            <td${ec('date')}>${d.date || '—'}</td>
            <td${ec('account')} style="${orphan ? 'color:var(--danger);font-weight:600;' : ''}">${esc(d.account)}</td>
            <td class="debit"${ec('debit')}>${d.debit   ? php(d.debit)   : '—'}</td>
            <td class="credit"${ec('credit')}>${d.credit ? php(d.credit) : '—'}</td>
            <td${ec('description_1')}>${esc(d.description_1 || '')}</td>
            <td${ec('description_2')}>${esc(d.description_2 || '')}</td>
            <td style="text-align:center;">${docsHtml || '—'}</td>
            ${delCell}
          </tr>`;
        }).join('');

        if (this.editMode) {
          tbody.querySelectorAll('td[data-col]').forEach(td => {
            td.addEventListener('click', () => this.startEdit(td));
          });
        }
      },



      /* ── Inline edit (staged) ── */
      startEdit(td) {
        if (td.querySelector('.cell-edit-input')) return;
        const col = td.dataset.col;
        const id  = parseInt(td.dataset.id, 10);
        const r   = this.entries.find(x => x.id === id);
        if (!r) return;

        // Current value: apply any pending change
        const staged = (this.pendingChanges[id] || {})[col];
        const currentVal = staged ? staged.new : r[col];

        let html;
        if (col === 'account') {
          const opts = this.accounts.map(a =>
            `<option value="${esc(a.name)}"${a.name === currentVal ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
          html = `<select class="cell-edit-input">${opts}</select>`;
        } else if (col === 'date') {
          html = `<input type="date" class="cell-edit-input" value="${currentVal || ''}" />`;
        } else if (col === 'debit' || col === 'credit') {
          const num = currentVal ? String(currentVal).replace(/[₱,]/g, '') : '';
          html = `<input type="number" class="cell-edit-input" value="${num}" step="0.01" min="0" />`;
        } else if (col === 'entry_number') {
          const formatted = currentVal ? fmtEntry(currentVal) : '';
          html = `<input type="text" class="cell-edit-input" value="${formatted}" />`;
        } else {
          html = `<input type="text" class="cell-edit-input" value="${!currentVal || currentVal === '—' ? '' : currentVal}" />`;
        }

        td.innerHTML = html;
        const inp = td.querySelector('.cell-edit-input');
        inp.focus();
        if (inp.select) inp.select();

        const commit = async () => {
          const val = inp.value;
          let newVal;
          const origVal = r[col]; // original DB value

          if (col === 'debit' || col === 'credit') {
            newVal = val === '' ? null : parseFloat(val);
          } else if (col === 'date') {
            if (!val) { this.renderTable(); return; }
            newVal = val;
          } else if (col === 'entry_number') {
            const trimmed = val.trim();
            if (trimmed === '') {
              newVal = await this.getNextEntryNum();
            } else {
              newVal = parseEntry(val);
              if (newVal === null) {
                Toast.error('Invalid entry format. Use e.g. BK-AA0759');
                this.renderTable();
                return;
              }
            }
          } else {
            newVal = val || null;
          }

          // Stage the change
          if (col === 'entry_number') {
            const sameEntryRows = this.entries.filter(x => 
              x.entry_number === r.entry_number &&
              x.date === r.date &&
              (x.description_1 || '') === (r.description_1 || '')
            );
            for (const row of sameEntryRows) {
              const rowId = row.id;
              if (!this.pendingChanges[rowId]) this.pendingChanges[rowId] = {};
              if (newVal !== row.entry_number) {
                this.pendingChanges[rowId]['entry_number'] = { old: row.entry_number, new: newVal, entryNum: row.entry_number };
              } else {
                delete this.pendingChanges[rowId]['entry_number'];
                if (!Object.keys(this.pendingChanges[rowId]).length) delete this.pendingChanges[rowId];
              }
            }
          } else {
            if (!this.pendingChanges[id]) this.pendingChanges[id] = {};
            if (JSON.stringify(newVal) !== JSON.stringify(origVal)) {
              this.pendingChanges[id][col] = { old: origVal, new: newVal, entryNum: r.entry_number };
            } else {
              delete this.pendingChanges[id][col];
              if (!Object.keys(this.pendingChanges[id]).length) delete this.pendingChanges[id];
            }
          }
          this.renderTable();
          this.updateEditBar();
        };

        let saving = false;
        let discarded = false;
        inp.addEventListener('keydown', async e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (!saving && !discarded) {
              saving = true;
              await commit();
            }
          }
          if (e.key === 'Escape') {
            discarded = true;
            this.renderTable();
          }
        });
        inp.addEventListener('blur', async () => {
          if (!saving && !discarded) {
            saving = true;
            await commit();
          }
        });
      },

      /* ── Orphan popover ── */
      bindOrphanPop() {
        document.getElementById('orphan-close-btn').addEventListener('click', () => this.closeOrphanPop());
        document.addEventListener('click', e => {
          const pop = document.getElementById('orphan-pop');
          if (pop.style.display !== 'none' && !pop.contains(e.target) && !e.target.closest('.row-orphan')) {
            this.closeOrphanPop();
          }
        });

        document.getElementById('orphan-add-btn').addEventListener('click', async () => {
          const name = this.activeOrphanAccount;
          if (!name) return;
          try {
            await sbPost('journal_accounts', { name, category: 'Other', company_id: this.companyId });
            Toast.success(`"${name}" added to accounts.`);
            this.closeOrphanPop();
            await this.loadAccounts();
            this.renderTable();
          } catch(e) { Toast.error('Failed: ' + e.message); }
        });

        document.getElementById('orphan-reassign-btn').addEventListener('click', async () => {
          const rowId  = this.activeOrphanId;
          const newAcc = document.getElementById('orphan-reassign-sel').value;
          if (!rowId || !newAcc) return;
          try {
            await sbPatch('general_journal', `id=eq.${rowId}`, { account: newAcc });
            Toast.success('Account reassigned.');
            this.closeOrphanPop();
            await this.loadEntries();
          } catch(e) { Toast.error('Failed: ' + e.message); }
        });
      },

      openOrphanPop(e, rowId, accountName) {
        e.stopPropagation();
        this.activeOrphanId      = rowId;
        this.activeOrphanAccount = accountName;
        document.getElementById('orphan-acct-name').textContent = accountName;

        const pop = document.getElementById('orphan-pop');
        const x = Math.min(e.clientX, window.innerWidth  - 280);
        const y = Math.min(e.clientY + 10, window.innerHeight - 220);
        pop.style.left    = `${x}px`;
        pop.style.top     = `${y}px`;
        pop.style.display = 'block';
      },

      closeOrphanPop() {
        document.getElementById('orphan-pop').style.display = 'none';
        this.activeOrphanId      = null;
        this.activeOrphanAccount = null;
      },

      /* ── Pagination ── */
      /* ── Sort toggle ── */
      toggleSort(col) {
        if (this.sortBy === col) {
          this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortBy = col;
          this.sortDir = 'desc';
        }
        this.page = 1;
        this.loadEntries();
      },

      updateHeaderSortIndicators() {
        const thEntry = document.getElementById('th-entry');
        const thDate = document.getElementById('th-date');
        if (!thEntry || !thDate) return;

        thEntry.querySelector('.sort-indicator').textContent = '';
        thDate.querySelector('.sort-indicator').textContent = '';

        const arrow = this.sortDir === 'asc' ? ' ▲' : ' ▼';
        if (this.sortBy === 'entry_number') {
          thEntry.querySelector('.sort-indicator').textContent = arrow;
        } else if (this.sortBy === 'date') {
          thDate.querySelector('.sort-indicator').textContent = arrow;
        }
      },

      /* ── Pagination ── */
      renderPagination() {
        const total = this.totalCount;
        const pages = Math.ceil(total / this.pageSize);
        const c     = document.getElementById('pagination');
        if (total === 0) { c.innerHTML = ''; return; }

        const start = (this.page - 1) * this.pageSize + 1;
        const end   = Math.min(this.page * this.pageSize, total);

        // Always show a window of 8 consecutive pages around current page
        const WINDOW = 8;
        const pageNums = [];
        if (pages <= WINDOW + 2) {
          // Few enough pages — just show all of them
          for (let i = 1; i <= pages; i++) pageNums.push(i);
        } else {
          // Slide a window of WINDOW pages centred around current page
          let start = Math.max(1, this.page - Math.floor(WINDOW / 2));
          let end   = start + WINDOW - 1;
          if (end > pages) { end = pages; start = Math.max(1, end - WINDOW + 1); }

          if (start > 1) {
            pageNums.push(1);
            if (start > 2) pageNums.push('...');
          }
          for (let i = start; i <= end; i++) pageNums.push(i);
          if (end < pages) {
            if (end < pages - 1) pageNums.push('...');
            pageNums.push(pages);
          }
        }

        const pageButtons = pageNums.map(n =>
          n === '...'
            ? `<span class="pagination__ellipsis">…</span>`
            : `<button class="pagination__page${n === this.page ? ' active' : ''}" ${n === this.page ? 'disabled' : ''} onclick="JournalApp.goPage(${n})">${n}</button>`
        ).join('');

        c.innerHTML = `
          <div class="pagination__left">
            <span class="pagination__info">Show</span>
            <select class="form-select" id="page-size-sel" style="font-size:0.72rem;padding:0.25rem 1.6rem 0.25rem 0.5rem;width:auto;" onchange="JournalApp.setPageSize(+this.value)">
              ${[10,30,50,100].map(n => `<option value="${n}"${n === this.pageSize ? ' selected' : ''}>${n}</option>`).join('')}
            </select>
            <span class="pagination__info">rows &nbsp;·&nbsp; ${start}–${end} of ${total}</span>
          </div>
          <div class="pagination__pages">
            <button class="pagination__page" ${this.page <= 1 ? 'disabled' : ''} onclick="JournalApp.goPage(${this.page - 1})" title="Previous">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            ${pageButtons}
            <button class="pagination__page" ${this.page >= pages ? 'disabled' : ''} onclick="JournalApp.goPage(${this.page + 1})" title="Next">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>`;
      },

      setPageSize(n) {
        this.pageSize = n;
        this.page = 1;
        this.loadEntries();
      },

      async goPage(n) {
        this.page = n;
        const section = document.getElementById('journal-entries-section');
        if (section) {
          section.style.minHeight = section.offsetHeight + 'px';
          const y = section.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top: y, behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        await this.loadEntries();
        if (section) section.style.minHeight = '';
      },

      /* ── Year filter (from DB) ── */
      async loadYears() { /* removed — year/month dropdowns no longer used */ },

      /* ── User detection (IP + browser) ── */
      async detectUser() {
        try {
          const r = await fetch('https://api.ipify.org?format=json');
          const j = await r.json();
          this.userIp = j.ip || 'unknown';
        } catch { this.userIp = 'unknown'; }
        const ua = navigator.userAgent;
        let browser = 'Unknown';
        if      (ua.includes('Edg'))                           browser = 'Edge';
        else if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
        else if (ua.includes('Firefox'))                       browser = 'Firefox';
        else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
        const mobile = /Mobi|Android|iPad/i.test(ua);
        this.deviceInfo = `${browser} · ${mobile ? 'Mobile' : 'Desktop'}`;
      },

      /* ── Bind Edit mode controls ── */
      bindEditMode() {
        document.getElementById('edit-toggle-btn').addEventListener('click', () => {
          this.editMode ? this.exitEditMode() : this.enterEditMode();
        });
        document.getElementById('edit-save-btn').addEventListener('click', () => this.saveAllChanges());
        document.getElementById('edit-discard-btn').addEventListener('click', () => this.discardAllChanges());
      },

      enterEditMode() {
        this.editMode = true;
        document.getElementById('edit-mode-bar').classList.add('active');
        document.getElementById('edit-toggle-btn').classList.add('btn-edit-active');
        document.getElementById('delete-col-header').style.display = '';
        this.renderTable();
        this.updateEditBar();
      },

      exitEditMode() {
        this.editMode = false;
        this.pendingChanges = {};
        this.pendingDeletes = new Set();
        // Always restore save button — it may still be disabled from a prior save
        const saveBtn = document.getElementById('edit-save-btn');
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save All Changes';
        }
        document.getElementById('edit-mode-bar').classList.remove('active');
        document.getElementById('edit-toggle-btn').classList.remove('btn-edit-active');
        document.getElementById('delete-col-header').style.display = 'none';
        this.renderTable();
      },

      updateEditBar() {
        const edits  = Object.keys(this.pendingChanges).length;
        const dels   = this.pendingDeletes.size;
        const parts  = [];
        if (edits) parts.push(`${edits} edit${edits > 1 ? 's' : ''}`);
        if (dels)  parts.push(`${dels} delete${dels > 1 ? 's' : ''}`);
        document.getElementById('edit-pending-count').textContent = parts.length ? `(${parts.join(', ')} pending)` : '';
      },

      /* ── Mark / unmark delete ── */
      async markDelete(entryNum) {
        const label = fmtEntry(entryNum);
        const ok = await BKDialog.ask({
          title: 'Delete Journal Entry',
          message: `Delete entry ${label}?\n\nBoth rows (debit + credit) will be permanently removed.\nThis cannot be undone after saving.`,
          okText: 'Delete',
          danger: true
        });
        if (!ok) return;
        this.pendingDeletes.add(entryNum);
        this.renderTable();
        this.updateEditBar();
      },

      unmarkDelete(entryNum) {
        this.pendingDeletes.delete(entryNum);
        this.renderTable();
        this.updateEditBar();
      },

      /* ── Save all staged changes ── */
      async saveAllChanges() {
        const btn = document.getElementById('edit-save-btn');
        btn.disabled = true;
        btn.textContent = 'Saving…';
        try {
          // 1. Process deletes
          for (const entryNum of this.pendingDeletes) {
            let filter = `entry_number=eq.${entryNum}`;
            if (this.companyId && this.companyId !== 'undefined' && this.companyId !== 'null') {
              filter += `&company_id=eq.${this.companyId}`;
            }
            await sbDelete('general_journal', filter);
            await this.logAction('DELETE', entryNum);
          }
          // 2. Process edits
          for (const [rowIdStr, fields] of Object.entries(this.pendingChanges)) {
            const rowId = parseInt(rowIdStr, 10);
            const patch = {};
            for (const [col, chg] of Object.entries(fields)) {
              patch[col] = chg.new;
              if (col === 'date' && chg.new) {
                const [yr, mo] = chg.new.split('-').map(Number);
                patch.year = yr; patch.month = mo;
              }
            }
            await sbPatch('general_journal', `id=eq.${rowId}`, patch);
            for (const [col, chg] of Object.entries(fields)) {
              await this.logAction('EDIT', chg.entryNum, col, chg.old, chg.new);
            }
          }
          Toast.success('All changes saved.');
          this.exitEditMode();
          // Auto-refresh logs modal if it's currently open
          if (document.getElementById('logs-overlay').classList.contains('open')) {
            this.loadLogs();
          }
          await this.loadEntries();
          await this.refreshNextBadge();
          await this.loadYears();
        } catch(e) {
          Toast.error('Save failed: ' + e.message);
          btn.disabled = false;
          btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save All Changes';
        }
      },

      discardAllChanges() {
        this.exitEditMode();
        Toast.show('Changes discarded.', 'success');
      },

      /* ── Log action to Supabase ── */
      async logAction(action, entryNumber, fieldChanged = null, oldValue = null, newValue = null) {
        try {
          await sbPost('journal_audit_log', {
            company_id:    this.companyId,
            action,
            entry_number:  entryNumber,
            entry_label:   fmtEntry(entryNumber),
            field_changed: fieldChanged,
            old_value:     oldValue !== null && oldValue !== undefined ? String(oldValue) : null,
            new_value:     newValue !== null && newValue !== undefined ? String(newValue) : null,
            ip_address:    this.userIp,
            device_info:   this.deviceInfo,
            logged_at:     new Date().toISOString(), // explicit — works even without DB DEFAULT
          });
        } catch(e) {
          console.error('Audit log failed:', e);
          Toast.show('Audit log not recorded: ' + e.message, 'error');
        }
      },

      /* ── Logs modal ── */
      bindLogs() {
        document.getElementById('logs-toggle-btn').addEventListener('click', () => this.openLogsModal());
        document.getElementById('logs-modal-close').addEventListener('click', () => this.closeLogsModal());
        document.getElementById('logs-refresh-btn').addEventListener('click', () => this.loadLogs());
        document.getElementById('log-month-filter').addEventListener('change', () => this.filterLogs());
        // Close on backdrop click
        document.getElementById('logs-overlay').addEventListener('click', e => {
          if (e.target === document.getElementById('logs-overlay')) this.closeLogsModal();
        });
        // Close on Escape
        document.addEventListener('keydown', e => {
          if (e.key === 'Escape' && document.getElementById('logs-overlay').classList.contains('open')) this.closeLogsModal();
        });
      },

      openLogsModal() {
        document.getElementById('logs-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';
        this.loadLogs();
      },

      closeLogsModal() {
        document.getElementById('logs-overlay').classList.remove('open');
        document.body.style.overflow = '';
      },

      _allLogRows: [], // cache for client-side month filter

      async loadLogs() {
        document.getElementById('log-list').innerHTML = '<p class="log-empty">Loading…</p>';
        try {
          let url = 'journal_audit_log?order=logged_at.desc&limit=500';
          if (this.companyId && this.companyId !== 'undefined' && this.companyId !== 'null') {
            url = `journal_audit_log?order=logged_at.desc&limit=500&company_id=eq.${this.companyId}`;
          }
          const rows = await sbGet(url);
          this._allLogRows = rows;
          this.populateLogMonths(rows);
          this.filterLogs();
        } catch(e) {
          document.getElementById('log-list').innerHTML = `<p class="log-empty" style="color:var(--danger);">Error: ${esc(e.message)}</p>`;
        }
      },

      populateLogMonths(rows) {
        const seen = new Set();
        const months = [];
        rows.forEach(r => {
          const d = new Date(r.logged_at);
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
          if (!seen.has(key)) {
            seen.add(key);
            months.push({ key, label: d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) });
          }
        });
        const sel = document.getElementById('log-month-filter');
        const prev = sel.value;
        sel.innerHTML = '<option value="">All months</option>';
        months.forEach(m => {
          const o = document.createElement('option');
          o.value = m.key; o.textContent = m.label;
          sel.appendChild(o);
        });
        if (prev) sel.value = prev;
      },

      filterLogs() {
        const month = document.getElementById('log-month-filter').value;
        const rows = month
          ? this._allLogRows.filter(r => {
              const d = new Date(r.logged_at);
              return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === month;
            })
          : this._allLogRows;
        this.renderLogs(rows);
      },

      renderLogs(rows) {
        const list = document.getElementById('log-list');
        if (!rows.length) {
          list.innerHTML = '<p class="log-empty">No log entries found.</p>';
          return;
        }
        // Group by calendar month
        const groups = {};
        rows.forEach(r => {
          const d = new Date(r.logged_at);
          const key = d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
          if (!groups[key]) groups[key] = [];
          groups[key].push(r);
        });
        list.innerHTML = Object.entries(groups).map(([monthLabel, entries]) => `
          <div class="log-month-group">
            <div class="log-month-label">${esc(monthLabel)}</div>
            ${entries.map(r => {
              const badge = `<span class="log-badge log-badge-${r.action.toLowerCase()}">${esc(r.action)}</span>`;
              let desc = '';
              if (r.action === 'ADD') {
                desc = `${badge} <strong>${esc(r.entry_label || '')}</strong>`;
              } else if (r.action === 'DELETE') {
                desc = `${badge} <strong>${esc(r.entry_label || '')}</strong>`;
              } else if (r.action === 'EDIT') {
                desc = `${badge} <strong>${esc(r.entry_label || '')}</strong> &mdash; ${esc(r.field_changed || '')}: <span class="log-diff-inline"><s>${esc(r.old_value ?? '—')}</s> &rarr; <ins>${esc(r.new_value ?? '—')}</ins></span>`;
              }
              const who = [r.ip_address, r.device_info].filter(Boolean).join(' · ');
              return `<div class="log-entry">
                <div class="log-entry__time">${this.fmtLogTime(r.logged_at)}</div>
                <div class="log-entry__desc">${desc}</div>
                <div class="log-entry__who">${esc(who)}</div>
              </div>`;
            }).join('')}
          </div>`).join('');
      },

      fmtLogTime(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' })
          + ' ' + d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
      },
    };


    document.addEventListener('DOMContentLoaded', () => JournalApp.init());
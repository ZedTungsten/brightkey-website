'use strict';

(function quotationFiles() {
  const PAGE_SIZE = 50;
  const byId = id => document.getElementById(id);

  function init({ sb, companyId, capture, restore, toast }) {
    if (!companyId || companyId === 'undefined' || companyId === 'null') return;
    const cache = new Map(); // This instance belongs to one authenticated company/page lifecycle.
    let modal = null;
    let returnFocus = null;
    let busy = false;
    let page = 0;
    let selectedId = null;
    let fileName = '';

    function open(id, trigger) {
      if (modal) return;
      modal = byId(id);
      returnFocus = trigger;
      document.querySelector('.dash-layout').inert = true;
      modal.style.display = 'flex';
      void modal.offsetHeight;
      modal.classList.add('open');
      modal.querySelector('input,button:not(:disabled)')?.focus();
    }

    function close() {
      if (!modal || busy) return;
      const closing = modal;
      closing.classList.remove('open');
      setTimeout(() => { if (modal !== closing) closing.style.display = 'none'; }, 200);
      document.querySelector('.dash-layout').inert = false;
      modal = null;
      returnFocus?.focus();
    }

    function setBusy(value) {
      busy = value;
      if (!modal) return;
      modal.setAttribute('aria-busy', String(value));
      modal.querySelectorAll('button,input').forEach(control => { control.disabled = value; });
      if (!value) {
        byId('quotation-confirm-load').disabled = !selectedId;
        updatePagination();
        if (!modal.contains(document.activeElement)) modal.querySelector('input:not(:disabled),button:not(:disabled)')?.focus();
      }
    }

    function updatePagination() {
      byId('quotation-files-prev').disabled = busy || page === 0;
      byId('quotation-files-next').disabled = busy || !cache.get(page)?.hasMore;
      byId('quotation-files-page').textContent = `Page ${page + 1}`;
    }

    function statusRow(message, loading = false) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 2;
      cell.className = 'quotation-files-status';
      if (loading) {
        const spinner = document.createElement('span');
        spinner.className = 'spinner-cyan';
        spinner.setAttribute('aria-hidden', 'true');
        cell.append(spinner, document.createElement('br'));
      }
      cell.append(document.createTextNode(message));
      row.append(cell);
      byId('quotation-file-list').replaceChildren(row);
    }

    function renderList(rows) {
      if (!rows.length) { statusRow('No saved quotations on this page.'); return; }
      byId('quotation-file-list').replaceChildren(...rows.map(record => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        const dateCell = document.createElement('td');
        const label = document.createElement('label');
        label.className = 'quotation-file-choice';
        const radio = document.createElement('input');
        radio.type = 'radio'; radio.name = 'saved-quotation'; radio.value = record.id;
        radio.addEventListener('change', () => { selectedId = record.id; byId('quotation-confirm-load').disabled = false; });
        const name = document.createElement('span');
        name.textContent = record.file_name;
        label.append(radio, name); nameCell.append(label);
        dateCell.textContent = new Intl.DateTimeFormat('en-PH', { dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Manila' }).format(new Date(record.created_at));
        row.append(nameCell, dateCell);
        return row;
      }));
    }

    async function loadList() {
      selectedId = null;
      byId('quotation-load-error').textContent = '';
      byId('quotation-files-retry').hidden = true;
      setBusy(true);
      try {
        // Refresh other users' saves after a one-minute expiry, never by polling.
        if (!cache.has(page) || Date.now() - cache.get(page).fetchedAt > 60000) {
          statusRow('Loading saved quotations...', true);
          const { data, error } = await sb.from('quotations').select('id,file_name,created_at').eq('company_id', companyId).order('created_at', { ascending:false }).order('id', { ascending:false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
          if (error) throw error;
          cache.set(page, { rows:data.slice(0, PAGE_SIZE), hasMore:data.length > PAGE_SIZE, fetchedAt:Date.now() });
        }
        renderList(cache.get(page).rows);
      } catch (_) {
        statusRow('Saved quotations could not be loaded.');
        byId('quotation-load-error').textContent = 'Please try again. Your current quotation has not changed.';
        byId('quotation-files-retry').hidden = false;
      } finally { setBusy(false); }
    }

    byId('quotation-open-save').addEventListener('click', event => {
      byId('quotation-file-name').value = fileName;
      byId('quotation-file-name').removeAttribute('aria-invalid');
      byId('quotation-save-error').textContent = '';
      open('quotation-save-modal', event.currentTarget);
    });
    byId('quotation-open-load').addEventListener('click', event => {
      open('quotation-load-modal', event.currentTarget);
      page = 0;
      loadList();
    });
    byId('quotation-save-form').addEventListener('submit', async event => {
      event.preventDefault();
      if (busy) return;
      const input = byId('quotation-file-name');
      const name = input.value.trim();
      if (!name || name.length > 120) {
        input.setAttribute('aria-invalid', 'true');
        byId('quotation-save-error').textContent = 'Enter a file name of up to 120 characters.';
        input.focus(); return;
      }
      input.removeAttribute('aria-invalid');
      byId('quotation-save-error').textContent = '';
      setBusy(true);
      byId('quotation-confirm-save').textContent = 'Saving...';
      try {
        const snapshot = capture();
        const { error } = await sb.from('quotations').insert({ company_id:companyId, file_name:name, snapshot });
        if (error) throw error;
        fileName = name;
        cache.clear();
        setBusy(false); close();
        toast('Quotation saved.');
      } catch (_) {
        byId('quotation-save-error').textContent = 'The quotation could not be saved. Your fields are still here; please try again.';
      } finally { setBusy(false); byId('quotation-confirm-save').textContent = 'Save Quotation'; }
    });
    byId('quotation-confirm-load').addEventListener('click', async () => {
      if (busy || !selectedId) return;
      setBusy(true);
      byId('quotation-confirm-load').textContent = 'Loading...';
      try {
        const { data, error } = await sb.from('quotations').select('id,file_name,snapshot').eq('company_id', companyId).eq('id', selectedId).single();
        if (error || !data) throw error || new Error('Quotation unavailable.');
        // Validate the entire snapshot before touching any of the current fields.
        const snapshot = window.BKQuotationDocument.validate(data.snapshot);
        restore(snapshot);
        fileName = data.file_name;
        setBusy(false); close(); toast('Quotation loaded.');
      } catch (_) {
        byId('quotation-load-error').textContent = 'This quotation could not be loaded. Your current quotation has not changed. Please try again.';
      } finally { setBusy(false); byId('quotation-confirm-load').textContent = 'Load Quotation'; }
    });
    byId('quotation-files-prev').addEventListener('click', () => { if (!busy && page > 0) { page--; loadList(); } });
    byId('quotation-files-next').addEventListener('click', () => { if (!busy && cache.get(page)?.hasMore) { page++; loadList(); } });
    byId('quotation-files-retry').addEventListener('click', () => { if (!busy) loadList(); });
    document.querySelectorAll('[data-quotation-close]').forEach(button => button.addEventListener('click', close));
    document.querySelectorAll('.quotation-modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
      overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key !== 'Tab') return;
        const controls = [...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(el => !el.hidden && el.getClientRects().length);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      });
    });
    byId('quotation-open-save').disabled = false;
    byId('quotation-open-load').disabled = false;
  }

  window.BKQuotationFiles = { init };
})();

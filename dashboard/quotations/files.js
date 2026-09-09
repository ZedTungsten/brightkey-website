'use strict';

(function quotationFiles() {
  const PAGE_SIZE = 50;
  const byId = id => document.getElementById(id);

  async function init({ sb, companyId, capture, restore, setQuotationNumber, markClean, toast }) {
    if (!companyId || companyId === 'undefined' || companyId === 'null') return;
    const cache = new Map(); // This instance belongs to one authenticated company/page lifecycle.
    let modal = null;
    let returnFocus = null;
    let busy = false;
    let page = 0;
    let selectedId = null;
    let fileName = '';
    let loadedId = null;
    let pendingDelete = null;
    let pendingOverwrite = null;

    async function loadNextQuotationNumber() {
      const date = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
      const prefix = window.BKQuotationDocument.nextQuotationNumber(date).slice(0, 6);
      const { data, error } = await sb.from('quotations').select('quotation_number').eq('company_id', companyId).like('quotation_number', `${prefix}-%`).order('quotation_number', { ascending:false }).limit(1).maybeSingle();
      if (error) throw error;
      setQuotationNumber(window.BKQuotationDocument.nextQuotationNumber(date, data?.quotation_number));
    }

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
      cell.colSpan = 3;
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
        const actionsCell = document.createElement('td');
        const label = document.createElement('label');
        label.className = 'quotation-file-choice';
        const radio = document.createElement('input');
        radio.type = 'radio'; radio.name = 'saved-quotation'; radio.value = record.id;
        radio.addEventListener('change', () => { selectedId = record.id; byId('quotation-confirm-load').disabled = false; });
        const name = document.createElement('span');
        name.textContent = record.file_name;
        label.append(radio, name); nameCell.append(label);
        dateCell.textContent = new Intl.DateTimeFormat('en-PH', { dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Manila' }).format(new Date(record.created_at));
        actionsCell.className = 'quotation-file-actions';
        const edit = document.createElement('button');
        edit.className = 'quotation-file-action'; edit.type = 'button'; edit.title = 'Rename quotation'; edit.setAttribute('aria-label', `Rename ${record.file_name}`);
        edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>';
        edit.addEventListener('click', () => beginRename(record, nameCell, actionsCell));
        const remove = document.createElement('button');
        remove.className = 'quotation-file-action delete'; remove.type = 'button'; remove.title = 'Delete quotation'; remove.setAttribute('aria-label', `Delete ${record.file_name}`);
        remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6"/></svg>';
        remove.addEventListener('click', () => openDeleteFile(record));
        actionsCell.append(edit, remove);
        row.append(nameCell, dateCell, actionsCell);
        return row;
      }));
    }

    function beginRename(record, nameCell, actionsCell) {
      let finished = false;
      const input = document.createElement('input');
      input.className = 'quotation-file-rename'; input.type = 'text'; input.maxLength = 120; input.value = record.file_name;
      input.setAttribute('aria-label', 'Quotation file name');
      nameCell.replaceChildren(input);
      actionsCell.replaceChildren();
      const finish = async save => {
        if (finished) return;
        finished = true;
        if (!save) { renderList(cache.get(page)?.rows || []); return; }
        const name = input.value.trim();
        if (!name) { finished = false; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
        setBusy(true);
        const { error } = await sb.from('quotations').update({ file_name:name }).eq('company_id', companyId).eq('id', record.id);
        if (error) { setBusy(false); toast('The quotation could not be renamed.', 'error'); renderList(cache.get(page)?.rows || []); return; }
        record.file_name = name;
        if (selectedId === record.id) fileName = name;
        cache.get(page).fetchedAt = Date.now();
        setBusy(false); renderList(cache.get(page).rows); toast('Quotation renamed.');
      };
      input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); finish(true); } else if (event.key === 'Escape') { event.preventDefault(); finish(false); } });
      input.addEventListener('blur', () => finish(true), { once:true });
      input.focus(); input.select();
    }

    function openDeleteFile(record) {
      pendingDelete = record;
      byId('quotation-delete-file-name').textContent = record.file_name;
      modal.classList.remove('open');
      modal.style.display = 'none';
      modal = byId('quotation-delete-file-modal');
      modal.style.display = 'flex'; void modal.offsetHeight; modal.classList.add('open');
      byId('quotation-cancel-delete-file').focus();
    }

    function returnToLoadModal() {
      modal.classList.remove('open');
      modal.style.display = 'none';
      modal = byId('quotation-load-modal');
      modal.style.display = 'flex'; void modal.offsetHeight; modal.classList.add('open');
    }

    function switchModal(id) {
      modal.classList.remove('open');
      modal.style.display = 'none';
      modal = byId(id);
      modal.style.display = 'flex'; void modal.offsetHeight; modal.classList.add('open');
    }

    function returnToSaveModal() {
      switchModal('quotation-save-modal');
      byId('quotation-file-name').focus();
    }

    async function persistSnapshot({ name, snapshot, existing = null }) {
      const target = existing || (loadedId ? { id:loadedId } : null);
      if (target) {
        const { data, error } = await sb.from('quotations').update({ file_name:name, snapshot }).eq('company_id', companyId).eq('id', target.id).select('id,quotation_number').single();
        if (error || !data?.quotation_number) throw error || new Error('Quotation could not be updated.');
        loadedId = data.id;
        setQuotationNumber(data.quotation_number);
      } else {
        const { data, error } = await sb.from('quotations').insert({ company_id:companyId, file_name:name, snapshot }).select('id,quotation_number').single();
        if (error || !data?.quotation_number) throw error || new Error('Quotation number was not generated.');
        loadedId = data.id;
        setQuotationNumber(data.quotation_number);
      }
      fileName = name;
      markClean?.();
      cache.clear();
    }

    async function deleteFile() {
      if (!pendingDelete || busy) return;
      const record = pendingDelete;
      setBusy(true);
      const { error } = await sb.from('quotations').delete().eq('company_id', companyId).eq('id', record.id);
      if (error) { setBusy(false); toast('The quotation could not be deleted.', 'error'); return; }
      cache.clear();
      if (selectedId === record.id) selectedId = null;
      pendingDelete = null;
      setBusy(false); returnToLoadModal();
      await loadList();
      toast('Quotation deleted.');
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
      byId('quotation-file-name').focus();
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
        const { data:existing, error:lookupError } = await sb.from('quotations').select('id,quotation_number').eq('company_id', companyId).eq('file_name', name).order('created_at', { ascending:false }).limit(1).maybeSingle();
        if (lookupError) throw lookupError;
        if (existing) {
          pendingOverwrite = { name, snapshot, existing };
          byId('quotation-overwrite-file-name').textContent = name;
          setBusy(false);
          switchModal('quotation-overwrite-modal');
          byId('quotation-cancel-overwrite').focus();
          return;
        }
        await persistSnapshot({ name, snapshot });
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
        const { data, error } = await sb.from('quotations').select('id,file_name,quotation_number,snapshot').eq('company_id', companyId).eq('id', selectedId).single();
        if (error || !data) throw error || new Error('Quotation unavailable.');
        // Validate the entire snapshot before touching any of the current fields.
        const snapshot = window.BKQuotationDocument.validate(data.snapshot);
        restore(snapshot);
        setQuotationNumber(data.quotation_number);
        fileName = data.file_name;
        loadedId = data.id;
        setBusy(false); close(); toast('Quotation loaded.');
      } catch (_) {
        byId('quotation-load-error').textContent = 'This quotation could not be loaded. Your current quotation has not changed. Please try again.';
      } finally { setBusy(false); byId('quotation-confirm-load').textContent = 'Load Quotation'; }
    });
    byId('quotation-files-prev').addEventListener('click', () => { if (!busy && page > 0) { page--; loadList(); } });
    byId('quotation-files-next').addEventListener('click', () => { if (!busy && cache.get(page)?.hasMore) { page++; loadList(); } });
    byId('quotation-files-retry').addEventListener('click', () => { if (!busy) loadList(); });
    byId('quotation-cancel-delete-file').addEventListener('click', () => { pendingDelete = null; returnToLoadModal(); });
    byId('quotation-confirm-delete-file').addEventListener('click', deleteFile);
    byId('quotation-cancel-overwrite').addEventListener('click', () => { pendingOverwrite = null; returnToSaveModal(); });
    byId('quotation-confirm-overwrite').addEventListener('click', async () => {
      if (!pendingOverwrite || busy) return;
      const pending = pendingOverwrite;
      setBusy(true);
      byId('quotation-confirm-overwrite').textContent = 'Overwriting...';
      try {
        await persistSnapshot(pending);
        pendingOverwrite = null;
        setBusy(false); close();
        toast('Quotation overwritten.');
      } catch (_) {
        setBusy(false);
        toast('The quotation could not be overwritten.', 'error');
      } finally { byId('quotation-confirm-overwrite').textContent = 'Overwrite'; }
    });
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
    await loadNextQuotationNumber().catch(error => {
      console.error('Unable to load the next quotation number:', error);
      setQuotationNumber('');
      toast('The quotation number preview could not be loaded.', 'error');
    });
  }

  window.BKQuotationFiles = { init };
})();

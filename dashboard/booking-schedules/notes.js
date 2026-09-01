(function () {
  'use strict';

  const PAGE_SIZE = 10;
  const state = { sb: null, companyId: null, notes: [], page: 0, total: 0, query: '', loading: false, editingId: null, deletingId: null, initialDraft: null, initialized: false };
  const allowedTags = new Set(['P', 'DIV', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'HR']);
  const $ = id => document.getElementById(id);

  function showToast(message, isError = false) {
    if (window.Toast) window.Toast.show(message, isError ? 'error' : 'success');
    else console.log(`${isError ? 'ERROR' : 'INFO'}: ${message}`);
  }

  function friendly(error, fallback) {
    console.error(error);
    return window.BKFriendlyError ? window.BKFriendlyError(error, fallback) : fallback;
  }

  function sanitizeHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const clean = document.createElement('div');

    function appendSafe(source, target) {
      Array.from(source.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          target.appendChild(document.createTextNode(node.textContent || ''));
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (!allowedTags.has(node.tagName)) {
          appendSafe(node, target);
          return;
        }
        const element = document.createElement(node.tagName.toLowerCase());
        appendSafe(node, element);
        target.appendChild(element);
      });
    }

    appendSafe(template.content, clean);
    return clean.innerHTML;
  }

  function hasContent(html) {
    const probe = document.createElement('div');
    probe.innerHTML = html;
    return Boolean(probe.textContent.trim() || probe.querySelector('hr'));
  }

  function currentDraft() {
    const contentHtml = sanitizeHtml($('installer-note-editor').innerHTML);
    return {
      title: $('installer-note-title').value,
      contentHtml: hasContent(contentHtml) ? contentHtml : ''
    };
  }

  function setModalOpen(modal, open) {
    if (open) {
      modal.style.display = 'flex';
      modal.offsetHeight;
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    } else {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      setTimeout(() => { modal.style.display = 'none'; }, 150);
    }
  }

  function openEditor(note = null) {
    state.editingId = note?.id || null;
    $('installer-note-modal-title').textContent = note ? 'Edit Note' : 'Create Notes';
    $('installer-note-title').value = note?.title || '';
    $('installer-note-editor').innerHTML = sanitizeHtml(note?.content_html || '');
    state.initialDraft = currentDraft();
    $('installer-note-form-error').textContent = '';
    setModalOpen($('installer-note-modal'), true);
    setTimeout(() => $('installer-note-title').focus(), 0);
  }

  function closeEditor() {
    setModalOpen($('installer-note-modal'), false);
    state.editingId = null;
    state.initialDraft = null;
  }

  function hasUnsavedChanges() {
    if (!state.initialDraft) return false;
    const draft = currentDraft();
    return draft.title !== state.initialDraft.title || draft.contentHtml !== state.initialDraft.contentHtml;
  }

  function requestCloseEditor() {
    if (!hasUnsavedChanges()) {
      closeEditor();
      return;
    }
    setModalOpen($('discard-installer-note-modal'), true);
  }

  function keepEditing() {
    setModalOpen($('discard-installer-note-modal'), false);
    setTimeout(() => $('installer-note-title').focus(), 150);
  }

  function discardEditorChanges() {
    setModalOpen($('discard-installer-note-modal'), false);
    closeEditor();
  }

  function render() {
    const body = $('installer-notes-tbody');
    if (!state.notes.length) {
      body.innerHTML = `<tr><td colspan="3"><div class="installer-notes-empty">${state.query ? 'No notes match your search.' : 'No notes have been created yet.'}</div></td></tr>`;
      return;
    }

    const rows = state.notes.map(note => {
      const row = document.createElement('tr');
      const titleCell = document.createElement('td');
      const contentCell = document.createElement('td');
      const actionsCell = document.createElement('td');
      titleCell.className = 'installer-note-title-cell';
      titleCell.textContent = note.title;
      contentCell.className = 'installer-note-content-cell';
      contentCell.innerHTML = sanitizeHtml(note.content_html);
      actionsCell.innerHTML = `<div class="installer-note-actions">
        <button type="button" class="installer-note-action edit" data-id="${note.id}" aria-label="Edit note" title="Edit note"><svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg></button>
        <button type="button" class="installer-note-action delete" data-id="${note.id}" aria-label="Delete note" title="Delete note"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4h6v2"></path></svg></button>
      </div>`;
      row.append(titleCell, contentCell, actionsCell);
      return row;
    });
    const spacer = document.createElement('tr');
    spacer.className = 'installer-notes-spacer-row';
    const spacerCell = document.createElement('td');
    spacerCell.colSpan = 3;
    spacer.appendChild(spacerCell);
    body.replaceChildren(...rows, spacer);
  }

  function paginationItems(totalPages, currentPage) {
    if (totalPages <= 10) return Array.from({ length: totalPages }, (_, index) => index + 1);
    const middleStart = Math.min(Math.max(currentPage - 1, 4), totalPages - 6);
    const pages = [1, 2, 3, ...Array.from({ length: 4 }, (_, index) => middleStart + index), totalPages - 2, totalPages - 1, totalPages];
    return [...new Set(pages)].reduce((items, page, index, uniquePages) => {
      if (index && page - uniquePages[index - 1] > 1) items.push('ellipsis');
      items.push(page);
      return items;
    }, []);
  }

  function updatePagination(rowCount) {
    const start = state.total ? state.page * PAGE_SIZE + 1 : 0;
    const end = Math.min(state.page * PAGE_SIZE + rowCount, state.total);
    const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    $('installer-notes-page-summary').textContent = `${start.toLocaleString()}–${end.toLocaleString()} of ${state.total.toLocaleString()} · Page ${state.page + 1} of ${pages}`;
    $('installer-notes-page-numbers').innerHTML = paginationItems(pages, state.page + 1).map(item => item === 'ellipsis'
      ? '<span class="installer-notes-page-ellipsis" aria-hidden="true">…</span>'
      : `<button class="installer-notes-page-number${item === state.page + 1 ? ' active' : ''}" type="button" data-page="${item}"${state.loading ? ' disabled' : ''}${item === state.page + 1 ? ' aria-current="page"' : ''}>${item}</button>`).join('');
    $('installer-notes-previous-page').disabled = state.loading || state.page === 0;
    $('installer-notes-next-page').disabled = state.loading || end >= state.total;
  }

  async function loadNotes() {
    if (state.loading) return;
    state.loading = true;
    $('installer-notes-tbody').innerHTML = '<tr><td colspan="3"><div class="installer-notes-loading"><span class="spinner-cyan"></span><span>Loading notes...</span></div></td></tr>';
    updatePagination(0);
    const from = state.page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let request = state.sb
      .from('installer_notes')
      .select('id,title,content_html,created_at,updated_at', { count: 'exact' })
      .eq('company_id', state.companyId);
    if (state.query) {
      const term = state.query.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
      if (term) request = request.or(`title.ilike.%${term}%,content_html.ilike.%${term}%`);
    }
    const { data, error, count } = await request
      .order('updated_at', { ascending: false })
      .range(from, to);
    try {
      if (error) throw error;
      state.total = count || 0;
      state.notes = data || [];
      render();
    } finally {
      state.loading = false;
      updatePagination(state.notes.length);
    }
  }

  async function saveNote(event) {
    event.preventDefault();
    const title = $('installer-note-title').value.trim();
    const contentHtml = sanitizeHtml($('installer-note-editor').innerHTML);
    const errorNode = $('installer-note-form-error');
    if (!title || !hasContent(contentHtml)) {
      errorNode.textContent = 'Enter both a title and note content.';
      (!title ? $('installer-note-title') : $('installer-note-editor')).focus();
      return;
    }

    const saveButton = $('save-installer-note');
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    const wasEditing = Boolean(state.editingId);
    try {
      const payload = { company_id: state.companyId, title, content_html: contentHtml, updated_at: new Date().toISOString() };
      const query = state.editingId
        ? state.sb.from('installer_notes').update(payload).eq('id', state.editingId).eq('company_id', state.companyId)
        : state.sb.from('installer_notes').insert(payload);
      const { error } = await query;
      if (error) throw error;
      closeEditor();
      if (!wasEditing) state.page = 0;
      await loadNotes();
      showToast(wasEditing ? 'Note updated successfully.' : 'Note created successfully.');
    } catch (error) {
      errorNode.textContent = friendly(error, 'The note could not be saved. Please try again.');
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Save Note';
    }
  }

  function requestDelete(id) {
    state.deletingId = id;
    setModalOpen($('delete-installer-note-modal'), true);
  }

  async function deleteNote() {
    if (!state.deletingId) return;
    const button = $('confirm-delete-installer-note');
    button.disabled = true;
    button.textContent = 'Deleting...';
    try {
      const { error } = await state.sb.from('installer_notes').delete().eq('id', state.deletingId).eq('company_id', state.companyId);
      if (error) throw error;
      setModalOpen($('delete-installer-note-modal'), false);
      state.deletingId = null;
      if (state.notes.length === 1 && state.page > 0) state.page -= 1;
      await loadNotes();
      showToast('Note deleted successfully.');
    } catch (error) {
      showToast(friendly(error, 'The note could not be deleted. Please try again.'), true);
    } finally {
      button.disabled = false;
      button.textContent = 'Delete';
    }
  }

  function bindEvents() {
    $('create-installer-note').addEventListener('click', () => openEditor());
    $('close-installer-note-modal').addEventListener('click', requestCloseEditor);
    $('cancel-installer-note').addEventListener('click', requestCloseEditor);
    $('installer-note-form').addEventListener('submit', saveNote);
    $('keep-editing-installer-note').addEventListener('click', keepEditing);
    $('discard-installer-note-changes').addEventListener('click', discardEditorChanges);
    $('installer-note-editor').addEventListener('paste', event => {
      event.preventDefault();
      document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
    });
    $('installer-note-editor').addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      document.execCommand(event.shiftKey ? 'insertLineBreak' : 'insertParagraph', false);
    });
    document.querySelectorAll('.installer-note-tool').forEach(button => {
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => {
        $('installer-note-editor').focus();
        document.execCommand(button.dataset.command, false);
      });
    });
    $('installer-notes-tbody').addEventListener('click', event => {
      const button = event.target.closest('.installer-note-action');
      if (!button) return;
      const note = state.notes.find(item => item.id === button.dataset.id);
      if (!note) return;
      if (button.classList.contains('edit')) openEditor(note);
      else requestDelete(note.id);
    });
    $('cancel-delete-installer-note').addEventListener('click', () => {
      state.deletingId = null;
      setModalOpen($('delete-installer-note-modal'), false);
    });
    $('confirm-delete-installer-note').addEventListener('click', deleteNote);
    $('installer-notes-page-numbers').addEventListener('click', event => {
      const button = event.target.closest('[data-page]');
      if (!button || state.loading) return;
      state.page = Number(button.dataset.page) - 1;
      loadNotes();
    });
    $('installer-notes-previous-page').addEventListener('click', () => {
      if (state.page > 0 && !state.loading) { state.page -= 1; loadNotes(); }
    });
    $('installer-notes-next-page').addEventListener('click', () => {
      if ((state.page + 1) * PAGE_SIZE < state.total && !state.loading) { state.page += 1; loadNotes(); }
    });
    let searchTimer;
    $('installer-notes-search').addEventListener('input', event => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        state.query = event.target.value.trim();
        state.page = 0;
        loadNotes();
      }, 250);
    });
  }

  async function init({ sb, companyId }) {
    state.sb = sb;
    state.companyId = companyId;
    if (!state.initialized) {
      bindEvents();
      state.initialized = true;
    }
    try {
      await loadNotes();
    } catch (error) {
      $('installer-notes-tbody').innerHTML = '<tr><td colspan="3"><div class="installer-notes-empty">Notes could not be loaded. Refresh the page and try again.</div></td></tr>';
      showToast(friendly(error, 'Notes could not be loaded. Refresh the page and try again.'), true);
    }
  }

  window.BKInstallerNotes = Object.freeze({ init });
})();

'use strict';

(function () {
  let editingId = null;

  function context() {
    return window.BKResourcesEditorContext();
  }

  function isEditableLink(item) {
    return item.type !== 'folder' && (
      item.file_type === 'youtube'
      || (item.file_url && (item.file_url.includes('google.com') || item.file_url.includes('drive.google.com')))
    );
  }

  function menuItem(item) {
    if (!isEditableLink(item)) return '';
    return `
      <div class="card-dropdown-item" onclick="BKResourceEditor.open(event, '${item.id}')">
        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
        Edit
      </div>`;
  }

  function toggleFields(source) {
    document.getElementById('edit-resource-gdrive-type-group').style.display = source === 'gdrive' ? 'block' : 'none';
  }

  function open(event, id) {
    event.stopPropagation();
    const state = context();
    if (!state.canEdit) return;
    const resource = state.resources.find(item => item.id === id && isEditableLink(item));
    if (!resource) return;

    editingId = id;
    const source = resource.file_type === 'youtube' ? 'youtube' : 'gdrive';
    document.getElementById('edit-resource-source-type').value = source;
    document.getElementById('edit-resource-gdrive-type').value = source === 'gdrive' ? resource.file_type : '';
    document.getElementById('edit-resource-url').value = resource.file_url || '';
    toggleFields(source);
    window.openModal('edit-resource-modal');
  }

  async function save() {
    const state = context();
    if (!state.canEdit || !editingId) return;
    const source = document.getElementById('edit-resource-source-type').value;
    const url = document.getElementById('edit-resource-url').value.trim();
    const fileType = source === 'youtube' ? 'youtube' : document.getElementById('edit-resource-gdrive-type').value;

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (_) {
      window.showToast('Please enter a valid resource link.', true);
      return;
    }

    const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
    if (source === 'youtube' && !['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
      window.showToast('Please enter a YouTube or youtu.be link.', true);
      return;
    }
    if (source === 'gdrive' && (!fileType || !['drive.google.com', 'docs.google.com'].includes(host))) {
      window.showToast(fileType ? 'Please enter a Google Drive link.' : 'Please select the Google Drive file type.', true);
      return;
    }
    if (source === 'gdrive' && host === 'drive.google.com' && parsedUrl.pathname.split('/').includes('folders')) {
      window.showToast('Open the individual file in Drive and copy its file link instead.', true);
      return;
    }

    const button = document.getElementById('btn-save-resource-edit');
    button.disabled = true;
    try {
      const { error } = await state.sb.from('sales_resources')
        .update({ file_url: url, file_type: fileType, updated_at: new Date().toISOString() })
        .eq('id', editingId)
        .eq('company_id', state.companyId);
      if (error) throw error;
      window.closeModal('edit-resource-modal');
      editingId = null;
      window.showToast('Resource updated.');
      await state.reload();
    } catch (error) {
      console.error(error);
      window.showToast('Unable to update this resource. Please try again.', true);
    } finally {
      button.disabled = false;
    }
  }

  window.BKResourceEditor = { menuItem, open, save, toggleFields };
  window.saveResourceEdit = save;
  window.toggleEditResourceFields = toggleFields;
})();

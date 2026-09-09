'use strict';

window.WarehouseInspectedPending = (() => {
  const STORAGE_BUCKET = 'brightkey-assets';
  const MAX_PENDING = 6;
  const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
  const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic']);
  const COMPRESSIBLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);
  const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);
  const MAX_VIDEO_SECONDS = 15;
  let sb;
  let companyId;
  let pending = [];
  let selectedRecord = null;
  let requirements = [];
  let requirementUploads = [];
  let onCompleted = async () => {};

  const byId = id => document.getElementById(id);

  function approvedImageUrl(value) {
    const url = String(value || '').trim();
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url)) return url;
    try {
      const parsed = new URL(url, window.location.origin);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch {
      return '';
    }
  }

  function showToast(message, isError = false) {
    window.WarehousePage.showToast(message, isError);
  }

  function openModal(id = 'inspect-complete-modal') {
    const modal = byId(id);
    modal.inert = false;
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    if (id === 'inspect-complete-modal') byId('inspect-complete-requirements').querySelector('button')?.focus({ preventScroll: true });
    else modal.querySelector('button')?.focus({ preventScroll: true });
  }

  function closeModal(id = 'inspect-complete-modal') {
    const modal = byId(id);
    modal.classList.remove('open');
    if (modal.contains(document.activeElement)) document.activeElement.blur();
    modal.inert = true;
    modal.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      if (!modal.classList.contains('open')) modal.style.display = 'none';
    }, 150);
  }

  function cardImage(record) {
    const source = approvedImageUrl(record.image_main);
    if (!source) {
      const fallback = document.createElement('div');
      fallback.className = 'pending-inspection-image pending-inspection-image-fallback';
      fallback.textContent = 'No image';
      return fallback;
    }
    const image = document.createElement('img');
    image.className = 'pending-inspection-image';
    image.alt = `${record.sku} product`;
    image.src = source;
    image.addEventListener('error', () => {
      const fallback = document.createElement('div');
      fallback.className = 'pending-inspection-image pending-inspection-image-fallback';
      fallback.textContent = 'Image unavailable';
      image.replaceWith(fallback);
    }, { once: true });
    return image;
  }

  function openRecord(record) {
    selectedRecord = record;
    resetRequirementUploads();
    byId('inspect-complete-code').textContent = record.code;
    byId('inspect-complete-form').reset();
    byId('inspect-complete-requirements').classList.remove('form-error');
    byId('inspect-complete-employee').classList.remove('form-error');
    renderRequirements();
    openModal();
  }

  function render() {
    const section = byId('pending-inspections');
    const grid = byId('pending-inspection-grid');
    grid.replaceChildren();
    section.hidden = pending.length === 0;
    byId('pending-inspections-count').textContent = `${pending.length} of ${MAX_PENDING}`;
    pending.forEach(record => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'pending-inspection-card';
      card.setAttribute('aria-label', `Complete inspection ${record.code}`);
      const copy = document.createElement('span');
      copy.className = 'pending-inspection-copy';
      const sku = document.createElement('strong');
      sku.className = 'pending-inspection-sku';
      sku.textContent = record.sku;
      const date = document.createElement('span');
      date.className = 'pending-inspection-date';
      date.textContent = new Date(record.created_at).toLocaleDateString('en-PH', { dateStyle: 'medium' });
      const code = document.createElement('span');
      code.className = 'pending-inspection-code';
      code.textContent = record.code;
      copy.append(sku, date, code);
      card.append(cardImage(record), copy);
      card.addEventListener('click', () => openRecord(record));
      grid.appendChild(card);
    });
    const createButton = byId('create-inspect-btn');
    createButton.classList.toggle('pending-limit-reached', pending.length >= MAX_PENDING);
    createButton.setAttribute('aria-disabled', String(pending.length >= MAX_PENDING));
    createButton.title = pending.length >= MAX_PENDING ? 'Complete a pending inspection before creating another.' : '';
  }

  async function refresh() {
    const { data, error } = await sb.from('warehouse_inspections')
      .select('id, product_id, sku, code, created_at')
      .eq('company_id', companyId)
      .eq('inspection_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(MAX_PENDING);
    if (error) throw error;
    const productIds = [...new Set((data || []).map(record => record.product_id).filter(Boolean))];
    let productById = new Map();
    if (productIds.length) {
      const { data: products, error: productError } = await sb.from('products')
        .select('id, image_main')
        .eq('company_id', companyId)
        .in('id', productIds)
        .limit(MAX_PENDING);
      if (productError) throw productError;
      productById = new Map((products || []).map(product => [product.id, product]));
    }
    pending = (data || []).map(record => ({ ...record, image_main: productById.get(record.product_id)?.image_main || '' }));
    render();
  }

  function mediaKind(file) {
    const extension = String(file.name || '').split('.').pop()?.toLowerCase();
    if (IMAGE_TYPES.has(file.type) || ['png', 'jpg', 'jpeg', 'heic'].includes(extension)) return 'image';
    if (VIDEO_TYPES.has(file.type) || ['mov', 'mp4'].includes(extension)) return 'video';
    return '';
  }

  function videoDuration(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const objectUrl = URL.createObjectURL(file);
      const cleanup = () => URL.revokeObjectURL(objectUrl);
      video.preload = 'metadata';
      video.addEventListener('loadedmetadata', () => {
        const duration = video.duration;
        cleanup();
        Number.isFinite(duration) ? resolve(duration) : reject(new Error('Video duration is unavailable.'));
      }, { once: true });
      video.addEventListener('error', () => {
        cleanup();
        reject(new Error('The video could not be read.'));
      }, { once: true });
      video.src = objectUrl;
    });
  }

  async function validateFile(file) {
    const kind = mediaKind(file);
    if (kind === 'image') return file.size <= MAX_IMAGE_BYTES ? '' : `${file.name} exceeds the 15 MB image limit.`;
    if (kind === 'video') {
      try {
        const duration = await videoDuration(file);
        return duration <= MAX_VIDEO_SECONDS + .05 ? '' : `${file.name} exceeds the 15-second video limit.`;
      } catch {
        return `${file.name} could not be read as a MOV or MP4 video.`;
      }
    }
    return `${file.name} must be a PNG, JPG, HEIC, MOV, or MP4 file.`;
  }

  function resetRequirementUploads() {
    requirementUploads.forEach(item => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    requirementUploads = requirements.map(requirement => ({ requirement, file: null, previewUrl: '', url: '', status: 'empty', progress: 0 }));
  }

  function previewFor(item) {
    const preview = document.createElement('div');
    preview.className = 'inspection-requirement-preview';
    const source = item.previewUrl || approvedImageUrl(item.requirement.guide_url);
    if (item.previewUrl && mediaKind(item.file) === 'video') {
      const video = document.createElement('video');
      video.src = source;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('aria-label', `${item.requirement.label} selected video`);
      preview.append(video);
    } else if (source) {
      const image = document.createElement('img');
      image.src = source;
      image.alt = item.previewUrl ? `${item.requirement.label} selected media` : `${item.requirement.label} guide`;
      if (!item.previewUrl) image.className = 'inspection-requirement-guide';
      image.addEventListener('error', () => {
        preview.replaceChildren(document.createTextNode('Guide unavailable'));
      }, { once: true });
      preview.append(image);
    } else {
      preview.textContent = 'Media placeholder';
    }
    return preview;
  }

  function renderRequirements() {
    const container = byId('inspect-complete-requirements');
    container.replaceChildren();
    requirementUploads.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = `inspection-requirement${item.status === 'error' ? ' error' : ''}`;
      const label = document.createElement('div');
      label.className = 'inspection-requirement-label';
      label.textContent = item.requirement.label;
      const input = document.createElement('input');
      input.type = 'file';
      input.hidden = true;
      input.accept = 'image/png,image/jpeg,image/heic,.heic,video/mp4,video/quicktime,.mov';
      input.addEventListener('change', event => selectRequirementFile(event, index));
      const upload = document.createElement('button');
      upload.type = 'button';
      upload.className = 'btn btn-outline inspection-requirement-upload';
      upload.disabled = item.status === 'uploading';
      upload.textContent = item.status === 'error' ? 'Retry Upload' : item.url ? 'Replace Media' : item.status === 'uploading' ? 'Uploading...' : 'Upload Media';
      upload.addEventListener('click', () => item.status === 'error' && item.file ? uploadRequirement(index) : input.click());
      const progress = document.createElement('div');
      progress.className = 'inspection-requirement-progress';
      progress.hidden = item.status !== 'uploading';
      const bar = document.createElement('span');
      bar.style.width = `${item.progress}%`;
      progress.append(bar);
      const status = document.createElement('div');
      status.className = `inspection-requirement-status${item.status === 'done' ? ' success' : item.status === 'error' ? ' error' : item.requirement.required ? ' required' : ''}`;
      status.textContent = item.status === 'done' ? 'Upload complete' : item.status === 'error' ? 'Upload failed. Retry this item.' : item.status === 'uploading' ? `${item.progress}% uploaded` : item.requirement.required ? 'Required' : 'Optional';
      card.append(label, previewFor(item), input, upload, progress, status);
      container.append(card);
    });
  }

  async function selectRequirementFile(event, index) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const validationError = await validateFile(file);
    if (validationError) {
      showToast(validationError, true);
      return;
    }
    const item = requirementUploads[index];
    const previousUrl = item.url;
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    item.file = file;
    item.previewUrl = URL.createObjectURL(file);
    await uploadRequirement(index, previousUrl);
  }

  async function uploadRequirement(index, previousUrl = '') {
    const item = requirementUploads[index];
    const file = item.file;
    if (!file || item.status === 'uploading') return;
    item.status = 'uploading';
    item.progress = 8;
    item.url = '';
    byId('inspect-complete-requirements').classList.remove('form-error');
    renderRequirements();
    const progressTimer = setInterval(() => {
      if (item.status !== 'uploading') return clearInterval(progressTimer);
      item.progress = Math.min(88, item.progress + 7);
      renderRequirements();
    }, 180);
    try {
      item.url = await uploadMedia(file);
      item.progress = 100;
      item.status = 'done';
      if (previousUrl) await removeUploads([previousUrl]);
    } catch (error) {
      console.error(error);
      item.progress = 0;
      item.status = 'error';
      showToast(`${item.requirement.label} could not be uploaded. Retry this item.`, true);
    } finally {
      clearInterval(progressTimer);
      renderRequirements();
    }
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => blob
          ? resolve(new File([blob], `${crypto.randomUUID()}.jpg`, { type: 'image/jpeg' }))
          : reject(new Error('An image could not be compressed.')), 'image/jpeg', .8);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('An image could not be read.'));
      };
      image.src = objectUrl;
    });
  }

  async function uploadMedia(file) {
    const originalExtension = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const shouldCompress = COMPRESSIBLE_IMAGE_TYPES.has(file.type) || ['jpg', 'jpeg', 'png'].includes(originalExtension);
    const prepared = shouldCompress ? await compressImage(file) : file;
    const extension = shouldCompress ? 'jpg' : originalExtension || 'mp4';
    const path = `companies/${companyId}/warehouse-inspected/${crypto.randomUUID()}.${extension}`;
    const allowedType = IMAGE_TYPES.has(prepared.type) || VIDEO_TYPES.has(prepared.type) ? prepared.type : '';
    const contentType = allowedType || (mediaKind(file) === 'image' ? 'image/heic' : extension === 'mov' ? 'video/quicktime' : 'video/mp4');
    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, prepared, { contentType, cacheControl: '31536000', upsert: false });
    if (error) throw error;
    return sb.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function removeUploads(urls) {
    const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
    const paths = urls.map(url => {
      const index = String(url).indexOf(marker);
      return index < 0 ? null : decodeURIComponent(String(url).slice(index + marker.length));
    }).filter(Boolean);
    if (paths.length) await sb.storage.from(STORAGE_BUCKET).remove(paths);
  }

  async function complete(event) {
    event.preventDefault();
    if (!selectedRecord) return;
    const employeeSelect = byId('inspect-complete-employee');
    const employee = employeeSelect.selectedOptions[0];
    const uploadsComplete = requirementUploads.length > 0 && requirementUploads.every(item => !item.requirement.required || (item.status === 'done' && item.url));
    const uploadInProgress = requirementUploads.some(item => item.status === 'uploading');
    employeeSelect.classList.toggle('form-error', !employee?.value);
    byId('inspect-complete-requirements').classList.toggle('form-error', !uploadsComplete);
    if (uploadInProgress) {
      showToast('Wait for each media upload to finish.', true);
      return;
    }
    if (!employee?.value || !uploadsComplete) {
      showToast('Upload every required inspection media item and select a Warehouse Member.', true);
      return;
    }
    const button = byId('inspect-complete-save');
    button.disabled = true;
    button.textContent = 'Saving...';
    const uploaded = requirementUploads.map(item => item.url).filter(Boolean);
    try {
      const { data, error } = await sb.from('warehouse_inspections')
        .update({
          media_urls: uploaded,
          inspected_by: employee.value,
          inspected_by_name: employee.textContent.trim(),
          inspected_at: new Date().toISOString(),
          inspection_status: 'completed'
        })
        .eq('id', selectedRecord.id)
        .eq('company_id', companyId)
        .eq('inspection_status', 'pending')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('This pending inspection is no longer available.');
      closeModal();
      selectedRecord = null;
      requirementUploads.forEach(item => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        item.previewUrl = '';
      });
      showToast('Inspection completed.');
      await Promise.all([refresh(), onCompleted()]);
    } catch (error) {
      console.error(error);
      showToast('The inspection could not be completed. Please try again.', true);
    } finally {
      button.disabled = false;
      button.textContent = 'Complete';
    }
  }

  function confirmDelete() {
    if (!selectedRecord) return;
    byId('inspect-pending-delete-title').textContent = `Delete ${selectedRecord.code}`;
    openModal('inspect-pending-delete-modal');
  }

  async function deletePendingRequest() {
    if (!selectedRecord) return;
    const button = byId('inspect-pending-delete-confirm');
    button.disabled = true;
    button.textContent = 'Deleting...';
    try {
      const { data, error } = await sb.from('warehouse_inspections')
        .delete()
        .eq('id', selectedRecord.id)
        .eq('company_id', companyId)
        .eq('inspection_status', 'pending')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('This pending inspection is no longer available.');
      const uploaded = requirementUploads.map(item => item.url).filter(Boolean);
      await removeUploads(uploaded);
      closeModal('inspect-pending-delete-modal');
      closeModal();
      selectedRecord = null;
      resetRequirementUploads();
      showToast('Inspection request deleted.');
      await refresh();
    } catch (error) {
      console.error(error);
      showToast('The inspection request could not be deleted. Please try again.', true);
    } finally {
      button.disabled = false;
      button.textContent = 'Delete Request';
    }
  }

  async function loadRequirements() {
    const { data, error } = await sb.from('global_settings')
      .select('value')
      .eq('company_id', companyId)
      .eq('key', 'inspection_checklist')
      .maybeSingle();
    if (error) throw error;
    const configured = Array.isArray(data?.value) ? data.value : [];
    requirements = configured.slice(0, 5).map((item, index) => ({
      id: String(item?.id || `inspection-${index + 1}`),
      label: String(item?.label || '').trim(),
      guide_url: approvedImageUrl(item?.guide_url),
      required: item?.required !== false
    })).filter(item => item.label && item.guide_url);
    if (!requirements.length) requirements = [{ id: 'inspection-media', label: 'Inspection Media', guide_url: '', required: true }];
    resetRequirementUploads();
    renderRequirements();
  }

  async function init(options) {
    sb = options.sb;
    companyId = options.companyId;
    onCompleted = options.onCompleted || onCompleted;
    const memberSelect = byId('inspect-complete-employee');
    const sourceSelect = options.memberSelect;
    memberSelect.replaceChildren(...[...sourceSelect.options].map(option => option.cloneNode(true)));
    byId('inspect-complete-employee').addEventListener('change', event => event.target.classList.remove('form-error'));
    byId('inspect-complete-form').addEventListener('submit', complete);
    byId('inspect-complete-delete').addEventListener('click', confirmDelete);
    byId('inspect-pending-delete-confirm').addEventListener('click', deletePendingRequest);
    await Promise.all([loadRequirements(), refresh()]);
  }

  return {
    init,
    refresh,
    atCapacity: () => pending.length >= MAX_PENDING
  };
})();

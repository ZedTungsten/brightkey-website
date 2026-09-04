'use strict';

(() => {
  const STORAGE_BUCKET = 'brightkey-assets';
  const PAGE_SIZE = 50;
  const MAX_MEDIA = 5;
  const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
  const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
  const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
  let sb;
  let companyId;
  let records = [];
  let selectedFiles = [];
  let productResults = [];
  let businesses = [];
  let selectedGuideline = null;
  let currentPage = 0;
  let totalRecords = 0;
  let skuSearchTimer;
  let guidelineRequestId = 0;
  const modalReturnFocus = new WeakMap();
  const activeView = window.location.pathname.replace(/\/+$/, '').endsWith('/deployed') ? 'deployed' : 'in-stock';
  let deployedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const byId = id => document.getElementById(id);

  function renderActiveView() {
    const deployed = activeView === 'deployed';
    byId('in-stock-subtab').classList.toggle('active', !deployed);
    byId('deployed-subtab').classList.toggle('active', deployed);
    byId('in-stock-panel').hidden = deployed;
    byId('in-stock-panel').classList.toggle('active', !deployed);
    byId('deployed-panel').hidden = !deployed;
    byId('deployed-panel').classList.toggle('active', deployed);
    byId('create-inspect-btn').hidden = deployed;
    renderDeployedMonth();
  }

  function renderDeployedMonth() {
    byId('deployed-month-label').textContent = deployedMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  }

  function changeDeployedMonth(offset) {
    deployedMonth = new Date(deployedMonth.getFullYear(), deployedMonth.getMonth() + offset, 1);
    renderDeployedMonth();
  }

  function showToast(message, isError = false) {
    WarehousePage.showToast(message, isError);
  }

  function openModal(id) {
    const modal = byId(id);
    modalReturnFocus.set(modal, document.activeElement instanceof HTMLElement ? document.activeElement : null);
    modal.inert = false;
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    modal.querySelector('.modal-close, button, input, select, textarea')?.focus({ preventScroll: true });
  }

  function closeModal(id) {
    const modal = byId(id);
    const returnFocus = modalReturnFocus.get(modal);
    modal.classList.remove('open');
    if (returnFocus?.isConnected && !returnFocus.closest('[inert]')) returnFocus.focus({ preventScroll: true });
    else if (modal.contains(document.activeElement)) document.activeElement.blur();
    modal.inert = true;
    modal.setAttribute('aria-hidden', 'true');
    modalReturnFocus.delete(modal);
    setTimeout(() => {
      if (!modal.classList.contains('open')) modal.style.display = 'none';
    }, 150);
  }

  function mediaIcon(isVideo) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.innerHTML = isVideo
      ? '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2z"/>'
      : '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/>';
    return svg;
  }

  function renderSelectedMedia() {
    const list = byId('selected-media-list');
    list.replaceChildren();
    selectedFiles.forEach((file, index) => {
      const row = document.createElement('div');
      row.className = 'selected-media-item';
      const name = document.createElement('span');
      name.className = 'selected-media-name';
      name.textContent = file.name;
      const remove = document.createElement('button');
      remove.className = 'remove-media';
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${file.name}`);
      remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
      remove.addEventListener('click', () => {
        selectedFiles.splice(index, 1);
        renderSelectedMedia();
      });
      row.append(mediaIcon(VIDEO_TYPES.has(file.type)), name, remove);
      list.appendChild(row);
    });
  }

  function validateFile(file) {
    if (IMAGE_TYPES.has(file.type)) {
      return file.size <= MAX_IMAGE_BYTES ? '' : `${file.name} exceeds the 15 MB image limit.`;
    }
    if (VIDEO_TYPES.has(file.type)) {
      return file.size <= MAX_VIDEO_BYTES ? '' : `${file.name} exceeds the 25 MB video limit.`;
    }
    return `${file.name} is not a supported image or video.`;
  }

  function handleMediaSelection(event) {
    const incoming = [...event.target.files];
    if (selectedFiles.length + incoming.length > MAX_MEDIA) {
      showToast('Upload up to 5 media files only.', true);
      event.target.value = '';
      return;
    }
    const error = incoming.map(validateFile).find(Boolean);
    if (error) {
      showToast(error, true);
      event.target.value = '';
      return;
    }
    selectedFiles.push(...incoming);
    event.target.value = '';
    renderSelectedMedia();
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
    const prepared = IMAGE_TYPES.has(file.type) ? await compressImage(file) : file;
    const extension = IMAGE_TYPES.has(file.type)
      ? 'jpg'
      : (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `companies/${companyId}/warehouse-inspected/${crypto.randomUUID()}.${extension}`;
    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, prepared, {
      contentType: prepared.type,
      cacheControl: '31536000',
      upsert: false
    });
    if (error) throw error;
    return sb.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  function storagePath(url) {
    const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
    const index = String(url).indexOf(marker);
    return index < 0 ? null : decodeURIComponent(String(url).slice(index + marker.length));
  }

  async function removeUploads(urls) {
    const paths = urls.map(storagePath).filter(Boolean);
    if (paths.length) await sb.storage.from(STORAGE_BUCKET).remove(paths);
  }

  async function searchProducts(search = '') {
    const business = byId('inspect-business').value;
    if (!business) {
      productResults = [];
      byId('inspect-sku-options').replaceChildren();
      clearGuideline();
      return;
    }
    let query = sb.from('products')
      .select('id, sku, category')
      .eq('company_id', companyId)
      .eq('business', business)
      .order('sku', { ascending: true })
      .limit(100);
    if (search) query = query.ilike('sku', `%${search}%`);
    const { data, error } = await query;
    if (error) throw error;
    productResults = (data || []).filter(product => {
      const category = String(product.category || '').trim().toLowerCase();
      const sku = String(product.sku || '').trim().toLowerCase();
      return !['service', 'services'].includes(category) && !['service', 'services'].includes(sku);
    });
    const datalist = byId('inspect-sku-options');
    datalist.replaceChildren();
    productResults.forEach(product => {
      const option = document.createElement('option');
      option.value = product.sku;
      datalist.appendChild(option);
    });
    await updateGuidelineAvailability();
  }

  function clearGuideline() {
    guidelineRequestId += 1;
    selectedGuideline = null;
    byId('inspection-guide-action').hidden = true;
  }

  async function updateGuidelineAvailability() {
    const requestId = ++guidelineRequestId;
    selectedGuideline = null;
    byId('inspection-guide-action').hidden = true;
    const sku = byId('inspect-sku').value.trim().toUpperCase();
    const product = productResults.find(item => String(item.sku || '').trim().toUpperCase() === sku);
    if (!product) return;
    const { data, error } = await sb.from('qa_guides')
      .select('id, product_id, general_notes, parts')
      .eq('company_id', companyId)
      .eq('product_id', product.id)
      .maybeSingle();
    if (requestId !== guidelineRequestId) return;
    if (error) {
      console.error(error);
      return;
    }
    if (!data) return;
    selectedGuideline = { ...data, sku: product.sku };
    byId('inspection-guide-action').hidden = false;
  }

  function approvedGuideImageUrl(value) {
    const url = String(value || '').trim();
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url)) return url;
    try {
      const parsed = new URL(url, window.location.origin);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch {
      return '';
    }
  }

  function guideImage(part, sku) {
    const source = approvedGuideImageUrl(part?.image_url);
    if (!source) {
      const placeholder = document.createElement('div');
      placeholder.className = 'guideline-part-placeholder';
      placeholder.textContent = 'No image';
      return placeholder;
    }
    const image = document.createElement('img');
    image.className = 'guideline-part-image';
    image.alt = `${sku} inspection component`;
    image.src = source;
    image.addEventListener('error', () => {
      const placeholder = document.createElement('div');
      placeholder.className = 'guideline-part-placeholder';
      placeholder.textContent = 'Image unavailable';
      image.replaceWith(placeholder);
    }, { once: true });
    return image;
  }

  function renderGuideline() {
    if (!selectedGuideline) return;
    const content = byId('inspection-guideline-content');
    content.replaceChildren();
    byId('inspection-guideline-title').textContent = `${selectedGuideline.sku} Inspection Guideline`;
    if (selectedGuideline.general_notes) {
      const notes = document.createElement('section');
      notes.className = 'guideline-notes';
      const heading = document.createElement('h3');
      heading.className = 'guideline-heading';
      heading.textContent = 'General Notes';
      const copy = document.createElement('p');
      copy.className = 'guideline-copy';
      copy.textContent = selectedGuideline.general_notes;
      notes.append(heading, copy);
      content.appendChild(notes);
    }
    const savedParts = Array.isArray(selectedGuideline.parts) ? selectedGuideline.parts : [];
    const groups = savedParts.some(item => Array.isArray(item?.parts))
      ? savedParts
      : (savedParts.length ? [{ group_name: 'Components', parts: savedParts }] : []);
    const groupList = document.createElement('div');
    groupList.className = 'guideline-groups';
    groups.forEach((group, groupIndex) => {
      const section = document.createElement('section');
      section.className = 'guideline-group';
      const heading = document.createElement('h3');
      heading.className = 'guideline-heading';
      heading.textContent = group.group_name || `Component Group ${groupIndex + 1}`;
      const parts = document.createElement('div');
      parts.className = 'guideline-parts';
      (Array.isArray(group.parts) ? group.parts : []).forEach(part => {
        const card = document.createElement('div');
        card.className = 'guideline-part';
        const copy = document.createElement('div');
        copy.className = 'guideline-part-copy';
        const quantity = document.createElement('span');
        quantity.className = 'guideline-quantity';
        quantity.textContent = `Quantity: ${part?.quantity || 1}`;
        const notes = document.createElement('p');
        notes.className = 'guideline-copy';
        notes.textContent = part?.notes || 'No additional instructions.';
        copy.append(quantity, notes);
        card.append(guideImage(part, selectedGuideline.sku), copy);
        parts.appendChild(card);
      });
      section.append(heading, parts);
      groupList.appendChild(section);
    });
    content.appendChild(groupList);
    openModal('inspection-guideline-modal');
  }

  async function loadBusinesses() {
    const [businessResult, orderResult] = await Promise.all([
      sb.from('tenant_businesses').select('id, name').eq('company_id', companyId),
      sb.from('global_settings').select('value').eq('company_id', companyId).eq('key', 'business_order').maybeSingle()
    ]);
    if (businessResult.error || orderResult.error) throw businessResult.error || orderResult.error;
    const rank = new Map((Array.isArray(orderResult.data?.value) ? orderResult.data.value : []).map((id, index) => [id, index]));
    businesses = [...(businessResult.data || [])].sort((a, b) =>
      (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      || a.name.localeCompare(b.name));
    const select = byId('inspect-business');
    businesses.forEach(business => {
      const option = document.createElement('option');
      option.value = business.name.toLowerCase().replace(/[\s_.-]+/g, '_');
      option.textContent = business.name;
      select.appendChild(option);
    });
  }

  async function loadWarehouseMembers() {
    const { data: assignments, error: assignmentsError } = await sb.from('employee_assignments')
      .select('name, visibility')
      .eq('company_id', companyId)
      .limit(100);
    if (assignmentsError) throw assignmentsError;
    const names = (assignments || [])
      .filter(assignment => Array.isArray(assignment.visibility) && assignment.visibility.includes('warehouse.member'))
      .map(assignment => assignment.name)
      .filter(Boolean);
    const select = byId('inspect-employee');
    if (!names.length) return;
    const { data, error } = await sb.from('employees')
      .select('id, first_name, last_name, assignment, employment_status')
      .eq('company_id', companyId)
      .in('assignment', names)
      .limit(500);
    if (error) throw error;
    (data || [])
      .filter(employee => String(employee.employment_status || '').toLowerCase() !== 'inactive')
      .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`))
      .forEach(employee => {
        const option = document.createElement('option');
        option.value = employee.id;
        option.textContent = `${employee.first_name || ''} ${employee.last_name || ''}`.trim();
        option.dataset.name = option.textContent;
        select.appendChild(option);
      });
  }

  function appendCell(row, value) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.appendChild(cell);
  }

  function renderRecords() {
    const body = byId('inspected-list');
    body.replaceChildren();
    if (!records.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.className = 'empty-cell';
      cell.textContent = 'No inspected records yet.';
      row.appendChild(cell);
      body.appendChild(row);
    }
    records.forEach(record => {
      const row = document.createElement('tr');
      appendCell(row, record.code);
      appendCell(row, record.sku);
      const mediaCell = document.createElement('td');
      const mediaButton = document.createElement('button');
      mediaButton.className = 'media-link';
      mediaButton.type = 'button';
      mediaButton.textContent = 'See Media Uploaded';
      mediaButton.addEventListener('click', () => openGallery(record));
      mediaCell.appendChild(mediaButton);
      row.appendChild(mediaCell);
      appendCell(row, record.inspected_by_name);
      appendCell(row, new Date(record.inspected_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }));
      body.appendChild(row);
    });
    renderPagination();
  }

  function paginationItems(totalPages, activePage) {
    if (totalPages <= 9) return Array.from({ length: totalPages }, (_, index) => index + 1);
    const middleStart = Math.min(Math.max(activePage - 1, 4), totalPages - 5);
    const pages = [1, 2, 3, middleStart, middleStart + 1, middleStart + 2, totalPages - 2, totalPages - 1, totalPages];
    return [...new Set(pages)].sort((a, b) => a - b).reduce((items, page, index, uniquePages) => {
      if (index && page - uniquePages[index - 1] > 1) items.push('ellipsis');
      items.push(page);
      return items;
    }, []);
  }

  function renderPagination() {
    const footer = byId('inspected-pagination');
    const numbers = byId('inspected-page-numbers');
    const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
    const start = totalRecords ? currentPage * PAGE_SIZE + 1 : 0;
    const end = Math.min(start + records.length - 1, totalRecords);
    footer.hidden = totalRecords <= PAGE_SIZE;
    byId('inspected-page-status').textContent = `${start}–${end} of ${totalRecords} · Page ${currentPage + 1} of ${totalPages}`;
    byId('inspected-prev-page').disabled = currentPage === 0;
    byId('inspected-next-page').disabled = currentPage >= totalPages - 1;
    numbers.replaceChildren();
    paginationItems(totalPages, currentPage + 1).forEach(item => {
      if (item === 'ellipsis') {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'inspected-page-ellipsis';
        ellipsis.textContent = '…';
        ellipsis.setAttribute('aria-hidden', 'true');
        numbers.appendChild(ellipsis);
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `inspected-page-number${item === currentPage + 1 ? ' active' : ''}`;
      button.dataset.page = String(item - 1);
      button.textContent = String(item);
      if (item === currentPage + 1) button.setAttribute('aria-current', 'page');
      numbers.appendChild(button);
    });
  }

  async function loadRecords(page = 0) {
    const start = page * PAGE_SIZE;
    const { data, error, count } = await sb.from('warehouse_inspections')
      .select('id, code, sku, media_urls, inspected_by, inspected_by_name, inspected_at, warehouse_inspection_allocations!left(inspection_id)', { count: 'exact' })
      .eq('company_id', companyId)
      .is('warehouse_inspection_allocations.inspection_id', null)
      .order('inspected_at', { ascending: false })
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw error;
    currentPage = page;
    totalRecords = count || 0;
    records = (data || []).map(({ warehouse_inspection_allocations: _allocations, ...record }) => record);
    renderRecords();
  }

  function changePage(page) {
    const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
    if (page === currentPage || page < 0 || page >= totalPages) return;
    loadRecords(page).catch(error => { console.error(error); showToast('That page could not be loaded.', true); });
  }

  function openGallery(record) {
    const gallery = byId('inspect-gallery');
    gallery.replaceChildren();
    (record.media_urls || []).forEach(url => {
      const wrapper = document.createElement('div');
      wrapper.className = 'gallery-item';
      const media = /\.(mp4|mov|webm)(?:\?|$)/i.test(url)
        ? document.createElement('video')
        : document.createElement('img');
      if (media instanceof HTMLVideoElement) media.controls = true;
      else media.alt = `${record.code} inspection media`;
      media.src = url;
      wrapper.appendChild(media);
      gallery.appendChild(wrapper);
    });
    byId('gallery-title').textContent = `${record.code} Media Uploaded`;
    openModal('inspect-gallery-modal');
  }

  function resetCreateForm() {
    byId('inspect-create-form').reset();
    byId('inspect-sku').disabled = true;
    byId('inspect-sku').placeholder = 'Choose a business first';
    productResults = [];
    byId('inspect-sku-options').replaceChildren();
    clearGuideline();
    selectedFiles = [];
    renderSelectedMedia();
    document.querySelectorAll('#inspect-create-form .form-error').forEach(element => element.classList.remove('form-error'));
  }

  async function submitInspect(event) {
    event.preventDefault();
    const skuInput = byId('inspect-sku');
    const businessSelect = byId('inspect-business');
    const codeInput = byId('inspect-code');
    const employeeSelect = byId('inspect-employee');
    const normalizedSku = skuInput.value.trim().toUpperCase();
    const product = productResults.find(item => String(item.sku).toUpperCase() === normalizedSku);
    const employeeOption = employeeSelect.selectedOptions[0];
    const code = codeInput.value.trim().toUpperCase();
    businessSelect.classList.toggle('form-error', !businessSelect.value);
    skuInput.classList.toggle('form-error', !product);
    codeInput.classList.toggle('form-error', !code);
    employeeSelect.classList.toggle('form-error', !employeeOption?.value);
    byId('inspect-media').closest('.media-picker').classList.toggle('form-error', !selectedFiles.length);
    if (!businessSelect.value || !product || !code || !employeeOption?.value || !selectedFiles.length) {
      showToast('Select a Business, SKU, and Warehouse Member, enter a code, and upload at least one media file.', true);
      return;
    }
    const button = byId('inspect-done-btn');
    button.disabled = true;
    button.textContent = 'Saving...';
    const uploaded = [];
    try {
      for (const file of selectedFiles) uploaded.push(await uploadMedia(file));
      const { data: sessionData } = await sb.auth.getSession();
      const { error } = await sb.from('warehouse_inspections').insert({
        company_id: companyId,
        product_id: product.id,
        sku: product.sku,
        code,
        media_urls: uploaded,
        inspected_by: employeeOption.value,
        inspected_by_name: employeeOption.dataset.name,
        created_by: sessionData.session?.user?.id || null
      });
      if (error) throw error;
      closeModal('inspect-create-modal');
      resetCreateForm();
      showToast('Inspection recorded.');
      await loadRecords(0);
    } catch (error) {
      console.error(error);
      await removeUploads(uploaded);
      showToast(error?.code === '23505' ? 'That inspection code already exists.' : 'The inspection could not be saved. Please try again.', true);
    } finally {
      button.disabled = false;
      button.textContent = 'Done';
    }
  }

  async function init() {
    try {
      const normalizedPath = window.location.pathname.replace(/\.html$/i, '').replace(/\/+$/, '');
      if (normalizedPath === '/dashboard/warehouse/inspected') {
        window.location.replace(`/dashboard/warehouse/inspected/in-stock${window.location.search}${window.location.hash}`);
        return;
      }
      renderActiveView();
      const authInfo = await BKAuth.checkRoleGate(['Logistics'], '/admin.html');
      if (!authInfo) return;
      sb = BKAuth.sb;
      WarehousePage.sb = sb;
      const { data: company, error } = await sb.from('companies')
        .select('id')
        .eq('tenant_id', authInfo.tenantId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      companyId = company?.id || null;
      if (!companyId) throw new Error('Company context is unavailable.');
      WarehousePage.companyId = companyId;
      if (activeView === 'deployed') {
        await WarehousePage.updateBadgeCounts();
        return;
      }
      await Promise.all([loadBusinesses(), loadWarehouseMembers(), loadRecords(0)]);
      WarehousePage.updateBadgeCounts();
    } catch (error) {
      console.error(error);
      byId('inspected-list').innerHTML = '<tr><td colspan="5" class="empty-cell">Inspected records could not be loaded. Refresh and try again.</td></tr>';
      showToast('Inspected records could not be loaded. Refresh and try again.', true);
    }
  }

  byId('create-inspect-btn').addEventListener('click', () => { resetCreateForm(); openModal('inspect-create-modal'); });
  byId('inspect-media').addEventListener('change', handleMediaSelection);
  byId('inspect-business').addEventListener('change', event => {
    event.target.classList.remove('form-error');
    const skuInput = byId('inspect-sku');
    skuInput.value = '';
    skuInput.disabled = false;
    skuInput.placeholder = 'Search and select an SKU';
    clearGuideline();
    searchProducts().catch(error => { console.error(error); showToast('SKUs could not be loaded.', true); });
  });
  byId('inspect-code').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase(); event.target.classList.remove('form-error'); });
  byId('inspect-sku').addEventListener('input', event => {
    event.target.value = event.target.value.toUpperCase();
    event.target.classList.remove('form-error');
    clearGuideline();
    clearTimeout(skuSearchTimer);
    skuSearchTimer = setTimeout(() => searchProducts(event.target.value.trim()).catch(error => console.error(error)), 250);
  });
  byId('view-inspection-guide-btn').addEventListener('click', renderGuideline);
  byId('deployed-prev-month').addEventListener('click', () => changeDeployedMonth(-1));
  byId('deployed-next-month').addEventListener('click', () => changeDeployedMonth(1));
  byId('inspect-employee').addEventListener('change', event => event.target.classList.remove('form-error'));
  byId('inspect-create-form').addEventListener('submit', submitInspect);
  byId('inspected-prev-page').addEventListener('click', () => changePage(currentPage - 1));
  byId('inspected-next-page').addEventListener('click', () => changePage(currentPage + 1));
  byId('inspected-page-numbers').addEventListener('click', event => {
    const button = event.target.closest('[data-page]');
    if (button) changePage(Number(button.dataset.page));
  });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.close)));
  document.querySelectorAll('.modal-overlay').forEach(modal => modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal.id); }));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const open = [...document.querySelectorAll('.modal-overlay.open')].pop();
    if (open) closeModal(open.id);
  });
  document.addEventListener('DOMContentLoaded', init);
})();

(function () {
  'use strict';

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const VIDEO_PATTERN = /\.(mp4|mov|webm|m4v)(?:\?|$)/i;
  const SAFE_MEDIA_PATTERN = /^(https?:\/\/|data:image\/(?:png|jpeg|gif|webp);base64,|data:video\/(?:mp4|webm);base64,)/i;
  const PAGE_SIZE = 10;
  const BOOKING_BATCH_SIZE = 100;
  const JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';

  const state = {
    companyId: null,
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    allRows: [],
    filteredRows: [],
    rows: [],
    page: 0,
    loadToken: 0,
    mediaObserver: null,
    zipPromise: null
  };

  const getSb = () => window.BKAuth.sb;

  function toast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const item = document.createElement('div');
    item.className = `toast toast-${type}`;
    item.textContent = message;
    container.appendChild(item);
    setTimeout(() => item.remove(), 3500);
  }

  function parseMonthHash() {
    const match = window.location.hash.match(/^#(\d{2})-(\d{4})$/);
    if (!match) return;
    const month = Number(match[1]);
    const year = Number(match[2]);
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2200) {
      state.month = month - 1;
      state.year = year;
    }
  }

  function updateMonthDisplay() {
    const display = document.getElementById('media-month-display');
    if (display) display.textContent = `${MONTHS[state.month]} ${state.year}`;
    const nextHash = `#${String(state.month + 1).padStart(2, '0')}-${state.year}`;
    if (window.location.hash !== nextHash) history.replaceState(null, '', nextHash);
    document.querySelectorAll('[data-media-tab]').forEach(link => {
      link.href = `/dashboard/marketing-media/${link.dataset.mediaTab}${nextHash}`;
    });
  }

  function monthRange() {
    const start = `${state.year}-${String(state.month + 1).padStart(2, '0')}-01`;
    const nextMonth = state.month === 11 ? 0 : state.month + 1;
    const nextYear = state.month === 11 ? state.year + 1 : state.year;
    return { start, end: `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-01` };
  }

  function parseArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function uniqueSafeUrls(values) {
    return [...new Set(values.filter(value => typeof value === 'string').map(value => value.trim()).filter(value => SAFE_MEDIA_PATTERN.test(value)))];
  }

  function customerName(booking) {
    if (booking.customer_is_company) return booking.customer_company_name || booking.customer_name || 'Unnamed customer';
    return [booking.customer_first_name, booking.customer_last_name].filter(Boolean).join(' ').trim() || booking.customer_name || 'Unnamed customer';
  }

  function productLookup(booking) {
    return new Map(parseArray(booking.products).map(product => [String(product?.sku || '').toUpperCase(), product?.name || product?.title || product?.sku]));
  }

  function deviceName(door, index, lookup) {
    const sku = Array.isArray(door?.products) ? door.products.find(Boolean) : null;
    if (sku) {
      const title = lookup.get(String(sku).toUpperCase());
      if (title && title !== sku) {
        const escapedSku = String(sku).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const productTitle = String(title).replace(new RegExp(`^${escapedSku}\\s*[-–—:|]\\s*`, 'i'), '').trim();
        return productTitle && productTitle.toUpperCase() !== String(sku).toUpperCase()
          ? `${sku} - ${productTitle}`
          : sku;
      }
      return sku;
    }
    return `Device ${index + 1}`;
  }

  function bookingRows(booking) {
    const doors = parseArray(booking.doors);
    const lookup = productLookup(booking);
    return doors.map((door, index) => {
      const after = uniqueSafeUrls([
        ...(Array.isArray(door?.media_urls) ? door.media_urls : []),
        ...(door?.required_media && typeof door.required_media === 'object' ? Object.values(door.required_media) : []),
        ...(Array.isArray(door?.other_media) ? door.other_media : [])
      ]);
      return {
        id: `${booking.id}-${index}`,
        customer: customerName(booking),
        orderNo: booking.order_no || 'No order number',
        installedDate: door?.completed_at || booking.scheduled_date || null,
        device: deviceName(door, index, lookup),
        before: uniqueSafeUrls(Array.isArray(door?.photos) ? door.photos : []),
        after
      };
    }).filter(row => row.before.length > 0 || row.after.length > 0);
  }

  function sortRows(rows) {
    const compare = (left, right) => String(left || '').localeCompare(String(right || ''), 'en', {
      sensitivity: 'base',
      numeric: true
    });
    const nameOrder = (left, right) => compare(left.customer, right.customer)
      || compare(left.orderNo, right.orderNo)
      || compare(left.device, right.device);
    const mode = document.getElementById('media-sort').value;
    return rows.sort((left, right) => {
      if (mode === 'date-desc') return compare(right.installedDate, left.installedDate) || nameOrder(left, right);
      if (mode === 'date-asc') return compare(left.installedDate, right.installedDate) || nameOrder(left, right);
      return nameOrder(left, right);
    });
  }

  function setLoading() {
    const body = document.getElementById('media-table-body');
    body.replaceChildren();
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 2;
    const wrapper = document.createElement('div');
    wrapper.className = 'loading-wrapper';
    const spinner = document.createElement('span');
    spinner.className = 'spinner-cyan';
    wrapper.append(spinner, document.createTextNode('Loading customer media...'));
    cell.appendChild(wrapper);
    row.appendChild(cell);
    body.appendChild(row);
  }

  function formatDate(value) {
    if (!value) return 'Installation date unavailable';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? 'Installation date unavailable' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function mediaTile(url, index) {
    const isVideo = VIDEO_PATTERN.test(url) || url.startsWith('data:video/');
    const tile = document.createElement('button');
    tile.className = 'media-tile';
    tile.setAttribute('aria-label', isVideo ? `Preview video ${index + 1}` : `Open image ${index + 1}`);
    if (isVideo) {
      tile.classList.add('media-video-tile');
      tile.type = 'button';
      tile.addEventListener('click', () => openVideoPreview(url));
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'none';
      video.dataset.src = url;
      tile.appendChild(video);
      const badge = document.createElement('span');
      badge.className = 'media-tile-badge';
      badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg>';
      tile.appendChild(badge);
    } else {
      tile.type = 'button';
      tile.classList.add('media-image-tile');
      tile.addEventListener('click', () => openImagePreview(url));
      const image = document.createElement('img');
      image.alt = `Installation media ${index + 1}`;
      image.loading = 'lazy';
      image.dataset.src = url;
      image.addEventListener('error', () => tile.remove());
      tile.appendChild(image);
    }
    return tile;
  }

  function openImagePreview(url) {
    const modal = document.getElementById('media-image-modal');
    const image = document.getElementById('media-image-preview');
    const error = document.getElementById('media-image-error');
    error.hidden = true;
    image.hidden = false;
    image.src = url;
    modal.style.display = 'flex';
    void modal.offsetHeight;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeImagePreview() {
    const modal = document.getElementById('media-image-modal');
    const image = document.getElementById('media-image-preview');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    image.removeAttribute('src');
    setTimeout(() => { modal.style.display = 'none'; }, 150);
  }

  function openVideoPreview(url) {
    const modal = document.getElementById('media-video-modal');
    const player = document.getElementById('media-video-player');
    const error = document.getElementById('media-video-error');
    error.hidden = true;
    player.hidden = false;
    player.src = url;
    modal.style.display = 'flex';
    void modal.offsetHeight;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    player.play().catch(() => {});
  }

  function closeVideoPreview() {
    const modal = document.getElementById('media-video-modal');
    const player = document.getElementById('media-video-player');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    player.pause();
    player.removeAttribute('src');
    player.load();
    setTimeout(() => { modal.style.display = 'none'; }, 150);
  }

  function observeMedia() {
    if (state.mediaObserver) state.mediaObserver.disconnect();
    const media = document.querySelectorAll('.media-tile img[data-src], .media-tile video[data-src]');
    if (!('IntersectionObserver' in window)) {
      media.forEach(element => { element.src = element.dataset.src; delete element.dataset.src; });
      return;
    }
    state.mediaObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const element = entry.target;
        element.src = element.dataset.src;
        delete element.dataset.src;
        state.mediaObserver.unobserve(element);
      });
    }, { rootMargin: '160px' });
    media.forEach(element => state.mediaObserver.observe(element));
  }

  function mediaSection(title, urls) {
    const section = document.createElement('section');
    const heading = document.createElement('div');
    heading.className = 'media-section-heading';
    const label = document.createElement('span');
    label.className = 'media-section-title';
    label.textContent = title;
    heading.appendChild(label);
    section.appendChild(heading);
    if (!urls.length) {
      const empty = document.createElement('div');
      empty.className = 'media-empty';
      empty.textContent = `No ${title.toLowerCase()} media.`;
      section.appendChild(empty);
      return section;
    }
    const gallery = document.createElement('div');
    gallery.className = 'media-gallery';
    urls.forEach((url, index) => gallery.appendChild(mediaTile(url, index)));
    section.appendChild(gallery);
    return section;
  }

  function downloadButton(row) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'download-all-btn';
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg><span>Download all</span>';
    button.addEventListener('click', () => downloadAll(row, button));
    return button;
  }

  function render() {
    const body = document.getElementById('media-table-body');
    body.replaceChildren();
    if (!state.rows.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 2;
      cell.className = 'media-empty-row';
      cell.textContent = state.allRows.length ? 'No customer media matches these filters.' : 'No installed devices found for this month.';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }
    state.rows.forEach(item => {
      const row = document.createElement('tr');
      const customerCell = document.createElement('td');
      const name = document.createElement('div');
      name.className = 'customer-name';
      name.textContent = item.customer;
      const date = document.createElement('div');
      date.className = 'customer-meta';
      date.textContent = formatDate(item.installedDate);
      const order = document.createElement('div');
      order.className = 'customer-meta';
      order.textContent = item.orderNo;
      const device = document.createElement('span');
      device.className = 'device-badge';
      device.textContent = item.device;
      customerCell.append(name, date, order, device);

      const mediaCell = document.createElement('td');
      const header = document.createElement('div');
      header.className = 'media-cell-header';
      header.appendChild(downloadButton(item));
      const sections = document.createElement('div');
      sections.className = 'media-sections';
      sections.append(mediaSection('Before Installation', item.before), mediaSection('After Installation', item.after));
      mediaCell.append(header, sections);
      row.append(customerCell, mediaCell);
      body.appendChild(row);
    });
    const spacer = document.createElement('tr');
    spacer.className = 'table-spacer-row';
    const spacerCell = document.createElement('td');
    spacerCell.colSpan = 2;
    spacer.appendChild(spacerCell);
    body.appendChild(spacer);
    observeMedia();
  }

  function paginationItems(totalPages, currentPage) {
    if (totalPages <= 9) return Array.from({ length: totalPages }, (_, index) => index + 1);
    const middleStart = Math.min(Math.max(currentPage - 1, 4), totalPages - 5);
    const pages = [1, 2, 3, middleStart, middleStart + 1, middleStart + 2, totalPages - 2, totalPages - 1, totalPages];
    return [...new Set(pages)].sort((a, b) => a - b).reduce((items, page, index, uniquePages) => {
      if (index && page - uniquePages[index - 1] > 1) items.push('ellipsis');
      items.push(page);
      return items;
    }, []);
  }

  function updatePagination() {
    const previous = document.getElementById('media-prev-page');
    const next = document.getElementById('media-next-page');
    const status = document.getElementById('media-page-status');
    const numbers = document.getElementById('media-page-numbers');
    const totalPages = Math.max(1, Math.ceil(state.filteredRows.length / PAGE_SIZE));
    const start = state.filteredRows.length ? state.page * PAGE_SIZE + 1 : 0;
    const end = Math.min(start + state.rows.length - 1, state.filteredRows.length);
    previous.disabled = state.page === 0;
    next.disabled = state.page >= totalPages - 1;
    status.textContent = `${start}–${end} of ${state.filteredRows.length} · Page ${state.page + 1} of ${totalPages}`;
    numbers.replaceChildren();
    paginationItems(totalPages, state.page + 1).forEach(item => {
      if (item === 'ellipsis') {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'media-page-ellipsis';
        ellipsis.textContent = '…';
        ellipsis.setAttribute('aria-hidden', 'true');
        numbers.appendChild(ellipsis);
        return;
      }
      const page = item - 1;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `media-page-number${page === state.page ? ' active' : ''}`;
      button.dataset.page = String(page);
      button.textContent = String(item);
      if (page === state.page) button.setAttribute('aria-current', 'page');
      numbers.appendChild(button);
    });
  }

  function populateDeviceFilter() {
    const select = document.getElementById('media-device-filter');
    const selected = select.value;
    select.replaceChildren();
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All Customers';
    select.appendChild(allOption);
    state.allRows.forEach(row => {
      const option = document.createElement('option');
      option.value = row.id;
      option.textContent = `${row.customer} — ${row.orderNo} — ${row.device}`;
      select.appendChild(option);
    });
    select.value = state.allRows.some(row => row.id === selected) ? selected : '';
  }

  function fileExtension(url, contentType) {
    const match = String(url).match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
    if (match) return match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
    if (contentType?.includes('video')) return 'mp4';
    if (contentType?.includes('png')) return 'png';
    if (contentType?.includes('webp')) return 'webp';
    return 'jpg';
  }

  async function downloadAll(row, button) {
    const urls = [...row.before, ...row.after];
    if (!urls.length) {
      toast('No media is available to download.', 'info');
      return;
    }
    button.disabled = true;
    try {
      await loadZipLibrary();
      const zip = new window.JSZip();
      const failures = [];
      await Promise.all(urls.map(async (url, index) => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error('Download failed');
          const blob = await response.blob();
          const group = index < row.before.length ? 'before' : 'after';
          zip.file(`${group}-${String(index + 1).padStart(2, '0')}.${fileExtension(url, blob.type)}`, blob);
        } catch (_) {
          failures.push(url);
        }
      }));
      if (failures.length === urls.length) throw new Error('No media could be downloaded');
      const archive = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      const objectUrl = URL.createObjectURL(archive);
      link.href = objectUrl;
      link.download = `${row.orderNo}-${row.device}-media.zip`.replace(/[^a-z0-9._-]+/gi, '-');
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast(failures.length ? `Downloaded available media; ${failures.length} file${failures.length === 1 ? '' : 's'} could not be fetched.` : 'Media archive downloaded.', failures.length ? 'info' : 'success');
    } catch (error) {
      console.error(error);
      toast('Media could not be downloaded. Try again.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  function loadZipLibrary() {
    if (window.JSZip) return Promise.resolve();
    if (state.zipPromise) return state.zipPromise;
    state.zipPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = JSZIP_URL;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Download tool unavailable'));
      document.head.appendChild(script);
    }).catch(error => {
      state.zipPromise = null;
      throw error;
    });
    return state.zipPromise;
  }

  async function fetchBookingBatch(offset) {
    const range = monthRange();
    const { data, error } = await getSb().from('installation_bookings')
      .select('id, order_no, customer_name, customer_first_name, customer_last_name, customer_is_company, customer_company_name, scheduled_date, status, doors, products')
      .eq('company_id', state.companyId)
      .gte('scheduled_date', range.start)
      .lt('scheduled_date', range.end)
      .neq('status', 'cancelled')
      .order('scheduled_date', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + BOOKING_BATCH_SIZE - 1);
    if (error) throw error;
    return data || [];
  }

  function showPage(page = state.page) {
    const totalPages = Math.max(1, Math.ceil(state.filteredRows.length / PAGE_SIZE));
    state.page = Math.min(Math.max(0, page), totalPages - 1);
    const from = state.page * PAGE_SIZE;
    state.rows = state.filteredRows.slice(from, from + PAGE_SIZE);
    render();
    updatePagination();
    const scroll = document.querySelector('.media-table-scroll');
    if (scroll) scroll.scrollTop = 0;
  }

  function applyFilters() {
    const query = document.getElementById('media-search').value.trim().toLowerCase();
    const selectedId = document.getElementById('media-device-filter').value;
    state.filteredRows = sortRows(state.allRows.filter(row => {
      if (selectedId && row.id !== selectedId) return false;
      if (!query) return true;
      return [row.customer, row.orderNo, row.device].some(value => String(value || '').toLowerCase().includes(query));
    }));
    showPage(0);
  }

  async function loadMonthRows() {
    setLoading();
    const token = ++state.loadToken;
    try {
      let bookingOffset = 0;
      let reachedEnd = false;
      while (!reachedEnd) {
        const bookings = await fetchBookingBatch(bookingOffset);
        if (token !== state.loadToken) return;
        bookingOffset += bookings.length;
        reachedEnd = bookings.length < BOOKING_BATCH_SIZE;
        state.allRows.push(...bookings.flatMap(bookingRows));
        if (!bookings.length) break;
      }
      sortRows(state.allRows);
      populateDeviceFilter();
      applyFilters();
    } catch (error) {
      console.error(error);
      state.allRows = [];
      state.filteredRows = [];
      state.rows = [];
      render();
      updatePagination();
      toast('Customer media could not be loaded. Try again.', 'error');
    }
  }

  function changeMonth(delta) {
    state.month += delta;
    if (state.month < 0) { state.month = 11; state.year -= 1; }
    if (state.month > 11) { state.month = 0; state.year += 1; }
    updateMonthDisplay();
    resetPagination();
    loadMonthRows();
  }

  function resetPagination() {
    state.page = 0;
    state.allRows = [];
    state.filteredRows = [];
    state.rows = [];
  }

  async function init() {
    const authInfo = await window.BKAuth.checkRoleGate(['Marketing', 'owner', 'admin', 'Operations', 'Sales'], '/admin.html');
    if (!authInfo) return;
    const { data: company, error } = await getSb().from('companies').select('id').eq('tenant_id', authInfo.tenantId).limit(1).maybeSingle();
    if (error || !company?.id) {
      toast('Company access could not be resolved.', 'error');
      return;
    }
    state.companyId = company.id;
    parseMonthHash();
    updateMonthDisplay();
    document.getElementById('media-prev-month').addEventListener('click', () => changeMonth(-1));
    document.getElementById('media-next-month').addEventListener('click', () => changeMonth(1));
    document.getElementById('media-search').addEventListener('input', applyFilters);
    document.getElementById('media-device-filter').addEventListener('change', applyFilters);
    document.getElementById('media-sort').addEventListener('change', applyFilters);
    document.getElementById('media-video-close').addEventListener('click', closeVideoPreview);
    document.getElementById('media-video-modal').addEventListener('click', event => {
      if (event.target === event.currentTarget) closeVideoPreview();
    });
    document.getElementById('media-video-player').addEventListener('error', () => {
      document.getElementById('media-video-player').hidden = true;
      document.getElementById('media-video-error').hidden = false;
    });
    document.getElementById('media-image-close').addEventListener('click', closeImagePreview);
    document.getElementById('media-image-modal').addEventListener('click', event => {
      if (event.target === event.currentTarget) closeImagePreview();
    });
    document.getElementById('media-image-preview').addEventListener('error', () => {
      document.getElementById('media-image-preview').hidden = true;
      document.getElementById('media-image-error').hidden = false;
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.getElementById('media-video-modal').classList.contains('open')) closeVideoPreview();
      if (event.key === 'Escape' && document.getElementById('media-image-modal').classList.contains('open')) closeImagePreview();
    });
    document.getElementById('media-prev-page').addEventListener('click', () => showPage(state.page - 1));
    document.getElementById('media-next-page').addEventListener('click', () => showPage(state.page + 1));
    document.getElementById('media-page-numbers').addEventListener('click', event => {
      const button = event.target.closest('[data-page]');
      if (!button || button.disabled) return;
      showPage(Number(button.dataset.page));
    });
    window.addEventListener('hashchange', () => { parseMonthHash(); updateMonthDisplay(); resetPagination(); loadMonthRows(); });
    await loadMonthRows();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof initNav === 'function') initNav();
    init().catch(error => {
      console.error(error);
      toast('Marketing Media could not be initialized.', 'error');
    });
  });
}());

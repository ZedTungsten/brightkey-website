(function () {
  'use strict';

  const PAGE_SIZE = 5;
  const INSTALLATION_PAGE_SIZE = 5;
  const BOOKING_BATCH_SIZE = 100;
  const VIDEO_PATTERN = /\.(mp4|mov|webm|m4v)(?:\?|$)/i;
  const SAFE_MEDIA_PATTERN = /^(https?:\/\/|data:image\/(?:png|jpeg|gif|webp);base64,|data:video\/(?:mp4|webm);base64,)/i;
  const now = new Date();

  const state = {
    companyId: null,
    year: now.getFullYear(),
    quarter: Math.floor(now.getMonth() / 3) + 1,
    groups: [],
    filteredGroups: [],
    page: 0,
    loadToken: 0,
    mediaObserver: null
  };

  const getSb = () => window.BKAuth.sb;

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

  function safeUrls(values) {
    return [...new Set(values.filter(value => typeof value === 'string')
      .map(value => value.trim()).filter(value => SAFE_MEDIA_PATTERN.test(value)))];
  }

  function syncTabLinks() {
    const now = new Date();
    const customerHash = /^#\d{2}-\d{4}$/.test(window.location.hash)
      ? window.location.hash
      : `#${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
    document.querySelector('[data-media-tab="customers"]').href = `/dashboard/marketing-media/customers${customerHash}`;
    document.querySelector('[data-media-tab="products"]').href = '/dashboard/marketing-media/products';
  }

  function customerName(booking) {
    if (booking.customer_is_company) return booking.customer_company_name || booking.customer_name || 'Unnamed customer';
    return [booking.customer_first_name, booking.customer_last_name].filter(Boolean).join(' ').trim() || booking.customer_name || 'Unnamed customer';
  }

  function productTitle(sku, title) {
    if (!title) return sku;
    const escapedSku = String(sku).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(title).replace(new RegExp(`^${escapedSku}\\s*[-–—:|]\\s*`, 'i'), '').trim() || sku;
  }

  function formatDate(value) {
    if (!value) return 'Date unavailable';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function groupBookings(bookings) {
    const groups = new Map();
    bookings.forEach(booking => {
      const lookup = new Map(parseArray(booking.products).map(product => [
        String(product?.sku || '').trim().toUpperCase(),
        product?.name || product?.title || product?.sku
      ]));
      parseArray(booking.doors).forEach(door => {
        const sku = String(Array.isArray(door?.products) ? door.products.find(Boolean) || '' : '').trim();
        const after = safeUrls([
          ...(Array.isArray(door?.media_urls) ? door.media_urls : []),
          ...(door?.required_media && typeof door.required_media === 'object' ? Object.values(door.required_media) : []),
          ...(Array.isArray(door?.other_media) ? door.other_media : [])
        ]);
        if (!sku || !after.length) return;
        const key = sku.toUpperCase();
        if (!groups.has(key)) {
          const title = productTitle(sku, lookup.get(key));
          groups.set(key, { sku, title, label: title === sku ? sku : `${sku} - ${title}`, installations: [] });
        }
        groups.get(key).installations.push({
          id: `${booking.id}-${groups.get(key).installations.length}`,
          customer: customerName(booking),
          date: booking.scheduled_date || null,
          after
        });
      });
    });
    const compare = (left, right) => String(left || '').localeCompare(String(right || ''), 'en', { sensitivity: 'base', numeric: true });
    return [...groups.values()].sort((left, right) => compare(left.sku, right.sku)).map(group => ({
      ...group,
      installations: group.installations.sort((left, right) => compare(right.date, left.date) || compare(left.customer, right.customer)),
      visibleInstallations: INSTALLATION_PAGE_SIZE
    }));
  }

  function setLoading() {
    const body = document.getElementById('product-media-body');
    body.replaceChildren();
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 2;
    const wrapper = document.createElement('div');
    wrapper.className = 'loading-wrapper';
    const spinner = document.createElement('span');
    spinner.className = 'spinner-cyan';
    wrapper.append(spinner, document.createTextNode('Loading product media...'));
    cell.appendChild(wrapper);
    row.appendChild(cell);
    body.appendChild(row);
  }

  function openPreview(url, isVideo) {
    const modal = document.getElementById('product-media-preview');
    const image = document.getElementById('product-media-preview-image');
    const video = document.getElementById('product-media-preview-video');
    const error = document.getElementById('product-media-preview-error');
    image.hidden = true;
    video.hidden = true;
    error.hidden = true;
    if (isVideo) {
      video.hidden = false;
      video.src = url;
      video.play().catch(() => {});
    } else {
      image.hidden = false;
      image.src = url;
    }
    modal.style.display = 'flex';
    void modal.offsetHeight;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closePreview() {
    const modal = document.getElementById('product-media-preview');
    const image = document.getElementById('product-media-preview-image');
    const video = document.getElementById('product-media-preview-video');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    image.removeAttribute('src');
    video.pause();
    video.removeAttribute('src');
    video.load();
    setTimeout(() => { modal.style.display = 'none'; }, 150);
  }

  function mediaTile(url, index) {
    const isVideo = VIDEO_PATTERN.test(url) || url.startsWith('data:video/');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `media-tile ${isVideo ? 'media-video-tile' : 'media-image-tile'}`;
    button.setAttribute('aria-label', `${isVideo ? 'Preview video' : 'Open image'} ${index + 1}`);
    button.addEventListener('click', () => openPreview(url, isVideo));
    const media = document.createElement(isVideo ? 'video' : 'img');
    if (isVideo) {
      media.muted = true;
      media.preload = 'none';
    } else {
      media.alt = `After-installation media ${index + 1}`;
      media.loading = 'lazy';
    }
    media.dataset.src = url;
    button.appendChild(media);
    if (isVideo) {
      const badge = document.createElement('span');
      badge.className = 'media-tile-badge';
      badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg>';
      button.appendChild(badge);
    }
    return button;
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
        entry.target.src = entry.target.dataset.src;
        delete entry.target.dataset.src;
        state.mediaObserver.unobserve(entry.target);
      });
    }, { rootMargin: '160px' });
    media.forEach(element => state.mediaObserver.observe(element));
  }

  function render() {
    const body = document.getElementById('product-media-body');
    const from = state.page * PAGE_SIZE;
    const groups = state.filteredGroups.slice(from, from + PAGE_SIZE);
    body.replaceChildren();
    if (!groups.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 2;
      cell.className = 'media-empty-row';
      cell.textContent = state.groups.length ? 'No product media matches this filter.' : 'No after-installation product media found in this quarter.';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }
    groups.forEach(group => {
      const row = document.createElement('tr');
      const skuCell = document.createElement('td');
      const identity = document.createElement('div');
      identity.className = 'product-identity';
      const sku = document.createElement('strong');
      sku.textContent = group.sku;
      const title = document.createElement('span');
      title.textContent = group.title;
      identity.append(sku, title);
      skuCell.appendChild(identity);
      const mediaCell = document.createElement('td');
      const installations = document.createElement('div');
      installations.className = 'product-installations';
      group.installations.slice(0, group.visibleInstallations).forEach(installation => {
        const section = document.createElement('section');
        section.className = 'product-installation';
        const line = document.createElement('div');
        line.className = 'product-installation-line';
        line.textContent = `${installation.customer} | ${formatDate(installation.date)}`;
        const gallery = document.createElement('div');
        gallery.className = 'media-gallery';
        installation.after.forEach((url, index) => gallery.appendChild(mediaTile(url, index)));
        section.append(line, gallery);
        installations.appendChild(section);
      });
      if (group.visibleInstallations < group.installations.length) {
        const loadMore = document.createElement('button');
        loadMore.type = 'button';
        loadMore.className = 'product-load-more';
        loadMore.textContent = 'Load more';
        loadMore.addEventListener('click', () => {
          group.visibleInstallations += INSTALLATION_PAGE_SIZE;
          render();
        });
        installations.appendChild(loadMore);
      }
      mediaCell.appendChild(installations);
      row.append(skuCell, mediaCell);
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
    const totalPages = Math.max(1, Math.ceil(state.filteredGroups.length / PAGE_SIZE));
    const start = state.filteredGroups.length ? state.page * PAGE_SIZE + 1 : 0;
    const end = Math.min((state.page + 1) * PAGE_SIZE, state.filteredGroups.length);
    document.getElementById('product-media-page-status').textContent = `${start}–${end} of ${state.filteredGroups.length} · Page ${state.page + 1} of ${totalPages}`;
    document.getElementById('product-media-prev-page').disabled = state.page === 0;
    document.getElementById('product-media-next-page').disabled = state.page >= totalPages - 1;
    const numbers = document.getElementById('product-media-page-numbers');
    numbers.replaceChildren();
    paginationItems(totalPages, state.page + 1).forEach(item => {
      if (item === 'ellipsis') {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'media-page-ellipsis';
        ellipsis.textContent = '…';
        numbers.appendChild(ellipsis);
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `media-page-number${item === state.page + 1 ? ' active' : ''}`;
      button.dataset.page = String(item - 1);
      button.textContent = String(item);
      if (item === state.page + 1) button.setAttribute('aria-current', 'page');
      numbers.appendChild(button);
    });
  }

  function showPage(page) {
    const totalPages = Math.max(1, Math.ceil(state.filteredGroups.length / PAGE_SIZE));
    state.page = Math.min(Math.max(0, page), totalPages - 1);
    render();
    updatePagination();
    document.querySelector('.media-table-scroll').scrollTop = 0;
  }

  function populateFilter() {
    const select = document.getElementById('product-media-filter');
    select.replaceChildren();
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'All Products';
    select.appendChild(all);
    state.groups.forEach(group => {
      const option = document.createElement('option');
      option.value = group.sku.toUpperCase();
      option.textContent = group.label;
      select.appendChild(option);
    });
  }

  function applyFilter() {
    const sku = document.getElementById('product-media-filter').value;
    state.filteredGroups = sku ? state.groups.filter(group => group.sku.toUpperCase() === sku) : state.groups.slice();
    showPage(0);
  }

  function selectedQuarterRange() {
    const startMonth = (state.quarter - 1) * 3;
    const start = `${state.year}-${String(startMonth + 1).padStart(2, '0')}-01`;
    const nextYear = state.quarter === 4 ? state.year + 1 : state.year;
    const nextMonth = state.quarter === 4 ? 1 : startMonth + 4;
    const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    return { start, end };
  }

  async function populateRangeFilters() {
    const yearSelect = document.getElementById('product-media-year');
    const quarterSelect = document.getElementById('product-media-quarter');
    let earliestYear = state.year;
    const { data, error } = await getSb().from('installation_bookings')
      .select('scheduled_date')
      .eq('company_id', state.companyId)
      .not('scheduled_date', 'is', null)
      .order('scheduled_date', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!error && data?.scheduled_date) {
      const parsedYear = Number(String(data.scheduled_date).slice(0, 4));
      if (Number.isInteger(parsedYear)) earliestYear = Math.min(parsedYear, state.year);
    }
    yearSelect.replaceChildren();
    for (let year = state.year; year >= earliestYear; year -= 1) {
      const option = document.createElement('option');
      option.value = String(year);
      option.textContent = String(year);
      yearSelect.appendChild(option);
    }
    yearSelect.value = String(state.year);
    quarterSelect.value = String(state.quarter);
  }

  async function fetchBookingBatch(offset) {
    const range = selectedQuarterRange();
    const { data, error } = await getSb().from('installation_bookings')
      .select('id, customer_name, customer_first_name, customer_last_name, customer_is_company, customer_company_name, scheduled_date, status, doors, products')
      .eq('company_id', state.companyId)
      .neq('status', 'cancelled')
      .gte('scheduled_date', range.start)
      .lt('scheduled_date', range.end)
      .order('scheduled_date', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + BOOKING_BATCH_SIZE - 1);
    if (error) throw error;
    return data || [];
  }

  async function loadRange() {
    setLoading();
    const token = ++state.loadToken;
    const bookings = [];
    try {
      let offset = 0;
      let complete = false;
      while (!complete) {
        const batch = await fetchBookingBatch(offset);
        if (token !== state.loadToken) return;
        bookings.push(...batch);
        offset += batch.length;
        complete = batch.length < BOOKING_BATCH_SIZE;
        if (!batch.length) break;
      }
      state.groups = groupBookings(bookings);
      populateFilter();
      applyFilter();
    } catch (error) {
      console.error(error);
      state.groups = [];
      state.filteredGroups = [];
      render();
      updatePagination();
    }
  }

  async function init() {
    const authInfo = await window.BKAuth.checkRoleGate(['Marketing', 'owner', 'admin', 'Operations', 'Sales'], '/admin.html');
    if (!authInfo) return;
    const { data: company, error } = await getSb().from('companies').select('id').eq('tenant_id', authInfo.tenantId).limit(1).maybeSingle();
    if (error || !company?.id) return;
    state.companyId = company.id;
    syncTabLinks();
    await populateRangeFilters();
    document.getElementById('product-media-year').addEventListener('change', event => {
      state.year = Number(event.target.value);
      state.page = 0;
      loadRange().catch(loadError => console.error(loadError));
    });
    document.getElementById('product-media-quarter').addEventListener('change', event => {
      state.quarter = Number(event.target.value);
      state.page = 0;
      loadRange().catch(loadError => console.error(loadError));
    });
    document.getElementById('product-media-filter').addEventListener('change', applyFilter);
    document.getElementById('product-media-prev-page').addEventListener('click', () => showPage(state.page - 1));
    document.getElementById('product-media-next-page').addEventListener('click', () => showPage(state.page + 1));
    document.getElementById('product-media-page-numbers').addEventListener('click', event => {
      const button = event.target.closest('[data-page]');
      if (button) showPage(Number(button.dataset.page));
    });
    document.getElementById('product-media-preview-close').addEventListener('click', closePreview);
    document.getElementById('product-media-preview').addEventListener('click', event => {
      if (event.target === event.currentTarget) closePreview();
    });
    document.getElementById('product-media-preview-image').addEventListener('error', () => {
      document.getElementById('product-media-preview-image').hidden = true;
      document.getElementById('product-media-preview-error').hidden = false;
    });
    document.getElementById('product-media-preview-video').addEventListener('error', () => {
      document.getElementById('product-media-preview-video').hidden = true;
      document.getElementById('product-media-preview-error').hidden = false;
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.getElementById('product-media-preview').classList.contains('open')) closePreview();
    });
    await loadRange();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof initNav === 'function') initNav();
    init().catch(error => console.error(error));
  });
}());

(function () {
  'use strict';

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const VIDEO_PATTERN = /\.(mp4|mov|webm|m4v)(?:\?|$)/i;
  const SAFE_MEDIA_PATTERN = /^(https?:\/\/|data:image\/(?:png|jpeg|gif|webp);base64,|data:video\/(?:mp4|webm);base64,)/i;

  const state = {
    companyId: null,
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    rows: []
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
      return title && title !== sku ? `${sku} — ${title}` : sku;
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
    const link = document.createElement('a');
    link.className = 'media-tile';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', VIDEO_PATTERN.test(url) ? `Open video ${index + 1}` : `Open image ${index + 1}`);
    if (VIDEO_PATTERN.test(url) || url.startsWith('data:video/')) {
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      video.preload = 'metadata';
      link.appendChild(video);
      const badge = document.createElement('span');
      badge.className = 'media-tile-badge';
      badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg>';
      link.appendChild(badge);
    } else {
      const image = document.createElement('img');
      image.src = url;
      image.alt = `Installation media ${index + 1}`;
      image.loading = 'lazy';
      image.addEventListener('error', () => link.remove());
      link.appendChild(image);
    }
    return link;
  }

  function mediaSection(title, urls) {
    const section = document.createElement('section');
    const heading = document.createElement('div');
    heading.className = 'media-section-heading';
    const label = document.createElement('span');
    label.className = 'media-section-title';
    label.textContent = title;
    const count = document.createElement('span');
    count.className = 'media-count';
    count.textContent = `${urls.length} file${urls.length === 1 ? '' : 's'}`;
    heading.append(label, count);
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
    const query = document.getElementById('media-search').value.trim().toLowerCase();
    const selectedId = document.getElementById('media-device-filter').value;
    const rows = state.rows.filter(row => {
      if (selectedId && row.id !== selectedId) return false;
      if (!query) return true;
      return [row.customer, row.orderNo, row.device].some(value => String(value || '').toLowerCase().includes(query));
    });
    body.replaceChildren();
    if (!rows.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 2;
      cell.className = 'media-empty-row';
      cell.textContent = query ? 'No customer media matches this search.' : 'No installed devices found for this month.';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }
    rows.forEach(item => {
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
      const total = document.createElement('span');
      total.className = 'media-count';
      total.textContent = `${item.before.length + item.after.length} total files`;
      header.append(total, downloadButton(item));
      const sections = document.createElement('div');
      sections.className = 'media-sections';
      sections.append(mediaSection('Before Installation', item.before), mediaSection('After Installation', item.after));
      mediaCell.append(header, sections);
      row.append(customerCell, mediaCell);
      body.appendChild(row);
    });
  }

  function populateDeviceFilter() {
    const select = document.getElementById('media-device-filter');
    const selected = select.value;
    select.replaceChildren();
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All customers and devices';
    select.appendChild(allOption);
    state.rows.forEach(row => {
      const option = document.createElement('option');
      option.value = row.id;
      option.textContent = `${row.customer} — ${row.orderNo} — ${row.device}`;
      select.appendChild(option);
    });
    select.value = state.rows.some(row => row.id === selected) ? selected : '';
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
    if (!window.JSZip) {
      toast('The download tool is unavailable. Refresh and try again.', 'error');
      return;
    }
    button.disabled = true;
    try {
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

  async function loadRows() {
    setLoading();
    const range = monthRange();
    try {
      const { data, error } = await getSb().from('installation_bookings')
        .select('id, order_no, customer_name, customer_first_name, customer_last_name, customer_is_company, customer_company_name, scheduled_date, status, doors, products')
        .eq('company_id', state.companyId)
        .gte('scheduled_date', range.start)
        .lt('scheduled_date', range.end)
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: false })
        .limit(100);
      if (error) throw error;
      state.rows = (data || []).flatMap(bookingRows);
      populateDeviceFilter();
      render();
    } catch (error) {
      console.error(error);
      state.rows = [];
      render();
      toast('Customer media could not be loaded. Try again.', 'error');
    }
  }

  function changeMonth(delta) {
    state.month += delta;
    if (state.month < 0) { state.month = 11; state.year -= 1; }
    if (state.month > 11) { state.month = 0; state.year += 1; }
    updateMonthDisplay();
    loadRows();
  }

  async function init() {
    const authInfo = await window.BKAuth.checkRoleGate(['Marketing', 'owner', 'admin', 'Operations', 'Sales'], '../admin.html');
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
    document.getElementById('media-search').addEventListener('input', render);
    document.getElementById('media-device-filter').addEventListener('change', render);
    window.addEventListener('hashchange', () => { parseMonthHash(); updateMonthDisplay(); loadRows(); });
    await loadRows();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof initNav === 'function') initNav();
    init().catch(error => {
      console.error(error);
      toast('Marketing Media could not be initialized.', 'error');
    });
  });
}());

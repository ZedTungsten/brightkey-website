(function () {
  'use strict';

  const IMAGE_PATTERN = /^(https?:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i;
  const PAGE_LIMIT = 100;

  function create(app) {
    const state = { loaded: false, loading: false, orders: [], visible: [], activeId: null, selected: new Set() };
    const getSb = () => app.state.sb;

    function parseArray(value) {
      if (Array.isArray(value)) return value;
      if (typeof value !== 'string' || !value.trim()) return [];
      try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
      catch (_) { return []; }
    }

    function safeImages(doors) {
      const urls = parseArray(doors).flatMap(door => [
        ...(Array.isArray(door?.media_urls) ? door.media_urls : []),
        ...(door?.required_media && typeof door.required_media === 'object' ? Object.values(door.required_media) : []),
        ...(Array.isArray(door?.other_media) ? door.other_media : [])
      ]);
      return [...new Set(urls.filter(url => typeof url === 'string').map(url => url.trim()).filter(url => IMAGE_PATTERN.test(url)))];
    }

    function customerName(booking) {
      if (booking.customer_is_company) return booking.customer_company_name || booking.customer_name || 'Unnamed customer';
      return [booking.customer_first_name, booking.customer_last_name].filter(Boolean).join(' ').trim() || booking.customer_name || 'Unnamed customer';
    }

    function dateLabel(value) {
      if (!value) return 'Date unavailable';
      const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
      return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function normalizedOrders(bookings) {
      return bookings.map(booking => ({
        id: booking.id, orderNo: booking.order_no || 'No order number', customer: customerName(booking),
        date: booking.scheduled_date || '', images: safeImages(booking.doors)
      })).filter(order => order.images.length > 0);
    }

    function stateMessage(container, message, loading = false) {
      container.replaceChildren();
      const node = document.createElement('div'); node.className = 'browse-images-state';
      if (loading) { const spinner = document.createElement('span'); spinner.className = 'spinner-cyan'; node.append(spinner); }
      node.append(document.createTextNode(message)); container.appendChild(node);
    }

    function updateSelectedCount() {
      const count = state.selected.size;
      document.getElementById('browse-images-selected-count').textContent = count ? `${count} image${count === 1 ? '' : 's'} selected` : 'No images selected';
      document.getElementById('add-browsed-images').disabled = count === 0;
    }

    function renderImages() {
      const container = document.getElementById('browse-order-images');
      const order = state.orders.find(item => item.id === state.activeId);
      if (!order) { stateMessage(container, state.visible.length ? 'Select an order to view its images.' : 'No installer images found.'); return; }
      container.replaceChildren();
      order.images.forEach((url, index) => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = `browse-media-item${state.selected.has(url) ? ' selected' : ''}`;
        button.setAttribute('aria-pressed', String(state.selected.has(url))); button.setAttribute('aria-label', `Select installer image ${index + 1}`);
        const image = document.createElement('img');
        image.src = url; image.alt = `${order.orderNo} installer image ${index + 1}`; image.loading = 'lazy';
        image.addEventListener('error', () => button.remove());
        const check = document.createElement('span'); check.className = 'browse-media-check'; check.setAttribute('aria-hidden', 'true');
        button.append(image, check);
        button.addEventListener('click', () => {
          if (state.selected.has(url)) state.selected.delete(url); else state.selected.add(url);
          button.classList.toggle('selected', state.selected.has(url));
          button.setAttribute('aria-pressed', String(state.selected.has(url))); updateSelectedCount();
        });
        container.appendChild(button);
      });
    }

    function renderOrders() {
      const container = document.getElementById('browse-image-orders');
      if (!state.visible.length) { stateMessage(container, 'No orders with installer images found.'); renderImages(); return; }
      if (!state.visible.some(order => order.id === state.activeId)) state.activeId = state.visible[0].id;
      container.replaceChildren();
      state.visible.forEach(order => {
        const button = document.createElement('button'); button.type = 'button'; button.className = `browse-order${order.id === state.activeId ? ' active' : ''}`;
        const title = document.createElement('strong'); title.textContent = `${order.orderNo} - ${order.customer}`;
        const date = document.createElement('span'); date.textContent = dateLabel(order.date); button.append(title, date);
        button.addEventListener('click', () => { state.activeId = order.id; renderOrders(); }); container.appendChild(button);
      });
      renderImages();
    }

    function applySearch() {
      const query = document.getElementById('browse-images-search').value.trim().toLowerCase();
      state.visible = state.orders.filter(order => !query || [order.orderNo, order.customer, order.date, dateLabel(order.date)].some(value => String(value).toLowerCase().includes(query)));
      renderOrders();
    }

    async function load() {
      if (state.loaded || state.loading) return;
      state.loading = true;
      stateMessage(document.getElementById('browse-image-orders'), 'Loading orders...', true);
      stateMessage(document.getElementById('browse-order-images'), 'Loading installer images...', true);
      try {
        const { data, error } = await getSb().rpc('get_shared_media_bookings', {
          p_company_id: app.state.companyId, p_start_date: '2000-01-01', p_end_date: '2200-01-01', p_offset: 0, p_limit: PAGE_LIMIT
        });
        if (error) throw error;
        state.orders = normalizedOrders(data || []); state.loaded = true; applySearch();
      } catch (error) {
        console.error(error);
        stateMessage(document.getElementById('browse-image-orders'), 'Orders could not be loaded.');
        stateMessage(document.getElementById('browse-order-images'), 'Try opening Browse Images again.');
        app.toast('Installer images could not be loaded.');
      } finally { state.loading = false; }
    }

    async function imageFile(url, index) {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Installer image download failed');
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('Unsupported installer media');
      const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1] || 'png';
      return new File([blob], `installer-image-${index + 1}.${extension}`, { type: blob.type });
    }

    async function addSelected(button) {
      const available = Math.max(0, 25 - app.state.images.length);
      const urls = [...state.selected].slice(0, available);
      if (!urls.length) { app.toast(available ? 'Select at least one image.' : 'A canvas can contain up to 25 uploaded images.'); return; }
      button.disabled = true; button.textContent = 'Adding...';
      try {
        const files = await Promise.all(urls.map(imageFile)); await app.addFiles(files);
        state.selected.clear(); updateSelectedCount(); app.closeModal(document.getElementById('browse-images-modal'));
      } catch (error) { console.error(error); app.toast('One or more installer images could not be added.'); }
      finally { button.disabled = false; button.textContent = 'Add Images'; }
    }

    function open() {
      state.selected.clear(); updateSelectedCount(); app.openModal(document.getElementById('browse-images-modal')); load();
    }

    function bind() {
      document.getElementById('browse-installer-images').addEventListener('click', open);
      document.getElementById('browse-images-search').addEventListener('input', applySearch);
      document.getElementById('add-browsed-images').addEventListener('click', event => addSelected(event.currentTarget));
    }

    return { bind };
  }

  window.BKImageEditorMediaBrowser = { create };
}());

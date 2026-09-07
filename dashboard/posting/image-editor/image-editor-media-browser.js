(function () {
  'use strict';
  const IMAGE_PATTERN = /^(https?:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i;
  const HANDOFF_KEY = 'bk-posting-image-editor-import';
  const PAGE_SIZE = 10;
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function create(app) {
    const now = new Date();
    const state = { loading: false, month: now.getMonth(), year: now.getFullYear(), orders: [], activeId: null, selected: new Set(), offset: 0, hasMore: false, token: 0, searchTimer: 0 };
    let pending = null;
    function parseArray(value) { if (Array.isArray(value)) return value; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; } }
    function safeImages(doors) {
      const urls = parseArray(doors).flatMap(door => [...(Array.isArray(door?.media_urls) ? door.media_urls : []), ...(door?.required_media && typeof door.required_media === 'object' ? Object.values(door.required_media) : []), ...(Array.isArray(door?.other_media) ? door.other_media : [])]);
      return [...new Set(urls.filter(url => typeof url === 'string').map(url => url.trim()).filter(url => IMAGE_PATTERN.test(url) && !/\.(mp4|mov|webm|m4v)(?:\?|$)/i.test(url)))];
    }
    function customerName(booking) {
      if (booking.customer_is_company) return booking.customer_company_name || booking.customer_name || 'Unnamed customer';
      return [booking.customer_first_name,booking.customer_last_name].filter(Boolean).join(' ').trim() || booking.customer_name || 'Unnamed customer';
    }
    function dateLabel(value) {
      if (!value) return 'Date unavailable';
      const date = new Date(`${String(value).slice(0,10)}T00:00:00`);
      return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString('en-US',{ month:'short',day:'numeric',year:'numeric' });
    }
    function monthRange() {
      const start = `${state.year}-${String(state.month + 1).padStart(2,'0')}-01`;
      const nextMonth = state.month === 11 ? 0 : state.month + 1; const nextYear = state.month === 11 ? state.year + 1 : state.year;
      return { start, end:`${nextYear}-${String(nextMonth + 1).padStart(2,'0')}-01` };
    }
    function normalizedOrders(bookings) {
      return bookings.map(booking => ({ id:booking.id,orderNo:booking.order_no || 'No order number',customer:customerName(booking),date:booking.scheduled_date || '',images:safeImages(booking.doors) })).filter(order => order.images.length > 0);
    }
    function stateMessage(container,message,loading=false) {
      container.replaceChildren(); const node = document.createElement('div'); node.className = 'browse-images-state';
      if (loading) { const spinner = document.createElement('span'); spinner.className = 'spinner-cyan'; node.append(spinner); }
      node.append(document.createTextNode(message)); container.appendChild(node);
    }
    function updateSelectedCount() {
      const count = state.selected.size; document.getElementById('browse-images-selected-count').textContent = count ? `${count} image${count === 1 ? '' : 's'} selected` : 'No images selected';
      document.getElementById('add-browsed-images').disabled = count === 0;
    }
    function renderImages() {
      const container = document.getElementById('browse-order-images'); const order = state.orders.find(item => item.id === state.activeId);
      if (!order) { stateMessage(container,state.orders.length ? 'Select an order to view its images.' : 'No installer images found.'); return; }
      container.replaceChildren();
      order.images.forEach((url,index) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = `browse-media-item${state.selected.has(url) ? ' selected' : ''}`;
        button.setAttribute('aria-pressed',String(state.selected.has(url))); button.setAttribute('aria-label',`Select installer image ${index + 1}`);
        const image = document.createElement('img'); image.src = url; image.alt = `${order.orderNo} installer image ${index + 1}`; image.loading = 'lazy'; image.addEventListener('error',() => button.remove());
        const check = document.createElement('span'); check.className = 'browse-media-check'; check.setAttribute('aria-hidden','true'); button.append(image,check);
        button.addEventListener('click',() => { if (state.selected.has(url)) state.selected.delete(url); else state.selected.add(url); button.classList.toggle('selected',state.selected.has(url)); button.setAttribute('aria-pressed',String(state.selected.has(url))); updateSelectedCount(); });
        container.appendChild(button);
      });
    }
    function renderOrders() {
      const container = document.getElementById('browse-image-orders');
      if (!state.orders.length) { stateMessage(container,'No orders with installer images found.'); renderImages(); }
      else {
        if (!state.orders.some(order => order.id === state.activeId)) state.activeId = state.orders[0].id; container.replaceChildren();
        state.orders.forEach(order => { const button = document.createElement('button'); button.type = 'button'; button.className = `browse-order${order.id === state.activeId ? ' active' : ''}`; const title = document.createElement('strong'); title.textContent = `${order.orderNo} - ${order.customer}`; const date = document.createElement('span'); date.textContent = dateLabel(order.date); button.append(title,date); button.addEventListener('click',() => { state.activeId = order.id; renderOrders(); }); container.appendChild(button); }); renderImages();
      }
      const more = document.getElementById('browse-orders-load-more'); more.hidden = !state.hasMore; more.disabled = state.loading;
    }
    function updateMonthLabel() { document.getElementById('browse-month-label').textContent = `${MONTHS[state.month]} ${state.year}`; }
    async function load(reset=false) {
      if (state.loading && !reset) return; if (reset) { state.orders = []; state.offset = 0; state.activeId = null; state.hasMore = false; }
      const token = reset ? ++state.token : state.token; state.loading = true; const more = document.getElementById('browse-orders-load-more'); more.disabled = true;
      if (reset) { stateMessage(document.getElementById('browse-image-orders'),'Loading orders...',true); stateMessage(document.getElementById('browse-order-images'),'Loading installer images...',true); } else more.textContent = 'Loading...';
      try {
        const range = monthRange(); const { data,error } = await app.state.sb.rpc('get_posting_image_browser_bookings',{ p_company_id:app.state.companyId,p_start_date:range.start,p_end_date:range.end,p_search:document.getElementById('browse-images-search').value.trim(),p_offset:state.offset,p_limit:PAGE_SIZE + 1 });
        if (error) throw error; if (token !== state.token) return; const page = normalizedOrders(data || []); state.hasMore = page.length > PAGE_SIZE; const visiblePage = page.slice(0,PAGE_SIZE); state.orders.push(...visiblePage); state.offset += visiblePage.length; renderOrders();
      } catch (error) { console.error(error); if (reset) { stateMessage(document.getElementById('browse-image-orders'),'Orders could not be loaded.'); stateMessage(document.getElementById('browse-order-images'),'Try opening Browse Images again.'); } app.toast('Installer images could not be loaded.'); }
      finally { if (token === state.token) { state.loading = false; more.disabled = false; more.textContent = 'Load More'; } }
    }
    function changeMonth(delta) { state.month += delta; if (state.month < 0) { state.month = 11; state.year -= 1; } if (state.month > 11) { state.month = 0; state.year += 1; } state.selected.clear(); updateSelectedCount(); updateMonthLabel(); load(true); }
    async function imageFile(url,index) { const response = await fetch(url); if (!response.ok) throw new Error('Installer image download failed'); const blob = await response.blob(); if (!blob.type.startsWith('image/')) throw new Error('Unsupported installer media'); const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1] || 'png'; return new File([blob],`installer-image-${index + 1}.${extension}`,{ type:blob.type }); }
    async function addSelected(button) {
      const available = Math.max(0,25 - app.state.images.length); const urls = [...state.selected].slice(0,available); if (!urls.length) { app.toast(available ? 'Select at least one image.' : 'A canvas can contain up to 25 uploaded images.'); return; }
      button.disabled = true; button.textContent = 'Adding...'; try { const files = await Promise.all(urls.map(imageFile)); await app.addFiles(files); state.selected.clear(); updateSelectedCount(); app.closeModal(document.getElementById('browse-images-modal')); } catch (error) { console.error(error); app.toast('One or more installer images could not be added.'); } finally { button.disabled = false; button.textContent = 'Add Images'; }
    }
    function openPendingCanvasSetup(openSizeModal) {
      try { const value = JSON.parse(sessionStorage.getItem(HANDOFF_KEY) || 'null'); pending = value && typeof value.url === 'string' && IMAGE_PATTERN.test(value.url) ? value : null; }
      catch (error) { console.warn('Pending editor image could not be read.', error); pending = null; }
      if (pending) openSizeModal();
    }
    async function importAfterCanvasReady() {
      if (!pending || !app.state.canvasReady) return;
      try {
        const response = await fetch(pending.url); if (!response.ok) throw new Error('Image download failed'); const blob = await response.blob();
        if (!['image/png','image/jpeg','image/webp'].includes(blob.type)) throw new Error('Unsupported image format'); const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1];
        await app.addFiles([new File([blob],`customer-media.${extension}`,{ type:blob.type })]); pending = null; sessionStorage.removeItem(HANDOFF_KEY);
      } catch (error) { console.error(error); app.toast('The selected customer image could not be loaded.'); }
    }
    function open() { state.selected.clear(); updateSelectedCount(); updateMonthLabel(); app.openModal(document.getElementById('browse-images-modal')); load(true); }
    function bind() {
      document.getElementById('browse-installer-images').addEventListener('click',open); document.getElementById('browse-month-previous').addEventListener('click',() => changeMonth(-1)); document.getElementById('browse-month-next').addEventListener('click',() => changeMonth(1)); document.getElementById('browse-orders-load-more').addEventListener('click',() => load(false));
      document.getElementById('browse-images-search').addEventListener('input',() => { clearTimeout(state.searchTimer); state.searchTimer = setTimeout(() => load(true),250); }); document.getElementById('add-browsed-images').addEventListener('click',event => addSelected(event.currentTarget));
    }
    return { bind, importAfterCanvasReady, openPendingCanvasSetup };
  }
  window.BKImageEditorMediaBrowser = { create };
}());

(function () {
  'use strict';

  const state = {
    width: 1080,
    height: 1080,
    canvasReady: false,
    zoom: 100,
    background: '#FFFFFF',
    baseImage: null,
    images: [],
    activeIndex: -1,
    overlays: { watermark: null, template: null },
    selected: null,
    drag: null,
    modalType: null,
    draftOverlay: null,
    urls: [],
    sb: null,
    companyId: null,
    savedCanvases: [],
    selectedSavedId: null
  };

  const canvas = document.getElementById('editor-canvas');
  const context = canvas.getContext('2d');
  const canvasFrame = document.getElementById('editor-canvas-frame');
  const interactionCanvas = document.getElementById('image-interaction-canvas');
  const interactionContext = interactionCanvas.getContext('2d');
  const preview = document.getElementById('overlay-preview-canvas');
  const previewContext = preview.getContext('2d');
  const HANDLE_SIZE = 20;
  let draggedLayerIndex = null;

  function toast(message) {
    const container = document.getElementById('toast-container');
    const item = document.createElement('div');
    item.className = 'editor-toast';
    item.textContent = message;
    container.replaceChildren(item);
    setTimeout(() => item.remove(), 2200);
  }

  function openModal(modal) {
    modal.style.display = 'flex';
    void modal.offsetHeight;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    setTimeout(() => { modal.style.display = 'none'; }, 150);
  }

  function loadFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      state.urls.push(url);
      const image = new Image();
      image.onload = () => resolve({ image, url });
      image.onerror = reject;
      image.src = url;
    });
  }

  function fitTransform(image, mode) {
    const scale = mode === 'height'
      ? state.height / image.naturalHeight
      : Math.min(state.width / image.naturalWidth, state.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    return { x: (state.width - width) / 2, y: (state.height - height) / 2, width, height };
  }

  function activeImage() { return state.images[state.activeIndex] || null; }

  function imageCenter(target) {
    return { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  }

  function drawImageTransformed(ctx, target) {
    const center = imageCenter(target);
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate((target.rotation || 0) * Math.PI / 180);
    ctx.scale(target.flipX ? -1 : 1, target.flipY ? -1 : 1);
    ctx.globalAlpha = target.opacity ?? 1;
    ctx.drawImage(target.image, -target.width / 2, -target.height / 2, target.width, target.height);
    ctx.restore();
  }

  function updateImageProperties() {
    const target = activeImage();
    const disabled = !target;
    document.getElementById('image-properties').setAttribute('aria-disabled', String(disabled));
    ['reset-image-dimensions', 'reset-image-rotation', 'reset-image-opacity', 'image-opacity', 'flip-image-horizontal', 'flip-image-vertical']
      .forEach(id => { document.getElementById(id).disabled = disabled; });
    document.getElementById('image-dimensions-value').textContent = target ? `${Math.round(target.width)} × ${Math.round(target.height)} px` : 'No image selected';
    document.getElementById('image-rotation-value').textContent = `${Math.round(target?.rotation || 0)}°`;
    const opacity = Math.round((target?.opacity ?? 1) * 100);
    document.getElementById('image-opacity-value').textContent = `${opacity}%`;
    document.getElementById('image-opacity').value = String(opacity);
  }

  function drawSelection(target, ctx, scaleFactor) {
    if (!target) return;
    ctx.save();
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = Math.max(2, 2 / scaleFactor);
    ctx.setLineDash([8 / scaleFactor, 5 / scaleFactor]);
    ctx.strokeRect(target.x, target.y, target.width, target.height);
    ctx.setLineDash([]);
    const handle = HANDLE_SIZE / scaleFactor;
    const cornerX = target.x + target.width;
    const cornerY = target.y + target.height;
    ctx.fillStyle = '#06B6D4';
    ctx.fillRect(cornerX - handle / 2, cornerY - handle / 2, handle, handle);
    const iconRadius = 4 / scaleFactor;
    const arrowSize = 3 / scaleFactor;
    const startX = cornerX - iconRadius;
    const startY = cornerY - iconRadius;
    const endX = cornerX + iconRadius;
    const endY = cornerY + iconRadius;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + arrowSize, startY);
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX, startY + arrowSize);
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - arrowSize, endY);
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX, endY - arrowSize);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.6 / scaleFactor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  function drawImageSelection(target, ctx, scaleFactor) {
    const center = imageCenter(target);
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate((target.rotation || 0) * Math.PI / 180);
    ctx.scale(target.flipX ? -1 : 1, target.flipY ? -1 : 1);
    const local = { x: -target.width / 2, y: -target.height / 2, width: target.width, height: target.height };
    drawSelection(local, ctx, scaleFactor);
    const handle = HANDLE_SIZE / scaleFactor;
    const cornerX = local.x + local.width;
    const cornerY = local.y;
    ctx.fillStyle = '#06B6D4';
    ctx.fillRect(cornerX - handle / 2, cornerY - handle / 2, handle, handle);
    const radius = 5.5 / scaleFactor;
    const startAngle = Math.PI * 0.15;
    const endAngle = Math.PI * 1.78;
    ctx.beginPath();
    ctx.arc(cornerX, cornerY, radius * 0.68, startAngle, endAngle);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.7 / scaleFactor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    const arrowX = cornerX + Math.cos(endAngle) * radius * 0.68;
    const arrowY = cornerY + Math.sin(endAngle) * radius * 0.68;
    const arrowSize = 2.8 / scaleFactor;
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(arrowX - arrowSize * 1.25, arrowY - arrowSize * 0.2);
    ctx.lineTo(arrowX - arrowSize * 0.15, arrowY + arrowSize * 1.2);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
  }

  function drawCanvas() {
    context.clearRect(0, 0, state.width, state.height);
    context.fillStyle = state.background;
    context.fillRect(0, 0, state.width, state.height);
    if (state.baseImage) context.drawImage(state.baseImage, 0, 0, state.width, state.height);
    state.images.forEach(image => drawImageTransformed(context, image));
    const current = activeImage();
    ['watermark', 'template'].forEach(type => {
      const overlay = state.overlays[type];
      if (!overlay) return;
      context.save();
      context.globalAlpha = overlay.opacity;
      context.drawImage(overlay.image, overlay.x, overlay.y, overlay.width, overlay.height);
      context.restore();
    });
    drawInteractionOverlay();
    updateImageProperties();
  }

  function transformedBounds(target) {
    if (!target && !state.images.length) return { left: 0, top: 0, right: state.width, bottom: state.height };
    const outboundX = state.width;
    const outboundY = state.height;
    return {
      left: -outboundX,
      top: -outboundY,
      right: state.width + outboundX,
      bottom: state.height + outboundY
    };
  }

  function sizeInteractionSurface(target) {
    const bounds = transformedBounds(state.selected === 'image' ? target : null);
    const scale = state.displayScale || 1;
    state.interactionOriginX = bounds.left;
    state.interactionOriginY = bounds.top;
    const width = Math.max(1, Math.ceil(bounds.right - bounds.left));
    const height = Math.max(1, Math.ceil(bounds.bottom - bounds.top));
    interactionCanvas.width = width;
    interactionCanvas.height = height;
    canvasFrame.style.width = `${Math.round(width * scale)}px`;
    canvasFrame.style.height = `${Math.round(height * scale)}px`;
    const shiftX = (width + bounds.left * 2 - state.width) * scale / 2;
    const shiftY = (height + bounds.top * 2 - state.height) * scale / 2;
    canvasFrame.style.transform = `translate(${shiftX}px, ${shiftY}px)`;
    canvas.style.left = `${Math.round(-bounds.left * scale)}px`;
    canvas.style.top = `${Math.round(-bounds.top * scale)}px`;
    canvas.style.width = `${Math.round(state.width * scale)}px`;
    canvas.style.height = `${Math.round(state.height * scale)}px`;
  }

  function drawInteractionOverlay() {
    const target = activeImage();
    sizeInteractionSurface(target);
    interactionContext.clearRect(0, 0, interactionCanvas.width, interactionCanvas.height);
    if (state.selected !== 'image' || !target) return;
    const originX = state.interactionOriginX || 0;
    const originY = state.interactionOriginY || 0;
    interactionContext.save();
    interactionContext.translate(-originX, -originY);
    interactionContext.beginPath();
    interactionContext.rect(originX, originY, interactionCanvas.width, interactionCanvas.height);
    interactionContext.rect(0, 0, state.width, state.height);
    interactionContext.clip('evenodd');
    drawImageTransformed(interactionContext, { ...target, opacity: (target.opacity ?? 1) * 0.25 });
    interactionContext.restore();
    interactionContext.save();
    interactionContext.translate(-originX, -originY);
    drawImageSelection(target, interactionContext, canvas.clientWidth / state.width || 1);
    interactionContext.restore();
  }

  function syncCanvasSize() {
    canvas.width = state.width;
    canvas.height = state.height;
    document.getElementById('canvas-size-label').textContent = `${state.width} × ${state.height}`;
    drawCanvas();
  }

  function showCanvas() {
    syncCanvasSize();
    document.getElementById('canvas-empty').hidden = true;
    canvasFrame.style.display = 'block';
    document.getElementById('canvas-zoom').hidden = false;
    document.getElementById('source-images').disabled = false;
    document.getElementById('upload-label').classList.remove('disabled');
    document.getElementById('upload-label').setAttribute('aria-disabled', 'false');
    document.getElementById('fill-height').disabled = false;
    document.getElementById('open-save-canvas-modal').disabled = false;
    requestAnimationFrame(fillCanvasHeight);
  }

  function applyZoom() {
    if (!state.canvasReady) return;
    const stage = document.getElementById('canvas-stage');
    const availableHeight = Math.max(100, stage.clientHeight - 64);
    const fitScale = availableHeight / state.height;
    const scale = fitScale * state.zoom / 100;
    state.displayScale = scale;
    document.getElementById('zoom-slider').value = String(state.zoom);
    document.getElementById('zoom-value').textContent = `${state.zoom}%`;
    drawCanvas();
  }

  function fillCanvasHeight() {
    state.zoom = 100;
    applyZoom();
    document.getElementById('canvas-stage').scrollTo({ top: 0, left: 0 });
  }

  function setZoom(value) {
    state.zoom = Math.min(200, Math.max(25, Number(value) || 100));
    applyZoom();
  }

  function centerCanvasInStage() {
    const stage = document.getElementById('canvas-stage');
    const stageRect = stage.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    stage.scrollBy({
      left: canvasRect.left + canvasRect.width / 2 - stageRect.left - stage.clientWidth / 2,
      top: canvasRect.top + canvasRect.height / 2 - stageRect.top - stage.clientHeight / 2
    });
  }

  function renderStrip() {
    const list = document.getElementById('layers-list');
    if (!state.images.length) {
      const empty = document.createElement('p');
      empty.className = 'layers-empty';
      empty.textContent = 'Uploaded images will appear here.';
      list.replaceChildren(empty);
      return;
    }
    const rows = [...state.images].map((entry, index) => ({ entry, index })).reverse().map(({ entry, index }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `layer-row${index === state.activeIndex ? ' active' : ''}`;
      button.dataset.layerIndex = String(index);
      button.setAttribute('aria-label', `Select ${entry.name}`);
      const handle = document.createElement('span');
      handle.className = 'layer-handle';
      handle.draggable = true;
      handle.setAttribute('aria-hidden', 'true');
      handle.innerHTML = '<svg viewBox="0 0 20 20"><path d="M3 6h14M3 10h14M3 14h14"></path></svg>';
      const image = document.createElement('img');
      image.className = 'layer-thumbnail';
      image.src = entry.url;
      image.alt = '';
      const filename = document.createElement('span');
      filename.className = 'layer-filename';
      filename.textContent = entry.name;
      filename.title = entry.name;
      button.append(handle, image, filename);
      button.addEventListener('click', () => {
        state.activeIndex = index;
        state.selected = 'image';
        renderStrip();
        drawCanvas();
      });
      return button;
    });
    list.replaceChildren(...rows);
  }

  function reorderLayers(fromIndex, toIndex) {
    if (fromIndex === toIndex || !state.images[fromIndex] || !state.images[toIndex]) return;
    const active = activeImage();
    const [moved] = state.images.splice(fromIndex, 1);
    state.images.splice(toIndex, 0, moved);
    state.activeIndex = state.images.indexOf(active);
    state.selected = 'image';
    renderStrip();
    drawCanvas();
  }

  async function uploadSources(files) {
    if (!state.canvasReady) return;
    const valid = [...files].filter(file => ['image/png', 'image/jpeg', 'image/webp'].includes(file.type));
    if (!valid.length) return;
    const loaded = await Promise.all(valid.map(async file => ({ ...await loadFile(file), name: file.name })));
    loaded.forEach(({ image, url, name }) => {
      const transform = fitTransform(image, 'contain');
      state.images.push({ image, url, name, ...transform, originalWidth: transform.width, originalHeight: transform.height, rotation: 0, opacity: 1, flipX: false, flipY: false });
    });
    if (state.activeIndex < 0) state.activeIndex = 0;
    state.selected = 'image';
    renderStrip();
    requestAnimationFrame(() => {
      applyZoom();
      requestAnimationFrame(centerCanvasInStage);
    });
    drawCanvas();
  }

  function canvasBlob() {
    const selected = state.selected;
    state.selected = null;
    drawCanvas();
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        state.selected = selected;
        drawCanvas();
        if (blob) resolve(blob);
        else reject(new Error('Canvas could not be encoded.'));
      }, 'image/png');
    });
  }

  function publicCanvasUrl(path) {
    return state.sb.storage.from('brightkey-assets').getPublicUrl(path).data.publicUrl;
  }

  async function saveCanvas() {
    const nameInput = document.getElementById('saved-canvas-name');
    const errorNode = document.getElementById('save-canvas-error');
    const saveButton = document.getElementById('save-canvas');
    const name = nameInput.value.trim();
    errorNode.hidden = Boolean(name);
    nameInput.style.borderColor = name ? '' : 'var(--danger)';
    if (!name || !state.canvasReady || !state.companyId) {
      if (!name) nameInput.focus();
      return;
    }
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    const path = `companies/${state.companyId}/posting/canvases/${crypto.randomUUID()}.png`;
    try {
      const blob = await canvasBlob();
      const { error: uploadError } = await state.sb.storage.from('brightkey-assets').upload(path, blob, { contentType: 'image/png', cacheControl: '31536000', upsert: false });
      if (uploadError) throw uploadError;
      const { error: insertError } = await state.sb.from('posting_image_canvases').insert({
        company_id: state.companyId,
        name,
        width: state.width,
        height: state.height,
        image_path: path
      });
      if (insertError) {
        await state.sb.storage.from('brightkey-assets').remove([path]);
        throw insertError;
      }
      closeModal(document.getElementById('save-canvas-modal'));
      nameInput.value = '';
      toast('Canvas saved.');
    } catch (error) {
      console.error(error);
      toast('Canvas could not be saved. Please try again.');
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Save Canvas';
    }
  }

  function renderSavedCanvases() {
    const list = document.getElementById('saved-canvases-list');
    if (!state.savedCanvases.length) {
      list.innerHTML = '<div class="saved-canvases-state">No saved canvases yet.</div>';
      return;
    }
    list.replaceChildren(...state.savedCanvases.map(saved => {
      const row = document.createElement('div');
      row.className = 'saved-canvas-row';
      const name = document.createElement('span');
      name.className = 'saved-canvas-name';
      name.textContent = saved.name;
      name.title = saved.name;
      const dimensions = document.createElement('span');
      dimensions.className = 'saved-canvas-dimensions';
      dimensions.textContent = `${saved.width} × ${saved.height}`;
      const loadButton = document.createElement('button');
      loadButton.type = 'button';
      loadButton.className = 'btn btn-cyan';
      loadButton.dataset.canvasId = saved.id;
      loadButton.textContent = 'Load';
      row.append(name, dimensions, loadButton);
      return row;
    }));
  }

  function updateSizeAction() {
    const button = document.getElementById('create-canvas');
    const loadingSaved = Boolean(state.selectedSavedId);
    button.textContent = loadingSaved ? 'Load' : 'Create';
    button.classList.toggle('btn-success', !loadingSaved);
    button.classList.toggle('btn-cyan', loadingSaved);
  }

  function renderSizeSavedCanvases() {
    const list = document.getElementById('size-saved-canvases');
    if (!state.savedCanvases.length) {
      list.innerHTML = '<div class="size-saved-state">No saved canvases yet.</div>';
      return;
    }
    list.replaceChildren(...state.savedCanvases.map(saved => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = `size-saved-option${saved.id === state.selectedSavedId ? ' selected' : ''}`;
      option.dataset.savedCanvasId = saved.id;
      option.setAttribute('aria-pressed', saved.id === state.selectedSavedId ? 'true' : 'false');
      const name = document.createElement('strong');
      name.textContent = saved.name;
      name.title = saved.name;
      const dimensions = document.createElement('span');
      dimensions.textContent = `${saved.width} × ${saved.height}`;
      option.append(name, dimensions);
      return option;
    }));
  }

  async function fetchSavedCanvases() {
    const { data, error } = await state.sb.from('posting_image_canvases')
      .select('id,name,width,height,image_path,updated_at')
      .eq('company_id', state.companyId)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    state.savedCanvases = data || [];
  }

  async function openSizeModal() {
    const list = document.getElementById('size-saved-canvases');
    state.selectedSavedId = null;
    updateSizeAction();
    list.innerHTML = '<div class="size-saved-state"><span class="spinner-cyan"></span><span>Loading saved canvases...</span></div>';
    openModal(document.getElementById('size-modal'));
    try {
      await fetchSavedCanvases();
      renderSizeSavedCanvases();
    } catch (error) {
      console.error(error);
      list.innerHTML = '<div class="size-saved-state">Saved canvases could not be loaded.</div>';
    }
  }

  async function openSavedCanvases() {
    const modal = document.getElementById('load-canvas-modal');
    const list = document.getElementById('saved-canvases-list');
    list.innerHTML = '<div class="saved-canvases-state"><span class="spinner-cyan"></span><span>Loading saved canvases...</span></div>';
    openModal(modal);
    try {
      await fetchSavedCanvases();
    } catch (error) {
      console.error(error);
      list.innerHTML = '<div class="saved-canvases-state">Saved canvases could not be loaded.</div>';
      return;
    }
    renderSavedCanvases();
  }

  function loadRemoteImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
  }

  async function loadSavedCanvas(saved, button) {
    button.disabled = true;
    button.textContent = 'Loading...';
    try {
      const image = await loadRemoteImage(publicCanvasUrl(saved.image_path));
      state.width = saved.width;
      state.height = saved.height;
      state.canvasReady = true;
      state.zoom = 100;
      state.background = '#FFFFFF';
      state.baseImage = image;
      state.images = [];
      state.activeIndex = -1;
      state.overlays = { watermark: null, template: null };
      state.selected = null;
      state.drag = null;
      interactionCanvas.style.cursor = 'default';
      document.getElementById('background-color').value = '#ffffff';
      document.getElementById('background-hex').value = '#FFFFFF';
      renderStrip();
      showCanvas();
      closeModal(document.getElementById('load-canvas-modal'));
      closeModal(document.getElementById('size-modal'));
      toast(`Loaded ${saved.name}.`);
    } catch (error) {
      console.error(error);
      toast('Canvas could not be loaded. Please try again.');
    } finally {
      button.disabled = false;
      button.textContent = 'Load';
    }
  }

  function canvasPoint(event, targetCanvas) {
    const rect = targetCanvas.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) * (targetCanvas.width / rect.width),
      y: (event.clientY - rect.top) * (targetCanvas.height / rect.height)
    };
    if (targetCanvas === interactionCanvas) {
      point.x += state.interactionOriginX || 0;
      point.y += state.interactionOriginY || 0;
    }
    return point;
  }

  function contains(target, point) {
    return target && point.x >= target.x && point.x <= target.x + target.width && point.y >= target.y && point.y <= target.y + target.height;
  }

  function isResizeHandle(target, point, handleSize) {
    if (!target) return false;
    const half = handleSize / 2;
    const cornerX = target.x + target.width;
    const cornerY = target.y + target.height;
    return point.x >= cornerX - half && point.x <= cornerX + half
      && point.y >= cornerY - half && point.y <= cornerY + half;
  }

  function imageLocalPoint(target, point) {
    const center = imageCenter(target);
    const angle = -(target.rotation || 0) * Math.PI / 180;
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    let localX = dx * Math.cos(angle) - dy * Math.sin(angle);
    let localY = dx * Math.sin(angle) + dy * Math.cos(angle);
    if (target.flipX) localX *= -1;
    if (target.flipY) localY *= -1;
    return { x: center.x + localX, y: center.y + localY };
  }

  function isRotateHandle(target, point, handleSize) {
    if (!target) return false;
    const half = handleSize / 2;
    const cornerX = target.x + target.width;
    const cornerY = target.y;
    return point.x >= cornerX - half && point.x <= cornerX + half
      && point.y >= cornerY - half && point.y <= cornerY + half;
  }

  function canvasTargetAt(point) {
    const handle = HANDLE_SIZE * state.width / Math.max(canvas.clientWidth, 1);
    const image = activeImage();
    if (!image) return { type: null, target: null, action: null, localPoint: point };
    const localPoint = imageLocalPoint(image, point);
    const action = isRotateHandle(image, localPoint, handle) ? 'rotate'
      : isResizeHandle(image, localPoint, handle) ? 'resize'
        : contains(image, localPoint) ? 'move' : null;
    return { type: action ? 'image' : null, target: action ? image : null, action, localPoint };
  }

  function updateCanvasCursor(point) {
    const { action } = canvasTargetAt(point);
    interactionCanvas.style.cursor = action === 'rotate' ? 'grab' : action === 'resize' ? 'nwse-resize' : action === 'move' ? 'move' : 'default';
  }

  function onCanvasPointerDown(event) {
    const point = canvasPoint(event, interactionCanvas);
    const { type, target, action, localPoint } = canvasTargetAt(point);
    if (!type) { state.selected = null; drawCanvas(); return; }
    state.selected = type;
    const center = imageCenter(target);
    state.drag = {
      type,
      action,
      startX: point.x,
      startY: point.y,
      startLocalX: localPoint.x,
      startLocalY: localPoint.y,
      startAngle: Math.atan2(point.y - center.y, point.x - center.x),
      original: { x: target.x, y: target.y, width: target.width, height: target.height, rotation: target.rotation || 0 }
    };
    interactionCanvas.style.cursor = action === 'rotate' ? 'grabbing' : action === 'resize' ? 'nwse-resize' : 'move';
    interactionCanvas.setPointerCapture(event.pointerId);
    drawCanvas();
  }

  function onCanvasPointerMove(event) {
    const point = canvasPoint(event, interactionCanvas);
    if (!state.drag) { updateCanvasCursor(point); return; }
    const target = state.drag.type === 'image' ? activeImage() : state.overlays[state.drag.type];
    const dx = point.x - state.drag.startX;
    const dy = point.y - state.drag.startY;
    if (state.drag.action === 'rotate') {
      const center = { x: state.drag.original.x + state.drag.original.width / 2, y: state.drag.original.y + state.drag.original.height / 2 };
      const angle = Math.atan2(point.y - center.y, point.x - center.x);
      target.rotation = state.drag.original.rotation + (angle - state.drag.startAngle) * 180 / Math.PI;
    } else if (state.drag.action === 'resize') {
      const localPoint = imageLocalPoint(target, point);
      const localDx = localPoint.x - state.drag.startLocalX;
      const ratio = state.drag.original.width / state.drag.original.height;
      const width = Math.max(40, state.drag.original.width + localDx);
      target.width = width;
      target.height = width / ratio;
    } else {
      target.x = state.drag.original.x + dx;
      target.y = state.drag.original.y + dy;
    }
    drawCanvas();
  }

  function onCanvasPointerUp(event) {
    if (state.drag) interactionCanvas.releasePointerCapture(event.pointerId);
    state.drag = null;
    updateCanvasCursor(canvasPoint(event, interactionCanvas));
  }

  function drawOverlayPreview() {
    previewContext.clearRect(0, 0, preview.width, preview.height);
    previewContext.fillStyle = state.background;
    previewContext.fillRect(0, 0, preview.width, preview.height);
    const current = activeImage();
    const scale = Math.min(preview.width / state.width, preview.height / state.height);
    const offsetX = (preview.width - state.width * scale) / 2;
    const offsetY = (preview.height - state.height * scale) / 2;
    previewContext.save();
    previewContext.translate(offsetX, offsetY);
    previewContext.scale(scale, scale);
    if (state.baseImage) previewContext.drawImage(state.baseImage, 0, 0, state.width, state.height);
    if (current) drawImageTransformed(previewContext, current);
    if (state.draftOverlay) {
      previewContext.globalAlpha = state.draftOverlay.opacity;
      previewContext.drawImage(state.draftOverlay.image, state.draftOverlay.x, state.draftOverlay.y, state.draftOverlay.width, state.draftOverlay.height);
      previewContext.globalAlpha = 1;
      drawSelection(state.draftOverlay, previewContext, scale);
    }
    previewContext.restore();
  }

  function openOverlay(type) {
    state.modalType = type;
    const existing = state.overlays[type];
    state.draftOverlay = existing ? { ...existing } : null;
    document.getElementById('overlay-title').textContent = type === 'watermark' ? 'Watermark' : 'Template';
    document.getElementById('overlay-description').textContent = `${type === 'watermark' ? 'Watermark' : 'Template'} is applied to all uploaded images.`;
    const opacity = Math.round((state.draftOverlay?.opacity ?? 1) * 100);
    document.getElementById('overlay-opacity').value = String(opacity);
    document.getElementById('overlay-opacity-value').textContent = `${opacity}%`;
    document.getElementById('overlay-preview-empty').hidden = Boolean(state.draftOverlay);
    document.getElementById('apply-overlay').disabled = !state.draftOverlay;
    drawOverlayPreview();
    openModal(document.getElementById('overlay-modal'));
  }

  async function loadOverlay(file) {
    if (!file || file.type !== 'image/png') return;
    const { image, url } = await loadFile(file);
    const maxWidth = state.width * 0.7;
    const maxHeight = state.height * 0.7;
    const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    state.draftOverlay = { image, url, opacity: Number(document.getElementById('overlay-opacity').value) / 100, x: (state.width - width) / 2, y: (state.height - height) / 2, width, height };
    document.getElementById('overlay-preview-empty').hidden = true;
    document.getElementById('apply-overlay').disabled = false;
    drawOverlayPreview();
  }

  function previewPointerDown(event) {
    if (!state.draftOverlay) return;
    const point = canvasPoint(event, preview);
    const scale = Math.min(preview.width / state.width, preview.height / state.height);
    const offsetX = (preview.width - state.width * scale) / 2;
    const offsetY = (preview.height - state.height * scale) / 2;
    const canvasPosition = { x: (point.x - offsetX) / scale, y: (point.y - offsetY) / scale };
    const handle = HANDLE_SIZE / scale;
    if (!contains(state.draftOverlay, canvasPosition) && !isResizeHandle(state.draftOverlay, canvasPosition, handle)) return;
    const resizing = isResizeHandle(state.draftOverlay, canvasPosition, handle);
    state.drag = { type: 'draft', resizing, startX: canvasPosition.x, startY: canvasPosition.y, original: { x: state.draftOverlay.x, y: state.draftOverlay.y, width: state.draftOverlay.width, height: state.draftOverlay.height }, previewScale: scale, offsetX, offsetY };
    preview.style.cursor = resizing ? 'nwse-resize' : 'move';
    preview.setPointerCapture(event.pointerId);
  }

  function previewPointerMove(event) {
    const point = canvasPoint(event, preview);
    const scale = Math.min(preview.width / state.width, preview.height / state.height);
    const offsetX = (preview.width - state.width * scale) / 2;
    const offsetY = (preview.height - state.height * scale) / 2;
    const hoverPosition = { x: (point.x - offsetX) / scale, y: (point.y - offsetY) / scale };
    if (state.drag?.type !== 'draft') {
      const handle = HANDLE_SIZE / scale;
      preview.style.cursor = isResizeHandle(state.draftOverlay, hoverPosition, handle) ? 'nwse-resize' : contains(state.draftOverlay, hoverPosition) ? 'move' : 'default';
      return;
    }
    const position = { x: (point.x - state.drag.offsetX) / state.drag.previewScale, y: (point.y - state.drag.offsetY) / state.drag.previewScale };
    const dx = position.x - state.drag.startX;
    const dy = position.y - state.drag.startY;
    if (state.drag.resizing) {
      const ratio = state.drag.original.width / state.drag.original.height;
      state.draftOverlay.width = Math.max(40, state.drag.original.width + dx);
      state.draftOverlay.height = state.draftOverlay.width / ratio;
    } else {
      state.draftOverlay.x = state.drag.original.x + dx;
      state.draftOverlay.y = state.drag.original.y + dy;
    }
    drawOverlayPreview();
  }

  function previewPointerUp(event) {
    if (state.drag?.type === 'draft') preview.releasePointerCapture(event.pointerId);
    state.drag = null;
    previewPointerMove(event);
  }

  function resizeCanvas() {
    const width = Number(document.getElementById('canvas-width').value);
    const height = Number(document.getElementById('canvas-height').value);
    const valid = Number.isInteger(width) && Number.isInteger(height) && width >= 100 && width <= 8000 && height >= 100 && height <= 8000;
    document.getElementById('size-error').hidden = valid;
    if (!valid) return;
    state.width = width;
    state.height = height;
    state.canvasReady = true;
    state.zoom = 100;
    state.baseImage = null;
    state.images = [];
    state.activeIndex = -1;
    state.overlays = { watermark: null, template: null };
    state.selected = null;
    state.drag = null;
    interactionCanvas.style.cursor = 'default';
    renderStrip();
    showCanvas();
    closeModal(document.getElementById('size-modal'));
  }

  function runSizeAction() {
    if (!state.selectedSavedId) {
      resizeCanvas();
      return;
    }
    const saved = state.savedCanvases.find(item => item.id === state.selectedSavedId);
    if (saved) loadSavedCanvas(saved, document.getElementById('create-canvas'));
  }

  async function init() {
    const authInfo = await window.BKAuth.checkRoleGate(['Marketing', 'owner', 'admin'], '/admin.html');
    if (!authInfo) return;
    state.sb = window.BKAuth.sb;
    const { data: company, error: companyError } = await state.sb.from('companies')
      .select('id').eq('tenant_id', authInfo.tenantId).limit(1).maybeSingle();
    if (companyError || !company?.id) {
      toast('Company access could not be verified.');
      return;
    }
    state.companyId = company.id;
    if (typeof initNav === 'function') initNav();
    document.getElementById('source-images').addEventListener('change', event => uploadSources(event.target.files).catch(() => toast('One or more images could not be loaded.')));
    const layersList = document.getElementById('layers-list');
    layersList.addEventListener('dragstart', event => {
      const handle = event.target.closest('.layer-handle');
      const row = handle?.closest('.layer-row');
      if (!row) return;
      draggedLayerIndex = Number(row.dataset.layerIndex);
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', row.dataset.layerIndex);
    });
    layersList.addEventListener('dragover', event => {
      const row = event.target.closest('.layer-row');
      if (!row || draggedLayerIndex === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      layersList.querySelectorAll('.drag-over').forEach(item => item.classList.remove('drag-over'));
      row.classList.add('drag-over');
    });
    layersList.addEventListener('drop', event => {
      const row = event.target.closest('.layer-row');
      if (!row || draggedLayerIndex === null) return;
      event.preventDefault();
      reorderLayers(draggedLayerIndex, Number(row.dataset.layerIndex));
      draggedLayerIndex = null;
    });
    layersList.addEventListener('dragend', () => {
      draggedLayerIndex = null;
      layersList.querySelectorAll('.dragging,.drag-over').forEach(item => item.classList.remove('dragging', 'drag-over'));
    });
    document.getElementById('fill-height').addEventListener('click', fillCanvasHeight);
    document.getElementById('zoom-slider').addEventListener('input', event => setZoom(event.target.value));
    document.getElementById('zoom-in').addEventListener('click', () => setZoom(state.zoom + 5));
    document.getElementById('zoom-out').addEventListener('click', () => setZoom(state.zoom - 5));
    document.getElementById('reset-image-dimensions').addEventListener('click', () => {
      const target = activeImage();
      if (!target) return;
      const center = imageCenter(target);
      target.width = target.originalWidth;
      target.height = target.originalHeight;
      target.x = center.x - target.width / 2;
      target.y = center.y - target.height / 2;
      drawCanvas();
    });
    document.getElementById('reset-image-rotation').addEventListener('click', () => {
      const target = activeImage();
      if (!target) return;
      target.rotation = 0;
      drawCanvas();
    });
    document.getElementById('reset-image-opacity').addEventListener('click', () => {
      const target = activeImage();
      if (!target) return;
      target.opacity = 1;
      drawCanvas();
    });
    document.getElementById('image-opacity').addEventListener('input', event => {
      const target = activeImage();
      if (!target) return;
      target.opacity = Number(event.target.value) / 100;
      drawCanvas();
    });
    document.getElementById('flip-image-horizontal').addEventListener('click', () => {
      const target = activeImage();
      if (!target) return;
      target.flipX = !target.flipX;
      drawCanvas();
    });
    document.getElementById('flip-image-vertical').addEventListener('click', () => {
      const target = activeImage();
      if (!target) return;
      target.flipY = !target.flipY;
      drawCanvas();
    });
    document.getElementById('open-size-modal').addEventListener('click', openSizeModal);
    document.getElementById('create-canvas').addEventListener('click', runSizeAction);
    document.getElementById('size-saved-canvases').addEventListener('click', event => {
      const option = event.target.closest('[data-saved-canvas-id]');
      if (!option) return;
      state.selectedSavedId = option.dataset.savedCanvasId;
      const saved = state.savedCanvases.find(item => item.id === state.selectedSavedId);
      if (saved) {
        document.getElementById('canvas-width').value = String(saved.width);
        document.getElementById('canvas-height').value = String(saved.height);
      }
      renderSizeSavedCanvases();
      updateSizeAction();
    });
    ['canvas-width', 'canvas-height'].forEach(id => document.getElementById(id).addEventListener('input', () => {
      if (!state.selectedSavedId) return;
      state.selectedSavedId = null;
      renderSizeSavedCanvases();
      updateSizeAction();
    }));
    document.getElementById('open-save-canvas-modal').addEventListener('click', () => {
      document.getElementById('save-canvas-error').hidden = true;
      document.getElementById('saved-canvas-name').style.borderColor = '';
      openModal(document.getElementById('save-canvas-modal'));
      setTimeout(() => document.getElementById('saved-canvas-name').focus(), 0);
    });
    document.getElementById('save-canvas').addEventListener('click', saveCanvas);
    document.getElementById('saved-canvas-name').addEventListener('keydown', event => { if (event.key === 'Enter') saveCanvas(); });
    document.getElementById('open-load-canvas-modal').addEventListener('click', () => openSavedCanvases().catch(error => { console.error(error); toast('Saved canvases could not be loaded.'); }));
    document.getElementById('saved-canvases-list').addEventListener('click', event => {
      const button = event.target.closest('[data-canvas-id]');
      if (!button) return;
      const saved = state.savedCanvases.find(item => item.id === button.dataset.canvasId);
      if (saved) loadSavedCanvas(saved, button);
    });
    document.getElementById('open-watermark-modal').addEventListener('click', () => openOverlay('watermark'));
    document.getElementById('open-template-modal').addEventListener('click', () => openOverlay('template'));
    document.getElementById('overlay-file').addEventListener('change', event => loadOverlay(event.target.files[0]).catch(() => toast('The PNG could not be loaded.')));
    document.getElementById('overlay-opacity').addEventListener('input', event => {
      const value = Number(event.target.value);
      document.getElementById('overlay-opacity-value').textContent = `${value}%`;
      if (state.draftOverlay) state.draftOverlay.opacity = value / 100;
      drawOverlayPreview();
    });
    document.getElementById('apply-overlay').addEventListener('click', () => {
      if (!state.draftOverlay || !state.modalType) return;
      state.overlays[state.modalType] = { ...state.draftOverlay };
      state.selected = state.modalType;
      closeModal(document.getElementById('overlay-modal'));
      drawCanvas();
      toast(`${state.modalType === 'watermark' ? 'Watermark' : 'Template'} applied to all images.`);
    });

    const color = document.getElementById('background-color');
    const hex = document.getElementById('background-hex');
    color.addEventListener('input', () => { state.background = color.value.toUpperCase(); hex.value = state.background; drawCanvas(); });
    hex.addEventListener('change', () => {
      const value = hex.value.trim();
      if (!/^#[0-9A-F]{6}$/i.test(value)) { hex.value = state.background; return; }
      state.background = value.toUpperCase();
      hex.value = state.background;
      color.value = state.background;
      drawCanvas();
    });

    document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.closest('.editor-modal'))));
    document.querySelectorAll('.editor-modal').forEach(modal => modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal); }));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') document.querySelectorAll('.editor-modal.open').forEach(closeModal); });
    interactionCanvas.addEventListener('pointerdown', onCanvasPointerDown);
    interactionCanvas.addEventListener('pointermove', onCanvasPointerMove);
    interactionCanvas.addEventListener('pointerup', onCanvasPointerUp);
    interactionCanvas.addEventListener('pointercancel', onCanvasPointerUp);
    preview.addEventListener('pointerdown', previewPointerDown);
    preview.addEventListener('pointermove', previewPointerMove);
    preview.addEventListener('pointerup', previewPointerUp);
    preview.addEventListener('pointercancel', previewPointerUp);
    new ResizeObserver(() => applyZoom()).observe(document.getElementById('canvas-stage'));
    window.addEventListener('beforeunload', () => state.urls.forEach(URL.revokeObjectURL));
    openSizeModal();
  }

  document.addEventListener('DOMContentLoaded', () => init().catch(error => console.error(error)));
}());

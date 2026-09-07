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
    selected: null,
    drag: null,
    pan: null,
    urls: [],
    sb: null,
    companyId: null,
    savedCanvases: [],
    selectedSavedId: null,
    currentProjectId: null,
    currentProjectName: '',
    projectDirty: false,
    baseImagePath: null
  };

  const canvas = document.getElementById('editor-canvas');
  const context = canvas.getContext('2d');
  const canvasFrame = document.getElementById('editor-canvas-frame');
  const interactionCanvas = document.getElementById('image-interaction-canvas');
  const interactionContext = interactionCanvas.getContext('2d');
  const HANDLE_SIZE = 20;
  let draggedLayerIndex = null;
  let zoomScrollFrame = 0;
  let projects = null;
  let effects = null;
  let properties = null;
  function canvasCreatedKey() { return `bk-posting-image-editor-canvas:${state.companyId}`; }
  function rememberCanvasCreated() {
    try { localStorage.setItem(canvasCreatedKey(), '1'); }
    catch (error) { console.warn('Canvas creation preference could not be saved.', error); }
  }
  function hasCreatedCanvas() {
    try { return Boolean(localStorage.getItem(canvasCreatedKey())); }
    catch (error) { console.warn('Canvas creation preference could not be read.', error); return false; }
  }
  function solidImageColor(image) {
    const sample = document.createElement('canvas'); sample.width = 8; sample.height = 8; const ctx = sample.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0, 8, 8);
    const pixels = ctx.getImageData(0, 0, 8, 8).data; const [red, green, blue, alpha] = pixels; for (let index = 4; index < pixels.length; index += 4) { if (pixels[index] !== red || pixels[index + 1] !== green || pixels[index + 2] !== blue || pixels[index + 3] !== alpha) return null; }
    return alpha === 255 ? `#${[red, green, blue].map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase()}` : null;
  }
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

  function isHeicFile(file) {
    const type = String(file?.type || '').toLowerCase();
    return ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'].includes(type)
      || /\.(heic|heif)$/i.test(file?.name || '');
  }

  async function prepareImageFile(file) {
    if (!isHeicFile(file)) return file;
    if (typeof window.heic2any !== 'function') {
      throw new Error('HEIC conversion is temporarily unavailable. Please refresh and try again.');
    }
    const result = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    const jpeg = Array.isArray(result) ? result[0] : result;
    if (!(jpeg instanceof Blob)) throw new Error('The HEIC image could not be converted to JPEG.');
    const baseName = String(file.name || 'image').replace(/\.(heic|heif)$/i, '');
    return new File([jpeg], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified || Date.now()
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

  function drawRawImageTransformed(ctx, target) {
    const center = imageCenter(target);
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate((target.rotation || 0) * Math.PI / 180);
    ctx.scale(target.flipX ? -1 : 1, target.flipY ? -1 : 1);
    ctx.globalAlpha = target.opacity ?? 1;
    ctx.drawImage(target.image, -target.width / 2, -target.height / 2, target.width, target.height);
    ctx.restore();
  }

  function drawImageTransformed(ctx, target) {
    effects?.draw(ctx, target);
    drawRawImageTransformed(ctx, target);
  }

  function updateImageProperties() {
    const target = state.selected === 'image' ? activeImage() : null;
    properties?.update(target);
    effects?.update(target);
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
    const duplicateX = local.x;
    const duplicateY = local.y;
    ctx.fillStyle = '#06B6D4';
    ctx.fillRect(duplicateX - handle / 2, duplicateY - handle / 2, handle, handle);
    const boxSize = 7 / scaleFactor;
    const boxOffset = 2.5 / scaleFactor;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5 / scaleFactor;
    ctx.lineJoin = 'round';
    ctx.strokeRect(duplicateX - boxSize / 2 + boxOffset, duplicateY - boxSize / 2 - boxOffset, boxSize, boxSize);
    ctx.strokeRect(duplicateX - boxSize / 2 - boxOffset, duplicateY - boxSize / 2 + boxOffset, boxSize, boxSize);
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
    drawRawImageTransformed(interactionContext, { ...target, opacity: (target.opacity ?? 1) * 0.25 });
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
    document.getElementById('browse-installer-images').disabled = false;
    document.getElementById('upload-label').classList.remove('disabled');
    document.getElementById('upload-label').setAttribute('aria-disabled', 'false');
    document.getElementById('fill-height').disabled = false;
    requestAnimationFrame(fillCanvasHeight);
  }

  function applyZoom() {
    if (!state.canvasReady) return;
    const stage = document.getElementById('canvas-stage');
    const availableHeight = Math.max(100, stage.clientHeight - 64);
    const fitScale = availableHeight / state.height;
    const scale = fitScale * state.zoom / 100;
    state.displayScale = scale;
    const zoomSlider = document.getElementById('zoom-slider');
    zoomSlider.value = String(state.zoom);
    zoomSlider.style.setProperty('--zoom-progress', `${((state.zoom - 25) / 175) * 100}%`);
    document.getElementById('zoom-value').textContent = `${state.zoom}%`;
    drawCanvas();
  }

  function fillCanvasHeight() {
    state.zoom = 100;
    applyZoom();
    requestAnimationFrame(centerCanvasInStage);
  }

  function setZoom(value) {
    const stage = document.getElementById('canvas-stage');
    const oldScale = state.displayScale || 1;
    const viewportCenterX = stage.scrollLeft + stage.clientWidth / 2;
    const viewportCenterY = stage.scrollTop + stage.clientHeight / 2;
    state.zoom = Math.min(200, Math.max(25, Number(value) || 100));
    applyZoom();
    const ratio = state.displayScale / oldScale;
    const targetLeft = viewportCenterX * ratio - stage.clientWidth / 2;
    const targetTop = viewportCenterY * ratio - stage.clientHeight / 2;
    const restoreScroll = () => stage.scrollTo({ left: targetLeft, top: targetTop });
    restoreScroll();
    cancelAnimationFrame(zoomScrollFrame);
    zoomScrollFrame = requestAnimationFrame(() => {
      restoreScroll();
      zoomScrollFrame = requestAnimationFrame(() => {
        restoreScroll();
        zoomScrollFrame = 0;
      });
    });
  }

  function centerCanvasInStage() {
    const stage = document.getElementById('canvas-stage');
    const stageRect = stage.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    stage.scrollBy({
      left: canvasRect.left + canvasRect.width / 2 - stageRect.left - stage.clientLeft - stage.clientWidth / 2,
      top: canvasRect.top + canvasRect.height / 2 - stageRect.top - stage.clientTop - stage.clientHeight / 2
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
    projects.markDirty();
    renderStrip();
    drawCanvas();
  }

  async function uploadSources(files) {
    if (!state.canvasReady) return;
    const valid = [...files].filter(file => ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || isHeicFile(file));
    if (!valid.length) return;
    const prepared = await Promise.all(valid.map(prepareImageFile));
    const loaded = await Promise.all(prepared.map(async file => ({ ...await loadFile(file), name: file.name, file })));
    loaded.forEach(({ image, url, name, file }) => {
      const transform = fitTransform(image, 'contain');
      state.images.push({ image, url, name, file, ...transform, originalWidth: transform.width, originalHeight: transform.height, rotation: 0, opacity: 1, flipX: false, flipY: false, effects: effects.defaults() });
    });
    if (state.activeIndex < 0) state.activeIndex = 0;
    state.selected = 'image';
    projects.markDirty();
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

  async function downloadCanvas() {
    if (!state.canvasReady) return;
    const button = document.getElementById('header-download-canvas');
    button.disabled = true;
    button.textContent = 'Downloading...';
    try {
      const blob = await canvasBlob();
      const url = URL.createObjectURL(blob);
      const baseName = (state.currentProjectName || `image-editor-${state.width}x${state.height}`)
        .trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'image-editor';
      const link = document.createElement('a');
      link.href = url;
      link.download = `${baseName}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast(`Downloaded ${state.width} × ${state.height} PNG.`);
    } catch (error) {
      console.error(error);
      toast('The canvas could not be downloaded. Please try again.');
    } finally {
      button.disabled = false;
      button.textContent = 'Download';
    }
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

  async function openSizeModal() {
    const list = document.getElementById('size-saved-canvases');
    state.selectedSavedId = null;
    updateSizeAction();
    list.innerHTML = '<div class="size-saved-state"><span class="spinner-cyan"></span><span>Loading saved canvases...</span></div>';
    openModal(document.getElementById('size-modal'));
    try {
      await projects.fetchCanvasPresets();
      renderSizeSavedCanvases();
    } catch (error) {
      console.error(error);
      list.innerHTML = '<div class="size-saved-state">Saved canvases could not be loaded.</div>';
    }
  }

  function openSaveDimensions() {
    const width = Number(document.getElementById('canvas-width').value);
    const height = Number(document.getElementById('canvas-height').value);
    const valid = Number.isInteger(width) && Number.isInteger(height) && width >= 100 && width <= 8000 && height >= 100 && height <= 8000;
    document.getElementById('size-error').hidden = valid;
    if (!valid) return;
    const input = document.getElementById('saved-dimensions-name');
    document.getElementById('save-dimensions-error').hidden = true;
    input.style.borderColor = '';
    input.value = '';
    openModal(document.getElementById('save-dimensions-modal'));
    setTimeout(() => input.focus(), 0);
  }

  async function saveDimensions() {
    const input = document.getElementById('saved-dimensions-name');
    const errorNode = document.getElementById('save-dimensions-error');
    const button = document.getElementById('confirm-save-dimensions');
    const name = input.value.trim();
    const width = Number(document.getElementById('canvas-width').value);
    const height = Number(document.getElementById('canvas-height').value);
    errorNode.hidden = Boolean(name);
    input.style.borderColor = name ? '' : 'var(--danger)';
    if (!name || !state.companyId) { if (!name) input.focus(); return; }
    button.disabled = true;
    button.textContent = 'Saving...';
    try {
      const { error } = await state.sb.from('posting_image_canvases').insert({
        company_id: state.companyId,
        name,
        width,
        height,
        image_path: '',
        project_data: null
      });
      if (error) throw error;
      closeModal(document.getElementById('save-dimensions-modal'));
      toast('Canvas dimensions saved.');
    } catch (error) {
      console.error(error);
      toast('Canvas dimensions could not be saved. Please try again.');
    } finally {
      button.disabled = false;
      button.textContent = 'Save Canvas';
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

  function isDuplicateHandle(target, point, handleSize) {
    if (!target) return false;
    const half = handleSize / 2;
    return point.x >= target.x - half && point.x <= target.x + half
      && point.y >= target.y - half && point.y <= target.y + half;
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
    const active = activeImage();
    if (active) {
      const localPoint = imageLocalPoint(active, point);
      const action = isDuplicateHandle(active, localPoint, handle) ? 'duplicate'
        : isRotateHandle(active, localPoint, handle) ? 'rotate'
        : isResizeHandle(active, localPoint, handle) ? 'resize' : null;
      if (action) return { type: 'image', target: active, action, localPoint, index: state.activeIndex };
    }
    for (let index = state.images.length - 1; index >= 0; index -= 1) {
      const image = state.images[index];
      const localPoint = imageLocalPoint(image, point);
      if (contains(image, localPoint)) return { type: 'image', target: image, action: 'move', localPoint, index };
    }
    return { type: null, target: null, action: null, localPoint: point, index: -1 };
  }

  function updateCanvasCursor(point) {
    const { action } = canvasTargetAt(point);
    interactionCanvas.style.cursor = action === 'duplicate' ? 'copy' : action === 'rotate' ? 'grab' : action === 'resize' ? 'nwse-resize' : action === 'move' ? 'move' : 'grab';
  }

  function duplicateImage(target) {
    const duplicate = { ...target, x: target.x + 10, y: target.y + 10, name: `${target.name || 'Image'} copy`, effects: effects.clone(target.effects) };
    const originalIndex = state.images.indexOf(target);
    const duplicateIndex = originalIndex >= 0 ? originalIndex + 1 : state.images.length;
    state.images.splice(duplicateIndex, 0, duplicate);
    state.activeIndex = duplicateIndex;
    state.selected = 'image';
    projects.markDirty();
    renderStrip();
    drawCanvas();
  }

  function onCanvasPointerDown(event) {
    const point = canvasPoint(event, interactionCanvas);
    const { type, target, action, localPoint, index } = canvasTargetAt(point);
    if (!type) {
      const stage = document.getElementById('canvas-stage');
      state.selected = null;
      state.pan = {
        pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY,
        startScrollLeft: stage.scrollLeft, startScrollTop: stage.scrollTop
      };
      interactionCanvas.style.cursor = 'grabbing';
      interactionCanvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      drawCanvas();
      return;
    }
    if (action === 'duplicate') {
      duplicateImage(target);
      updateCanvasCursor(point);
      return;
    }
    state.activeIndex = index;
    state.selected = type;
    renderStrip();
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
    if (state.pan) {
      const stage = document.getElementById('canvas-stage');
      stage.scrollLeft = state.pan.startScrollLeft - (event.clientX - state.pan.startClientX);
      stage.scrollTop = state.pan.startScrollTop - (event.clientY - state.pan.startClientY);
      return;
    }
    if (!state.drag) { updateCanvasCursor(point); return; }
    const target = activeImage();
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
    projects.markDirty();
    drawCanvas();
  }

  function onCanvasPointerUp(event) {
    if (state.drag || state.pan) interactionCanvas.releasePointerCapture(event.pointerId);
    state.drag = null;
    state.pan = null;
    updateCanvasCursor(canvasPoint(event, interactionCanvas));
  }

  function deleteSelectedImage(event) {
    if (!['Delete', 'Backspace'].includes(event.key) || state.selected !== 'image' || state.activeIndex < 0) return;
    if (document.querySelector('.editor-modal.open')) return;
    const target = event.target;
    if (target instanceof Element && (target.matches('input, textarea, select') || target.isContentEditable)) return;
    event.preventDefault();
    const [removed] = state.images.splice(state.activeIndex, 1);
    if (removed?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(removed.url);
      state.urls = state.urls.filter(url => url !== removed.url);
    }
    state.activeIndex = -1;
    state.selected = null;
    state.drag = null;
    state.pan = null;
    projects.markDirty();
    renderStrip();
    drawCanvas();
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
    state.selected = null;
    state.drag = null;
    state.currentProjectId = null;
    state.currentProjectName = '';
    state.baseImagePath = null;
    rememberCanvasCreated();
    projects.markDirty();
    interactionCanvas.style.cursor = 'grab';
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
    if (saved) {
      const name = saved.name;
      resizeCanvas();
      toast(`Loaded ${name} dimensions.`);
    }
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
    const projectApp = { state, canvasBlob, closeModal, openModal, renderStrip, rememberCanvasCreated, showCanvas, solidImageColor, toast, guard: null };
    projects = window.BKImageEditorProjects.create(projectApp);
    effects = window.BKImageEditorEffects.create({ state, activeImage, drawCanvas, drawRawImageTransformed, markDirty: projects.markDirty }); effects.bind();
    properties = window.BKImageEditorProperties.create({ activeImage, drawCanvas, markDirty: projects.markDirty }); properties.bind();
    window.BKImageEditorMediaBrowser.create({ state, addFiles: uploadSources, closeModal, openModal, toast }).bind();
    projectApp.guard = window.BKImageEditorUnsavedGuard.create({ closeModal, isDirty: () => state.projectDirty, markDirty: projects.markDirty, openModal, saveBeforeLeave: projects.saveBeforeLeave });
    projectApp.guard.bind();
    projects.updateSaveButton();
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
      projects.markDirty();
      drawCanvas();
    });
    document.getElementById('reset-image-rotation').addEventListener('click', () => {
      const target = activeImage();
      if (!target) return;
      target.rotation = 0;
      projects.markDirty();
      drawCanvas();
    });
    document.getElementById('reset-image-opacity').addEventListener('click', () => {
      const target = activeImage();
      if (!target) return;
      target.opacity = 1;
      projects.markDirty();
      drawCanvas();
    });
    document.getElementById('image-opacity').addEventListener('input', event => {
      const target = activeImage();
      if (!target) return;
      target.opacity = Number(event.target.value) / 100;
      projects.markDirty();
      drawCanvas();
    });
    document.getElementById('flip-image-horizontal').addEventListener('click', () => {
      const target = activeImage();
      if (!target) return;
      target.flipX = !target.flipX;
      projects.markDirty();
      drawCanvas();
    });
    document.getElementById('flip-image-vertical').addEventListener('click', () => {
      const target = activeImage();
      if (!target) return;
      target.flipY = !target.flipY;
      projects.markDirty();
      drawCanvas();
    });
    document.getElementById('open-size-modal').addEventListener('click', openSizeModal);
    document.getElementById('save-canvas-dimensions').addEventListener('click', openSaveDimensions);
    document.getElementById('confirm-save-dimensions').addEventListener('click', saveDimensions);
    document.getElementById('saved-dimensions-name').addEventListener('keydown', event => { if (event.key === 'Enter') saveDimensions(); });
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
    document.getElementById('header-save-canvas').addEventListener('click', projects.openSave);
    document.getElementById('header-download-canvas').addEventListener('click', downloadCanvas);
    document.getElementById('save-canvas').addEventListener('click', () => projects.save());
    document.getElementById('confirm-overwrite-document').addEventListener('click', event => projects.confirmOverwrite(event.currentTarget));
    document.querySelectorAll('[data-cancel-overwrite]').forEach(button => button.addEventListener('click', projects.cancelOverwrite));
    document.getElementById('overwrite-document-modal').addEventListener('click', event => { if (event.target === event.currentTarget) projects.cancelOverwrite(); });
    document.getElementById('saved-canvas-name').addEventListener('keydown', event => { if (event.key === 'Enter') projects.save(); });
    document.getElementById('header-load-canvas').addEventListener('click', projects.openLoad);
    document.getElementById('saved-canvases-list').addEventListener('change', event => {
      const checkbox = event.target.closest('[data-select-canvas-id]');
      if (checkbox) projects.toggleSelection(checkbox.dataset.selectCanvasId, checkbox.checked);
    });
    document.getElementById('saved-canvases-list').addEventListener('click', event => {
      if (event.target.closest('[data-select-canvas-id]')) return;
      const editButton = event.target.closest('[data-edit-canvas-id]');
      if (editButton) { projects.startRename(editButton.dataset.editCanvasId); return; }
      const cancelRename = event.target.closest('[data-cancel-rename-id]');
      if (cancelRename) { projects.cancelRename(); return; }
      const applyRename = event.target.closest('[data-apply-rename-id]');
      if (applyRename) {
        const input = applyRename.closest('.saved-canvas-card')?.querySelector('[data-rename-canvas-input]');
        projects.applyRename(applyRename.dataset.applyRenameId, input?.value, applyRename);
        return;
      }
      if (event.target.closest('[data-rename-canvas-input]')) return;
      const loadButton = event.target.closest('[data-canvas-id]');
      if (loadButton) {
        const saved = state.savedCanvases.find(item => item.id === loadButton.dataset.canvasId);
        if (saved) projects.requestLoad(saved, loadButton);
        return;
      }
      const row = event.target.closest('.saved-canvas-card');
      const checkbox = row?.querySelector('[data-select-canvas-id]');
      if (checkbox) projects.toggleSelection(checkbox.dataset.selectCanvasId, !checkbox.checked);
    });
    document.getElementById('saved-canvases-list').addEventListener('keydown', event => {
      const input = event.target.closest('[data-rename-canvas-input]');
      if (!input) return;
      if (event.key === 'Escape') { event.preventDefault(); projects.cancelRename(); }
      if (event.key === 'Enter') {
        event.preventDefault();
        const applyButton = input.closest('.saved-canvas-card')?.querySelector('[data-apply-rename-id]');
        if (applyButton) projects.applyRename(applyButton.dataset.applyRenameId, input.value, applyButton);
      }
    });
    document.getElementById('saved-files-search').addEventListener('input', event => projects.setSearchQuery(event.target.value));
    document.getElementById('select-all-saved-files').addEventListener('click', projects.selectAllVisible);
    document.getElementById('deselect-all-saved-files').addEventListener('click', projects.deselectAll);
    document.getElementById('duplicate-selected-documents').addEventListener('click', event => projects.duplicateSelected(event.currentTarget));
    document.getElementById('delete-selected-documents').addEventListener('click', () => projects.openDelete());
    document.getElementById('discard-current-document-changes').addEventListener('click', projects.discardChangesAndLoad);
    document.getElementById('save-current-document-changes').addEventListener('click', event => projects.saveChangesAndLoad(event.currentTarget));
    document.getElementById('confirm-delete-document').addEventListener('click', projects.remove);
    const color = document.getElementById('background-color');
    const hex = document.getElementById('background-hex');
    color.addEventListener('input', () => { state.background = color.value.toUpperCase(); hex.value = state.background; projects.markDirty(); drawCanvas(); });
    hex.addEventListener('change', () => {
      const value = hex.value.trim();
      if (!/^#[0-9A-F]{6}$/i.test(value)) { hex.value = state.background; return; }
      state.background = value.toUpperCase();
      hex.value = state.background;
      color.value = state.background;
      projects.markDirty();
      drawCanvas();
    });

    document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.closest('.editor-modal'))));
    document.querySelectorAll('.editor-modal').forEach(modal => modal.addEventListener('click', event => { if (event.target === modal && !modal.hasAttribute('data-static-modal')) closeModal(modal); }));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') { projects.cancelOverwrite(); document.querySelectorAll('.editor-modal.open:not([data-static-modal])').forEach(closeModal); }
      deleteSelectedImage(event);
    });
    interactionCanvas.addEventListener('pointerdown', onCanvasPointerDown);
    interactionCanvas.addEventListener('pointermove', onCanvasPointerMove);
    interactionCanvas.addEventListener('pointerup', onCanvasPointerUp);
    interactionCanvas.addEventListener('pointercancel', onCanvasPointerUp);
    new ResizeObserver(() => applyZoom()).observe(document.getElementById('canvas-stage'));
    window.addEventListener('beforeunload', () => state.urls.forEach(URL.revokeObjectURL));
    if (!hasCreatedCanvas()) openSizeModal();
  }

  document.addEventListener('DOMContentLoaded', () => init().catch(error => console.error(error)));
}());

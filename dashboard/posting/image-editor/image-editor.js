(function () {
  'use strict';

  const state = {
    width: 1080,
    height: 1080,
    canvasReady: false,
    zoom: 100,
    background: '#FFFFFF',
    images: [],
    activeIndex: -1,
    overlays: { watermark: null, template: null },
    selected: null,
    drag: null,
    modalType: null,
    draftOverlay: null,
    urls: []
  };

  const canvas = document.getElementById('editor-canvas');
  const context = canvas.getContext('2d');
  const preview = document.getElementById('overlay-preview-canvas');
  const previewContext = preview.getContext('2d');
  const HANDLE_SIZE = 24;

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

  function drawSelection(target, ctx, scaleFactor) {
    if (!target) return;
    ctx.save();
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = Math.max(2, 2 / scaleFactor);
    ctx.setLineDash([8 / scaleFactor, 5 / scaleFactor]);
    ctx.strokeRect(target.x, target.y, target.width, target.height);
    ctx.setLineDash([]);
    const handle = HANDLE_SIZE / scaleFactor;
    ctx.fillStyle = '#06B6D4';
    ctx.fillRect(target.x + target.width - handle / 2, target.y + target.height - handle / 2, handle, handle);
    ctx.restore();
  }

  function drawCanvas() {
    context.clearRect(0, 0, state.width, state.height);
    context.fillStyle = state.background;
    context.fillRect(0, 0, state.width, state.height);
    const current = activeImage();
    if (current) context.drawImage(current.image, current.x, current.y, current.width, current.height);
    ['watermark', 'template'].forEach(type => {
      const overlay = state.overlays[type];
      if (!overlay) return;
      context.save();
      context.globalAlpha = overlay.opacity;
      context.drawImage(overlay.image, overlay.x, overlay.y, overlay.width, overlay.height);
      context.restore();
    });
    const selected = state.selected === 'image' ? current : state.overlays[state.selected];
    if (selected) drawSelection(selected, context, canvas.clientWidth / state.width || 1);
  }

  function syncCanvasSize() {
    canvas.width = state.width;
    canvas.height = state.height;
    document.getElementById('canvas-size-label').textContent = `${state.width} × ${state.height}`;
    drawCanvas();
  }

  function applyZoom() {
    if (!state.canvasReady) return;
    const stage = document.getElementById('canvas-stage');
    const availableHeight = Math.max(100, stage.clientHeight - 64);
    const fitScale = availableHeight / state.height;
    const scale = fitScale * state.zoom / 100;
    canvas.style.width = `${Math.round(state.width * scale)}px`;
    canvas.style.height = `${Math.round(state.height * scale)}px`;
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

  function renderStrip() {
    const strip = document.getElementById('image-strip');
    strip.replaceChildren();
    state.images.forEach((entry, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `image-thumb${index === state.activeIndex ? ' active' : ''}`;
      button.setAttribute('aria-label', `Edit uploaded image ${index + 1}`);
      const image = document.createElement('img');
      image.src = entry.url;
      image.alt = '';
      button.appendChild(image);
      button.addEventListener('click', () => {
        state.activeIndex = index;
        state.selected = 'image';
        renderStrip();
        drawCanvas();
      });
      strip.appendChild(button);
    });
    strip.style.display = state.images.length ? 'flex' : 'none';
  }

  async function uploadSources(files) {
    if (!state.canvasReady) return;
    const valid = [...files].filter(file => ['image/png', 'image/jpeg', 'image/webp'].includes(file.type));
    if (!valid.length) return;
    const loaded = await Promise.all(valid.map(loadFile));
    loaded.forEach(({ image, url }) => state.images.push({ image, url, ...fitTransform(image, 'contain') }));
    if (state.activeIndex < 0) state.activeIndex = 0;
    state.selected = 'image';
    renderStrip();
    requestAnimationFrame(applyZoom);
    drawCanvas();
  }

  function canvasPoint(event, targetCanvas) {
    const rect = targetCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (targetCanvas.width / rect.width),
      y: (event.clientY - rect.top) * (targetCanvas.height / rect.height)
    };
  }

  function contains(target, point) {
    return target && point.x >= target.x && point.x <= target.x + target.width && point.y >= target.y && point.y <= target.y + target.height;
  }

  function onCanvasPointerDown(event) {
    const point = canvasPoint(event, canvas);
    const candidates = ['template', 'watermark'].filter(type => contains(state.overlays[type], point));
    const type = candidates[0] || (contains(activeImage(), point) ? 'image' : null);
    if (!type) { state.selected = null; drawCanvas(); return; }
    state.selected = type;
    const target = type === 'image' ? activeImage() : state.overlays[type];
    const handle = HANDLE_SIZE * state.width / Math.max(canvas.clientWidth, 1);
    const resizing = point.x >= target.x + target.width - handle && point.y >= target.y + target.height - handle;
    state.drag = { type, resizing, startX: point.x, startY: point.y, original: { x: target.x, y: target.y, width: target.width, height: target.height } };
    canvas.setPointerCapture(event.pointerId);
    drawCanvas();
  }

  function onCanvasPointerMove(event) {
    if (!state.drag) return;
    const point = canvasPoint(event, canvas);
    const target = state.drag.type === 'image' ? activeImage() : state.overlays[state.drag.type];
    const dx = point.x - state.drag.startX;
    const dy = point.y - state.drag.startY;
    if (state.drag.resizing) {
      const ratio = state.drag.original.width / state.drag.original.height;
      const width = Math.max(40, state.drag.original.width + dx);
      target.width = width;
      target.height = width / ratio;
    } else {
      target.x = state.drag.original.x + dx;
      target.y = state.drag.original.y + dy;
    }
    drawCanvas();
  }

  function onCanvasPointerUp(event) {
    if (state.drag) canvas.releasePointerCapture(event.pointerId);
    state.drag = null;
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
    if (current) previewContext.drawImage(current.image, current.x, current.y, current.width, current.height);
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
    if (!contains(state.draftOverlay, canvasPosition)) return;
    const handle = HANDLE_SIZE / scale;
    const resizing = canvasPosition.x >= state.draftOverlay.x + state.draftOverlay.width - handle && canvasPosition.y >= state.draftOverlay.y + state.draftOverlay.height - handle;
    state.drag = { type: 'draft', resizing, startX: canvasPosition.x, startY: canvasPosition.y, original: { x: state.draftOverlay.x, y: state.draftOverlay.y, width: state.draftOverlay.width, height: state.draftOverlay.height }, previewScale: scale, offsetX, offsetY };
    preview.setPointerCapture(event.pointerId);
  }

  function previewPointerMove(event) {
    if (state.drag?.type !== 'draft') return;
    const point = canvasPoint(event, preview);
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
  }

  function resizeCanvas() {
    const width = Number(document.getElementById('canvas-width').value);
    const height = Number(document.getElementById('canvas-height').value);
    const valid = Number.isInteger(width) && Number.isInteger(height) && width >= 100 && width <= 8000 && height >= 100 && height <= 8000;
    document.getElementById('size-error').hidden = valid;
    if (!valid) return;
    const scaleX = width / state.width;
    const scaleY = height / state.height;
    Object.values(state.overlays).filter(Boolean).forEach(overlay => {
      overlay.x *= scaleX;
      overlay.y *= scaleY;
      const scale = Math.min(scaleX, scaleY);
      overlay.width *= scale;
      overlay.height *= scale;
    });
    state.width = width;
    state.height = height;
    state.canvasReady = true;
    state.zoom = 100;
    state.images.forEach(entry => Object.assign(entry, fitTransform(entry.image, 'contain')));
    syncCanvasSize();
    document.getElementById('canvas-empty').hidden = true;
    canvas.style.display = 'block';
    document.getElementById('canvas-zoom').hidden = false;
    document.getElementById('source-images').disabled = false;
    document.getElementById('upload-label').classList.remove('disabled');
    document.getElementById('upload-label').setAttribute('aria-disabled', 'false');
    document.getElementById('fill-height').disabled = false;
    closeModal(document.getElementById('size-modal'));
    requestAnimationFrame(fillCanvasHeight);
  }

  async function init() {
    const authInfo = await window.BKAuth.checkRoleGate(['Marketing', 'owner', 'admin'], '/admin.html');
    if (!authInfo) return;
    if (typeof initNav === 'function') initNav();
    document.getElementById('source-images').addEventListener('change', event => uploadSources(event.target.files).catch(() => toast('One or more images could not be loaded.')));
    document.getElementById('fill-height').addEventListener('click', fillCanvasHeight);
    document.getElementById('zoom-slider').addEventListener('input', event => setZoom(event.target.value));
    document.getElementById('zoom-in').addEventListener('click', () => setZoom(state.zoom + 5));
    document.getElementById('zoom-out').addEventListener('click', () => setZoom(state.zoom - 5));
    document.getElementById('open-size-modal').addEventListener('click', () => openModal(document.getElementById('size-modal')));
    document.getElementById('create-canvas').addEventListener('click', resizeCanvas);
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
    canvas.addEventListener('pointerdown', onCanvasPointerDown);
    canvas.addEventListener('pointermove', onCanvasPointerMove);
    canvas.addEventListener('pointerup', onCanvasPointerUp);
    canvas.addEventListener('pointercancel', onCanvasPointerUp);
    preview.addEventListener('pointerdown', previewPointerDown);
    preview.addEventListener('pointermove', previewPointerMove);
    preview.addEventListener('pointerup', previewPointerUp);
    preview.addEventListener('pointercancel', previewPointerUp);
    new ResizeObserver(() => applyZoom()).observe(document.getElementById('canvas-stage'));
    window.addEventListener('beforeunload', () => state.urls.forEach(URL.revokeObjectURL));
    openModal(document.getElementById('size-modal'));
  }

  document.addEventListener('DOMContentLoaded', () => init().catch(error => console.error(error)));
}());

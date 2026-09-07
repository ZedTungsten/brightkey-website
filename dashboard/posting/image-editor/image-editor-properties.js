(function () {
  'use strict';

  function create(app) {
    function update(target) {
      const disabled = !target;
      const section = document.getElementById('image-properties');
      section.hidden = disabled;
      section.setAttribute('aria-disabled', String(disabled));
      ['reset-image-dimensions', 'reset-image-rotation', 'reset-image-opacity', 'image-opacity', 'flip-image-horizontal', 'flip-image-vertical']
        .forEach(id => { document.getElementById(id).disabled = disabled; });
      document.getElementById('image-width-value').value = target ? String(Math.round(target.width)) : '';
      document.getElementById('image-height-value').value = target ? String(Math.round(target.height)) : '';
      document.getElementById('image-rotation-value').value = String(Math.round(target?.rotation || 0));
      const opacity = Math.round((target?.opacity ?? 1) * 100);
      document.getElementById('image-opacity-value').value = String(opacity);
      document.getElementById('image-opacity').value = String(opacity);
      document.getElementById('image-opacity').style.setProperty('--image-opacity-progress', `${opacity}%`);
    }
    function commitDimensions() {
      const target = app.activeImage();
      if (!target) return;
      const width = Number(document.getElementById('image-width-value').value);
      const height = Number(document.getElementById('image-height-value').value);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 16000 || height > 16000) { update(target); return; }
      target.width = width; target.height = height; app.markDirty(); app.drawCanvas();
    }
    function commitValue(id, apply) {
      const input = document.getElementById(id);
      input.addEventListener('change', () => {
        const target = app.activeImage();
        if (!target) return;
        const min = Number(input.min); const max = Number(input.max);
        const value = Number(input.value);
        if (input.value === '' || !Number.isFinite(value)) { update(target); return; }
        const clampedValue = Math.min(max, Math.max(min, value));
        apply(target, clampedValue); app.markDirty(); app.drawCanvas();
      });
      input.addEventListener('keydown', event => { if (event.key === 'Enter') input.blur(); });
    }
    function bind() {
      ['image-width-value', 'image-height-value'].forEach(id => {
        const input = document.getElementById(id);
        input.addEventListener('change', commitDimensions);
        input.addEventListener('keydown', event => { if (event.key === 'Enter') input.blur(); });
      });
      commitValue('image-rotation-value', (target, value) => { target.rotation = value; });
      commitValue('image-opacity-value', (target, value) => { target.opacity = value / 100; });
    }
    return { bind, update };
  }

  window.BKImageEditorProperties = { create };
}());

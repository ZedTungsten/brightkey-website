(function () {
  'use strict';

  const EFFECTS = ['dropShadow', 'glow'];
  const DEFAULTS = {
    dropShadow: { enabled: false, color: '#000000', opacity: 60, distance: 20, blur: 20 },
    glow: { enabled: false, color: '#FFFFFF', opacity: 70, distance: 0, blur: 30 }
  };

  function create(app) {
    const surface = document.createElement('canvas');
    const surfaceContext = surface.getContext('2d');
    let selectedEffect = 'dropShadow';

    const defaults = () => structuredClone(DEFAULTS);
    const clone = value => structuredClone(value || DEFAULTS);
    function ensure(target) {
      if (!target.effects) target.effects = defaults();
      EFFECTS.forEach(type => { target.effects[type] = { ...DEFAULTS[type], ...(target.effects[type] || {}) }; });
      return target.effects;
    }
    function rgba(hex, opacity) {
      const value = /^#[0-9A-F]{6}$/i.test(hex) ? hex.slice(1) : '000000';
      return `rgba(${parseInt(value.slice(0, 2), 16)},${parseInt(value.slice(2, 4), 16)},${parseInt(value.slice(4, 6), 16)},${opacity})`;
    }
    function drawEffect(output, target, config) {
      if (!config?.enabled || Number(config.opacity) <= 0) return;
      if (surface.width !== app.state.width || surface.height !== app.state.height) {
        surface.width = app.state.width;
        surface.height = app.state.height;
      }
      surfaceContext.clearRect(0, 0, surface.width, surface.height);
      const offset = Number(config.distance || 0) / Math.sqrt(2);
      surfaceContext.save();
      surfaceContext.shadowColor = rgba(config.color, Number(config.opacity) / 100);
      surfaceContext.shadowBlur = Number(config.blur || 0);
      surfaceContext.shadowOffsetX = offset;
      surfaceContext.shadowOffsetY = offset;
      app.drawRawImageTransformed(surfaceContext, target);
      surfaceContext.restore();
      surfaceContext.save();
      surfaceContext.globalCompositeOperation = 'destination-out';
      app.drawRawImageTransformed(surfaceContext, { ...target, opacity: 1 });
      surfaceContext.restore();
      output.drawImage(surface, 0, 0);
    }
    function draw(output, target) {
      const effects = ensure(target);
      drawEffect(output, target, effects.glow);
      drawEffect(output, target, effects.dropShadow);
    }
    function update(target) {
      const section = document.getElementById('image-effects');
      section.hidden = !target;
      if (!target) return;
      section.querySelectorAll('[data-effect]').forEach(group => { group.hidden = group.dataset.effect !== selectedEffect; });
      const effects = ensure(target);
      document.getElementById('image-effect-label').textContent = selectedEffect === 'dropShadow' ? 'Drop Shadow' : 'Glow';
      document.getElementById('drop-shadow-enabled').checked = Boolean(effects.dropShadow.enabled);
      document.getElementById('glow-enabled').checked = Boolean(effects.glow.enabled);
      EFFECTS.forEach(type => {
        const prefix = type === 'dropShadow' ? 'shadow' : 'glow';
        const config = effects[type];
        document.getElementById(`${prefix}-color`).value = config.color;
        document.getElementById(`${prefix}-hex`).value = config.color;
        (type === 'glow' ? ['opacity', 'blur'] : ['opacity', 'distance', 'blur']).forEach(key => {
          const input = document.getElementById(`${prefix}-${key}`);
          input.value = String(config[key]);
          input.style.setProperty('--effect-progress', `${Number(config[key]) / Number(input.max) * 100}%`);
          document.getElementById(`${prefix}-${key}-value`).value = String(config[key]);
        });
      });
    }
    function change(type, key, value) {
      const target = app.activeImage();
      if (!target) return;
      ensure(target)[type][key] = value;
      app.markDirty();
      app.drawCanvas();
    }
    function bindColor(type, prefix) {
      const picker = document.getElementById(`${prefix}-color`);
      const hex = document.getElementById(`${prefix}-hex`);
      picker.addEventListener('input', () => change(type, 'color', picker.value.toUpperCase()));
      hex.addEventListener('change', () => {
        const value = hex.value.trim().toUpperCase();
        if (!/^#[0-9A-F]{6}$/.test(value)) { update(app.activeImage()); return; }
        change(type, 'color', value);
      });
    }
    function bind() {
      const picker = document.getElementById('image-effect-picker');
      const trigger = document.getElementById('image-effect-trigger');
      const menu = document.getElementById('image-effect-menu');
      const closeMenu = () => { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
      trigger.addEventListener('click', () => {
        menu.hidden = !menu.hidden;
        trigger.setAttribute('aria-expanded', String(!menu.hidden));
      });
      document.getElementById('drop-shadow-enabled').addEventListener('change', event => change('dropShadow', 'enabled', event.target.checked));
      document.getElementById('glow-enabled').addEventListener('change', event => change('glow', 'enabled', event.target.checked));
      menu.querySelectorAll('[data-effect-view]').forEach(button => button.addEventListener('click', () => {
        selectedEffect = button.dataset.effectView;
        closeMenu();
        update(app.activeImage());
      }));
      document.addEventListener('pointerdown', event => { if (!picker.contains(event.target)) closeMenu(); });
      document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeMenu(); trigger.focus(); } });
      EFFECTS.forEach(type => {
        const prefix = type === 'dropShadow' ? 'shadow' : 'glow';
        bindColor(type, prefix);
        (type === 'glow' ? ['opacity', 'blur'] : ['opacity', 'distance', 'blur']).forEach(key => {
          const slider = document.getElementById(`${prefix}-${key}`);
          const valueInput = document.getElementById(`${prefix}-${key}-value`);
          slider.addEventListener('input', event => change(type, key, Number(event.target.value)));
          valueInput.addEventListener('change', () => {
            const value = Number(valueInput.value);
            if (valueInput.value === '' || !Number.isFinite(value)) { update(app.activeImage()); return; }
            change(type, key, Math.min(Number(slider.max), Math.max(Number(slider.min), value)));
          });
          valueInput.addEventListener('keydown', event => { if (event.key === 'Enter') valueInput.blur(); });
        });
      });
    }
    return { bind, clone, defaults, draw, update };
  }

  window.BKImageEditorEffects = { create };
}());

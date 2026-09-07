(function () {
  'use strict';

  function bind() {
    const stage = document.getElementById('canvas-stage');
    let pan = null;
    stage.addEventListener('pointerdown', event => {
      if (event.target !== stage || event.button !== 0) return;
      pan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop };
      stage.classList.add('is-panning');
      stage.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    stage.addEventListener('pointermove', event => {
      if (!pan || pan.pointerId !== event.pointerId) return;
      stage.scrollLeft = pan.left - (event.clientX - pan.x);
      stage.scrollTop = pan.top - (event.clientY - pan.y);
    });
    const stop = event => {
      if (!pan || pan.pointerId !== event.pointerId) return;
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
      pan = null;
      stage.classList.remove('is-panning');
    };
    stage.addEventListener('pointerup', stop);
    stage.addEventListener('pointercancel', stop);
  }

  document.addEventListener('DOMContentLoaded', bind);
}());

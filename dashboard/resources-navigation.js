'use strict';

(function createResourcesNavigation() {
  const STATE_MARKER = 'bkResourcesNavigation';
  let navigationDepth = 0;

  function updateBackButton() {
    const button = document.getElementById('folder-back-button');
    if (!button) return;
    button.hidden = navigationDepth < 1;
  }

  function normalizeState(state) {
    if (state?.[STATE_MARKER] === true && Number.isInteger(state.depth) && state.depth >= 0) {
      navigationDepth = state.depth;
      return;
    }

    navigationDepth = 0;
    window.history.replaceState({ ...(state || {}), [STATE_MARKER]: true, depth: 0 }, '', window.location.href);
  }

  window.BKResourcesNavigation = {
    push(path) {
      navigationDepth += 1;
      window.history.pushState({ [STATE_MARKER]: true, depth: navigationDepth }, '', path);
      updateBackButton();
    },
    back() {
      if (navigationDepth > 0) window.history.back();
    },
    sync(state) {
      normalizeState(state);
      updateBackButton();
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    normalizeState(window.history.state);
    updateBackButton();
  });
})();

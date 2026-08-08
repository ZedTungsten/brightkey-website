(function () {
  'use strict';

  const drawer = document.getElementById('product-drawer');
  const drawerTitle = document.getElementById('drawer-title');
  const modal = document.getElementById('unsaved-product-modal');
  const cancelButton = document.getElementById('unsaved-product-cancel');
  const discardButton = document.getElementById('unsaved-product-discard');

  if (!drawer || !drawerTitle || !modal || !cancelButton || !discardButton) return;

  let dirty = false;
  let pendingAction = null;
  let bypassGuard = false;

  function isUnsavedProductOpen() {
    const title = drawerTitle.textContent.trim();
    return drawer.classList.contains('open') && (title === 'Add Product' || title === 'Duplicate Product');
  }

  function shouldGuard() {
    return dirty && isUnsavedProductOpen() && !bypassGuard;
  }

  function openModal(action) {
    pendingAction = action;
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('open');
    cancelButton.focus();
  }

  function closeModal() {
    modal.classList.remove('open');
    pendingAction = null;
    setTimeout(() => {
      if (!modal.classList.contains('open')) modal.style.display = 'none';
    }, 150);
  }

  function markDirty(event) {
    if (isUnsavedProductOpen() && event.target.closest('#product-drawer')) dirty = true;
  }

  function guardedDrawerAction(button) {
    openModal(() => {
      bypassGuard = true;
      button.click();
      bypassGuard = false;
    });
  }

  drawer.addEventListener('input', markDirty, true);
  drawer.addEventListener('change', markDirty, true);

  document.addEventListener('click', (event) => {
    if (!shouldGuard()) return;

    const drawerExit = event.target.closest('#drawer-close, #drawer-cancel, #drawer-overlay');
    if (drawerExit) {
      event.preventDefault();
      event.stopImmediatePropagation();
      guardedDrawerAction(drawerExit);
      return;
    }

    const anchor = event.target.closest('a[href]');
    if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

    const target = new URL(anchor.href, window.location.href);
    const current = new URL(window.location.href);
    if (target.href === current.href || (target.pathname === current.pathname && target.search === current.search)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    openModal(() => window.location.assign(target.href));
  }, true);

  document.addEventListener('keydown', (event) => {
    if (modal.classList.contains('open') && event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }

    const reloadKey = event.key === 'F5' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r');
    if (reloadKey && shouldGuard()) {
      event.preventDefault();
      openModal(() => window.location.reload());
    }
  });

  cancelButton.addEventListener('click', closeModal);
  discardButton.addEventListener('click', () => {
    const action = pendingAction;
    dirty = false;
    modal.classList.remove('open');
    modal.style.display = 'none';
    pendingAction = null;
    if (action) action();
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  new MutationObserver(() => {
    if (!isUnsavedProductOpen()) dirty = false;
  }).observe(drawerTitle, { childList: true, characterData: true, subtree: true });

  window.addEventListener('beforeunload', (event) => {
    if (!shouldGuard()) return;
    event.preventDefault();
    event.returnValue = '';
  });
})();

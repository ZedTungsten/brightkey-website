(function () {
  'use strict';

  function create(app) {
    let historyGuardActive = false;
    let suppressNextPopState = false;
    let allowPageUnload = false;
    let pendingLeaveAction = null;

    const arm = () => {
      if (historyGuardActive) return;
      history.pushState({ ...(history.state || {}), bkImageEditorUnsavedGuard: true }, '', window.location.href);
      historyGuardActive = true;
    };
    const release = () => {
      if (!historyGuardActive) return;
      historyGuardActive = false;
      suppressNextPopState = true;
      history.back();
    };
    const closeDialog = () => {
      app.closeModal(document.getElementById('unsaved-changes-overlay'));
      pendingLeaveAction = null;
    };
    const openDialog = leaveAction => {
      pendingLeaveAction = leaveAction;
      app.openModal(document.getElementById('unsaved-changes-overlay'));
    };
    const bind = () => {
      const overlay = document.getElementById('unsaved-changes-overlay');
      const saveButton = document.getElementById('unsaved-changes-save');
      document.getElementById('unsaved-changes-cancel').addEventListener('click', closeDialog);
      overlay.addEventListener('click', event => { if (event.target === overlay) closeDialog(); });
      saveButton.addEventListener('click', async () => {
        const leaveAction = pendingLeaveAction;
        saveButton.disabled = true; saveButton.textContent = 'Saving...';
        app.closeModal(overlay);
        const saved = await app.saveBeforeLeave();
        saveButton.disabled = false; saveButton.textContent = 'Save Changes';
        if (!saved) { app.openModal(overlay); return; }
        app.closeModal(overlay); pendingLeaveAction = null; historyGuardActive = false; allowPageUnload = true; leaveAction?.();
      });
      window.addEventListener('beforeunload', event => {
        if (allowPageUnload || !app.isDirty()) return;
        event.preventDefault(); event.returnValue = true;
      });
      window.addEventListener('popstate', () => {
        if (suppressNextPopState) { suppressNextPopState = false; return; }
        if (!historyGuardActive) return;
        historyGuardActive = false;
        if (!app.isDirty()) { history.back(); return; }
        arm(); openDialog(() => history.go(-2));
      });
      document.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest('a[href]');
        if (!link || link.target === '_blank' || link.hasAttribute('download') || !app.isDirty()) return;
        const href = link.getAttribute('href') || '';
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
        event.preventDefault(); openDialog(() => window.location.replace(link.href));
      }, true);
      const markImmediateEdit = event => {
        if (event.target.closest('#background-color,#background-hex,#image-opacity')) app.markDirty();
      };
      document.addEventListener('input', markImmediateEdit, true);
      document.addEventListener('change', markImmediateEdit, true);
      arm();
    };
    return { arm, bind, release };
  }

  window.BKImageEditorUnsavedGuard = { create };
}());

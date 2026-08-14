(function () {
  'use strict';

  function create(app) {
    let historyGuardActive = false;
    let suppressNextPopState = false;
    let allowPageUnload = false;
    let pendingLeaveAction = null;
    let dirtyInteraction = false;

    const hasUnsavedChanges = () => dirtyInteraction
      || Object.keys(app.dirty).length > 0
      || app.pendingDeletes.size > 0;

    const arm = () => {
      if (historyGuardActive) return;
      history.pushState({ ...(history.state || {}), bkDirectoryUnsavedGuard: true }, '', window.location.href);
      historyGuardActive = true;
    };

    const release = () => {
      if (!historyGuardActive) return;
      dirtyInteraction = false;
      historyGuardActive = false;
      suppressNextPopState = true;
      history.back();
    };

    const closeDialog = () => {
      document.getElementById('unsaved-changes-overlay')?.classList.remove('open');
      pendingLeaveAction = null;
    };

    const openDialog = leaveAction => {
      pendingLeaveAction = leaveAction;
      document.getElementById('unsaved-changes-overlay')?.classList.add('open');
    };

    const bind = () => {
      const overlay = document.getElementById('unsaved-changes-overlay');
      const cancelButton = document.getElementById('unsaved-changes-cancel');
      const saveButton = document.getElementById('unsaved-changes-save');

      cancelButton?.addEventListener('click', closeDialog);
      overlay?.addEventListener('click', event => {
        if (event.target === overlay) closeDialog();
      });

      saveButton?.addEventListener('click', async () => {
        const leaveAction = pendingLeaveAction;
        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';
        const saved = await app.saveAll({ keepHistoryGuard: true });
        saveButton.disabled = false;
        saveButton.textContent = 'Save Changes';
        if (!saved) return;

        overlay?.classList.remove('open');
        pendingLeaveAction = null;
        dirtyInteraction = false;
        historyGuardActive = false;
        allowPageUnload = true;
        leaveAction?.();
      });

      window.addEventListener('beforeunload', event => {
        if (allowPageUnload || !hasUnsavedChanges()) return;
        event.preventDefault();
        event.returnValue = true;
      });

      window.addEventListener('popstate', () => {
        if (suppressNextPopState) {
          suppressNextPopState = false;
          return;
        }
        if (!historyGuardActive) return;

        historyGuardActive = false;
        if (!hasUnsavedChanges()) {
          history.back();
          return;
        }

        arm();
        openDialog(() => history.go(-2));
      });

      document.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest('a[href]');
        if (!link || link.target === '_blank' || link.hasAttribute('download') || !hasUnsavedChanges()) return;
        const href = link.getAttribute('href') || '';
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

        event.preventDefault();
        // Replace the temporary guard entry so Back returns to the directory once.
        openDialog(() => window.location.replace(link.href));
      }, true);

      const markDirectoryEdit = event => {
        if (!app.editMode || !event.target.closest('.dir-table .cell-input')) return;
        dirtyInteraction = true;
        arm();
      };
      document.addEventListener('input', markDirectoryEdit, true);
      document.addEventListener('change', markDirectoryEdit, true);

      // Install the same-document history boundary up front. Back navigation is
      // therefore caught even if a field's input/change event and navigation
      // happen in the same interaction cycle.
      arm();
    };

    return {
      arm,
      armIfNeeded() {
        if (hasUnsavedChanges()) arm();
      },
      bind,
      release
    };
  }

  window.BKDirectoryUnsavedGuard = { create };
})();

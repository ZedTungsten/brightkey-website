    'use strict';

    // Toast and HTML Helpers
    function showToast(msg, isError = false) {
      const container = document.getElementById('toast-container');
      if (!container) return;
      const el = document.createElement('div');
      el.className = `toast toast-${isError ? 'error' : 'success'}`;
      el.innerText = msg;
      container.appendChild(el);
      setTimeout(() => el.remove(), 3500);
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
    }

    function formatInstallerName(nameStr) {
      if (!nameStr) return 'None Assigned';
      const delimiter = nameStr.includes('|') ? '|' : (nameStr.includes(',') ? ',' : null);
      if (delimiter) {
        return nameStr.split(delimiter)
          .map(n => formatInstallerName(n.trim()))
          .filter(Boolean)
          .join(', ');
      }
      let cleaned = nameStr.replace(/\s*\([^)]*\)/g, '').trim();
      if (!cleaned) return '';
      const parts = cleaned.split(/\s+/);
      if (parts.length <= 1) return cleaned;
      const firstName = parts[0];
      const lastName = parts[parts.length - 1];
      const initial = lastName ? ` ${lastName.charAt(0).toUpperCase()}.` : '';
      return `${firstName}${initial}`;
    }

    function renderSkeletons() {
      // Set correct month title immediately so it never shows a stale hardcoded value
      const titleEl = document.getElementById('calendar-month-title');
      if (titleEl) titleEl.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;

      // 1. Render Calendar Skeletons
      const cellsContainer = document.getElementById('calendar-cells');
      if (cellsContainer) {
        cellsContainer.innerHTML = '';
        for (let i = 0; i < 35; i++) {
          const hasSlot1 = (i % 7 === 1 || i % 7 === 4);
          const hasSlot2 = (i % 7 === 4);
          const slotsHtml = `
            <div class="calendar-half am">
              ${hasSlot1 ? '<div class="skeleton skeleton-slot"></div>' : ''}
            </div>
            <div class="calendar-half pm">
              ${hasSlot2 ? '<div class="skeleton skeleton-slot"></div>' : ''}
            </div>
          `;
          cellsContainer.insertAdjacentHTML('beforeend', `
            <div class="calendar-cell" style="opacity: 0.6;">
              <div class="calendar-cell-header"><span class="calendar-cell-num">${i + 1 <= 30 ? i + 1 : ''}</span></div>
              ${slotsHtml}
            </div>
          `);
        }
      }

      // 2. Render List Skeletons
      const listContainer = document.getElementById('list-schedules-container');
      if (listContainer) {
        listContainer.innerHTML = '';
        for (let i = 0; i < 4; i++) {
          listContainer.insertAdjacentHTML('beforeend', `
            <div class="skeleton-card">
              <div class="skeleton-card-left">
                <div class="skeleton skeleton-name"></div>
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text-short"></div>
              </div>
              <div class="skeleton-card-right">
                <div class="skeleton skeleton-date"></div>
                <div class="skeleton skeleton-time"></div>
              </div>
            </div>
          `);
        }
      }
    }

    // Build <option> HTML for door installer dropdowns
    function buildDoorInstallerOptions(selectedId = '') {
      const installerNames = window._installerAssignmentNames || [];
      const installers = dbEmployees.filter(emp => {
        // Filter by assignment if assignments are configured
        const empAssigns = (emp.assignment || '').split(',').map(s => s.trim());
        const empAssignsLower = empAssigns.map(s => s.toLowerCase());
        if (installerNames.length > 0) {
          return empAssigns.some(a => installerNames.includes(a));
        }
        const title = (emp.title || emp.position || '').toLowerCase();
        return title.includes('installer') || title.includes('operations') || title.includes('field') || empAssignsLower.includes('installer');
      });
      let html = '<option value="">-- Unassigned --</option>';
      installers.forEach(inst => {
        const lastName = inst.last_name ? ` ${inst.last_name.trim()}` : '';
        const displayName = `${inst.first_name}${lastName}`;
        const sel = inst.id === selectedId ? 'selected' : '';
        html += `<option value="${inst.id}" ${sel}>${displayName}</option>`;
      });
      return html;
    }

    window.editDoorInstallers = function(doorIndex) {
      let doorsArr = [];
      if (typeof selectedBooking.doors === 'string') {
        try { doorsArr = JSON.parse(selectedBooking.doors); } catch(_) {}
      } else if (Array.isArray(selectedBooking.doors)) {
        doorsArr = selectedBooking.doors;
      }
      
      const door = doorsArr[doorIndex];
      if (!door) return;

      const currentInstallers = door.installers || [];
      const hasAnyRole = currentInstallers.some(i => i.role);

      const leadInst  = hasAnyRole
        ? (currentInstallers.find(i => i.role === 'lead') || null)
        : currentInstallers[0];

      const assistInsts = hasAnyRole
        ? currentInstallers.filter(i => i.role === 'assist')
        : currentInstallers.slice(1);

      const serviceInst = hasAnyRole
        ? currentInstallers.find(i => i.role === 'service')
        : null;
      
      const inst1Id  = leadInst?.id || '';
      const inst2Id  = assistInsts[0]?.id || '';
      const inst3Id  = assistInsts[1]?.id || '';
      const hasAssist2 = !!inst2Id;
      const hasAssist3 = !!inst3Id;

      let productsArr = [];
      if (typeof selectedBooking.products === 'string') {
        try { productsArr = JSON.parse(selectedBooking.products); } catch(_) {}
      } else if (Array.isArray(selectedBooking.products)) {
        productsArr = selectedBooking.products;
      }

      let skus = [];
      if (selectedBooking.sku) {
        skus = selectedBooking.sku.split(' | ');
      }
      let names = [];
      if (selectedBooking.product_name) {
        names = selectedBooking.product_name.split(' | ');
      }

      const anyDoorHasAttachedProducts = doorsArr.some(d => Array.isArray(d.products) && d.products.length > 0);
      const isSingleDoorGrouping = (doorsArr.length === 1 && productsArr.length > 0);

      let doorProducts = [];
      if (anyDoorHasAttachedProducts) {
        const attachedSkus = door.products || [];
        doorProducts = productsArr.filter(p => attachedSkus.includes(p.sku));
      } else if (isSingleDoorGrouping) {
        doorProducts = productsArr.filter(p => p.sku !== 'ADD-ON LABOR');
      } else {
        if (productsArr[doorIndex]) {
          doorProducts = [productsArr[doorIndex]];
        } else if (skus[doorIndex]) {
          const nameFallback = names[doorIndex] || skus[doorIndex];
          doorProducts = [{ sku: skus[doorIndex], name: nameFallback, title: nameFallback }];
        }
      }

      const hasServiceProduct = doorProducts.some(p => {
        const prod = dbProducts.find(dbP => dbP.sku && dbP.sku.toUpperCase() === p.sku.toUpperCase());
        return prod && prod.category === 'Service';
      });

      const container = document.getElementById(`door-inst-container-${doorIndex}`);
      if (!container) return;

      const roleLabel = (text) => `<span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em;min-width:36px;flex-shrink:0;">${text}</span>`;

      const serviceHtml = hasServiceProduct ? `
          <div style="display: flex; gap: 0.35rem; align-items: center;">
            ${roleLabel('Service')}
            <select class="form-input" style="height:auto; padding:0.35rem; font-size:0.8rem; flex:1;" id="edit-inst-${doorIndex}-service" data-role="service">
              ${buildDoorInstallerOptions(serviceInst?.id || '')}
            </select>
            <div style="width: 28px;"></div>
          </div>
      ` : '';

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
          <div style="display: flex; gap: 0.35rem; align-items: center;">
            ${roleLabel('Lead')}
            <select class="form-input" style="height:auto; padding:0.35rem; font-size:0.8rem; flex:1;" id="edit-inst-${doorIndex}-1" data-role="lead">
              ${buildDoorInstallerOptions(inst1Id)}
            </select>
            <button type="button" class="btn-minimal btn-success" onclick="saveDoorInstallersEdit(${doorIndex})" title="Save">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
            <button type="button" class="btn-minimal btn-danger" onclick="cancelDoorInstallersEdit(${doorIndex})" title="Cancel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div id="edit-inst-2-wrapper-${doorIndex}" style="display: ${hasAssist2 ? 'flex' : 'none'}; gap: 0.35rem; align-items: center;">
            ${roleLabel('Assist')}
            <select class="form-input" style="height:auto; padding:0.35rem; font-size:0.8rem; flex:1;" id="edit-inst-${doorIndex}-2" data-role="assist">
              ${buildDoorInstallerOptions(inst2Id)}
            </select>
            <button type="button" class="btn-minimal btn-danger" onclick="removeAssistInstallerEdit(${doorIndex}, 2)" title="Remove"><svg viewBox="0 0 24 24" style="width:14px;height:14px;display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <div id="edit-inst-3-wrapper-${doorIndex}" style="display: ${hasAssist3 ? 'flex' : 'none'}; gap: 0.35rem; align-items: center;">
            ${roleLabel('Assist')}
            <select class="form-input" style="height:auto; padding:0.35rem; font-size:0.8rem; flex:1;" id="edit-inst-${doorIndex}-3" data-role="assist">
              ${buildDoorInstallerOptions(inst3Id)}
            </select>
            <button type="button" class="btn-minimal btn-danger" onclick="removeAssistInstallerEdit(${doorIndex}, 3)" title="Remove"><svg viewBox="0 0 24 24" style="width:14px;height:14px;display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          ${serviceHtml}
          <button type="button" class="btn btn-outline btn-sm" id="btn-add-inst-edit-${doorIndex}"
            style="display: ${(hasAssist2 && hasAssist3) ? 'none' : 'inline-flex'}; font-size: 0.72rem; padding: 0.2rem 0.5rem;"
            onclick="addAssistInstallerEdit(${doorIndex})">+ Add Assist</button>
        </div>
      `;
    };

    window.addAssistInstallerEdit = function(doorIndex) {
      // Show the first hidden assist wrapper
      const w2 = document.getElementById(`edit-inst-2-wrapper-${doorIndex}`);
      const w3 = document.getElementById(`edit-inst-3-wrapper-${doorIndex}`);
      if (w2 && w2.style.display === 'none') {
        w2.style.display = 'flex';
      } else if (w3 && w3.style.display === 'none') {
        w3.style.display = 'flex';
      }
      // Hide add btn if both assist slots are now visible
      if (w2 && w3 && w2.style.display !== 'none' && w3.style.display !== 'none') {
        const addBtn = document.getElementById(`btn-add-inst-edit-${doorIndex}`);
        if (addBtn) addBtn.style.display = 'none';
      }
    };

    // Keep old name as alias for backwards compatibility
    window.addSecondInstallerEdit = window.addAssistInstallerEdit;

    window.removeAssistInstallerEdit = function(doorIndex, slotNum) {
      const wrapper = document.getElementById(`edit-inst-${slotNum}-wrapper-${doorIndex}`);
      if (wrapper) wrapper.style.display = 'none';
      const sel = document.getElementById(`edit-inst-${doorIndex}-${slotNum}`);
      if (sel) sel.value = '';
      // Show add btn again since a slot was freed
      const addBtn = document.getElementById(`btn-add-inst-edit-${doorIndex}`);
      if (addBtn) addBtn.style.display = 'inline-flex';
    };

    window.removeSecondInstallerEdit = function(doorIndex) {
      window.removeAssistInstallerEdit(doorIndex, 2);
    };

    window.cancelDoorInstallersEdit = function(doorIndex) {
      showBookingDetails(selectedBooking.id);
    };

    window.editBookingInstallers = function(index) {
      if (!selectedBooking) return;
      
      let list = [];
      if (typeof selectedBooking.installers === 'string') {
        try { list = JSON.parse(selectedBooking.installers); } catch(_) {}
      } else if (Array.isArray(selectedBooking.installers)) {
        list = selectedBooking.installers;
      }

      const currentInstallers = list;
      const hasAnyRole = currentInstallers.some(i => i.role);

      const leadInst  = hasAnyRole
        ? (currentInstallers.find(i => i.role === 'lead') || null)
        : currentInstallers[0];

      const assistInsts = hasAnyRole
        ? currentInstallers.filter(i => i.role === 'assist')
        : currentInstallers.slice(1);

      const inst1Id  = leadInst?.id || '';
      const inst2Id  = assistInsts[0]?.id || '';
      const inst3Id  = assistInsts[1]?.id || '';
      const hasAssist2 = !!inst2Id;
      const hasAssist3 = !!inst3Id;

      const container = document.getElementById(`door-inst-container-general-${index}`);
      if (!container) return;

      const roleLabel = (text) => `<span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em;min-width:36px;flex-shrink:0;">${text}</span>`;

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
          <div style="display: flex; gap: 0.35rem; align-items: center;">
            ${roleLabel('Lead')}
            <select class="form-input" style="height:auto; padding:0.35rem; font-size:0.8rem; flex:1;" id="edit-inst-general-${index}-1" data-role="lead">
              ${buildDoorInstallerOptions(inst1Id)}
            </select>
            <button type="button" class="btn-minimal btn-success" onclick="saveBookingInstallersEdit(${index})" title="Save">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
            <button type="button" class="btn-minimal btn-danger" onclick="cancelBookingInstallersEdit(${index})" title="Cancel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div id="edit-inst-2-wrapper-general-${index}" style="display: ${hasAssist2 ? 'flex' : 'none'}; gap: 0.35rem; align-items: center;">
            ${roleLabel('Assist')}
            <select class="form-input" style="height:auto; padding:0.35rem; font-size:0.8rem; flex:1;" id="edit-inst-general-${index}-2" data-role="assist">
              ${buildDoorInstallerOptions(inst2Id)}
            </select>
            <button type="button" class="btn-minimal btn-danger" onclick="removeBookingAssistInstallerEdit(${index}, 2)" title="Remove"><svg viewBox="0 0 24 24" style="width:14px;height:14px;display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <div id="edit-inst-3-wrapper-general-${index}" style="display: ${hasAssist3 ? 'flex' : 'none'}; gap: 0.35rem; align-items: center;">
            ${roleLabel('Assist')}
            <select class="form-input" style="height:auto; padding:0.35rem; font-size:0.8rem; flex:1;" id="edit-inst-general-${index}-3" data-role="assist">
              ${buildDoorInstallerOptions(inst3Id)}
            </select>
            <button type="button" class="btn-minimal btn-danger" onclick="removeBookingAssistInstallerEdit(${index}, 3)" title="Remove"><svg viewBox="0 0 24 24" style="width:14px;height:14px;display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <button type="button" class="btn btn-outline btn-sm" id="btn-add-inst-edit-general-${index}"
            style="display: ${(hasAssist2 && hasAssist3) ? 'none' : 'inline-flex'}; font-size: 0.72rem; padding: 0.2rem 0.5rem;"
            onclick="addBookingAssistInstallerEdit(${index})">+ Add Assist</button>
        </div>
      `;
    };

    window.addBookingAssistInstallerEdit = function(index) {
      const wrap2 = document.getElementById(`edit-inst-2-wrapper-general-${index}`);
      const wrap3 = document.getElementById(`edit-inst-3-wrapper-general-${index}`);
      const addBtn = document.getElementById(`btn-add-inst-edit-general-${index}`);
      if (wrap2 && wrap2.style.display === 'none') {
        wrap2.style.display = 'flex';
      } else if (wrap3 && wrap3.style.display === 'none') {
        wrap3.style.display = 'flex';
        if (addBtn) addBtn.style.display = 'none';
      }
    };

    window.removeBookingAssistInstallerEdit = function(index, slot) {
      const wrap = document.getElementById(`edit-inst-${slot}-wrapper-general-${index}`);
      const sel = document.getElementById(`edit-inst-general-${index}-${slot}`);
      if (wrap) wrap.style.display = 'none';
      if (sel) sel.value = '';
      const addBtn = document.getElementById(`btn-add-inst-edit-general-${index}`);
      if (addBtn) addBtn.style.display = 'inline-flex';
    };

    window.cancelBookingInstallersEdit = function(index) {
      showBookingDetails(selectedBooking.id);
    };

    window.saveBookingInstallersEdit = async function(index) {
      if (!selectedBooking) return;

      const installersList = [];
      [1, 2, 3].forEach(slot => {
        const sel = document.getElementById(`edit-inst-general-${index}-${slot}`);
        const wrapper = slot > 1 ? document.getElementById(`edit-inst-${slot}-wrapper-general-${index}`) : null;
        const isVisible = slot === 1 || (wrapper && wrapper.style.display !== 'none');
        if (!isVisible || !sel || !sel.value) return;
        const emp = dbEmployees.find(e => e.id === sel.value);
        if (emp) {
          const lastName = emp.last_name ? ` ${emp.last_name.trim()}` : '';
          const role = sel.dataset.role || (slot === 1 ? 'lead' : 'assist');
          installersList.push({ id: emp.id, name: `${emp.first_name}${lastName}`, role });
        }
      });

      const installerIdStr   = installersList.length > 0 ? installersList.map(i => i.id).join(' | ')   : null;
      const installerNameStr = installersList.length > 0 ? installersList.map(i => i.name).join(' | ') : null;

      try {
        const { error } = await sb
          .from('installation_bookings')
          .update({
            installer_id: installerIdStr,
            installer_name: installerNameStr,
            installers: installersList
          })
          .eq('id', selectedBooking.id);

        if (error) throw error;

        const bookingIndex = dbBookings.findIndex(b => b.id === selectedBooking.id);
        if (bookingIndex !== -1) {
          dbBookings[bookingIndex].installer_id = installerIdStr;
          dbBookings[bookingIndex].installer_name = installerNameStr;
          dbBookings[bookingIndex].installers = installersList;

          selectedBooking.installer_id = installerIdStr;
          selectedBooking.installer_name = installerNameStr;
          selectedBooking.installers = installersList;
        }

        showToast('Installers updated successfully.');
        showBookingDetails(selectedBooking.id);
      } catch (err) {
        console.error('Failed to update booking installers:', err);
        showToast('Failed to update installers: ' + err.message);
      }
    };

    window.saveDoorInstallersEdit = async function(doorIndex) {
      if (!selectedBooking) return;

      let doorsArr = [];
      if (typeof selectedBooking.doors === 'string') {
        try { doorsArr = JSON.parse(selectedBooking.doors); } catch(_) {}
      } else if (Array.isArray(selectedBooking.doors)) {
        doorsArr = selectedBooking.doors;
      }

      const door = doorsArr[doorIndex];
      if (!door) return;

      const doorInstallers = [];
      [1, 2, 3].forEach(slot => {
        const sel = document.getElementById(`edit-inst-${doorIndex}-${slot}`);
        const wrapper = slot > 1 ? document.getElementById(`edit-inst-${slot}-wrapper-${doorIndex}`) : null;
        const isVisible = slot === 1 || (wrapper && wrapper.style.display !== 'none');
        if (!isVisible || !sel || !sel.value) return;
        const emp = dbEmployees.find(e => e.id === sel.value);
        if (emp) {
          const lastName = emp.last_name ? ` ${emp.last_name.trim()}` : '';
          const role = sel.dataset.role || (slot === 1 ? 'lead' : 'assist');
          doorInstallers.push({ id: emp.id, name: `${emp.first_name}${lastName}`, role });
        }
      });

      const serviceSel = document.getElementById(`edit-inst-${doorIndex}-service`);
      if (serviceSel && serviceSel.value) {
        const emp = dbEmployees.find(e => e.id === serviceSel.value);
        if (emp) {
          const lastName = emp.last_name ? ` ${emp.last_name.trim()}` : '';
          doorInstallers.push({ id: emp.id, name: `${emp.first_name}${lastName}`, role: 'service' });
        }
      }

      door.installers = doorInstallers;

      const allInstallersMap = new Map();
      doorsArr.forEach(d => {
        const dInstallers = d.installers || [];
        dInstallers.forEach(inst => {
          if (inst.id && !allInstallersMap.has(inst.id)) {
            allInstallersMap.set(inst.id, { id: inst.id, name: inst.name, role: inst.role });
          }
        });
      });

      const installersList = Array.from(allInstallersMap.values());
      const installerIdStr   = installersList.length > 0 ? installersList.map(i => i.id).join(' | ')   : null;
      const installerNameStr = installersList.length > 0 ? installersList.map(i => i.name).join(' | ') : null;

      try {
        const { error } = await sb
          .from('installation_bookings')
          .update({
            doors: doorsArr,
            installer_id: installerIdStr,
            installer_name: installerNameStr,
            installers: installersList
          })
          .eq('id', selectedBooking.id);

        if (error) throw error;

        const bookingIndex = dbBookings.findIndex(b => b.id === selectedBooking.id);
        if (bookingIndex !== -1) {
          dbBookings[bookingIndex].doors = doorsArr;
          dbBookings[bookingIndex].installer_id = installerIdStr;
          dbBookings[bookingIndex].installer_name = installerNameStr;
          dbBookings[bookingIndex].installers = installersList;

          selectedBooking.doors = doorsArr;
          selectedBooking.installer_id = installerIdStr;
          selectedBooking.installer_name = installerNameStr;
          selectedBooking.installers = installersList;
        }

        showToast('Installers updated successfully.');
        showBookingDetails(selectedBooking.id);
        applyFilterAndRender();
      } catch (err) {
        console.error('Failed to update door installers:', err);
        showToast('Failed to update: ' + err.message, true);
      }
    };

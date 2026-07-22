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
        const prod = dbProductsBySku.get(String(p.sku || '').toUpperCase());
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
        showToast('The installer assignments could not be updated. Please check the selections and try again.', true);
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

    function getInstallerSummaryJobs(booking, employeeId) {
      const parseArray = value => {
        if (Array.isArray(value)) return value;
        if (typeof value !== 'string' || !value.trim()) return [];
        try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; }
      };
      const doors = parseArray(booking.doors);
      const bookingInstallers = parseArray(booking.installers);
      const legacyIds = String(booking.installer_id || '').split(' | ').filter(Boolean);
      const legacyIndex = legacyIds.indexOf(employeeId);
      const bookingMatches = bookingInstallers.filter(installer => installer?.id === employeeId);
      const bookingAssigned = bookingMatches.length > 0 || legacyIndex !== -1;
      const hasDoorAssignments = doors.some(door => Array.isArray(door?.installers) && door.installers.some(installer => installer?.id || installer?.name));
      const getRoles = matches => {
        const roles = matches.map(installer => String(installer.role || 'lead').toLowerCase());
        if (!roles.length && legacyIndex !== -1) roles.push(legacyIndex === 0 ? 'lead' : 'assist');
        return [...new Set(roles)];
      };
      const bookingCompleted = ['done', 'completed', 'finished'].includes(String(booking.status || '').toLowerCase());
      if (!doors.length) return bookingAssigned ? [{ roles: getRoles(bookingMatches), completed: bookingCompleted, door: null }] : [];
      return doors.flatMap(door => {
        const matches = (Array.isArray(door?.installers) ? door.installers : []).filter(installer => installer?.id === employeeId);
        if (!matches.length && (hasDoorAssignments || !bookingAssigned)) return [];
        return [{ roles: getRoles(matches.length ? matches : bookingMatches), completed: Boolean(door?.completed) || bookingCompleted, door }];
      });
    }

    function installerSummaryPerson(employee) {
      const firstName = String(employee.first_name || '').trim();
      const lastName = String(employee.last_name || '').trim();
      const name = `${firstName} ${lastName}`.trim() || 'Unnamed installer';
      const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || 'I';
      const avatar = employee.picture_link
        ? `<img class="installer-summary-avatar" src="${escapeHtml(employee.picture_link)}" alt="" loading="lazy">`
        : `<span class="installer-summary-avatar installer-summary-avatar-fallback">${escapeHtml(initials)}</span>`;
      return `<div class="installer-summary-person">${avatar}<span>${escapeHtml(name)}</span></div>`;
    }

    function formatInstallerSummaryCredit(value) {
      return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }

    window.drawInstallersSummary = function() {
      const assignmentBody = document.getElementById('installer-assignment-tbody');
      if (!assignmentBody) return;
      const configuredNames = new Set((window._installerAssignmentNames || []).map(name => String(name).trim().toLowerCase()));
      configuredNames.add('installer');
      configuredNames.add('installers');
      const installers = dbEmployees.filter(employee => String(employee.assignment || '').split(',')
        .map(name => name.trim().toLowerCase()).some(name => configuredNames.has(name)));
      const threshold = Number(installerPayoutSettings?.installations_before_crediting ?? 15);
      const leadWeight = Number(installerPayoutSettings?.lead_credit ?? 1);
      const assistWeight = Number(installerPayoutSettings?.assist_credit ?? 0.5);
      const summaries = installers.map(employee => {
        const summary = { employee, lead: 0, scheduledLead: 0, assist: 0, scheduledAssist: 0, ocular: 0, scheduledOcular: 0, backjobs: 0, scheduledBackjobs: 0, credit: 0, service: 0, lastAssigned: '' };
        dbBookings.forEach(booking => {
          if (String(booking.status || '').toLowerCase() === 'cancelled') return;
          const type = String(booking.product_skus || '').trim().toLowerCase();
          const orderNo = String(booking.order_no || '').toUpperCase();
          const dayOff = type === 'day off' || orderNo.startsWith('DO-');
          const ocular = type === 'ocular' || orderNo.startsWith('OC-');
          const backjob = type === 'backjob' || orderNo.startsWith('BJ-');
          const assignedJobs = getInstallerSummaryJobs(booking, employee.id);
          if (!dayOff && assignedJobs.length && booking.scheduled_date && (!summary.lastAssigned || booking.scheduled_date > summary.lastAssigned)) {
            summary.lastAssigned = booking.scheduled_date;
          }
          assignedJobs.forEach(job => {
            if (dayOff) return;
            if (ocular) {
              summary.ocular++;
              if (!job.completed) summary.scheduledOcular++;
            } else if (backjob) {
              summary.backjobs++;
              if (!job.completed) summary.scheduledBackjobs++;
            } else if (job.roles.includes('lead')) {
              summary.lead++;
              if (!job.completed) summary.scheduledLead++;
            } else if (job.roles.includes('assist')) {
              summary.assist++;
              if (!job.completed) summary.scheduledAssist++;
            }
            if (!job.completed || ocular || backjob) return;
            if (job.roles.includes('lead')) summary.credit += leadWeight;
            else if (job.roles.includes('assist')) summary.credit += assistWeight;
            if (job.roles.includes('service')) summary.service++;
          });
        });
        summary.installationDone = (summary.lead - summary.scheduledLead) + (summary.assist - summary.scheduledAssist);
        summary.installationScheduled = summary.scheduledLead + summary.scheduledAssist;
        summary.total = summary.lead + summary.assist + summary.ocular + summary.backjobs;
        summary.extra = Math.max(0, summary.credit - threshold) + summary.service;
        return summary;
      });
      if (!summaries.length) {
      assignmentBody.innerHTML = '<tr><td colspan="11" class="installer-summary-empty">No employees with the Installer assignment were found.</td></tr>';
        return;
      }
      const formatDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—';
      const metric = (total, scheduled) => `${total}<span class="installer-scheduled-count"> (${scheduled})</span>`;
      assignmentBody.innerHTML = summaries.map(s => `<tr><td>${installerSummaryPerson(s.employee)}</td><td>${escapeHtml(s.employee.city || '—')}</td><td>${formatDate(s.lastAssigned)}</td><td class="installer-metric-lead">${metric(s.lead, s.scheduledLead)}</td><td class="installer-metric-assist">${metric(s.assist, s.scheduledAssist)}</td><td class="installer-summary-row-total">${metric(s.installationDone, s.installationScheduled)}</td><td class="installer-metric-ocular">${metric(s.ocular, s.scheduledOcular)}</td><td class="installer-metric-backjob">${metric(s.backjobs, s.scheduledBackjobs)}</td><td class="installer-summary-row-total">${s.total}</td><td><span class="installer-metric-lead">${formatInstallerSummaryCredit(s.credit)}</span><span class="installer-threshold-limit">/${formatInstallerSummaryCredit(threshold)}</span></td><td class="installer-metric-assist">${s.service}</td></tr>`).join('');
      const totals = summaries.reduce((a, s) => ({ lead:a.lead+s.lead, scheduledLead:a.scheduledLead+s.scheduledLead, assist:a.assist+s.assist, scheduledAssist:a.scheduledAssist+s.scheduledAssist, installationDone:a.installationDone+s.installationDone, installationScheduled:a.installationScheduled+s.installationScheduled, ocular:a.ocular+s.ocular, scheduledOcular:a.scheduledOcular+s.scheduledOcular, backjobs:a.backjobs+s.backjobs, scheduledBackjobs:a.scheduledBackjobs+s.scheduledBackjobs, total:a.total+s.total, credit:a.credit+s.credit, service:a.service+s.service, extra:a.extra+s.extra }), { lead:0, scheduledLead:0, assist:0, scheduledAssist:0, installationDone:0, installationScheduled:0, ocular:0, scheduledOcular:0, backjobs:0, scheduledBackjobs:0, total:0, credit:0, service:0, extra:0 });
      document.getElementById('installer-assignment-tfoot').innerHTML = `<tr><td colspan="3">Total</td><td class="installer-metric-lead">${metric(totals.lead, totals.scheduledLead)}</td><td class="installer-metric-assist">${metric(totals.assist, totals.scheduledAssist)}</td><td>${metric(totals.installationDone, totals.installationScheduled)}</td><td class="installer-metric-ocular">${metric(totals.ocular, totals.scheduledOcular)}</td><td class="installer-metric-backjob">${metric(totals.backjobs, totals.scheduledBackjobs)}</td><td>${totals.total}</td><td>—</td><td class="installer-metric-assist">${totals.service}</td></tr>`;
      window.drawInstallerAssignmentHistory();
    };

    let installerHistorySelectedIds = null;

    function getInstallerHistorySkus(booking, job) {
      const doorProducts = Array.isArray(job?.door?.products) ? job.door.products : [];
      let values = doorProducts.map(product => typeof product === 'string' ? product : product?.sku).filter(Boolean);
      if (!values.length) {
        const products = Array.isArray(booking.products) ? booking.products : (() => {
          try { const parsed = JSON.parse(booking.products || '[]'); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; }
        })();
        values = products.map(product => typeof product === 'string' ? product : product?.sku).filter(Boolean);
      }
      if (!values.length) values = String(booking.product_skus || '').split(/\s*\|\s*|\s*,\s*/).filter(Boolean);
      return [...new Set(values)].join(', ') || '—';
    }

    window.drawInstallerAssignmentHistory = function() {
      const tbody = document.getElementById('installer-history-tbody');
      const options = document.getElementById('installer-history-filter-options');
      if (!tbody || !options) return;

      const configuredNames = new Set((window._installerAssignmentNames || []).map(name => String(name).trim().toLowerCase()));
      configuredNames.add('installer');
      configuredNames.add('installers');
      const installers = dbEmployees.filter(employee => String(employee.assignment || '').split(',')
        .map(name => name.trim().toLowerCase()).some(name => configuredNames.has(name)));

      const availableIds = new Set(installers.map(employee => employee.id));
      if (installerHistorySelectedIds === null) installerHistorySelectedIds = new Set(availableIds);
      else installerHistorySelectedIds = new Set([...installerHistorySelectedIds].filter(id => availableIds.has(id)));

      options.innerHTML = installers.map(employee => {
        const name = `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || 'Unnamed installer';
        return `<label class="installer-filter-option"><input type="checkbox" value="${escapeHtml(employee.id)}" ${installerHistorySelectedIds.has(employee.id) ? 'checked' : ''}><span>${escapeHtml(name)}</span></label>`;
      }).join('');
      options.querySelectorAll('input[type="checkbox"]').forEach(input => {
        input.addEventListener('change', () => {
          if (input.checked) installerHistorySelectedIds.add(input.value);
          else installerHistorySelectedIds.delete(input.value);
          renderInstallerHistoryRows(installers);
        });
      });
      renderInstallerHistoryRows(installers);
    };

    function renderInstallerHistoryRows(installers) {
      const tbody = document.getElementById('installer-history-tbody');
      if (!tbody) return;
      const rows = [];
      installers.filter(employee => installerHistorySelectedIds.has(employee.id)).forEach(employee => {
        dbBookings.forEach(booking => {
          if (String(booking.status || '').toLowerCase() === 'cancelled') return;
          const type = String(booking.product_skus || '').trim().toLowerCase();
          const orderNo = String(booking.order_no || '').toUpperCase();
          const dayOff = type === 'day off' || orderNo.startsWith('DO-');
          if (dayOff) return;
          const isOcular = type === 'ocular' || orderNo.startsWith('OC-');
          const isBackjob = type === 'backjob' || orderNo.startsWith('BJ-');
          getInstallerSummaryJobs(booking, employee.id).forEach(job => {
            const roles = isOcular ? ['ocular'] : isBackjob ? ['backjob'] : job.roles.filter(role => role === 'lead' || role === 'assist' || role === 'service');
            if (!roles.length) return;
            rows.push({ employee, date: booking.scheduled_date || '', customer: booking.customer_name || '—', sku: getInstallerHistorySkus(booking, job), assignment: roles.map(role => role.charAt(0).toUpperCase() + role.slice(1)).join(', ') });
          });
        });
      });
      rows.sort((a, b) => a.date.localeCompare(b.date) || a.customer.localeCompare(b.customer));
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="installer-summary-empty">No assignments found for the selected installers.</td></tr>';
        return;
      }
      const formatDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—';
      tbody.innerHTML = rows.map(row => `<tr><td>${installerSummaryPerson(row.employee)}</td><td>${formatDate(row.date)}</td><td>${escapeHtml(row.customer)}</td><td class="installer-history-sku">${escapeHtml(row.sku)}</td><td>${escapeHtml(row.assignment)}</td></tr>`).join('');
    }

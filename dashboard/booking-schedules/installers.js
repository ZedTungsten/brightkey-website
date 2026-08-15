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

    function isActiveBookingEmployee(employee) {
      return String(employee?.employment_status || 'Active').trim().toLowerCase() === 'active';
    }

    // Build <option> HTML for door installer dropdowns
    function buildDoorInstallerOptions(selectedId = '') {
      const installerNames = window._installerAssignmentNames || [];
      const installerNameSet = new Set(
        installerNames.map(name => String(name || '').trim().toLowerCase()).filter(Boolean)
      );
      const installers = dbEmployees.filter(emp => {
        const isActive = isActiveBookingEmployee(emp);
        if (!isActive && emp.id !== selectedId) return false;
        // Filter by assignment if assignments are configured
        const empAssigns = (emp.assignment || '').split(',').map(s => s.trim());
        const empAssignsLower = empAssigns.map(s => s.toLowerCase());
        if (installerNameSet.size > 0) {
          return empAssignsLower.some(assignment => installerNameSet.has(assignment));
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

      const roleLabel = (text) => `<span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em;">${text}</span>`;
      const roleRowStyle = 'display:grid;grid-template-columns:48px minmax(0,1fr) 28px;gap:0.35rem;align-items:center;';

      const serviceHtml = hasServiceProduct ? `
          <div style="${roleRowStyle}">
            ${roleLabel('Service')}
            <select class="form-input" style="height:auto; padding:0.35rem; font-size:0.8rem; flex:1;" id="edit-inst-${doorIndex}-service" data-role="service">
              ${buildDoorInstallerOptions(serviceInst?.id || '')}
            </select>
            <button type="button" class="btn-minimal btn-danger" onclick="clearDoorInstallerEdit(${doorIndex}, 'service')" title="Remove service assignment">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
      ` : '';

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
          <div style="${roleRowStyle}">
            ${roleLabel('Lead')}
            <select class="form-input" style="height:auto; padding:0.35rem; font-size:0.8rem; flex:1;" id="edit-inst-${doorIndex}-1" data-role="lead">
              ${buildDoorInstallerOptions(inst1Id)}
            </select>
            <button type="button" class="btn-minimal btn-danger" onclick="clearDoorInstallerEdit(${doorIndex}, 'lead')" title="Remove lead assignment">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div id="edit-inst-2-wrapper-${doorIndex}" style="${roleRowStyle}display:${hasAssist2 ? 'grid' : 'none'};">
            ${roleLabel('Assist')}
            <select class="form-input" style="height:auto; padding:0.35rem; font-size:0.8rem; flex:1;" id="edit-inst-${doorIndex}-2" data-role="assist">
              ${buildDoorInstallerOptions(inst2Id)}
            </select>
            <button type="button" class="btn-minimal btn-danger" onclick="removeAssistInstallerEdit(${doorIndex}, 2)" title="Remove"><svg viewBox="0 0 24 24" style="width:14px;height:14px;display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <div id="edit-inst-3-wrapper-${doorIndex}" style="${roleRowStyle}display:${hasAssist3 ? 'grid' : 'none'};">
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
          <button type="button" class="btn btn-sm" onclick="saveDoorInstallersEdit(${doorIndex})"
            style="width:100%;justify-content:center;background:var(--success,#16a34a);border-color:var(--success,#16a34a);color:#fff;">Save</button>
          <button type="button" class="btn btn-sm" onclick="cancelDoorInstallersEdit(${doorIndex})"
            style="width:100%;justify-content:center;background:var(--danger,#dc2626);border-color:var(--danger,#dc2626);color:#fff;">Cancel</button>
        </div>
      `;
    };

    window.clearDoorInstallerEdit = function(doorIndex, role) {
      const selectorId = role === 'service' ? `edit-inst-${doorIndex}-service` : `edit-inst-${doorIndex}-1`;
      const select = document.getElementById(selectorId);
      if (select) select.value = '';
    };

    window.addAssistInstallerEdit = function(doorIndex) {
      // Show the first hidden assist wrapper
      const w2 = document.getElementById(`edit-inst-2-wrapper-${doorIndex}`);
      const w3 = document.getElementById(`edit-inst-3-wrapper-${doorIndex}`);
      if (w2 && w2.style.display === 'none') {
        w2.style.display = 'grid';
      } else if (w3 && w3.style.display === 'none') {
        w3.style.display = 'grid';
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

      const roleLabel = (text) => `<span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em;">${text}</span>`;
      const roleRowStyle = 'display:grid;grid-template-columns:48px minmax(0,1fr) 28px;gap:0.35rem;align-items:center;';

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
          <div style="${roleRowStyle}">
            ${roleLabel('Lead')}
            <select class="form-input" style="height:auto; padding:0.35rem; font-size:0.8rem; flex:1;" id="edit-inst-general-${index}-1" data-role="lead">
              ${buildDoorInstallerOptions(inst1Id)}
            </select>
            <button type="button" class="btn-minimal btn-danger" onclick="clearBookingInstallerEdit(${index})" title="Remove lead assignment">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div id="edit-inst-2-wrapper-general-${index}" style="${roleRowStyle}display:${hasAssist2 ? 'grid' : 'none'};">
            ${roleLabel('Assist')}
            <select class="form-input" style="height:auto; padding:0.35rem; font-size:0.8rem; flex:1;" id="edit-inst-general-${index}-2" data-role="assist">
              ${buildDoorInstallerOptions(inst2Id)}
            </select>
            <button type="button" class="btn-minimal btn-danger" onclick="removeBookingAssistInstallerEdit(${index}, 2)" title="Remove"><svg viewBox="0 0 24 24" style="width:14px;height:14px;display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <div id="edit-inst-3-wrapper-general-${index}" style="${roleRowStyle}display:${hasAssist3 ? 'grid' : 'none'};">
            ${roleLabel('Assist')}
            <select class="form-input" style="height:auto; padding:0.35rem; font-size:0.8rem; flex:1;" id="edit-inst-general-${index}-3" data-role="assist">
              ${buildDoorInstallerOptions(inst3Id)}
            </select>
            <button type="button" class="btn-minimal btn-danger" onclick="removeBookingAssistInstallerEdit(${index}, 3)" title="Remove"><svg viewBox="0 0 24 24" style="width:14px;height:14px;display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <button type="button" class="btn btn-outline btn-sm" id="btn-add-inst-edit-general-${index}"
            style="display: ${(hasAssist2 && hasAssist3) ? 'none' : 'inline-flex'}; font-size: 0.72rem; padding: 0.2rem 0.5rem;"
            onclick="addBookingAssistInstallerEdit(${index})">+ Add Assist</button>
          <button type="button" class="btn btn-sm" onclick="saveBookingInstallersEdit(${index})"
            style="width:100%;justify-content:center;background:var(--success,#16a34a);border-color:var(--success,#16a34a);color:#fff;">Save</button>
          <button type="button" class="btn btn-sm" onclick="cancelBookingInstallersEdit(${index})"
            style="width:100%;justify-content:center;background:var(--danger,#dc2626);border-color:var(--danger,#dc2626);color:#fff;">Cancel</button>
        </div>
      `;
    };

    window.clearBookingInstallerEdit = function(index) {
      const select = document.getElementById(`edit-inst-general-${index}-1`);
      if (select) select.value = '';
    };

    window.addBookingAssistInstallerEdit = function(index) {
      const wrap2 = document.getElementById(`edit-inst-2-wrapper-general-${index}`);
      const wrap3 = document.getElementById(`edit-inst-3-wrapper-general-${index}`);
      const addBtn = document.getElementById(`btn-add-inst-edit-general-${index}`);
      if (wrap2 && wrap2.style.display === 'none') {
        wrap2.style.display = 'grid';
      } else if (wrap3 && wrap3.style.display === 'none') {
        wrap3.style.display = 'grid';
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
      const installers = dbEmployees.filter(employee => isActiveBookingEmployee(employee)
        && String(employee.assignment || '').split(',')
          .map(name => name.trim().toLowerCase()).some(name => configuredNames.has(name)));
      const threshold = Number(installerPayoutSettings?.installations_before_crediting ?? 15);
      const leadWeight = Number(installerPayoutSettings?.lead_credit ?? 1);
      const assistWeight = Number(installerPayoutSettings?.assist_credit ?? 0.5);
      const summaries = installers.map(employee => {
        const summary = { employee, lead: 0, scheduledLead: 0, assist: 0, scheduledAssist: 0, serviceJobs: 0, scheduledService: 0, ocular: 0, scheduledOcular: 0, backjobs: 0, scheduledBackjobs: 0, credit: 0, service: 0, lastAssigned: '' };
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
            if (job.roles.includes('service')) {
              summary.serviceJobs++;
              if (!job.completed) summary.scheduledService++;
            }
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
      const metric = (done, scheduled) => `${done}<span class="installer-scheduled-count"> (${scheduled})</span>`;
      assignmentBody.innerHTML = summaries.map(s => `<tr><td>${installerSummaryPerson(s.employee)}</td><td>${escapeHtml(s.employee.city || '—')}</td><td>${formatDate(s.lastAssigned)}</td><td class="installer-metric-lead">${metric(s.lead - s.scheduledLead, s.scheduledLead)}</td><td class="installer-metric-assist">${metric(s.assist - s.scheduledAssist, s.scheduledAssist)}</td><td class="installer-summary-row-total">${metric(s.installationDone, s.installationScheduled)}</td><td class="installer-metric-service">${metric(s.serviceJobs - s.scheduledService, s.scheduledService)}</td><td class="installer-metric-ocular">${metric(s.ocular - s.scheduledOcular, s.scheduledOcular)}</td><td class="installer-metric-backjob">${metric(s.backjobs - s.scheduledBackjobs, s.scheduledBackjobs)}</td><td class="installer-summary-row-total">${s.total}</td><td><span class="installer-metric-lead">${formatInstallerSummaryCredit(s.credit)}</span><span class="installer-threshold-limit">/${formatInstallerSummaryCredit(threshold)}</span></td></tr>`).join('');
      const totals = summaries.reduce((a, s) => ({ lead:a.lead+s.lead, scheduledLead:a.scheduledLead+s.scheduledLead, assist:a.assist+s.assist, scheduledAssist:a.scheduledAssist+s.scheduledAssist, installationDone:a.installationDone+s.installationDone, installationScheduled:a.installationScheduled+s.installationScheduled, serviceJobs:a.serviceJobs+s.serviceJobs, scheduledService:a.scheduledService+s.scheduledService, ocular:a.ocular+s.ocular, scheduledOcular:a.scheduledOcular+s.scheduledOcular, backjobs:a.backjobs+s.backjobs, scheduledBackjobs:a.scheduledBackjobs+s.scheduledBackjobs, total:a.total+s.total, credit:a.credit+s.credit, service:a.service+s.service, extra:a.extra+s.extra }), { lead:0, scheduledLead:0, assist:0, scheduledAssist:0, installationDone:0, installationScheduled:0, serviceJobs:0, scheduledService:0, ocular:0, scheduledOcular:0, backjobs:0, scheduledBackjobs:0, total:0, credit:0, service:0, extra:0 });
      document.getElementById('installer-assignment-tfoot').innerHTML = `<tr><td colspan="3">Total</td><td class="installer-metric-lead">${metric(totals.lead - totals.scheduledLead, totals.scheduledLead)}</td><td class="installer-metric-assist">${metric(totals.assist - totals.scheduledAssist, totals.scheduledAssist)}</td><td>${metric(totals.installationDone, totals.installationScheduled)}</td><td class="installer-metric-service">${metric(totals.serviceJobs - totals.scheduledService, totals.scheduledService)}</td><td class="installer-metric-ocular">${metric(totals.ocular - totals.scheduledOcular, totals.scheduledOcular)}</td><td class="installer-metric-backjob">${metric(totals.backjobs - totals.scheduledBackjobs, totals.scheduledBackjobs)}</td><td>${totals.total}</td><td>—</td></tr>`;
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
      const installers = dbEmployees.filter(employee => isActiveBookingEmployee(employee)
        && String(employee.assignment || '').split(',')
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
            rows.push({ employee, date: booking.scheduled_date || '', completed: job.completed, customer: booking.customer_name || '—', sku: getInstallerHistorySkus(booking, job), assignment: roles.map(role => role.charAt(0).toUpperCase() + role.slice(1)).join(', ') });
          });
        });
      });
      rows.sort((a, b) => a.date.localeCompare(b.date) || a.customer.localeCompare(b.customer));
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="installer-summary-empty">No assignments found for the selected installers.</td></tr>';
        return;
      }
      const formatDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—';
      tbody.innerHTML = rows.map(row => `<tr><td>${installerSummaryPerson(row.employee)}</td><td>${formatDate(row.date)}</td><td><span class="installer-history-status-pill ${row.completed ? 'done' : 'scheduled'}">${row.completed ? 'Done' : 'Scheduled'}</span></td><td>${escapeHtml(row.customer)}</td><td class="installer-history-sku">${escapeHtml(row.sku)}</td><td>${escapeHtml(row.assignment)}</td></tr>`).join('');
    }

(() => {
  'use strict';

  let client;
  let companyId;
  let accounts = [];
  let editing = false;

  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  function isActive(employee) {
    return String(employee.employment_status || '').trim().toLowerCase() === 'active';
  }

  function fullName(employee) {
    return [employee.first_name, employee.middle_name, employee.last_name].filter(Boolean).join(' ') || 'Unnamed installer';
  }

  function initialInstallerPassword(employee) {
    const firstInitial = String(employee.first_name || '').trim().charAt(0).toLowerCase();
    const lastInitial = String(employee.last_name || '').trim().charAt(0).toLowerCase();
    const phoneDigits = String(employee.contact_number || '').replace(/\D/g, '');
    if (!firstInitial || !lastInitial || phoneDigits.length < 4) return '';
    return `${firstInitial}${lastInitial}${phoneDigits.slice(-4)}`;
  }

  async function autoSetMissingPasswords() {
    const existingPasswords = new Set(accounts.map(account => account.password).filter(Boolean));
    const generatedCounts = new Map();
    const candidates = accounts
      .filter(account => !account.password)
      .map(account => ({ account, password: initialInstallerPassword(account) }))
      .filter(candidate => candidate.password);

    candidates.forEach(candidate => {
      generatedCounts.set(candidate.password, (generatedCounts.get(candidate.password) || 0) + 1);
    });
    const eligible = candidates.filter(candidate =>
      generatedCounts.get(candidate.password) === 1 && !existingPasswords.has(candidate.password)
    );
    if (eligible.length === 0) return;

    const now = new Date().toISOString();
    const payload = eligible.map(candidate => ({
      employee_id: candidate.account.id,
      company_id: companyId,
      password: candidate.password,
      updated_at: now
    }));
    const { error } = await client.from('installer_accounts').upsert(payload, { onConflict: 'employee_id' });
    if (error) throw error;
    eligible.forEach(candidate => { candidate.account.password = candidate.password; });
  }

  function formatLastLogin(value) {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Never';
    const dateText = date.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric'
    });
    const timeText = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    return `${dateText} ${timeText}`;
  }

  function passwordCell(account) {
    if (editing) {
      return `<input type="text" class="installer-account-password edit" data-employee-id="${escapeHtml(account.id)}" minlength="4" maxlength="10" placeholder="Type new password" autocomplete="off">`;
    }
    if (!account.password) return '<span class="installer-password-missing">Not set</span>';
    return `<div class="installer-password-field">
      <input type="password" class="installer-account-password" value="${escapeHtml(account.password)}" readonly tabindex="-1" aria-label="Password for ${escapeHtml(fullName(account))}">
      <button type="button" class="installer-password-reveal" aria-label="Hold to show password">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>
      </button>
    </div>`;
  }

  function render() {
    const body = document.getElementById('installer-accounts-tbody');
    const filter = document.getElementById('installer-accounts-status')?.value || 'active';
    if (!body) return;
    const visible = accounts.filter(account => filter === 'all' || isActive(account));
    if (!visible.length) {
      body.innerHTML = '<tr><td colspan="6" class="installer-accounts-state">No installers match this filter.</td></tr>';
      return;
    }
    body.innerHTML = visible.map(account => {
      const name = fullName(account);
      const initials = `${String(account.first_name || '').charAt(0)}${String(account.last_name || '').charAt(0)}`.toUpperCase() || 'I';
      const avatar = account.picture_link
        ? `<img class="installer-account-avatar" src="${escapeHtml(account.picture_link)}" alt="" loading="lazy">`
        : `<span class="installer-account-avatar fallback">${escapeHtml(initials)}</span>`;
      return `<tr>
        <td>${avatar}</td>
        <td class="installer-account-name">${escapeHtml(name)}</td>
        <td>${escapeHtml(account.city || '—')}</td>
        <td>${escapeHtml(account.province || '—')}</td>
        <td>${passwordCell(account)}</td>
        <td>${escapeHtml(formatLastLogin(account.last_login_at))}</td>
      </tr>`;
    }).join('');
  }

  function setEditing(next) {
    editing = next;
    document.getElementById('installer-password-edit').hidden = next;
    document.getElementById('installer-password-confirm').hidden = !next;
    document.getElementById('installer-password-cancel').hidden = !next;
    render();
  }

  function reveal(button, visible) {
    const input = button.closest('.installer-password-field')?.querySelector('input');
    if (input) input.type = visible ? 'text' : 'password';
  }

  async function savePasswords() {
    const inputs = Array.from(document.querySelectorAll('.installer-account-password.edit'));
    const changes = inputs.map(input => ({
      employee_id: input.dataset.employeeId,
      password: input.value.trim()
    })).filter(change => change.password);
    if (!changes.length) {
      showToast('Type at least one new installer password.', true);
      return;
    }
    const invalid = changes.find(change => change.password.length < 4 || change.password.length > 10);
    if (invalid) {
      showToast('Installer passwords must contain 4 to 10 characters.', true);
      return;
    }
    const now = new Date().toISOString();
    const payload = changes.map(change => ({ ...change, company_id: companyId, updated_at: now }));
    const confirm = document.getElementById('installer-password-confirm');
    confirm.disabled = true;
    try {
      const { error } = await client.from('installer_accounts').upsert(payload, { onConflict: 'employee_id' });
      if (error) throw error;
      const changedById = new Map(changes.map(change => [change.employee_id, change.password]));
      accounts.forEach(account => {
        if (changedById.has(account.id)) account.password = changedById.get(account.id);
      });
      setEditing(false);
      showToast('Installer passwords updated successfully.');
    } catch (error) {
      const duplicate = error?.code === '23505';
      showToast(duplicate ? 'Each installer must have a unique password. Choose a different password.' : 'Installer passwords could not be updated. Please try again.', true);
      console.error('Unable to update installer passwords:', error);
    } finally {
      confirm.disabled = false;
    }
  }

  function bindEvents() {
    document.getElementById('installer-accounts-status')?.addEventListener('change', render);
    document.getElementById('installer-password-edit')?.addEventListener('click', () => setEditing(true));
    document.getElementById('installer-password-cancel')?.addEventListener('click', () => setEditing(false));
    document.getElementById('installer-password-confirm')?.addEventListener('click', savePasswords);
    const body = document.getElementById('installer-accounts-tbody');
    body?.addEventListener('pointerdown', event => {
      const button = event.target.closest('.installer-password-reveal');
      if (button) reveal(button, true);
    });
    const concealPasswords = () => {
      document.querySelectorAll('.installer-password-field input').forEach(input => { input.type = 'password'; });
    };
    ['pointerup', 'pointercancel'].forEach(eventName => {
      document.addEventListener(eventName, concealPasswords);
    });
    body?.addEventListener('pointerleave', concealPasswords);
  }

  async function load() {
    const body = document.getElementById('installer-accounts-tbody');
    try {
      const { data: employees, error: employeeError } = await client
        .from('employees')
        .select('id,first_name,middle_name,last_name,contact_number,picture_link,city,province,employment_status,assignment,title')
        .eq('company_id', companyId)
        .or('assignment.ilike.%installer%,title.ilike.%installer%')
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })
        .limit(100);
      if (employeeError) throw employeeError;
      const ids = (employees || []).map(employee => employee.id).filter(Boolean);
      let accountRows = [];
      if (ids.length) {
        const { data, error } = await client
          .from('installer_accounts')
          .select('employee_id,password,last_login_at')
          .eq('company_id', companyId)
          .in('employee_id', ids)
          .limit(100);
        if (error) throw error;
        accountRows = data || [];
      }
      const accountByEmployee = new Map(accountRows.map(account => [account.employee_id, account]));
      accounts = (employees || []).map(employee => ({ ...employee, ...(accountByEmployee.get(employee.id) || {}) }));
      try {
        await autoSetMissingPasswords();
      } catch (passwordError) {
        console.error('Unable to auto-set initial installer passwords:', passwordError);
        showToast('Some initial installer passwords could not be generated. You can set them manually using Edit Password.', true);
      }
      render();
    } catch (error) {
      if (body) body.innerHTML = '<tr><td colspan="6" class="installer-accounts-state error">Installer accounts could not be loaded. Refresh the page and try again.</td></tr>';
      showToast('Installer accounts could not be loaded. Please refresh and try again.', true);
      console.error('Unable to load installer accounts:', error);
    }
  }

  window.BKInstallerAccounts = {
    async init(context) {
      client = context.sb;
      companyId = context.companyId;
      if (!client || !companyId) return;
      bindEvents();
      await load();
    }
  };
})();

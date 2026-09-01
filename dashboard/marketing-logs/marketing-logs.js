/* ── Marketing Logs Controller ── */
(function() {
  'use strict';

  let sb = null;
  let companyId = null;
  let currentEmployee = null;
  let employeeInitials = '??';
  
  let currentDate = new Date();
  let logsList = [];
  let pendingDeletionId = null;
  const editRowStates = {}; // key: logId (or tempId), value: editData object

  // Standard escape helper
  function esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
  }

  // Toast notification helper using main.js notification engine
  function showToast(message, isError = false) {
    if (window.Toast) {
      window.Toast.show(message, isError ? 'error' : 'success');
    } else {
      console.log((isError ? 'ERROR: ' : 'INFO: ') + message);
    }
  }

  // Format date like: Oct 24, 2026 FRI
  function formatLogDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    
    const m = months[d.getMonth()];
    const date = String(d.getDate()).padStart(2, '0');
    const y = d.getFullYear();
    const day = days[d.getDay()];
    
    return `${m} ${date}, ${y} ${day}`;
  }

  // Initial setup
  document.addEventListener('DOMContentLoaded', async () => {
    if (!window.BKAuth) {
      console.error('BKAuth system not found.');
      return;
    }
    
    // Gate access to marketing & administrative roles
    const authInfo = await window.BKAuth.checkRoleGate(
      ['Marketing', 'owner', 'admin', 'Operations', 'Sales'],
      '../login.html'
    );
    
    sb = window.BKAuth.sb;
    
    try {
      // Resolve companyId
      const { data: co, error: coErr } = await sb.from('companies')
        .select('id')
        .eq('tenant_id', authInfo.tenantId)
        .limit(1)
        .maybeSingle();
        
      if (coErr) throw coErr;
      companyId = co?.id || null;
      
      if (!companyId) {
        showToast('Company details not found.', true);
        return;
      }

      // Fetch employee info for logged-in user
      const { data: emp, error: empErr } = await sb.from('employees')
        .select('id, first_name, last_name')
        .eq('email', authInfo.user.email)
        .limit(1)
        .maybeSingle();

      if (empErr) console.warn('Could not fetch employee details:', empErr);
      if (emp) {
        currentEmployee = emp;
        employeeInitials = ((emp.first_name || '').charAt(0) + (emp.last_name || '').charAt(0)).toUpperCase();
      }

      // Load initial month and data
      updateMonthYearDisplay();
      await loadMarketingLogs();

    } catch (err) {
      console.error(err);
      showToast('Error initializing page: ' + err.message, true);
    }
  });

  window.navigateMonth = function(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    updateMonthYearDisplay();
    loadMarketingLogs();
  };

  function updateMonthYearDisplay() {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const display = document.getElementById('month-year-display');
    if (display) {
      display.textContent = `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
  }

  // Load logs for the current selected month
  async function loadMarketingLogs() {
    const tbody = document.getElementById('logs-tbody');
    tbody.innerHTML = `
      <tr class="loading-row">
        <td colspan="7">
          <div class="loading-wrapper">
            <div class="spinner-cyan"></div>
            <span>Loading marketing logs...</span>
          </div>
        </td>
      </tr>
    `;

    try {
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth();
      const startOfMonth = new Date(y, m, 1).toISOString().split('T')[0];
      const endOfMonth = new Date(y, m + 1, 0).toISOString().split('T')[0];

      const { data, error } = await sb.from('marketing_logs')
        .select(`
          *,
          employees (
            first_name,
            last_name
          )
        `)
        .eq('company_id', companyId)
        .gte('date', startOfMonth)
        .lte('date', endOfMonth)
        .order('date', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;
      logsList = data || [];
      renderTable();
    } catch (err) {
      console.error(err);
      showToast('Failed to load logs: ' + err.message, true);
    }
  }

  window.autoResizeTextarea = function(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  function renderTable() {
    const tbody = document.getElementById('logs-tbody');
    tbody.innerHTML = '';

    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = new Date();

    for (let d = 1; d <= daysInMonth; d++) {
      const dateString = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      
      const dateLogs = logsList.filter(log => log.date === dateString);
      const rowsForDate = dateLogs.length ? dateLogs : [{
        id: null,
        date: dateString,
        item: '',
        change_desc: '',
        reason: '',
        learning: '',
        starred: false
      }];

      rowsForDate.forEach((log, rowIndex) => {
        const isFirstRowForDate = rowIndex === 0;
        const isLastRowForDate = rowIndex === rowsForDate.length - 1;
        const tr = document.createElement('tr');
        tr.dataset.logId = log.id || '';
        tr.dataset.date = dateString;
        if (log.starred) tr.classList.add('row-starred');
        if (y === today.getFullYear() && m === today.getMonth() && d === today.getDate()) tr.classList.add('row-today');

        let initials = '';
        if (log.employees) {
          initials = ((log.employees.first_name || '').charAt(0) + (log.employees.last_name || '').charAt(0)).toUpperCase();
        }
        const logId = log.id || '';
        const badgeKey = log.id || `new-${dateString}`;

        tr.innerHTML = `
        <td class="cell-date ${isFirstRowForDate ? 'date-group-first' : 'date-group-continuation'} ${isLastRowForDate ? 'date-group-last' : ''}">${isFirstRowForDate ? formatLogDate(dateString) : ''}</td>
        <td class="cell-user"><div class="user-badge" data-log-key="${badgeKey}" style="${initials ? '' : 'display: none;'}">${initials}</div></td>
        <td>
          <textarea rows="1" class="cell-textarea" onblur="saveCell('${dateString}', '${logId}', 'item', this.value, this)" oninput="autoResizeTextarea(this)">${esc(log.item)}</textarea>
        </td>
        <td>
          <textarea rows="1" class="cell-textarea" onblur="saveCell('${dateString}', '${logId}', 'change_desc', this.value, this)" oninput="autoResizeTextarea(this)">${esc(log.change_desc)}</textarea>
        </td>
        <td>
          <textarea rows="1" class="cell-textarea" onblur="saveCell('${dateString}', '${logId}', 'reason', this.value, this)" oninput="autoResizeTextarea(this)">${esc(log.reason)}</textarea>
        </td>
        <td class="cell-learning">
          <textarea rows="1" class="cell-textarea" onblur="saveCell('${dateString}', '${logId}', 'learning', this.value, this)" oninput="autoResizeTextarea(this)">${esc(log.learning)}</textarea>
        </td>
        <td>
          <div class="action-btn-group">
            ${isFirstRowForDate ? `<button type="button" class="action-icon-btn add-row-btn" onclick="addMarketingLogRow(event, '${dateString}')" title="Add another item for this date" aria-label="Add another item for this date">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>` : `<button type="button" class="action-icon-btn remove-row-btn" onclick="removeMarketingLogRow(event, '${logId}')" title="Remove this row" aria-label="Remove this row">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>`}
            <button type="button" class="action-icon-btn star-btn ${log.starred ? 'active' : ''}" onclick="toggleStarRow(event, '${dateString}', '${logId}', ${log.starred})" title="Star Highlight" aria-label="Star highlight">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="${log.starred ? 'currentColor' : 'none'}"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </button>
          </div>
        </td>
      `;

        tbody.appendChild(tr);
      });
    }

    // Append auto-height spacer row to prevent browser stretching rows to fill 100% min-height
    const spacerTr = document.createElement('tr');
    spacerTr.className = 'table-spacer-row';
    spacerTr.style.height = 'auto';
    spacerTr.style.border = 'none';
    spacerTr.style.background = 'transparent';
    spacerTr.innerHTML = `<td colspan="7" style="padding: 0; border: none; background: transparent; pointer-events: none;"></td>`;
    tbody.appendChild(spacerTr);

    // Trigger autoResize on all rendered textareas
    setTimeout(() => {
      document.querySelectorAll('.cell-textarea').forEach(textarea => {
        window.autoResizeTextarea(textarea);
      });
    }, 50);
  }

  window.saveCell = async function(dateString, logId, field, value, textarea) {
    const row = textarea?.closest('tr');
    logId = row?.dataset.logId || logId;
    const existing = logId ? logsList.find(log => log.id === logId) : null;
    const prevVal = existing ? existing[field] : '';
    const newVal = value.trim();

    if (prevVal === newVal) return; // No change, do not save

    try {
      if (existing) {
        // Update local object property first so we can check the complete row state
        existing[field] = newVal;

        // If all fields are empty and not starred, delete the row
        const wouldBeEmpty = !existing.item && !existing.change_desc && !existing.reason && !existing.learning && !existing.starred;

        if (wouldBeEmpty) {
          const { error } = await sb.from('marketing_logs')
            .delete()
            .eq('id', existing.id)
            .eq('company_id', companyId);
          if (error) throw error;
          logsList = logsList.filter(l => l.id !== existing.id);
          renderTable();
          return;
        } else {
          const payload = {
            [field]: newVal,
            employee_id: currentEmployee?.id || null,
            updated_at: new Date().toISOString()
          };
          const { data, error } = await sb.from('marketing_logs')
            .update(payload)
            .eq('id', existing.id)
            .select('*, employees(first_name, last_name)')
            .single();

          if (error) throw error;
          // Update local logsList item
          const idx = logsList.findIndex(l => l.id === existing.id);
          if (idx !== -1) {
            logsList[idx] = data;
          }
        }
      } else {
        // Do not insert a record if the user just blurred an empty cell
        if (!newVal) return;

        // Insert new record with default empty strings for the other non-null columns
        const payload = {
          company_id: companyId,
          date: dateString,
          item: field === 'item' ? newVal : '',
          change_desc: field === 'change_desc' ? newVal : '',
          reason: field === 'reason' ? newVal : '',
          learning: field === 'learning' ? newVal : '',
          employee_id: currentEmployee?.id || null
        };

        const { data, error } = await sb.from('marketing_logs')
          .insert([payload])
          .select('*, employees(first_name, last_name)')
          .single();

        if (error) throw error;
        logsList.push(data);
        if (row) {
          row.dataset.logId = data.id;
          const badge = row.querySelector('.user-badge');
          if (badge) badge.dataset.logKey = data.id;
        }
      }

      updateUserBadges();
    } catch (err) {
      console.error(err);
      showToast('Save failed: ' + err.message, true);
    }
  };

  function updateUserBadges() {
    // Hide and clear all user badges first to clean up cleared rows
    document.querySelectorAll('.user-badge').forEach(b => {
      b.style.display = 'none';
      b.textContent = '';
    });

    // Update active User badges initials from logsList
    logsList.forEach(log => {
      const badge = document.querySelector(`.user-badge[data-log-key="${log.id}"]`);
      if (badge) {
        let initials = '';
        if (log.employees) {
          initials = ((log.employees.first_name || '').charAt(0) + (log.employees.last_name || '').charAt(0)).toUpperCase();
        } else if (log.employee_id === currentEmployee?.id) {
          initials = employeeInitials;
        }
        if (initials) {
          badge.textContent = initials;
          badge.style.display = 'inline-flex';
        }
      }
    });
  }

  window.toggleStarRow = async function(e, dateString, logId, currentStarredState) {
    e.stopPropagation();
    logId = e.currentTarget.closest('tr')?.dataset.logId || logId;
    const newStarred = !currentStarredState;
    const existing = logId ? logsList.find(log => log.id === logId) : null;

    try {
      if (existing) {
        const { error } = await sb.from('marketing_logs')
          .update({ starred: newStarred })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const payload = {
          company_id: companyId,
          date: dateString,
          item: '',
          change_desc: '',
          reason: '',
          learning: '',
          starred: newStarred,
          employee_id: currentEmployee?.id || null
        };
        const { error } = await sb.from('marketing_logs').insert([payload]);
        if (error) throw error;
      }

      showToast(newStarred ? 'Row highlighted.' : 'Highlight removed.');
      await loadMarketingLogs();
    } catch (err) {
      console.error(err);
      showToast('Failed to toggle highlight: ' + err.message, true);
    }
  };

  window.addMarketingLogRow = async function(e, dateString) {
    e.stopPropagation();
    try {
      const payload = {
        company_id: companyId,
        date: dateString,
        item: '',
        change_desc: '',
        reason: '',
        learning: '',
        starred: false,
        employee_id: currentEmployee?.id || null
      };
      const { error } = await sb.from('marketing_logs').insert([payload]);
      if (error) throw error;
      showToast('Another item was added for the same date.');
      await loadMarketingLogs();
    } catch (err) {
      console.error(err);
      showToast('Could not add another item for this date.', true);
    }
  };

  function rowHasText(log) {
    return ['item', 'change_desc', 'reason', 'learning'].some(field => String(log?.[field] || '').trim());
  }

  async function deleteMarketingLogRow(logId) {
    try {
      const { error } = await sb.from('marketing_logs')
        .delete()
        .eq('id', logId)
        .eq('company_id', companyId);
      if (error) throw error;
      logsList = logsList.filter(log => log.id !== logId);
      showToast('Row removed.');
      renderTable();
    } catch (err) {
      console.error(err);
      showToast('Could not remove this row.', true);
    }
  }

  window.removeMarketingLogRow = function(e, logId) {
    e.stopPropagation();
    const log = logsList.find(item => item.id === logId);
    if (!log) {
      renderTable();
      return;
    }

    if (!rowHasText(log)) {
      deleteMarketingLogRow(logId);
      return;
    }

    pendingDeletionId = logId;
    const modal = document.getElementById('delete-row-modal');
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('open');
    modal.querySelector('.delete-row-cancel-btn')?.focus();
  };

  window.closeDeleteRowModal = function() {
    pendingDeletionId = null;
    const modal = document.getElementById('delete-row-modal');
    modal.classList.remove('open');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 150);
  };

  window.confirmDeleteMarketingLogRow = async function() {
    const logId = pendingDeletionId;
    window.closeDeleteRowModal();
    if (logId) await deleteMarketingLogRow(logId);
  };

  window.handleDeleteRowBackdrop = function(e) {
    if (e.target.id === 'delete-row-modal') window.closeDeleteRowModal();
  };

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('delete-row-modal')?.classList.contains('open')) {
      window.closeDeleteRowModal();
    }
  });

  window.clearRow = async function(e, dateString) {
    e.stopPropagation();
    const existing = logsList.find(l => l.date === dateString);
    if (!existing) return;

    // Use non-destructive custom alert/confirmation if desired, but since they clear, we can just clear directly
    try {
      const { error } = await sb.from('marketing_logs')
        .delete()
        .eq('id', existing.id);

      if (error) throw error;
      showToast('Row cleared.');
      await loadMarketingLogs();
    } catch (err) {
      console.error(err);
      showToast('Clear failed: ' + err.message, true);
    }
  };

})();

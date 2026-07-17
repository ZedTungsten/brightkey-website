/* ── Marketing Logs Controller ── */
(function() {
  'use strict';

  let sb = null;
  let companyId = null;
  let currentEmployee = null;
  let employeeInitials = '??';
  
  let currentDate = new Date();
  let logsList = [];
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
        .eq('email_address', authInfo.user.email)
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
        .order('created_at', { ascending: false });

      if (error) throw error;
      logsList = data || [];
      renderTable();
    } catch (err) {
      console.error(err);
      showToast('Failed to load logs: ' + err.message, true);
    }
  }

  function renderTable() {
    const tbody = document.getElementById('logs-tbody');
    tbody.innerHTML = '';

    if (logsList.length === 0) {
      tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="7">No marketing logs tracked for this month. Click "Add Log" to create one.</td>
        </tr>
      `;
      return;
    }

    logsList.forEach(log => {
      const tr = document.createElement('tr');
      const isEditing = editRowStates[log.id] !== undefined;

      if (log.starred) {
        tr.className = 'row-starred';
      }

      // Resolve initials
      let initials = '??';
      if (log.employees) {
        initials = ((log.employees.first_name || '').charAt(0) + (log.employees.last_name || '').charAt(0)).toUpperCase();
      } else if (log.id.startsWith?.('temp-') && currentEmployee) {
        initials = employeeInitials;
      }

      if (isEditing) {
        // Edit Mode Row
        const state = editRowStates[log.id];
        tr.innerHTML = `
          <td>
            <input type="date" class="table-input" value="${state.date}" onchange="updateEditField('${log.id}', 'date', this.value)" />
          </td>
          <td>
            <input type="text" class="table-input" value="${esc(state.item)}" placeholder="e.g. Ad, Campaign" oninput="updateEditField('${log.id}', 'item', this.value)" />
          </td>
          <td>
            <textarea class="table-textarea" rows="1" oninput="updateEditField('${log.id}', 'change_desc', this.value)">${esc(state.change_desc)}</textarea>
          </td>
          <td style="text-align: center;">
            <div class="user-badge" title="Autofilled user">${initials}</div>
          </td>
          <td>
            <textarea class="table-textarea" rows="1" oninput="updateEditField('${log.id}', 'reason', this.value)">${esc(state.reason)}</textarea>
          </td>
          <td class="cell-learning">
            <textarea class="table-textarea" rows="1" style="background:#fffbeb; color:#713f12;" oninput="updateEditField('${log.id}', 'learning', this.value)">${esc(state.learning)}</textarea>
          </td>
          <td>
            <div class="action-btn-group">
              <button class="action-icon-btn save-btn" onclick="saveLogRow('${log.id}')" title="Save Row">
                <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </button>
              <button class="action-icon-btn" onclick="cancelEdit('${log.id}')" title="Cancel">
                <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </td>
        `;
      } else {
        // Read Mode Row (Double click to edit)
        tr.ondblclick = () => enterEditMode(log);
        tr.innerHTML = `
          <td>${formatLogDate(log.date)}</td>
          <td class="wrap-text">${esc(log.item)}</td>
          <td class="wrap-text">${esc(log.change_desc)}</td>
          <td style="text-align: center;">
            <div class="user-badge">${initials}</div>
          </td>
          <td class="wrap-text">${esc(log.reason)}</td>
          <td class="cell-learning wrap-text">${esc(log.learning)}</td>
          <td>
            <div class="action-btn-group">
              <button class="action-icon-btn star-btn ${log.starred ? 'active' : ''}" onclick="toggleStarRow(event, '${log.id}', ${log.starred})" title="Star Highlight">
                <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="${log.starred ? 'currentColor' : 'none'}"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              </button>
              <button class="action-icon-btn" onclick="enterEditModeByButton(event, '${log.id}')" title="Edit Log">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="action-icon-btn delete-btn" onclick="deleteLogRow(event, '${log.id}')" title="Delete Log">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </td>
        `;
      }

      tbody.appendChild(tr);
    });
  }

  // Prepend a new log row in edit mode
  window.addNewLogRow = function() {
    const tempId = 'temp-' + Date.now();
    const todayStr = new Date().toISOString().split('T')[0];

    // Prepend a mock object to the local logs list
    logsList.unshift({
      id: tempId,
      date: todayStr,
      item: '',
      change_desc: '',
      employee_id: currentEmployee?.id || null,
      reason: '',
      learning: '',
      starred: false
    });

    // Initialize edit state
    editRowStates[tempId] = {
      date: todayStr,
      item: '',
      change_desc: '',
      reason: '',
      learning: ''
    };

    renderTable();
  };

  window.updateEditField = function(id, field, value) {
    if (editRowStates[id]) {
      editRowStates[id][field] = value;
    }
  };

  function enterEditMode(log) {
    editRowStates[log.id] = {
      date: log.date,
      item: log.item,
      change_desc: log.change_desc,
      reason: log.reason,
      learning: log.learning
    };
    renderTable();
  }

  window.enterEditModeByButton = function(e, id) {
    e.stopPropagation();
    const log = logsList.find(l => l.id === id);
    if (log) enterEditMode(log);
  };

  window.cancelEdit = function(id) {
    delete editRowStates[id];
    // If it was a new temp row, remove it entirely
    if (id.startsWith?.('temp-')) {
      logsList = logsList.filter(l => l.id !== id);
    }
    renderTable();
  };

  window.saveLogRow = async function(id) {
    const state = editRowStates[id];
    if (!state) return;

    if (!state.date) {
      showToast('Date is required.', true);
      return;
    }
    if (!state.item.trim()) {
      showToast('Item is required.', true);
      return;
    }
    if (!state.change_desc.trim()) {
      showToast('Change description is required.', true);
      return;
    }

    try {
      const payload = {
        company_id: companyId,
        date: state.date,
        item: state.item.trim(),
        change_desc: state.change_desc.trim(),
        reason: state.reason.trim(),
        learning: state.learning.trim(),
        employee_id: currentEmployee?.id || null,
        updated_at: new Date().toISOString()
      };

      if (id.startsWith?.('temp-')) {
        // Create new log
        const { data, error } = await sb.from('marketing_logs')
          .insert([payload])
          .select()
          .single();

        if (error) throw error;
        showToast('Marketing log created successfully.');
      } else {
        // Update existing log
        const { error } = await sb.from('marketing_logs')
          .update(payload)
          .eq('id', id);

        if (error) throw error;
        showToast('Marketing log updated successfully.');
      }

      delete editRowStates[id];
      await loadMarketingLogs();

    } catch (err) {
      console.error(err);
      showToast('Save failed: ' + err.message, true);
    }
  };

  let logIdToDelete = null;

  window.deleteLogRow = function(e, id) {
    e.stopPropagation();
    logIdToDelete = id;
    const modal = document.getElementById('delete-confirm-modal');
    if (modal) {
      modal.style.display = 'flex';
      modal.offsetHeight; // reflow
      modal.classList.add('open');
    }
  };

  window.closeDeleteModal = function() {
    const modal = document.getElementById('delete-confirm-modal');
    if (modal) {
      modal.classList.remove('open');
      setTimeout(() => {
        modal.style.display = 'none';
        logIdToDelete = null;
      }, 150);
    }
  };

  window.confirmDeleteLog = async function() {
    if (!logIdToDelete) return;
    const btn = document.getElementById('btn-confirm-delete');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Deleting...';
    }

    try {
      const { error } = await sb.from('marketing_logs')
        .delete()
        .eq('id', logIdToDelete);

      if (error) throw error;
      showToast('Marketing log deleted.');
      window.closeDeleteModal();
      await loadMarketingLogs();
    } catch (err) {
      console.error(err);
      showToast('Delete failed: ' + err.message, true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Delete';
      }
    }
  };

  window.toggleStarRow = async function(e, id, currentStarredState) {
    e.stopPropagation();
    const newStarred = !currentStarredState;

    try {
      const { error } = await sb.from('marketing_logs')
        .update({ starred: newStarred })
        .eq('id', id);

      if (error) throw error;
      
      // Update local array directly for fast feedback
      const log = logsList.find(l => l.id === id);
      if (log) {
        log.starred = newStarred;
      }
      renderTable();
      showToast(newStarred ? 'Row highlighted.' : 'Highlight removed.');
    } catch (err) {
      console.error(err);
      showToast('Failed to update status: ' + err.message, true);
    }
  };

})();

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
        .order('created_at', { ascending: false });

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

    for (let d = 1; d <= daysInMonth; d++) {
      const dateString = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      
      // Check if we have an existing log record for this date
      const log = logsList.find(l => l.date === dateString) || {
        id: null,
        date: dateString,
        item: '',
        change_desc: '',
        reason: '',
        learning: '',
        starred: false
      };

      const tr = document.createElement('tr');
      if (log.starred) {
        tr.className = 'row-starred';
      }

      // Resolve initials
      let initials = '';
      if (log.employees) {
        initials = ((log.employees.first_name || '').charAt(0) + (log.employees.last_name || '').charAt(0)).toUpperCase();
      }

      tr.innerHTML = `
        <td style="font-weight: 600; color: var(--text-secondary);">${formatLogDate(dateString)}</td>
        <td>
          <textarea class="cell-textarea" placeholder="Item..." onblur="saveCell('${dateString}', 'item', this.value)" oninput="autoResizeTextarea(this)">${esc(log.item)}</textarea>
        </td>
        <td>
          <textarea class="cell-textarea" placeholder="Change..." onblur="saveCell('${dateString}', 'change_desc', this.value)" oninput="autoResizeTextarea(this)">${esc(log.change_desc)}</textarea>
        </td>
        <td style="text-align: center; vertical-align: middle;">
          <div class="user-badge" id="user-badge-${dateString}" style="${initials ? '' : 'display: none;'}">${initials}</div>
        </td>
        <td>
          <textarea class="cell-textarea" placeholder="Reason..." onblur="saveCell('${dateString}', 'reason', this.value)" oninput="autoResizeTextarea(this)">${esc(log.reason)}</textarea>
        </td>
        <td class="cell-learning">
          <textarea class="cell-textarea" placeholder="Learning..." onblur="saveCell('${dateString}', 'learning', this.value)" oninput="autoResizeTextarea(this)">${esc(log.learning)}</textarea>
        </td>
        <td>
          <div class="action-btn-group">
            <button class="action-icon-btn star-btn ${log.starred ? 'active' : ''}" onclick="toggleStarRow(event, '${dateString}', ${log.starred})" title="Star Highlight">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="${log.starred ? 'currentColor' : 'none'}"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </button>
            <button class="action-icon-btn delete-btn" onclick="clearRow(event, '${dateString}')" title="Clear Row">
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    }

    // Trigger autoResize on all rendered textareas
    setTimeout(() => {
      document.querySelectorAll('.cell-textarea').forEach(textarea => {
        window.autoResizeTextarea(textarea);
      });
    }, 50);
  }

  window.saveCell = async function(dateString, field, value) {
    const existing = logsList.find(l => l.date === dateString);
    const prevVal = existing ? existing[field] : '';
    const newVal = value.trim();

    if (prevVal === newVal) return; // No change, do not save

    try {
      if (existing) {
        // Update existing record
        const payload = {
          [field]: newVal,
          employee_id: currentEmployee?.id || null,
          updated_at: new Date().toISOString()
        };

        // Check if all text fields are now empty and it's not starred, we can clean up by deleting
        const wouldBeEmpty = !newVal &&
          (field === 'item' ? true : !existing.item) &&
          (field === 'change_desc' ? true : !existing.change_desc) &&
          (field === 'reason' ? true : !existing.reason) &&
          (field === 'learning' ? true : !existing.learning) &&
          !existing.starred;

        if (wouldBeEmpty) {
          const { error } = await sb.from('marketing_logs').delete().eq('id', existing.id);
          if (error) throw error;
          showToast('Log entry cleared.');
        } else {
          const { error } = await sb.from('marketing_logs').update(payload).eq('id', existing.id);
          if (error) throw error;
          showToast('Cell saved.');
        }
      } else {
        // Do not insert a record if the user just blurred an empty cell
        if (!newVal) return;

        // Insert new record
        const payload = {
          company_id: companyId,
          date: dateString,
          [field]: newVal,
          employee_id: currentEmployee?.id || null
        };

        const { error } = await sb.from('marketing_logs').insert([payload]);
        if (error) throw error;
        showToast('Log created.');
      }

      // Reload logs silently to sync local logsList and re-render Initials/states
      await loadLogsSilently();
    } catch (err) {
      console.error(err);
      showToast('Save failed: ' + err.message, true);
    }
  };

  async function loadLogsSilently() {
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
        .lte('date', endOfMonth);

      if (error) throw error;
      logsList = data || [];
      
      // Update User badges initials and row highlight classes without losing input focus
      logsList.forEach(log => {
        const badge = document.getElementById(`user-badge-${log.date}`);
        if (badge) {
          if (log.employees) {
            const initials = ((log.employees.first_name || '').charAt(0) + (log.employees.last_name || '').charAt(0)).toUpperCase();
            badge.textContent = initials;
            badge.style.display = 'inline-flex';
          } else {
            badge.style.display = 'none';
          }
        }
      });
    } catch (err) {
      console.error('Silent reload failed:', err);
    }
  }

  window.toggleStarRow = async function(e, dateString, currentStarredState) {
    e.stopPropagation();
    const newStarred = !currentStarredState;
    const existing = logsList.find(l => l.date === dateString);

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

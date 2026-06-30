    'use strict';

    /* ── Supabase ── */
    const SB_URL = (typeof SUPABASE_URL !== 'undefined') ? SUPABASE_URL : 'https://ymjlosnxuhsybkzkoofq.supabase.co';
    const SB_ANON = (typeof SUPABASE_ANON !== 'undefined') ? SUPABASE_ANON : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltamxvc254dWhzeWJremtvb2ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY1MzYsImV4cCI6MjA4OTk4MjUzNn0.srhk9SVvFuZRcfeRGbVDGPr5pYrFhs8vzcOiMK3A91w';
    const getSb = () => window.BKAuth.sb;

    async function sbGet() {
      const { data, error } = await getSb()
        .from('employees')
        .select('*')
        .order('employee_number', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    }
    async function sbPatch(id, body) {
      const { error } = await getSb().from('employees').update(body).eq('id', id);
      if (error) throw new Error(error.message || 'Update failed');
    }
    async function sbInsert(body) {
      const { data, error } = await getSb().from('employees').insert([body]).select();
      if (error) throw new Error(error.message || 'Insert failed');
      return data;
    }
    async function sbDelete(id) {
      const { error } = await getSb().from('employees').delete().eq('id', id);
      if (error) throw new Error(error.message || 'Delete failed');
    }

    /* ── Helpers ── */
    function esc(s) {
      return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function fmt(v) { return (v === null || v === undefined || v === '') ? '' : v; }

    /* Date → "Mmm DD, YYYY" */
    function fmtDate(v) {
      if (!v) return '';
      const d = new Date(v + 'T00:00:00');
      if (isNaN(d)) return v;
      return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    }
    /* Date value for <input type="date"> */
    function isoDate(v) { return v ? String(v).slice(0, 10) : ''; }

    function fmtPHP(v) {
      if (v === null || v === undefined || v === '') return '';
      return '₱' + Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function fullName(emp) {
      return [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(' ');
    }
    function initials(emp) {
      const f = (emp.first_name || '').charAt(0).toUpperCase();
      const l = (emp.last_name || '').charAt(0).toUpperCase();
      return f + l || '?';
    }

    function parseTimeParts(timeStr) {
      if (!timeStr) return { h: '', m: '', p: '' };
      timeStr = timeStr.trim().toUpperCase();
      const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
      if (!match) return { h: '', m: '', p: '' };
      return {
        h: String(parseInt(match[1], 10)),
        m: match[2],
        p: match[3]
      };
    }

    /* ── Toast ── */
    function toast(msg, type = 'success') {
      const icons = {
        success: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
        error: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      };
      const el = document.createElement('div');
      el.className = `toast toast-${type}`;
      el.innerHTML = (icons[type] || '') + esc(msg);
      document.getElementById('toast-container').appendChild(el);
      setTimeout(() => el.remove(), 3500);
    }

    /* ══════════════════════════════════════════════════
       DirectoryApp
     ══════════════════════════════════════════════════ */
    const App = {
      allEmployees: [],
      filtered: [],
      page: 1,
      pageSize: 20,
      editMode: false,
      dirty: {},
      employeePrefix: 'BK',
      assignments: [],  // [{ id, name, visibility[] }] loaded from employee_assignments
      pendingDeletes: new Set(),
      sortCol: 'employee_number',
      sortDir: 'asc',
      pendingDeleteId: null,

      toggleShiftDay(btn, id, day) {
        const row = btn.closest('tr');
        const input = row.querySelector(`input[data-field="shift_days"]`);
        if (!input) return;
        let days = input.value ? input.value.split(',').map(d => d.trim()).filter(Boolean) : [];
        if (days.includes(day)) {
          days = days.filter(d => d !== day);
          btn.classList.remove('active');
        } else {
          days.push(day);
          btn.classList.add('active');
        }
        const order = ['M', 'T', 'W', 'Th', 'F', 'S', 'Su'];
        days.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        input.value = days.join(',');
        input.dispatchEvent(new Event('change', { bubbles: true }));
      },

      updateTimeRange(timeInput, id, fieldName) {
        const row = timeInput.closest('tr');
        const mainInput = row.querySelector(`input.main-time-input[data-field="${fieldName}"]`);
        if (!mainInput) return;
        
        const getTimeStr = (prefix) => {
          const wraps = row.querySelectorAll(`.time-part-wrap[data-prefix="${prefix}"]`);
          let correctWrap = null;
          wraps.forEach(w => {
            const hSel = w.querySelector('.time-h');
            if (hSel && hSel.dataset.field === fieldName) {
              correctWrap = w;
            }
          });
          if (!correctWrap) return '';
          const h = correctWrap.querySelector('.time-h').value;
          const m = correctWrap.querySelector('.time-m').value;
          const p = correctWrap.querySelector('.time-p').value;
          if (!h || !m || !p) return '';
          return `${String(h).padStart(2, '0')}:${m} ${p}`;
        };
        
        const startVal = getTimeStr('start');
        const endVal = getTimeStr('end');
        
        if (startVal && endVal) {
          mainInput.value = startVal + ' - ' + endVal;
        } else {
          mainInput.value = '';
        }
        mainInput.dispatchEvent(new Event('change', { bubbles: true }));
      },

      showSecondShift(btn, id) {
        const td = btn.closest('td');
        const wrap2 = td.querySelector('.second-shift-inputs-wrap');
        if (wrap2) {
          wrap2.style.display = 'flex';
          btn.style.display = 'none';
        }
      },
      
      hideSecondShift(btn, id) {
        const td = btn.closest('td');
        const wrap2 = td.querySelector('.second-shift-inputs-wrap');
        const mainInput2 = td.querySelector('input.main-time-input[data-field="shift_time_2"]');
        if (wrap2) {
          wrap2.style.display = 'none';
          wrap2.querySelectorAll('select').forEach(sel => sel.value = '');
          if (mainInput2) {
            mainInput2.value = '';
            mainInput2.dispatchEvent(new Event('change', { bubbles: true }));
          }
          const addBtn = td.querySelector('.add-shift-btn');
          if (addBtn) addBtn.style.display = 'inline-flex';
        }
      },

      openInviteModal(email, name) {
        document.getElementById('invite-email').value = email;
        document.getElementById('invite-name').value = name;
        
        const select = document.getElementById('invite-role');
        if (select) {
          select.innerHTML = `
            <option value="admin">Admin</option>
            <option value="custom">User</option>
          `;
          select.value = 'admin';
        }
        
        this.handleInviteRoleChange('admin');
        document.getElementById('invite-modal-overlay').classList.add('open');
      },

      closeInviteModal() {
        document.getElementById('invite-modal-overlay').classList.remove('open');
      },

      handleInviteRoleChange(role) {
        const customContainer = document.getElementById('invite-custom-access-container');
        if (customContainer) {
          customContainer.style.display = (role === 'custom') ? 'flex' : 'none';
        }
        if (role === 'admin') {
          document.querySelectorAll('.invite-custom-access').forEach(cb => cb.checked = true);
        } else {
          document.querySelectorAll('.invite-custom-access').forEach(cb => cb.checked = false);
        }
      },

      async submitInvite(e) {
        e.preventDefault();
        const email = document.getElementById('invite-email').value;
        const name = document.getElementById('invite-name').value;
        const roleSelect = document.getElementById('invite-role');
        const btn = document.getElementById('btn-submit-invite');

        if (!email || !name) return;

        btn.disabled = true;
        const origText = btn.innerText;
        btn.innerText = 'Sending invitation...';

        let role = roleSelect.value;

        if (role === 'custom') {
          const checkedModules = Array.from(document.querySelectorAll('.invite-custom-access:checked')).map(cb => cb.value);
          if (checkedModules.length === 0) {
            toast('Please check at least one access module for Custom role.', 'error');
            btn.disabled = false;
            btn.innerText = origText;
            return;
          }
          role = 'access:' + checkedModules.join(',');
        }

        try {
          const { data: { session } } = await getSb().auth.getSession();
          const token = session?.access_token;

          const res = await fetch('/api/send-invitation', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              tenant_id: this.tenantId,
              company_id: this.companyId,
              email: email,
              full_name: name,
              role: role,
              invite_type: 'directory'
            })
          });

          const data = await res.json();
          if (!res.ok) {
            toast(data.error || 'Invitation failed.', 'error');
            return;
          }

          toast(`Invitation email sent successfully to ${email}!`, 'success');
          this.closeInviteModal();
          await this.load();
        } catch (err) {
          console.error('Invitation error:', err);
          toast('System error sending invitation.', 'error');
        } finally {
          btn.disabled = false;
          btn.innerText = origText;
        }
      },

      async init() {
        const authInfo = await window.BKAuth.checkRoleGate(['HR'], '../admin.html');
        if (!authInfo) return;

        this.tenantId = authInfo.tenantId;

        // Fetch company ID for file uploads and RLS
        try {
          const { data: co } = await getSb().from('companies').select('id').eq('tenant_id', authInfo.tenantId).limit(1).maybeSingle();
          this.companyId = co?.id || null;
        } catch(e) { this.companyId = null; }

        // Load assignments for the Assignment column dropdown
        try {
          const { data: aData } = await getSb().from('employee_assignments')
            .select('id, name, visibility')
            .eq('company_id', this.companyId || '')
            .order('created_at', { ascending: true });
          this.assignments = aData || [];
        } catch(e) { this.assignments = []; }

        // Load HR configuration for prefix
        this.employeePrefix = 'BK';
        try {
          const { data: hrConf } = await getSb().from('global_settings')
            .select('value')
            .eq('key', 'hr_config')
            .eq('company_id', this.companyId || '')
            .maybeSingle();
          if (hrConf && hrConf.value && hrConf.value.employee_prefix) {
            this.employeePrefix = hrConf.value.employee_prefix.toUpperCase();
          }
        } catch(e) { console.error('Failed to load HR prefix settings:', e); }

        this.bindToolbar();
        this.bindEditMode();
        this.bindExport();
        this.bindDeleteConfirm();
        this.updateSortHeaders();
        await this.load();
      },

      updateSortHeaders() {
        document.querySelectorAll('.dir-table th.sortable').forEach(th => {
          th.classList.remove('sort-asc', 'sort-desc');
          const arrow = th.querySelector('.sort-arrow');
          if (arrow) arrow.innerHTML = '';
          
          if (th.dataset.col === this.sortCol) {
            th.classList.add(this.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
            if (arrow) {
              arrow.innerHTML = this.sortDir === 'asc' ? ' ▲' : ' ▼';
            }
          }
        });
      },

      /* ── Load from Supabase ── */
      async load() {
        document.getElementById('dir-tbody').innerHTML = '<tr><td colspan="28" class="tbl-state">Loading employees…</td></tr>';
        try {
          if (this.companyId) {
            try {
              const { data: settings } = await getSb()
                .from('global_settings')
                .select('value')
                .eq('key', 'company_structure')
                .eq('company_id', this.companyId)
                .maybeSingle();
              this.companyStructure = settings?.value || { departments: [] };
            } catch (e) {
              console.error('Failed to load company structure settings:', e);
              this.companyStructure = { departments: [] };
            }
          } else {
            this.companyStructure = { departments: [] };
          }
          this.buildReportingToMap();

          this.activeUserEmails = new Set();
          this.invitedEmails = new Set();
          try {
            const { data: tmData } = await getSb()
              .from('tenant_members')
              .select('user_email')
              .eq('tenant_id', this.tenantId);
            if (tmData) {
              tmData.forEach(m => {
                if (m.user_email) this.activeUserEmails.add(m.user_email.toLowerCase().trim());
              });
            }
          } catch (e) {
            console.error('Failed to fetch active member emails:', e);
          }

          try {
            const { data: invData } = await getSb()
              .from('company_invitations')
              .select('email')
              .eq('tenant_id', this.tenantId);
            if (invData) {
              invData.forEach(i => {
                if (i.email) this.invitedEmails.add(i.email.toLowerCase().trim());
              });
            }
          } catch (e) {
            console.error('Failed to fetch pending invitation emails:', e);
          }

          try {
            const { data: dRoles } = await getSb()
              .from('dashboard_roles')
              .select('*')
              .order('name', { ascending: true });
            this.dynamicRoles = dRoles || [];
          } catch (e) {
            console.error('Failed to fetch dashboard roles:', e);
            this.dynamicRoles = [];
          }

          // Fetch pending update requests
          this.pendingRequests = [];
          this.pendingRequestsByEmployee = {};
          try {
            const { data: reqs, error: reqsErr } = await getSb()
              .from('employee_update_requests')
              .select('*, employees(first_name, last_name, email, picture_link)')
              .eq('status', 'pending')
              .order('created_at', { ascending: false });
            if (!reqsErr && reqs) {
              this.pendingRequests = reqs;
              reqs.forEach(r => {
                this.pendingRequestsByEmployee[r.employee_id] = r;
              });
            }
          } catch(e) {
            console.error('Failed to fetch update requests:', e);
          }

          const data = await sbGet();
          this.allEmployees = data;
          this.dirty = {};
          this.pendingDeletes.clear();
          this.updateDeptFilter();
          this.applyFilters();
          this.updateStats();
          this.renderRequestsTab();

          // Show tab navigation if user is HR/Admin/Owner
          const tabNav = document.getElementById('directory-tabs');
          if (tabNav) {
            tabNav.style.display = 'flex';
          }
        } catch (err) {
          document.getElementById('dir-tbody').innerHTML = `<tr><td colspan="30" class="tbl-state error">Failed to load: ${esc(err.message)}</td></tr>`;
          toast('Failed to load employees: ' + err.message, 'error');
        }
      },

      buildReportingToMap() {
        this.reportingToMap = {};
        this.employeeDeptMap = {};
        this.employeeTeamsMap = {};
        const struct = this.companyStructure || { departments: [] };
        if (!struct.departments) return;
        struct.departments.forEach(dept => {
          const deptHeadId = dept.managerId;
          const deptName = dept.name;
          if (deptHeadId) {
            this.employeeDeptMap[deptHeadId] = deptName;
          }
          if (dept.subteams) {
            dept.subteams.forEach(sub => {
              const subteamManagerId = sub.managerId;
              const subteamName = sub.name;
              if (subteamManagerId) {
                this.employeeDeptMap[subteamManagerId] = deptName;
                if (!this.employeeTeamsMap[subteamManagerId]) this.employeeTeamsMap[subteamManagerId] = [];
                if (!this.employeeTeamsMap[subteamManagerId].includes(subteamName)) this.employeeTeamsMap[subteamManagerId].push(subteamName);
                if (deptHeadId) {
                  this.reportingToMap[subteamManagerId] = deptHeadId;
                }
                if (sub.colleagueIds) {
                  sub.colleagueIds.forEach(colId => {
                    this.reportingToMap[colId] = subteamManagerId;
                    this.employeeDeptMap[colId] = deptName;
                    if (!this.employeeTeamsMap[colId]) this.employeeTeamsMap[colId] = [];
                    if (!this.employeeTeamsMap[colId].includes(subteamName)) this.employeeTeamsMap[colId].push(subteamName);
                  });
                }
              } else {
                if (deptHeadId && sub.colleagueIds) {
                  sub.colleagueIds.forEach(colId => {
                    this.reportingToMap[colId] = deptHeadId;
                    this.employeeDeptMap[colId] = deptName;
                    if (!this.employeeTeamsMap[colId]) this.employeeTeamsMap[colId] = [];
                    if (!this.employeeTeamsMap[colId].includes(subteamName)) this.employeeTeamsMap[colId].push(subteamName);
                  });
                } else if (sub.colleagueIds) {
                  sub.colleagueIds.forEach(colId => {
                    this.employeeDeptMap[colId] = deptName;
                    if (!this.employeeTeamsMap[colId]) this.employeeTeamsMap[colId] = [];
                    if (!this.employeeTeamsMap[colId].includes(subteamName)) this.employeeTeamsMap[colId].push(subteamName);
                  });
                }
              }
            });
          }
        });
      },

      /* ── Department filter options ── */
      updateDeptFilter() {
        const sel = document.getElementById('filter-dept');
        const current = sel.value;

        // Load departments from companyStructure (Org Map)
        let depts = [];
        if (this.companyStructure && Array.isArray(this.companyStructure.departments)) {
          depts = this.companyStructure.departments.map(d => d.name).filter(Boolean);
        }

        // Union with any departments from existing employees so no data is orphaned
        const empDepts = this.allEmployees.map(e => e.department).filter(Boolean);
        empDepts.forEach(d => {
          if (!depts.includes(d)) depts.push(d);
        });

        depts.sort();

        // Populate search filter
        sel.innerHTML = '<option value="">All Departments</option>';
        depts.forEach(d => {
          const o = document.createElement('option');
          o.value = o.textContent = d;
          sel.appendChild(o);
        });
        sel.value = current;

        // Populate "Add Employee" modal dropdown
        const modalSel = document.getElementById('new-emp-department');
        if (modalSel) {
          const modalCurrent = modalSel.value;
          modalSel.innerHTML = '<option value="">Select Department</option>';
          depts.forEach(d => {
            const o = document.createElement('option');
            o.value = o.textContent = d;
            modalSel.appendChild(o);
          });
          modalSel.value = modalCurrent;
        }
      },

      /* ── Filter + sort ── */
      applyFilters() {
        const q = document.getElementById('search-input').value.trim().toLowerCase();
        const dept = document.getElementById('filter-dept').value;
        const status = document.getElementById('filter-status').value;

        this.filtered = this.allEmployees.filter(emp => {
          if (this.pendingDeletes.has(emp.id)) return false;
          const resolvedDept = (this.employeeDeptMap && this.employeeDeptMap[emp.id]) || emp.department || '';
          if (dept && resolvedDept !== dept) return false;
          if (status && (emp.employment_status || 'Active') !== status) return false;
          if (q) {
            const resolvedTeams = ((this.employeeTeamsMap && this.employeeTeamsMap[emp.id]) || []).join(' ');
            const hay = [
              emp.employee_number, emp.first_name, emp.middle_name, emp.last_name,
              resolvedDept, resolvedTeams, emp.title, emp.email, emp.contact_number,
            ].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });

        // Sort
        this.filtered.sort((a, b) => {
          let av = a[this.sortCol] ?? '';
          let bv = b[this.sortCol] ?? '';
          if (typeof av === 'string') av = av.toLowerCase();
          if (typeof bv === 'string') bv = bv.toLowerCase();
          if (av < bv) return this.sortDir === 'asc' ? -1 : 1;
          if (av > bv) return this.sortDir === 'asc' ? 1 : -1;
          return 0;
        });

        this.page = 1;
        this.render();
        this.updateStats();
      },

      /* ── Stats ── */
      updateStats() {
        const total = this.allEmployees.length;
        const active = this.allEmployees.filter(e => (e.employment_status || 'Active') === 'Active').length;
        const inactive = this.allEmployees.filter(e => e.employment_status === 'Inactive').length;
        const resigned = this.allEmployees.filter(e => e.employment_status === 'Resigned').length;
        const terminated = this.allEmployees.filter(e => e.employment_status === 'Terminated').length;

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-active').textContent = active;
        document.getElementById('stat-inactive').textContent = inactive;
        document.getElementById('stat-resigned').textContent = resigned;
        document.getElementById('stat-terminated').textContent = terminated;
      },

      /* ── Render table ── */
      render() {
        const start = (this.page - 1) * this.pageSize;
        const slice = this.filtered.slice(start, start + this.pageSize);
        const tbody = document.getElementById('dir-tbody');

        if (slice.length === 0) {
          tbody.innerHTML = '<tr><td colspan="30" class="tbl-state">No employees found.</td></tr>';
          document.getElementById('footer-info').textContent = 'No results';
          document.getElementById('pagination').innerHTML = '';
          return;
        }

        tbody.innerHTML = slice.map(emp => this.renderRow(emp)).join('');
        this.bindRowButtons();

        // Footer
        const total = this.filtered.length;
        const end = Math.min(start + this.pageSize, total);
        document.getElementById('footer-info').textContent = `Showing ${start + 1}–${end} of ${total} employees`;
        this.renderPagination(total);
      },

      /* ── Render single row ── */
      renderRow(emp) {
        const id = emp.id;
        const isDirty = !!this.dirty[id];
        const isEdit = this.editMode;
        const statusCls = {
          'Active': 'status-active', 'Inactive': 'status-inactive',
          'Resigned': 'status-resigned', 'Terminated': 'status-terminated',
        }[emp.employment_status] || 'status-inactive';

        // Check if there's a pending change request for this field
        const req = this.pendingRequestsByEmployee[id];
        const isPending = (field) => req && req.requested_data && req.requested_data.hasOwnProperty(field);

        // Cell helper: plain or editable
        const cell = (val, field, type = 'text', grpClass = '') => {
          const raw = fmt(val);
          const pendingCls = isPending(field) ? 'cell-pending-highlight' : '';
          const pendingTitle = isPending(field) ? ' title="Pending update request. Click to view comparison."' : '';
          
          if (!isEdit) {
            return raw
              ? `<td class="${grpClass} ${pendingCls}"${pendingTitle} data-field-click="${esc(field)}" data-emp-id="${esc(id)}"><div class="line-clamp-2">${esc(raw)}</div></td>`
              : `<td class="${grpClass} ${pendingCls} cell-empty"${pendingTitle} data-field-click="${esc(field)}" data-emp-id="${esc(id)}">—</td>`;
          }
          // editable
          if (type === 'date') {
            return `<td class="${grpClass}"><input type="date" class="cell-input" data-id="${esc(id)}" data-field="${esc(field)}" value="${esc(isoDate(raw))}"></td>`;
          }
          if (type === 'number') {
            return `<td class="${grpClass}"><input type="number" step="0.01" class="cell-input" data-id="${esc(id)}" data-field="${esc(field)}" value="${esc(raw)}" style="max-width:100px;"></td>`;
          }
          return `<td class="${grpClass}"><input type="text" class="cell-input" data-id="${esc(id)}" data-field="${esc(field)}" value="${esc(raw)}"></td>`;
        };

        const cellDate = (val, field, grpClass = '') => {
          const raw = fmt(val);
          const pendingCls = isPending(field) ? 'cell-pending-highlight' : '';
          const pendingTitle = isPending(field) ? ' title="Pending update request. Click to view comparison."' : '';

          if (!isEdit) {
            return raw ? `<td class="${grpClass} ${pendingCls}"${pendingTitle} data-field-click="${esc(field)}" data-emp-id="${esc(id)}">${esc(fmtDate(raw))}</td>` : `<td class="${grpClass} ${pendingCls} cell-empty"${pendingTitle} data-field-click="${esc(field)}" data-emp-id="${esc(id)}">—</td>`;
          }
          return `<td class="${grpClass}"><input type="date" class="cell-input" data-id="${esc(id)}" data-field="${esc(field)}" value="${esc(isoDate(raw))}"></td>`;
        };

        const cellLink = (url, label, field, grpClass = '') => {
          if (!isEdit) {
            return url
              ? `<td class="${grpClass} cell-link"><a href="${esc(url)}" target="_blank">${esc(label)}</a></td>`
              : `<td class="${grpClass} cell-empty">—</td>`;
          }
          return `<td class="${grpClass}"><input type="url" class="cell-input" data-id="${esc(id)}" data-field="${esc(field)}" value="${esc(fmt(url))}" style="min-width:150px;"></td>`;
        };

        // Document cell with file upload in edit mode
        const cellDoc = (url, viewLabel, field, docType, accept = '*') => {
          if (!isEdit) {
            return url
              ? `<td class="grp-docs cell-link"><a href="${esc(url)}" target="_blank">${esc(viewLabel)}</a></td>`
              : `<td class="grp-docs cell-empty">—</td>`;
          }
          return `<td class="grp-docs"><div class="doc-upload-wrap">
            <div class="doc-upload-row">
              <label class="doc-upload-btn" title="Upload file">
                <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <input type="file" accept="${accept}" style="display:none;" onchange="App.uploadDocFile(this,'${esc(id)}','${esc(field)}','${esc(docType)}')">
              </label>
              <input type="url" class="cell-input" data-id="${esc(id)}" data-field="${esc(field)}" value="${esc(fmt(url))}" placeholder="URL" style="flex:1;min-width:110px;">
            </div>
          </div></td>`;
        };

        const salaryCell = () => {
          if (!isEdit) {
            return emp.salary != null
              ? `<td class="cell-num">${esc(fmtPHP(emp.salary))}</td>`
              : `<td class="cell-empty">—</td>`;
          }
          return `<td><input type="number" step="0.01" class="cell-input" data-id="${esc(id)}" data-field="salary" value="${esc(emp.salary ?? '')}" style="max-width:110px;"></td>`;
        };

        const assignmentCell = () => {
          const val = emp.assignment || '';
          if (!isEdit) {
            return val ? `<td>${esc(val)}</td>` : `<td class="cell-empty">—</td>`;
          }
          const opts = App.assignments.map(a =>
            `<option value="${esc(a.name)}" ${val === a.name ? 'selected' : ''}>${esc(a.name)}</option>`
          ).join('');
          return `<td><select class="cell-input cell-select" data-id="${esc(id)}" data-field="assignment">
            <option value="">— None —</option>${opts}
          </select></td>`;
        };

        const shiftDaysCell = () => {
          const val = emp.shift_days || '';
          let temp = val;
          const daysList = [];
          ['Th', 'Su'].forEach(d => {
            if (temp.includes(d)) {
              daysList.push(d);
              temp = temp.replace(new RegExp(d, 'g'), '');
            }
          });
          ['M', 'T', 'W', 'F', 'S'].forEach(d => {
            if (temp.includes(d)) {
              daysList.push(d);
            }
          });
          
          if (!isEdit) {
            const dayLabels = ['M', 'T', 'W', 'Th', 'F', 'S', 'Su'];
            const pills = dayLabels.map(d => {
              const active = daysList.includes(d);
              return `<span class="day-pill ${active ? 'active' : ''}">${d}</span>`;
            }).join('');
            return `<td class="grp-hr"><div class="day-pills-wrap">${pills}</div></td>`;
          }
          
          const dayLabels = ['M', 'T', 'W', 'Th', 'F', 'S', 'Su'];
          const selectors = dayLabels.map(d => {
            const active = daysList.includes(d);
            return `<button type="button" class="day-selector-btn ${active ? 'active' : ''}" onclick="App.toggleShiftDay(this, '${esc(id)}', '${d}')">${d}</button>`;
          }).join('');
          
          return `<td class="grp-hr">
            <div class="day-selectors-wrap">${selectors}</div>
            <input type="hidden" class="cell-input" data-id="${esc(id)}" data-field="shift_days" value="${esc(val)}">
          </td>`;
        };

        const shiftTimeCell = () => {
          const val1 = emp.shift_time_1 || '';
          const val2 = emp.shift_time_2 || '';
          
          if (!isEdit) {
            if (!val1 && !val2) return `<td class="grp-hr cell-empty">—</td>`;
            let html = '';
            if (val1) html += `<div style="font-variant-numeric: tabular-nums;">${esc(val1)}</div>`;
            if (val2) html += `<div style="font-variant-numeric: tabular-nums;">${esc(val2)}</div>`;
            return `<td class="grp-hr"><div style="display:flex; flex-direction:column; gap:2px;">${html}</div></td>`;
          }
          
          const parts1 = val1.split('-').map(s => s.trim());
          const startParts1 = parseTimeParts(parts1[0] || '');
          const endParts1 = parseTimeParts(parts1[1] || '');
          
          const parts2 = val2.split('-').map(s => s.trim());
          const startParts2 = parseTimeParts(parts2[0] || '');
          const endParts2 = parseTimeParts(parts2[1] || '');
          
          const renderTimeSelects = (fieldName, prefix, p) => {
            const hrs = ['1','2','3','4','5','6','7','8','9','10','11','12'];
            const mins = ['00','15','30','45'];
            const periods = ['AM','PM'];
            
            const hOpts = [`<option value="" ${!p.h ? 'selected' : ''} disabled hidden>Hour</option>`, ...hrs.map(h => `<option value="${h}" ${p.h === h ? 'selected' : ''}>${h}</option>`)].join('');
            const mOpts = [`<option value="" ${!p.m ? 'selected' : ''} disabled hidden>Min</option>`, ...mins.map(m => `<option value="${m}" ${p.m === m ? 'selected' : ''}>${m}</option>`)].join('');
            const pOpts = [`<option value="" ${!p.p ? 'selected' : ''} disabled hidden>AM/PM</option>`, ...periods.map(pe => `<option value="${pe}" ${p.p === pe ? 'selected' : ''}>${pe}</option>`)].join('');
            
            return `
              <div class="time-part-wrap" data-prefix="${prefix}" style="display:inline-flex; gap:2px;">
                <select class="cell-input cell-select time-h" data-field="${fieldName}" onchange="App.updateTimeRange(this, '${esc(id)}', '${fieldName}')" style="min-width: 62px; padding-right: 1.1rem; background-position: right 0.25rem center; font-size: 0.78rem;">${hOpts}</select>
                <select class="cell-input cell-select time-m" data-field="${fieldName}" onchange="App.updateTimeRange(this, '${esc(id)}', '${fieldName}')" style="min-width: 58px; padding-right: 1.1rem; background-position: right 0.25rem center; font-size: 0.78rem;">${mOpts}</select>
                <select class="cell-input cell-select time-p" data-field="${fieldName}" onchange="App.updateTimeRange(this, '${esc(id)}', '${fieldName}')" style="min-width: 68px; padding-right: 1.1rem; background-position: right 0.25rem center; font-size: 0.78rem;">${pOpts}</select>
              </div>
            `;
          };
          
          const hasSecondShift = !!val2;
          
          return `<td class="grp-hr" style="max-width: 480px; min-width: 440px;">
            <div style="display:flex; flex-direction:column; gap:6px; width: 100%;">
              <!-- Shift 1 -->
              <div class="time-range-wrap" style="gap: 0.25rem; display:flex; align-items:center;">
                <span style="font-size:0.7rem; font-weight:700; color:var(--text-muted); min-width:40px;">Shift 1:</span>
                ${renderTimeSelects('shift_time_1', 'start', startParts1)}
                <span class="time-range-sep">to</span>
                ${renderTimeSelects('shift_time_1', 'end', endParts1)}
              </div>
              <input type="hidden" class="cell-input main-time-input" data-id="${esc(id)}" data-field="shift_time_1" value="${esc(val1)}">
              
              <!-- Shift 2 Wrap -->
              <div class="second-shift-inputs-wrap" style="display: ${hasSecondShift ? 'flex' : 'none'}; align-items:center; gap: 0.25rem;">
                <span style="font-size:0.7rem; font-weight:700; color:var(--text-muted); min-width:40px;">Shift 2:</span>
                ${renderTimeSelects('shift_time_2', 'start', startParts2)}
                <span class="time-range-sep">to</span>
                ${renderTimeSelects('shift_time_2', 'end', endParts2)}
                <button type="button" class="btn-row btn-delete" onclick="App.hideSecondShift(this, '${esc(id)}')" title="Remove 2nd shift" style="margin-left:4px; padding:2px 4px; height:24px; display:inline-flex; align-items:center; justify-content:center;">
                  <svg viewBox="0 0 24 24" style="width:12px; height:12px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <input type="hidden" class="cell-input main-time-input" data-id="${esc(id)}" data-field="shift_time_2" value="${esc(val2)}">
              
              <!-- Add Shift Button -->
              <button type="button" class="add-shift-btn btn-row" onclick="App.showSecondShift(this, '${esc(id)}')" style="display: ${hasSecondShift ? 'none' : 'inline-flex'}; align-items:center; gap:4px; width:fit-content; color:var(--cyan-light); border-color:var(--cyan-border); background:var(--cyan-dim); padding:0.2rem 0.5rem; font-size:0.72rem; border-radius:4px; cursor:pointer;">
                <svg viewBox="0 0 24 24" style="width:10px; height:10px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add 2nd shift
              </button>
            </div>
          </td>`;
        };

        const statusCell = () => {
          const statusVal = emp.employment_status || 'Active';
          if (!isEdit) {
            return `<td><span class="status-badge ${statusCls}">${esc(statusVal)}</span></td>`;
          }
          return `<td><select class="cell-input cell-select" data-id="${esc(id)}" data-field="employment_status">
            ${['Active', 'Inactive', 'Resigned', 'Terminated'].map(s =>
            `<option ${statusVal === s ? 'selected' : ''}>${s}</option>`
          ).join('')}
          </select></td>`;
        };

        const departmentCell = () => {
          const deptName = (this.employeeDeptMap && this.employeeDeptMap[id]) || emp.department || '';
          return deptName
            ? `<td class="grp-hr">${esc(deptName)}</td>`
            : `<td class="grp-hr cell-empty">—</td>`;
        };

        const teamsCell = () => {
          const teamsList = (this.employeeTeamsMap && this.employeeTeamsMap[id]) || [];
          return teamsList.length > 0
            ? `<td class="grp-hr">${esc(teamsList.join(', '))}</td>`
            : `<td class="grp-hr cell-empty">—</td>`;
        };

        const reportingToCell = () => {
          const mgrId = (this.reportingToMap && this.reportingToMap[id]) || emp.reporting_to;
          if (mgrId) {
            const mgr = this.allEmployees.find(e => e.id === mgrId);
            if (mgr) {
              const formattedName = `${mgr.first_name} ${mgr.last_name ? mgr.last_name[0] + '.' : ''}`;
              return `<td class="grp-hr">${esc(formattedName)}</td>`;
            }
          }
          return `<td class="grp-hr cell-empty">—</td>`;
        };

        /* Employee number cell — editable in edit mode */
        const cellEmpNum = () => {
          if (!isEdit) {
            return `<td class="col-num cell-emp-num">${esc(emp.employee_number)}</td>`;
          }
          return `<td class="col-num"><input type="text" class="cell-input" data-id="${esc(id)}" data-field="employee_number" value="${esc(emp.employee_number)}" style="min-width:90px;max-width:110px;font-family:var(--font-mono,monospace);font-weight:700;"></td>`;
        };

        /* Profile picture column — thumbnail + "No Image" fallback */
        const cellPicture = () => {
          const url = emp.picture_link;
          if (!isEdit) {
            if (url) {
              return `<td class="grp-docs"><div class="cell-pic">
                <img class="emp-avatar" src="${esc(url)}" alt="Photo" loading="lazy"
                  onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                <span class="emp-avatar-placeholder" style="display:none;">${esc(initials(emp))}</span>
                <a href="${esc(url)}" target="_blank" style="font-size:0.72rem;color:var(--cyan-light);">View</a>
              </div></td>`;
            }
            return `<td class="grp-docs"><div class="cell-pic">
              <span class="emp-avatar-placeholder">${esc(initials(emp))}</span>
              <span class="no-image-label">No Image</span>
            </div></td>`;
          }
          // Edit mode: file upload + URL input
          return `<td class="grp-docs"><div class="doc-upload-wrap">
            <div class="doc-upload-row">
              <label class="doc-upload-btn" title="Upload photo">
                <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <input type="file" accept="image/*" style="display:none;" onchange="App.uploadDocFile(this,'${esc(id)}','picture_link','photo')">
              </label>
              <input type="url" class="cell-input" data-id="${esc(id)}" data-field="picture_link" value="${esc(fmt(url))}" placeholder="URL" style="flex:1;min-width:110px;">
            </div>
          </div></td>`;
        };

        let actionBtns = '';
        if (isEdit) {
          actionBtns = `<div class="row-actions">
              <button class="btn-row btn-delete" data-id="${esc(id)}" data-name="${esc(fullName(emp) || emp.employee_number)}" title="Delete employee record">
                <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            </div>`;
        } else {
          const emailLower = (emp.email || '').toLowerCase().trim();
          const isUser = emailLower && (this.activeUserEmails.has(emailLower) || this.invitedEmails.has(emailLower));
          if (emailLower && !isUser) {
            actionBtns = `<div class="row-actions" style="justify-content: center;">
                <button class="btn-row" style="color: var(--cyan-light); border-color: var(--cyan-border); background: var(--cyan-dim); padding: 0.35rem 0.65rem;" onclick="App.openInviteModal('${esc(emailLower)}', '${esc(fullName(emp))}')">
                  Invite as user
                </button>
              </div>`;
          } else {
            actionBtns = `<div class="row-actions" style="justify-content: center;"><span style="color: var(--text-muted); font-size: 0.75rem;">—</span></div>`;
          }
        }

        return `<tr data-id="${esc(id)}" class="${isDirty ? 'row-dirty' : ''}">
          ${cellEmpNum()}
          ${cell(emp.first_name, 'first_name', 'text', 'grp-personal col-first-name')}
          ${cell(emp.middle_name, 'middle_name', 'text', 'col-middle-name')}
          ${cell(emp.last_name, 'last_name', 'text', 'col-last-name')}
          ${cellDate(emp.date_of_birth, 'date_of_birth', 'grp-personal')}
          ${cell(emp.address, 'address', 'text', 'grp-personal col-address')}
          ${cell(emp.contact_number, 'contact_number', 'text', 'grp-personal col-contact')}
          ${cell(emp.emergency_contact_number, 'emergency_contact_number', 'text', 'grp-personal')}
          ${cell(emp.email, 'email', 'text', 'grp-personal col-email')}
          ${departmentCell()}
          ${teamsCell()}
          ${cell(emp.title, 'title')}
          ${cell(emp.work_email, 'work_email')}
          ${reportingToCell()}
          ${cell(emp.level, 'level')}
          ${cell(emp.job_description, 'job_description')}
          ${cellDate(emp.date_hired, 'date_hired')}
          ${statusCell()}
          ${salaryCell()}
          ${assignmentCell()}
          ${shiftDaysCell()}
          ${shiftTimeCell()}
          ${cell(emp.tin, 'tin', 'text', 'grp-gov')}
          ${cell(emp.sss, 'sss')}
          ${cell(emp.pagibig, 'pagibig')}
          ${cell(emp.philhealth, 'philhealth')}
          ${cellPicture()}
          ${cellDoc(emp.gov_id_link, 'View', 'gov_id_link', 'govid', 'image/*,.pdf')}
          ${cellDoc(emp.cv_link,     'View', 'cv_link',     'cv',    '.pdf,.doc,.docx')}
          ${cellDoc(emp.id_link,     'View', 'id_link',     'id',    'image/*,.pdf')}
          <td class="grp-docs">
            ${(() => {
              const text = emp.payout_details || '';
              const imgUrl = emp.payout_details_image || '';
              if (!isEdit) {
                if (!text && !imgUrl) return `<span class="cell-empty">—</span>`;
                let cellHtml = `<div style="font-size:0.75rem; white-space:pre-wrap; line-height:1.2; font-weight:500;">${esc(text)}</div>`;
                if (imgUrl) {
                  cellHtml += `<a href="${esc(imgUrl)}" target="_blank" style="font-size:0.72rem; color:var(--cyan-light); font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:2px; margin-top:2px;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    QR Code
                  </a>`;
                }
                return cellHtml;
              }
              return `
                <textarea class="cell-input" data-id="${esc(id)}" data-field="payout_details" placeholder="Account Details" style="min-width:140px; height:40px; font-size:0.75rem; padding:4px; resize:vertical; display:block; margin-bottom:4px; background:var(--bg-surface); border:1px solid var(--border); border-radius:4px; color:var(--text-primary); outline:none;">${esc(fmt(text))}</textarea>
                <div class="doc-upload-wrap">
                  <div class="doc-upload-row">
                    <label class="doc-upload-btn" title="Upload QR Code">
                      <svg viewBox="0 0 24 24" style="width:10px; height:10px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      <input type="file" accept="image/*" style="display:none;" onchange="App.uploadDocFile(this,'${esc(id)}','payout_details_image','qr')">
                    </label>
                    <input type="url" class="cell-input" data-id="${esc(id)}" data-field="payout_details_image" value="${esc(fmt(imgUrl))}" placeholder="QR URL" style="flex:1;min-width:90px; font-size:0.72rem; padding: 2px 4px; height: 20px;">
                  </div>
                </div>
              `;
            })()}
          </td>
          <td class="col-actions">${actionBtns}</td>
        </tr>`;
      },

      /* ── Bind row buttons ── */
      bindRowButtons() {
        // Delete buttons (per-row, edit mode only)
        document.querySelectorAll('.btn-delete').forEach(btn => {
          btn.addEventListener('click', () => this.promptDelete(btn.dataset.id, btn.dataset.name));
        });

        // Track changes on cell inputs
        document.querySelectorAll('.cell-input').forEach(inp => {
          const track = () => {
            const id = inp.dataset.id;
            const field = inp.dataset.field;
            if (!this.dirty[id]) this.dirty[id] = {};
            this.dirty[id][field] = inp.value;
            const row = document.querySelector(`tr[data-id="${id}"]`);
            if (row) row.classList.add('row-dirty');
            this.updateDirtyInfo();
          };
          inp.addEventListener('input', track);
          inp.addEventListener('change', track);
        });

        // Bind clicks on pending cell highlights
        document.querySelectorAll('[data-field-click]').forEach(cell => {
          cell.addEventListener('click', () => {
            const empId = cell.dataset.empId;
            const req = this.pendingRequestsByEmployee[empId];
            if (req) {
              this.openReviewModal(req);
            }
          });
        });
      },

      /* ── Save single row ── */
      async saveRow(id) {
        const changes = this.dirty[id];
        if (!changes || Object.keys(changes).length === 0) {
          toast('No changes to save.', 'info');
          return;
        }
        // Optimistically update local data
        const emp = this.allEmployees.find(e => e.id === id);
        if (!emp) return;
        const origCopy = { ...emp };
        Object.assign(emp, changes);

        try {
          await sbPatch(id, changes);
          delete this.dirty[id];
          this.updateDirtyInfo();
          this.applyFilters();
          toast('Saved successfully.', 'success');
        } catch (err) {
          // Revert
          Object.assign(emp, origCopy);
          toast('Save failed: ' + err.message, 'error');
        }
      },

      /* ── Discard single row changes ── */
      discardRow(id) {
        delete this.dirty[id];
        this.updateDirtyInfo();
        this.render();
      },

      /* ── Save all dirty rows ── */
      async uploadDocFile(input, empId, field, docType) {
        const file = input.files[0];
        if (!file) return;
        const label = input.closest('.doc-upload-btn');
        const urlInput = input.closest('td').querySelector(`.cell-input[data-field="${field}"]`);
        const origHtml = label ? label.innerHTML : '';
        if (label) label.innerHTML = '<span style="font-size:0.7rem;padding:0 2px;">…</span>';
        try {
          const base64 = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(file);
          });
          const r = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileBase64: base64, fileName: file.name, category: 'employees', refId: empId, type: docType, companyId: this.companyId || 'general' })
          });
          if (!r.ok) throw new Error('Upload failed');
          const data = await r.json();
          if (urlInput) {
            urlInput.value = data.url;
            urlInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          toast('File uploaded!', 'success');
        } catch(e) {
          toast('Upload error: ' + e.message, 'error');
        } finally {
          if (label) label.innerHTML = origHtml;
          input.value = '';
        }
      },

      async saveAll() {
        const ids = Object.keys(this.dirty);
        const deletes = Array.from(this.pendingDeletes);

        if (ids.length === 0 && deletes.length === 0) {
          toast('No changes to save.', 'info');
          this.editMode = false;
          const bar = document.getElementById('edit-mode-bar');
          if (bar) bar.classList.remove('active');
          const toggleBtn = document.getElementById('btn-edit-toggle');
          if (toggleBtn) toggleBtn.classList.remove('btn-edit-active');
          this.render();
          return;
        }

        toast('Saving changes...', 'info');
        let saved = 0, failed = 0;

        // 1. Process pending deletes
        for (const id of deletes) {
          try {
            await sbDelete(id);
            this.allEmployees = this.allEmployees.filter(e => e.id !== id);
            this.pendingDeletes.delete(id);
            saved++;
          } catch (err) {
            failed++;
            console.error('Delete failed for ID:', id, err);
          }
        }

        // 2. Process updates and inserts
        for (const id of ids) {
          try {
            const changes = this.dirty[id];
            const emp = this.allEmployees.find(e => e.id === id);
            if (!emp) continue;

            const merged = { ...emp, ...changes };

            if (String(id).startsWith('new_')) {
              // Perform INSERT
              const { id: _, isNewRow: __, ...insertBody } = merged;
              // Only null out UUID/date/numeric columns when empty — text columns stay as ''
              // to satisfy NOT NULL constraints on the table
              const nullIfEmpty = ['reporting_to', 'date_of_birth', 'date_hired', 'salary', 'level'];
              for (const key of nullIfEmpty) {
                if (insertBody[key] === '' || insertBody[key] === undefined) insertBody[key] = null;
              }
              if (insertBody.level !== null && insertBody.level !== undefined) {
                insertBody.level = parseInt(insertBody.level, 10);
                if (isNaN(insertBody.level)) insertBody.level = null;
              }
              if (insertBody.salary !== null && insertBody.salary !== undefined) {
                insertBody.salary = parseFloat(insertBody.salary);
                if (isNaN(insertBody.salary)) insertBody.salary = null;
              }
              // Inject company_id required by RLS policy
              if (this.companyId) insertBody.company_id = this.companyId;
              // Required field fallbacks
              if (!insertBody.first_name)  insertBody.first_name  = '';
              if (!insertBody.last_name)   insertBody.last_name   = '';
              if (!insertBody.date_of_birth) insertBody.date_of_birth = '2000-01-01';
              if (!insertBody.email) insertBody.email = `${(insertBody.employee_number || 'emp').toLowerCase()}@brightkey.com`;
              if (!insertBody.date_hired) insertBody.date_hired = new Date().toISOString().split('T')[0];

              const insertedRows = await sbInsert(insertBody);
              if (insertedRows && insertedRows.length > 0) {
                const realRecord = insertedRows[0];
                const idx = this.allEmployees.findIndex(e => e.id === id);
                if (idx !== -1) {
                  this.allEmployees[idx] = realRecord;
                }
                delete this.dirty[id];
                saved++;
              } else {
                throw new Error('No data returned from insert');
              }
            } else {
              // Perform PATCH
              const patchBody = {};
              for (const key in changes) {
                if (key !== 'id' && key !== 'isNewRow') {
                  let val = changes[key];
                  if (key === 'reporting_to' || key === 'date_of_birth' || key === 'date_hired' || key === 'salary' || key === 'level') {
                    if (val === '' || val === undefined) val = null;
                  }
                  if (key === 'level' && val !== null) {
                    val = parseInt(val, 10);
                    if (isNaN(val)) val = null;
                  }
                  if (key === 'salary' && val !== null) {
                    val = parseFloat(val);
                    if (isNaN(val)) val = null;
                  }
                  patchBody[key] = val;
                }
              }
              await sbPatch(id, patchBody);
              Object.assign(emp, changes);
              delete this.dirty[id];
              saved++;
            }
          } catch (err) {
            failed++;
            console.error('Save failed for ID:', id, err);
          }
        }

        this.updateDirtyInfo();
        this.updateDeptFilter();
        this.applyFilters();

        if (failed === 0) {
          toast(`Saved ${saved} change${saved !== 1 ? 's' : ''} successfully.`, 'success');
          this.editMode = false;
          const bar = document.getElementById('edit-mode-bar');
          if (bar) bar.classList.remove('active');
          const toggleBtn = document.getElementById('btn-edit-toggle');
          if (toggleBtn) toggleBtn.classList.remove('btn-edit-active');
          this.render();
        } else {
          toast(`Saved ${saved} change${saved !== 1 ? 's' : ''}, failed on ${failed} change${failed !== 1 ? 's' : ''}.`, 'error');
        }
      },

      updateDirtyInfo() {
        const n = Object.keys(this.dirty).length + this.pendingDeletes.size;
        const el = document.getElementById('edit-dirty-info');
        if (el) {
          if (n > 0) {
            el.textContent = `(${n} unsaved change${n !== 1 ? 's' : ''})`;
          } else {
            el.textContent = '(No unsaved changes)';
          }
        }
      },

      /* ── Delete ── */
      promptDelete(id, name) {
        this.pendingDeleteId = id;
        document.getElementById('confirm-emp-label').textContent = name;
        document.getElementById('confirm-overlay').classList.add('open');
      },
      confirmDelete() {
        const id = this.pendingDeleteId;
        if (!id) return;
        document.getElementById('confirm-overlay').classList.remove('open');
        
        if (String(id).startsWith('new_')) {
          this.allEmployees = this.allEmployees.filter(e => e.id !== id);
          delete this.dirty[id];
        } else {
          this.pendingDeletes.add(id);
          delete this.dirty[id];
        }

        this.updateDirtyInfo();
        this.applyFilters();
        this.updateStats();
        toast('Employee marked for deletion. Click Save Changes to apply.', 'info');
        this.pendingDeleteId = null;
      },
      bindDeleteConfirm() {
        document.getElementById('confirm-delete').addEventListener('click', () => this.confirmDelete());
        document.getElementById('confirm-cancel').addEventListener('click', () => {
          this.pendingDeleteId = null;
          document.getElementById('confirm-overlay').classList.remove('open');
        });
        document.getElementById('confirm-overlay').addEventListener('click', e => {
          if (e.target === document.getElementById('confirm-overlay')) {
            this.pendingDeleteId = null;
            document.getElementById('confirm-overlay').classList.remove('open');
          }
        });
      },

      /* ── Pagination ── */
      renderPagination(total) {
        const pages = Math.ceil(total / this.pageSize);
        if (pages <= 1) { document.getElementById('pagination').innerHTML = ''; return; }

        let html = `<button class="page-btn" id="pg-prev" ${this.page === 1 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </button>`;

        for (let i = 1; i <= pages; i++) {
          if (pages > 7 && Math.abs(i - this.page) > 2 && i !== 1 && i !== pages) {
            if (i === 2 || i === pages - 1) html += `<span class="page-btn" style="cursor:default;border:none;color:var(--text-muted)">…</span>`;
            continue;
          }
          html += `<button class="page-btn${i === this.page ? ' active' : ''}" data-page="${i}">${i}</button>`;
        }

        html += `<button class="page-btn" id="pg-next" ${this.page === pages ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
        </button>`;

        const el = document.getElementById('pagination');
        el.innerHTML = html;

        el.querySelectorAll('[data-page]').forEach(btn => {
          btn.addEventListener('click', () => { this.page = +btn.dataset.page; this.render(); });
        });
        const prev = document.getElementById('pg-prev');
        const next = document.getElementById('pg-next');
        if (prev) prev.addEventListener('click', () => { if (this.page > 1) { this.page--; this.render(); } });
        if (next) next.addEventListener('click', () => { if (this.page < pages) { this.page++; this.render(); } });
      },

      /* ── Toolbar bindings ── */
      bindToolbar() {
        ['search-input', 'filter-dept', 'filter-status'].forEach(id => {
          document.getElementById(id)?.addEventListener('input', () => this.applyFilters());
          document.getElementById(id)?.addEventListener('change', () => this.applyFilters());
        });
        document.getElementById('btn-refresh').addEventListener('click', () => this.load());

        // Sortable headers
        document.querySelectorAll('.dir-table th.sortable').forEach(th => {
          th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (this.sortCol === col) {
              this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
              this.sortCol = col;
              this.sortDir = 'asc';
            }
            this.updateSortHeaders();
            this.applyFilters();
          });
        });

        // Add Employee button
        const btnAdd = document.getElementById('btn-add-employee');
        if (btnAdd) {
          btnAdd.addEventListener('click', () => {
            this.openAddEmployeeModal();
          });
        }
      },

      bindEditMode() {
        const bar = document.getElementById('edit-mode-bar');
        const toggleBtn = document.getElementById('btn-edit-toggle');

        toggleBtn.addEventListener('click', async () => {
          this.editMode = !this.editMode;
          bar.classList.toggle('active', this.editMode);
          toggleBtn.classList.toggle('btn-edit-active', this.editMode);
          if (this.editMode) this.updateDirtyInfo();
          else {
            // Confirm discard if dirty or has pending deletes
            if (Object.keys(this.dirty).length > 0 || this.pendingDeletes.size > 0) {
              const ok = await BKDialog.ask({
                title: 'Discard Changes',
                message: 'Discard all unsaved changes?',
                okText: 'Discard',
                danger: true
              });
              if (!ok) {
                this.editMode = true;
                bar.classList.add('active');
                toggleBtn.classList.add('btn-edit-active');
                return;
              }
              this.dirty = {};
              this.pendingDeletes.clear();
            }
          }
          this.render();
        });

        document.getElementById('btn-save-edit').addEventListener('click', () => this.saveAll());

        document.getElementById('btn-cancel-edit').addEventListener('click', async () => {
          if (Object.keys(this.dirty).length > 0 || this.pendingDeletes.size > 0) {
            const ok = await BKDialog.ask({
              title: 'Discard Changes',
              message: 'Discard all unsaved changes?',
              okText: 'Discard',
              danger: true
            });
            if (!ok) return;
          }
          this.dirty = {};
          this.pendingDeletes.clear();
          this.editMode = false;
          bar.classList.remove('active');
          document.getElementById('btn-edit-toggle').classList.remove('btn-edit-active');
          this.render();
        });
      },

      bindExport() {
        document.getElementById('btn-export').addEventListener('click', () => {
          const cols = [
            ['employee_number', 'Emp #'], ['department', 'Department'], ['team', 'Team'], ['title', 'Title'],
            ['reporting_to', 'Reporting To'], ['level', 'Level'], ['job_description', 'Job Description'],
            ['date_hired', 'Date Hired'], ['employment_status', 'Status'], ['salary', 'Salary'],
            ['first_name', 'First Name'], ['middle_name', 'Middle Name'], ['last_name', 'Last Name'],
            ['date_of_birth', 'Date of Birth'], ['address', 'Address'],
            ['contact_number', 'Contact #'], ['emergency_contact_number', 'Emergency Contact'],
            ['email', 'Email'], ['tin', 'TIN'], ['sss', 'SSS'],
            ['pagibig', 'PAG-IBIG'], ['philhealth', 'PhilHealth'],
            ['work_email', 'Work Email'], ['assignment', 'Assignment'], ['shift_days', 'Shift Days'], ['shift_time_1', 'Shift 1 Range'], ['shift_time_2', 'Shift 2 Range'], ['picture_link', 'Picture Link'], ['gov_id_link', "Gov't ID Link"], ['cv_link', 'CV Link'], ['id_link', 'ID Link'], ['payout_details', 'Payout Details'], ['payout_details_image', 'Payout Details Image'],
          ];
          const header = cols.map(c => `"${c[1]}"`).join(',');
          const rows = this.filtered.map(emp =>
            cols.map(([k]) => {
              let v = emp[k] ?? '';
              if (k === 'department') {
                const deptName = (this.employeeDeptMap && this.employeeDeptMap[emp.id]) || emp.department || '';
                v = deptName;
              } else if (k === 'team') {
                const teamsList = (this.employeeTeamsMap && this.employeeTeamsMap[emp.id]) || [];
                v = teamsList.join(', ');
              } else if (k === 'reporting_to') {
                const mgrId = (this.reportingToMap && this.reportingToMap[emp.id]) || emp.reporting_to;
                if (mgrId) {
                  const mgr = this.allEmployees.find(e => e.id === mgrId);
                  if (mgr) {
                    v = `${mgr.first_name} ${mgr.last_name ? mgr.last_name[0] + '.' : ''}`;
                  } else {
                    v = '';
                  }
                } else {
                  v = '';
                }
              }
              return `"${String(v).replace(/"/g, '""')}"`;
            }).join(',')
          );
          const csv = [header, ...rows].join('\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `employee-directory-${new Date().toISOString().slice(0, 10)}.csv`;
          a.click(); URL.revokeObjectURL(url);
          toast('CSV exported.', 'success');
        });
      },

      /* ── Tabs Management ── */
      switchTab(tab) {
        document.getElementById('tab-btn-directory').classList.toggle('active', tab === 'directory');
        document.getElementById('tab-btn-requests').classList.toggle('active', tab === 'requests');
        
        document.getElementById('directory-panel').style.display = (tab === 'directory') ? 'block' : 'none';
        document.getElementById('requests-panel').style.display = (tab === 'requests') ? 'block' : 'none';
      },

      renderRequestsTab() {
        const tbody = document.getElementById('requests-tbody');
        const badge = document.getElementById('requests-count-badge');
        
        if (this.pendingRequests.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">No pending requests.</td></tr>';
          if (badge) badge.style.display = 'none';
          return;
        }

        if (badge) {
          badge.textContent = this.pendingRequests.length;
          badge.style.display = 'inline-block';
        }

        tbody.innerHTML = this.pendingRequests.map(r => {
          const emp = r.employees || {};
          const name = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Unknown Employee';
          const fields = Object.keys(r.requested_data || {}).map(f => {
            return f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          }).join(', ');

          return `
            <tr style="border-bottom:1px solid var(--border);">
              <td style="padding:0.75rem 1rem; font-weight:600; color:var(--text-primary);">${esc(name)}</td>
              <td style="padding:0.75rem 1rem;">${esc(emp.email || '')}</td>
              <td style="padding:0.75rem 1rem; color:var(--text-secondary); max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(fields)}</td>
              <td style="padding:0.75rem 1rem;">${esc(fmtDate(r.created_at))}</td>
              <td style="padding:0.75rem 1rem; text-align:center;">
                <button class="btn btn-cyan btn-sm" onclick="App.openReviewModalById('${esc(r.id)}')" style="padding:0.3rem 0.6rem; font-size:0.75rem;">Review</button>
              </td>
            </tr>
          `;
        }).join('');
      },

      openReviewModalById(id) {
        const req = this.pendingRequests.find(r => r.id === id);
        if (req) {
          this.openReviewModal(req);
        }
      },

      /* ── Review Update Requests Modal ── */
      openReviewModal(req) {
        this.currentReviewRequest = req;
        const emp = req.employees || {};
        const name = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Unknown Employee';
        
        document.getElementById('review-fullname').textContent = name;
        document.getElementById('review-email').textContent = emp.email || '';
        
        const avatarWrap = document.getElementById('review-avatar-wrap');
        if (emp.picture_link) {
          avatarWrap.innerHTML = `<img src="${emp.picture_link}" alt="${name}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
        } else {
          const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
          avatarWrap.innerHTML = initials;
        }

        // Render comparison table
        const tbody = document.getElementById('review-comparison-tbody');
        const dbEmp = this.allEmployees.find(e => e.id === req.employee_id) || {};
        
        tbody.innerHTML = Object.keys(req.requested_data || {}).map(field => {
          const label = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          let originalVal = dbEmp[field] ?? '—';
          let requestedVal = req.requested_data[field] ?? '—';
          
          if (field === 'date_of_birth') {
            if (originalVal !== '—') originalVal = fmtDate(originalVal);
            if (requestedVal !== '—') requestedVal = fmtDate(requestedVal);
          }

          return `
            <tr style="border-bottom:1px solid var(--border);">
              <td style="padding:0.6rem 0.85rem; font-weight:600; color:var(--text-primary);">${esc(label)}</td>
              <td style="padding:0.6rem 0.85rem; color:var(--text-muted);">${esc(originalVal)}</td>
              <td style="padding:0.6rem 0.85rem; color:var(--cyan-light); font-weight:600;">${esc(requestedVal)}</td>
            </tr>
          `;
        }).join('');

        // Reset rejection inputs
        document.getElementById('review-reject-box').style.display = 'none';
        document.getElementById('review-reject-reason').value = '';
        document.getElementById('review-modal-actions').style.display = 'flex';
        document.getElementById('review-reject-actions').style.display = 'none';

        document.getElementById('review-modal-overlay').style.display = 'flex';
        document.getElementById('review-modal-overlay').classList.add('open');
      },

      closeReviewModal() {
        const overlay = document.getElementById('review-modal-overlay');
        overlay.classList.remove('open');
        setTimeout(() => overlay.style.display = 'none', 200);
        this.currentReviewRequest = null;
      },

      initiateRejection() {
        document.getElementById('review-reject-box').style.display = 'flex';
        document.getElementById('review-modal-actions').style.display = 'none';
        document.getElementById('review-reject-actions').style.display = 'flex';
        document.getElementById('review-reject-reason').focus();
      },

      cancelRejection() {
        document.getElementById('review-reject-box').style.display = 'none';
        document.getElementById('review-modal-actions').style.display = 'flex';
        document.getElementById('review-reject-actions').style.display = 'none';
      },

      async submitRejection() {
        const reason = document.getElementById('review-reject-reason').value.trim();
        if (!reason) {
          toast('Please write a reason for rejection.', 'error');
          return;
        }

        if (reason.length > 150) {
          toast('Rejection reason cannot exceed 150 characters.', 'error');
          return;
        }

        const req = this.currentReviewRequest;
        if (!req) return;

        try {
          const { error } = await getSb()
            .from('employee_update_requests')
            .update({
              status: 'rejected',
              rejected_reason: reason,
              updated_at: new Date().toISOString()
            })
            .eq('id', req.id);

          if (error) throw error;

          toast('Update request rejected.', 'info');
          this.closeReviewModal();
          await this.load();
        } catch (err) {
          toast('Failed to reject: ' + err.message, 'error');
        }
      },

      async approveRequest() {
        const req = this.currentReviewRequest;
        if (!req) return;

        try {
          // 1. Update the employee's official record
          const { error: empError } = await getSb()
            .from('employees')
            .update(req.requested_data)
            .eq('id', req.employee_id);

          if (empError) throw empError;

          // 2. Mark the update request as approved
          const { error: reqError } = await getSb()
            .from('employee_update_requests')
            .update({
              status: 'approved',
              updated_at: new Date().toISOString()
            })
            .eq('id', req.id);

          if (reqError) throw reqError;

          toast('Update request approved and applied successfully.', 'success');
          this.closeReviewModal();
          await this.load();
        } catch (err) {
          toast('Failed to approve request: ' + err.message, 'error');
        }
      },

      openAddEmployeeModal() {
        // 1. Calculate next employee number
        let maxNum = 0;
        const regex = new RegExp(`^${this.employeePrefix}-(\\d+)`);
        this.allEmployees.forEach(emp => {
          const numStr = emp.employee_number || '';
          const match = numStr.match(regex) || numStr.match(/^[A-Z]{1,3}-(\d+)/);
          if (match) {
            const val = parseInt(match[1], 10);
            if (val > maxNum) maxNum = val;
          }
        });
        const nextNum = maxNum + 1;
        const formattedNum = `${this.employeePrefix}-${String(nextNum).padStart(4, '0')}`;

        // 2. Reset form
        const form = document.getElementById('add-employee-form');
        if (form) form.reset();

        // 3. Reset shift 2 container
        this.removeModalShift2();

        // 4. Set default values
        document.getElementById('new-emp-number').value = formattedNum;
        document.getElementById('new-emp-dob').value = '2000-01-01';
        document.getElementById('new-emp-date-hired').value = new Date().toISOString().split('T')[0];
        document.getElementById('new-emp-email').value = `${formattedNum.toLowerCase()}@brightkey.com`;
        document.getElementById('new-emp-status').value = 'Active';

        // 5. Open modal overlay
        const modal = document.getElementById('add-employee-modal');
        if (modal) {
          modal.style.display = 'flex';
          modal.offsetHeight; // force reflow
          modal.classList.add('open');
        }
      },

      closeAddEmployeeModal() {
        const modal = document.getElementById('add-employee-modal');
        if (modal) {
          modal.classList.remove('open');
          setTimeout(() => {
            modal.style.display = 'none';
          }, 150);
        }
      },

      showModalShift2() {
        const container = document.getElementById('new-emp-shift2-container');
        const btnWrap = document.getElementById('new-emp-add-shift-btn-wrap');
        if (container) container.style.display = 'grid';
        if (btnWrap) btnWrap.style.display = 'none';
      },

      removeModalShift2() {
        const container = document.getElementById('new-emp-shift2-container');
        const btnWrap = document.getElementById('new-emp-add-shift-btn-wrap');
        if (container) {
          container.style.display = 'none';
          document.getElementById('new-emp-shift-time2-start-h').value = '';
          document.getElementById('new-emp-shift-time2-start-m').value = '';
          document.getElementById('new-emp-shift-time2-start-p').value = '';
          document.getElementById('new-emp-shift-time2-end-h').value = '';
          document.getElementById('new-emp-shift-time2-end-m').value = '';
          document.getElementById('new-emp-shift-time2-end-p').value = '';
        }
        if (btnWrap) btnWrap.style.display = 'flex';
      },

      async uploadModalFile(input, targetInputId, docType) {
        const file = input.files[0];
        if (!file) return;
        const label = input.closest('label');
        const targetInput = document.getElementById(targetInputId);
        const origText = label ? label.innerHTML : '';
        if (label) label.innerHTML = '<span style="font-size:0.75rem;">Uploading…</span>';
        try {
          const base64 = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(file);
          });
          const refId = 'new_' + Date.now();
          const r = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileBase64: base64, fileName: file.name, category: 'employees', refId: refId, type: docType, companyId: this.companyId || 'general' })
          });
          if (!r.ok) throw new Error('Upload failed');
          const data = await r.json();
          if (targetInput) {
            targetInput.value = data.url;
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          toast('File uploaded successfully!', 'success');
        } catch(e) {
          toast('Upload error: ' + e.message, 'error');
        } finally {
          if (label) label.innerHTML = origText;
          input.value = '';
        }
      },

      async submitAddEmployeeForm() {
        const form = document.getElementById('add-employee-form');
        if (!form) return;
        if (!form.reportValidity()) return;

        toast('Saving employee...', 'info');

        const emergencyName = document.getElementById('new-emp-emergency-contact-name').value.trim();
        const emergencyPhone = document.getElementById('new-emp-emergency-contact-number').value.trim();
        const emergencyCombined = (emergencyName && emergencyPhone) ? `${emergencyName} - ${emergencyPhone}` : (emergencyName || emergencyPhone || '');

        const formatTimeRangeFromSelects = (prefix) => {
          const sh = document.getElementById(`${prefix}-start-h`).value;
          const sm = document.getElementById(`${prefix}-start-m`).value;
          const sp = document.getElementById(`${prefix}-start-p`).value;
          const eh = document.getElementById(`${prefix}-end-h`).value;
          const em = document.getElementById(`${prefix}-end-m`).value;
          const ep = document.getElementById(`${prefix}-end-p`).value;
          
          if (!sh || !sm || !sp || !eh || !em || !ep) return null;
          
          const startStr = `${String(sh).padStart(2, '0')}:${sm} ${sp}`;
          const endStr = `${String(eh).padStart(2, '0')}:${em} ${ep}`;
          return `${startStr} - ${endStr}`;
        };

        const shift_time_1 = formatTimeRangeFromSelects('new-emp-shift-time1');
        const shift_time_2 = formatTimeRangeFromSelects('new-emp-shift-time2');

        const insertBody = {
          employee_number: document.getElementById('new-emp-number').value.trim(),
          first_name: document.getElementById('new-emp-first-name').value.trim(),
          last_name: document.getElementById('new-emp-last-name').value.trim(),
          middle_name: document.getElementById('new-emp-middle-name').value.trim(),
          date_of_birth: document.getElementById('new-emp-dob').value || null,
          address: document.getElementById('new-emp-address').value.trim(),
          contact_number: document.getElementById('new-emp-contact').value.trim(),
          emergency_contact_number: emergencyCombined,
          email: document.getElementById('new-emp-email').value.trim(),
          
          department: document.getElementById('new-emp-department').value.trim(),
          title: document.getElementById('new-emp-title').value.trim(),
          level: document.getElementById('new-emp-level').value.trim() ? parseInt(document.getElementById('new-emp-level').value.trim(), 10) : null,
          reporting_to: document.getElementById('new-emp-reporting').value.trim() || null,
          employment_status: document.getElementById('new-emp-status').value,
          date_hired: document.getElementById('new-emp-date-hired').value || null,
          salary: document.getElementById('new-emp-salary').value ? parseFloat(document.getElementById('new-emp-salary').value) : null,
          job_description: document.getElementById('new-emp-description').value.trim(),
          
          tin: document.getElementById('new-emp-tin').value.trim(),
          sss: document.getElementById('new-emp-sss').value.trim(),
          pagibig: document.getElementById('new-emp-pagibig').value.trim(),
          philhealth: document.getElementById('new-emp-philhealth').value.trim(),
          picture_link: document.getElementById('new-emp-pic-link').value.trim(),
          gov_id_link: document.getElementById('new-emp-gov-link').value.trim(),
          cv_link: document.getElementById('new-emp-cv-link').value.trim(),
          
          payout_details: document.getElementById('new-emp-payout').value.trim(),
          payout_details_image: document.getElementById('new-emp-payout-image').value.trim(),
          
          shift_days: document.getElementById('new-emp-shift-days').value.trim(),
          shift_time_1: shift_time_1,
          shift_time_2: shift_time_2
        };

        // Inject company_id required by RLS policy
        if (this.companyId) {
          insertBody.company_id = this.companyId;
        }

        try {
          const insertedRows = await sbInsert(insertBody);
          if (insertedRows && insertedRows.length > 0) {
            const realRecord = insertedRows[0];
            this.allEmployees.unshift(realRecord);
            toast(`Employee ${insertBody.employee_number} saved successfully.`, 'success');
            this.closeAddEmployeeModal();
            this.applyFilters();
          } else {
            throw new Error('No data returned from insert');
          }
        } catch (err) {
          toast('Failed to save: ' + err.message, 'error');
        }
      }
    };

    /* ── Boot ── */
    App.init();

    /* ── Nav (from main.js) ── */
    if (typeof initNav === 'function') initNav();
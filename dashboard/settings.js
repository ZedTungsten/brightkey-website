    let sb;
    let currentTenantId;
    let currentUser;
    let currentCompanyId = '';
    let employeePrefix = 'BK';

    let confirmCallback = null;
    let allTeamMembers = [];

    const VISIBILITY_OPTIONS = [
      { key: 'booking.door_specifications', label: 'Booking › Door Specifications' },
      { key: 'sales.commissions', label: 'Sales › Commissions' }
    ];
    let assignments = [];

    // ── Warehouse State ──
    let warehouses = [];     // [{id, name, is_active, managers:[]}]
    let activeWarehouseId = null; // warehouse being assigned to

    document.addEventListener('DOMContentLoaded', async () => {
      const authInfo = await BKAuth.checkRoleGate([], '../admin.html');
      if (!authInfo) return;

      sb = BKAuth.sb;
      currentUser = authInfo.user;
      currentTenantId = authInfo.tenantId;

      try {
        const { data: companyData } = await sb.from('companies').select('id').eq('tenant_id', currentTenantId).limit(1);
        currentCompanyId = companyData?.[0]?.id || '';
      } catch (err) {
        console.error('Error fetching company:', err);
      }

      loadAllMembers();
      loadRolesDropdown();
      await loadAssignments();
      await loadWarehouses();

      // Fetch products to populate commissions dropdowns
      try {
        const { data: productsData } = await sb.from('products').select('sku, category, tags, business').eq('company_id', currentCompanyId);
        window.commissionsProductsData = productsData || [];
        if (productsData) {
          populateCommissionsDropdowns(productsData);
        }
      } catch (err) {
        console.error('Error fetching products for commissions:', err);
      }

      await loadCommissionsSettings();
      await loadSalesManagers();
      await populateSalesManagersDropdown();
      await loadHRSettings();
      await loadCompanySettings();
      await loadBookingSettings();
      await loadBookingMediaRequirements();

      const confirmYes = document.getElementById('btn-confirm-yes');
      if (confirmYes) {
        confirmYes.addEventListener('click', () => {
          if (confirmCallback) confirmCallback();
          closeConfirmModal();
        });
      }
    });

    // ── Confirm Modal ──
    function showConfirmModal(message, onConfirm) {
      document.getElementById('confirm-message').textContent = message;
      confirmCallback = onConfirm;
      document.getElementById('confirm-modal').classList.add('open');
    }
    function closeConfirmModal() {
      document.getElementById('confirm-modal').classList.remove('open');
      confirmCallback = null;
    }



    async function loadRolesDropdown() {
      const select = document.getElementById('invite-role');
      if (!select) return;
      select.innerHTML = '<option value="admin">Admin</option><option value="custom">User</option>';
      select.value = 'admin';
      handleRoleChange(select.value);
    }

    // ── Add Member Modal ──
    function openAddMemberModal() {
      document.getElementById('invite-email').value = '';
      document.getElementById('invite-name').value = '';
      const select = document.getElementById('invite-role');
      if (select) { select.value = 'admin'; handleRoleChange(select.value); }
      document.getElementById('admin-warning').style.display = 'none';
      document.getElementById('add-member-modal').classList.add('open');
    }
    function closeAddMemberModal() {
      document.getElementById('add-member-modal').classList.remove('open');
    }

    function handleRoleChange(role) {
      const warning = document.getElementById('admin-warning');
      if (warning) warning.style.display = (role === 'admin') ? 'block' : 'none';
      const customContainer = document.getElementById('invite-custom-access-container');
      if (customContainer) customContainer.style.display = (role === 'custom') ? 'flex' : 'none';
      document.querySelectorAll('.invite-custom-access').forEach(cb => cb.checked = (role === 'admin'));
    }

    window.handleEditRoleSelectChange = function(role) {
      const customContainer = document.getElementById('edit-custom-access-container');
      if (customContainer) customContainer.style.display = (role === 'user') ? 'flex' : 'none';
      document.querySelectorAll('.edit-custom-access').forEach(cb => cb.checked = false);
    };

    function formatDateAdded(isoString) {
      if (!isoString) return '—';
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // ── Members Loader ──
    async function loadAllMembers() {
      const tbody = document.getElementById('members-list-body');
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">Loading team members...</td></tr>`;

      let activeData = [];
      let inviteData = [];

      let employeeUserIds = new Set();
      let employeeEmails = new Set();
      try {
        const { data: empData, error: empErr } = await sb.from('employees').select('id, email').eq('company_id', currentCompanyId);
        if (!empErr && empData) {
          empData.forEach(e => {
            if (e.id) employeeUserIds.add(e.id);
            if (e.email) employeeEmails.add(e.email.toLowerCase().trim());
          });
        }
      } catch (err) { console.error('Failed to query employees for mapping:', err); }

      try {
        const { data, error } = await sb.from('tenant_members').select('id, user_email, full_name, role, user_id, created_at, accessible_modules').eq('tenant_id', currentTenantId);
        if (error && error.message && error.message.includes('full_name')) {
          const { data: d2 } = await sb.from('tenant_members').select('id, user_email, role, user_id, created_at, accessible_modules').eq('tenant_id', currentTenantId);
          activeData = (d2 || []).map(r => ({ ...r, full_name: null }));
        } else if (error) {
          console.error('tenant_members error:', error.message);
        } else {
          activeData = data || [];
        }
      } catch (err) { console.error('tenant_members fetch failed:', err); }

      // Cache team members for warehouse assign dropdown
      allTeamMembers = activeData;

      let inviteError = null;
      try {
        const { data, error } = await sb.from('company_invitations').select('id, email, full_name, role, created_at').eq('tenant_id', currentTenantId);
        if (error && error.message && error.message.includes('full_name')) {
          const { data: d2, error: e2 } = await sb.from('company_invitations').select('id, email, role, created_at').eq('tenant_id', currentTenantId);
          if (e2) { inviteError = e2.message; } else { inviteData = (d2 || []).map(r => ({ ...r, full_name: null })); }
        } else if (error) {
          inviteError = error.message;
        } else {
          inviteData = data || [];
        }
      } catch (err) { inviteError = err.message; }

      const activeEmails = new Set(activeData.map(r => (r.user_email || '').toLowerCase().trim()));
      inviteData = inviteData.filter(r => !activeEmails.has((r.email || '').toLowerCase().trim()));

      tbody.innerHTML = '';

      if (activeData.length === 0 && inviteData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">No members found. Use "Add Member" to invite your first team member.</td></tr>`;
        return;
      }

      activeData.forEach(row => {
        const tr = document.createElement('tr');
        const isSelf = row.user_id === currentUser.id;
        const isOwner = row.role === 'owner';

        // Build role display from accessible_modules (new system)
        const rowModules = Array.isArray(row.accessible_modules) ? row.accessible_modules : [];
        let roleInnerHtml = '';
        if (row.role === 'owner') {
          roleInnerHtml = `<span class="badge badge-cyan">Owner</span>`;
        } else if (row.role === 'admin') {
          roleInnerHtml = `<span class="badge badge-cyan">Administrator</span>`;
        } else {
          const listItems = rowModules.length
            ? rowModules.map(m => `<li style="font-weight:400; color:var(--text-secondary); margin-bottom:0.1rem;">${escapeHtml(m)}</li>`).join('')
            : '<li style="font-weight:400; color:var(--text-muted);">No Access</li>';
          roleInnerHtml = `<div><div style="font-weight:700; color:var(--text-primary);">User</div><ul style="margin:0.2rem 0 0 0.5rem; padding-left:0.75rem; list-style-type:disc; font-size:0.8rem;">${listItems}</ul></div>`;
        }

        let roleCell = '';
        if (isOwner || isSelf) {
          roleCell = roleInnerHtml;
        } else {
          const modulesEncoded = encodeURIComponent(JSON.stringify(rowModules));
          roleCell = `<div style="display:flex; align-items:flex-start; justify-content:space-between; width:100%; gap:0.5rem;">${roleInnerHtml}<button type="button" style="background:none; border:none; color:var(--text-muted); cursor:pointer; display:inline-flex; align-items:center; padding:2px; margin-top:2px; vertical-align:middle; transition:color 0.15s;" onmouseover="this.style.color='var(--cyan-light)'" onmouseout="this.style.color='var(--text-muted)'" onclick="openEditRoleModal('${row.id}', '${escapeHtml(row.user_email)}', '${escapeHtml(row.full_name || '')}', '${escapeHtml(row.role || '')}', decodeURIComponent('${modulesEncoded}'))" title="Edit Access"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button></div>`;
        }

        const isEmployee = (row.user_id && employeeUserIds.has(row.user_id)) || (row.user_email && employeeEmails.has(row.user_email.toLowerCase().trim()));

        let actionsCellHtml = '';
        if (!isEmployee) {
          actionsCellHtml += `<button class="btn btn-outline btn-sm" style="color: var(--cyan-light); border-color: var(--cyan-border); padding: 0.35rem 0.65rem;" onclick="addToDirectory('${row.user_id || ''}', '${escapeHtml(row.user_email || '')}', '${escapeHtml(row.full_name || '')}')">Add to Directory</button>`;
        }
        if (!isOwner && !isSelf) {
          actionsCellHtml += `<button class="btn btn-danger" style="padding: 0.35rem 0.65rem;" onclick="removeMember('${row.id}')">Remove</button>`;
        }
        if (actionsCellHtml === '') {
          actionsCellHtml = '<span style="color:var(--text-muted);font-size:0.75rem;">—</span>';
        } else {
          actionsCellHtml = `<div style="display:flex; flex-direction:column; align-items:center; gap:0.35rem;">${actionsCellHtml}</div>`;
        }

        const resetPasswordBtn = row.user_email
          ? `<button class="btn btn-outline" style="padding:0.3rem 0.65rem;font-size:0.75rem;" onclick="sendResetPassword('${row.user_email}')">Send Reset Password</button>`
          : '<span style="color:var(--text-muted);font-size:0.75rem;">—</span>';

        tr.innerHTML = `
          <td><div style="font-weight:600;">${row.user_email || 'No email registered'}</div>${isSelf ? '<div style="font-size:0.75rem;color:var(--text-muted);">You</div>' : ''}</td>
          <td>${row.full_name || '—'}</td>
          <td>${roleCell}</td>
          <td>${formatDateAdded(row.created_at)}</td>
          <td><span class="badge badge-green">Active</span></td>
          <td style="text-align:center; white-space:nowrap;">${actionsCellHtml}</td>
          <td style="text-align:center;"><span style="color:var(--text-muted);font-size:0.75rem;">—</span></td>
          <td style="text-align:center;">${resetPasswordBtn}</td>
        `;
        tbody.appendChild(tr);
      });

      if (inviteError) {
        const errTr = document.createElement('tr');
        errTr.innerHTML = `<td colspan="8" style="padding:1rem; background:rgba(220,38,38,0.04); border-top:1px solid rgba(220,38,38,0.15);"><div style="display:flex;align-items:flex-start;gap:0.6rem;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><div><div style="font-size:0.8rem;font-weight:700;color:#B91C1C;">Could not load pending invitations</div><div style="font-size:0.75rem;color:#6B7280;margin-top:0.2rem;">${inviteError}</div></div></div></td>`;
        tbody.appendChild(errTr);
      }

      inviteData.forEach(row => {
        const tr = document.createElement('tr');
        tr.style.background = 'rgba(217,119,6,0.03)';
        let inviteRoleCell = '';
        if (row.role === 'admin') inviteRoleCell = `<span class="badge badge-gray">Administrator</span>`;
        else if (row.role && row.role.startsWith('access:')) {
          const mods = row.role.substring(7).split(',').map(s => s.trim());
          inviteRoleCell = `<div><div style="font-weight:700; color:var(--text-primary);">User</div><ul style="margin:0.2rem 0 0 0.5rem; padding-left:0.75rem; list-style-type:disc; font-size:0.8rem;">${mods.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul></div>`;
        } else {
          inviteRoleCell = `<span class="badge badge-gray">${escapeHtml(row.role || 'None')}</span>`;
        }
        tr.innerHTML = `
          <td><div style="font-weight:600;">${row.email}</div><div style="font-size:0.72rem;color:var(--text-muted);">Awaiting registration</div></td>
          <td>${row.full_name || '—'}</td>
          <td>${inviteRoleCell}</td>
          <td>${formatDateAdded(row.created_at)}</td>
          <td><span class="badge badge-orange">Invited</span></td>
          <td style="text-align:center;"><button class="btn btn-danger" style="padding:0.3rem 0.65rem;font-size:0.75rem;" onclick="cancelInvitation('${row.id}')">Cancel</button></td>
          <td style="text-align:center;"><button class="btn btn-outline" style="padding:0.3rem 0.75rem;font-size:0.78rem;gap:0.35rem;" onclick="copyInviteLink('${row.email}', '${row.role}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy Invitation Link</button></td>
          <td style="text-align:center;"><span style="color:var(--text-muted);font-size:0.75rem;">—</span></td>
        `;
        tbody.appendChild(tr);
      });
    }

    // ── Invitation Send ──
    async function sendInvitation(e) {
      e.preventDefault();
      const emailInput = document.getElementById('invite-email');
      const nameInput = document.getElementById('invite-name');
      const roleSelect = document.getElementById('invite-role');
      const btn = document.getElementById('btn-submit-invite');

      const email = emailInput.value.trim().toLowerCase();
      const fullName = nameInput.value.trim();
      let role = roleSelect.value;
      if (!email || !fullName) return;

      btn.disabled = true;
      btn.innerText = 'Inviting...';

      if (role === 'custom') {
        const checkedModules = Array.from(document.querySelectorAll('.invite-custom-access:checked')).map(cb => cb.value);
        if (checkedModules.length === 0) {
          showToast('Please check at least one access module for Custom role.', true);
          btn.disabled = false;
          btn.innerText = 'Send Invitation';
          return;
        }
        role = 'access:' + checkedModules.join(',');
      }

      try {
        const { data: { session } } = await sb.auth.getSession();
        const token = session?.access_token;
        const res = await fetch('/api/send-invitation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ tenant_id: currentTenantId, company_id: currentCompanyId, email, full_name: fullName, role, invited_by: currentUser.id })
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Invitation failed.', true); return; }
        showToast(data.email_sent ? `Invitation email sent to ${email}.` : `Member invited! Copy invite link from Actions column.`);
        closeAddMemberModal();
        loadAllMembers();
      } catch (err) {
        console.error('Invitation error:', err);
        showToast('System error sending invitation.', true);
      } finally {
        btn.disabled = false;
        btn.innerText = 'Send Invitation';
      }
    }

    async function generateSignature(tenant, company, role, email) {
      const msg = `${tenant}:${company}:${role || ''}:${email}:brightkey_invite_salt`;
      const encoder = new TextEncoder();
      const data = encoder.encode(msg);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function copyInviteLink(email, role) {
      try {
        const sig = await generateSignature(currentTenantId, currentCompanyId, role, email);
        const link = `${window.location.origin}/employee-registration?tenant=${encodeURIComponent(currentTenantId)}&company=${encodeURIComponent(currentCompanyId)}&role=${encodeURIComponent(role || '')}&email=${encodeURIComponent(email)}&sig=${sig}`;
        await navigator.clipboard.writeText(link);
        showToast('Invite link copied to clipboard!');
      } catch (err) {
        showToast('Failed to copy invite link', true);
      }
    }

    function cancelInvitation(inviteId) {
      showConfirmModal('Are you sure you want to cancel this invitation?', async () => {
        try {
          const { error } = await sb.from('company_invitations').delete().eq('id', inviteId);
          if (error) throw error;
          showToast('Invitation cancelled.');
          loadAllMembers();
        } catch (err) {
          showToast('Failed to cancel invitation.', true);
        }
      });
    }

    function sendResetPassword(email) {
      if (!email) return;
      showConfirmModal('Are you sure you want to send a reset password email to ' + email + '?', async () => {
        try {
          const res = await fetch('/api/send-reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Failed to send reset password email.');
          }
          showToast(data.email_sent ? 'Password reset email sent to ' + email + '.' : 'Password reset link generated successfully.');
        } catch (err) {
          console.error('Reset password error:', err);
          showToast('Failed to send reset password email: ' + err.message, true);
        }
      });
    }

    function removeMember(memberId) {
      showConfirmModal('Are you sure you want to remove this member from your team? They will immediately lose dashboard access.', async () => {
        try {
          const { error } = await sb.from('tenant_members').delete().eq('id', memberId);
          if (error) throw error;
          showToast('Member removed successfully.');
          loadAllMembers();
        } catch (err) {
          showToast('Failed to remove member.', true);
        }
      });
    }

    window.addToDirectory = async function(userId, email, fullName) {
      if (!email) { showToast('Cannot add member: Email is missing.', true); return; }
      const parts = (fullName || '').trim().split(/\s+/);
      const lastName = parts.pop() || '';
      const firstName = parts.join(' ') || '';
      try {
        showToast('Adding employee to directory...');
        let empNum = '';
        try {
          const { data, error: seqError } = await sb.rpc('generate_employee_number');
          if (!seqError && data) empNum = data;
        } catch (seqErr) { console.warn('RPC generate_employee_number failed:', seqErr); }
        if (!empNum) {
          const { count, error: countErr } = await sb.from('employees').select('*', { count: 'exact', head: true });
          if (countErr) throw countErr;
          empNum = employeePrefix + '-' + String((count || 0) + 1).padStart(4, '0');
        }
        const insertPayload = {
          email: email.toLowerCase().trim(),
          first_name: firstName || 'N/A',
          last_name: lastName || 'N/A',
          employee_number: empNum,
          company_id: currentCompanyId || null,
          employment_status: 'Active',
          date_of_birth: '1970-01-01',
          address: 'N/A',
          contact_number: 'N/A',
          emergency_contact_number: 'N/A'
        };
        if (userId) insertPayload.id = userId;
        const { error: insertErr } = await sb.from('employees').insert([insertPayload]);
        if (insertErr) throw insertErr;
        showToast('Successfully added to Employee Directory!');
        await loadAllMembers();
      } catch (err) {
        showToast('Failed to add employee: ' + err.message, true);
      }
    };

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function showToast(msg, isError = false) {
      const container = document.getElementById('toast-container');
      if (!container) return;
      const el = document.createElement('div');
      el.className = `toast toast-${isError ? 'error' : 'success'}`;
      el.innerText = msg;
      container.appendChild(el);
      setTimeout(() => el.remove(), 3500);
    }

    window.openEditRoleModal = function(memberId, email, name, currentRole, modulesJson) {
      document.getElementById('edit-role-member-id').value = memberId;
      document.getElementById('edit-role-member-name').innerText = name || '—';
      document.getElementById('edit-role-member-email').innerText = email;
      const currentModules = (() => { try { return JSON.parse(modulesJson || '[]'); } catch(e) { return []; } })();
      const select = document.getElementById('edit-role-select');
      if (select) {
        select.innerHTML = '<option value="admin">Administrator</option><option value="user">User (Custom Modules)</option>';
        const customContainer = document.getElementById('edit-custom-access-container');
        document.querySelectorAll('.edit-custom-access').forEach(cb => cb.checked = false);
        if (currentRole === 'admin') {
          select.value = 'admin';
          customContainer.style.display = 'none';
        } else {
          select.value = 'user';
          customContainer.style.display = 'flex';
          currentModules.forEach(mod => {
            const cb = document.querySelector(`.edit-custom-access[value="${mod}"]`);
            if (cb) cb.checked = true;
          });
        }
      }
      document.getElementById('edit-role-modal').classList.add('open');
    };

    window.closeEditRoleModal = function() {
      document.getElementById('edit-role-modal').classList.remove('open');
    };

    window.submitEditRole = async function(e) {
      e.preventDefault();
      const memberId = document.getElementById('edit-role-member-id').value;
      const selectedAccess = document.getElementById('edit-role-select').value;
      let newRole = null;
      let newModules = [];
      if (selectedAccess === 'admin') {
        newRole = 'admin';
      } else {
        newModules = Array.from(document.querySelectorAll('.edit-custom-access:checked')).map(cb => cb.value);
        if (newModules.length === 0) { showToast('Please check at least one access module.', true); return; }
      }
      try {
        const { error } = await sb.from('tenant_members').update({
          role: newRole,
          accessible_modules: newModules
        }).eq('id', memberId);
        if (error) throw error;
        showToast('Member access updated.');
        closeEditRoleModal();
        loadAllMembers();
      } catch (err) {
        showToast('Failed to update member access.', true);
      }
    };

    // ── Tab Switcher ──
    window.switchTab = function(tab) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
      document.getElementById('tab-' + tab).classList.add('active');
      const panel = document.getElementById('panel-' + tab);
      panel.classList.add('active');
      panel.style.display = (tab === 'access' || tab === 'warehouse' || tab === 'commissions' || tab === 'hr' || tab === 'company' || tab === 'booking') ? 'flex' : 'block';
    };

    // ── Assignments ──
    async function loadAssignments() {
      const tbody = document.getElementById('assignments-tbody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Loading assignments…</td></tr>';
      try {
        const { data, error } = await sb.from('employee_assignments').select('*').eq('company_id', currentCompanyId).order('created_at', { ascending: true });
        if (error) throw error;
        assignments = (data || []).map(r => ({ id: r.id, name: r.name, visibility: Array.isArray(r.visibility) ? r.visibility : [] }));
        renderAssignments();
      } catch (e) {
        tbody.innerHTML = `<tr><td colspan="3" class="empty-state" style="color:var(--danger);">Failed to load: ${e.message}</td></tr>`;
      }
    }

    function renderAssignments() {
      const tbody = document.getElementById('assignments-tbody');
      if (!tbody) return;
      if (assignments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No assignments yet. Click "+ Add Assignment" to create one.</td></tr>';
        return;
      }
      tbody.innerHTML = assignments.map((a, idx) => `
        <tr>
          <td><input type="text" class="form-input" value="${escapeHtml(a.name)}" oninput="assignments[${idx}].name = this.value" placeholder="e.g. Installer" style="max-width: 200px;" /></td>
          <td><div class="vis-group">${VISIBILITY_OPTIONS.map(opt => `<label class="vis-label"><input type="checkbox" value="${opt.key}" ${a.visibility.includes(opt.key) ? 'checked' : ''} onchange="toggleVisibility(${idx}, '${opt.key}', this.checked)" />${opt.label}</label>`).join('')}</div></td>
          <td><button class="btn btn-danger btn-sm" onclick="deleteAssignment(${idx}, '${a.id || ''}')" title="Delete assignment" style="padding: 0.35rem 0.55rem;"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button></td>
        </tr>
      `).join('');
    }

    window.addAssignment = function() {
      assignments.push({ id: null, name: '', visibility: [] });
      renderAssignments();
      const inputs = document.querySelectorAll('#assignments-tbody input[type="text"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    };

    window.toggleVisibility = function(idx, key, checked) {
      const vis = assignments[idx].visibility;
      if (checked && !vis.includes(key)) vis.push(key);
      if (!checked) assignments[idx].visibility = vis.filter(v => v !== key);
    };

    window.deleteAssignment = async function(idx, id) {
      if (id) {
        try {
          const { error } = await sb.from('employee_assignments').delete().eq('id', id);
          if (error) throw error;
        } catch (e) {
          showToast('Delete failed: ' + e.message, true);
          return;
        }
      }
      assignments.splice(idx, 1);
      renderAssignments();
      showToast('Assignment removed.');
    };

    window.saveAssignments = async function() {
      for (const a of assignments) {
        if (!a.name.trim()) { showToast('Assignment name cannot be empty.', true); return; }
      }
      try {
        for (const a of assignments) {
          if (a.id) {
            const { error } = await sb.from('employee_assignments').update({ name: a.name.trim(), visibility: a.visibility }).eq('id', a.id);
            if (error) throw error;
          } else {
            const { data, error } = await sb.from('employee_assignments').insert([{ company_id: currentCompanyId, name: a.name.trim(), visibility: a.visibility }]).select().single();
            if (error) throw error;
            a.id = data.id;
          }
        }
        showToast('Assignments saved.');
        renderAssignments();
      } catch (e) {
        showToast('Save failed: ' + e.message, true);
      }
    };

    // ────────────────────────────────────────────────────
    // ── WAREHOUSE TAB ──
    // ────────────────────────────────────────────────────

    async function loadWarehouses() {
      const container = document.getElementById('warehouse-list');
      container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:2rem;">Loading warehouses...</div>';

      try {
        const { data, error } = await sb
          .from('warehouses')
          .select('*')
          .eq('tenant_id', currentTenantId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        let whList = data || [];

        // Auto-create default warehouse if none exist
        if (whList.length === 0) {
          const { data: created, error: createErr } = await sb
            .from('warehouses')
            .insert([{ tenant_id: currentTenantId, name: 'Warehouse 1', is_active: true }])
            .select()
            .single();
          if (createErr) throw createErr;
          whList = [created];
          showToast('Default warehouse created.');
        }

        // Load managers for each warehouse
        for (const wh of whList) {
          const { data: managers, error: mErr } = await sb
            .from('warehouse_managers')
            .select('id, user_id, can_pack, can_dispatch, can_cancel, can_receive, can_manage_all_orders')
            .eq('warehouse_id', wh.id);
          wh.managers = managers || [];
        }

        warehouses = whList;
        renderWarehouses();
      } catch (err) {
        container.innerHTML = `<div style="text-align:center; color:var(--danger); padding:2rem;">Failed to load warehouses: ${err.message}</div>`;
        console.error('Warehouse load error:', err);
      }
    }

    function renderWarehouses() {
      const container = document.getElementById('warehouse-list');
      const total = warehouses.length;
      const active = warehouses.filter(w => w.is_active).length;
      document.getElementById('wh-total-count').textContent = total;
      document.getElementById('wh-active-count').textContent = active;
      document.getElementById('wh-inactive-count').textContent = total - active;

      if (total === 0) {
        container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:2rem;">No warehouses yet.</div>';
        return;
      }

      container.innerHTML = warehouses.map((wh, idx) => {
        const managersHtml = buildManagersTableHtml(wh, idx);
        return `
          <div class="wh-card" id="wh-card-${wh.id}">
            <div class="wh-card-header">
              <div class="wh-number">${idx + 1}</div>
              <input
                class="wh-name-input"
                id="wh-name-${wh.id}"
                type="text"
                value="${escapeHtml(wh.name)}"
                placeholder="Warehouse name"
                onblur="saveWarehouseName('${wh.id}', this.value)"
                onkeydown="if(event.key==='Enter') this.blur()"
              />
              <div class="wh-actions">
                <div class="toggle-wrap">
                  <label class="toggle-switch" title="${wh.is_active ? 'Active' : 'Inactive'}">
                    <input type="checkbox" ${wh.is_active ? 'checked' : ''} onchange="toggleWarehouseActive('${wh.id}', this.checked)" />
                    <span class="toggle-slider"></span>
                  </label>
                  <span id="wh-status-${wh.id}" style="color:${wh.is_active ? 'var(--success)' : 'var(--text-muted)'}; font-size:0.8rem;">${wh.is_active ? 'Active' : 'Inactive'}</span>
                </div>
                ${warehouses.length > 1 ? `
                <button class="btn btn-danger" style="padding:0.3rem 0.55rem;" onclick="deleteWarehouse('${wh.id}')" title="Delete warehouse">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                </button>` : ''}
              </div>
            </div>
            <div class="wh-card-body">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                <div style="font-size:0.78rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">
                  Assigned Managers
                  <span style="font-weight:400; text-transform:none; font-size:0.75rem; color:var(--text-muted); margin-left:0.4rem;">(Owner &amp; Admin manage all warehouses by default)</span>
                </div>
                <button class="btn btn-outline btn-sm" onclick="openAssignManagerModal('${wh.id}')">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Assign
                </button>
              </div>
              ${managersHtml}
            </div>
          </div>
        `;
      }).join('');
    }

    function buildManagersTableHtml(wh) {
      if (!wh.managers || wh.managers.length === 0) {
        return `<div style="font-size:0.82rem; color:var(--text-muted); padding:0.5rem 0;">No managers assigned yet.</div>`;
      }

      const rows = wh.managers.map(mgr => {
        const member = allTeamMembers.find(m => m.user_id === mgr.user_id);
        const displayName = member ? (member.full_name || member.user_email || 'Unknown') : 'Unknown';
        const email = member ? (member.user_email || '') : '';

        const perms = [
          { key: 'pack', label: 'Pack', val: mgr.can_pack },
          { key: 'dispatch', label: 'Dispatch', val: mgr.can_dispatch },
          { key: 'cancel', label: 'Cancel', val: mgr.can_cancel },
          { key: 'receive', label: 'Receive', val: mgr.can_receive },
          { key: 'manage_all_orders', label: 'Manage All Orders', val: mgr.can_manage_all_orders },
        ];
        const chipHtml = perms.map(p => `<span class="perm-chip ${p.val ? 'on' : ''}">${p.label}</span>`).join('');

        return `
          <tr>
            <td>
              <div style="font-weight:600; font-size:0.83rem;">${escapeHtml(displayName)}</div>
              <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(email)}</div>
            </td>
            <td><div class="perm-chips">${chipHtml}</div></td>
            <td style="text-align:right;">
              <button class="btn btn-danger" style="padding:0.28rem 0.55rem; font-size:0.73rem;" onclick="removeManager('${wh.id}', '${mgr.id}')">Remove</button>
            </td>
          </tr>
        `;
      }).join('');

      return `
        <table class="wh-managers-table">
          <thead>
            <tr>
              <th>Manager</th>
              <th>Permissions</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }

    // ── Add Warehouse ──
    window.addWarehouse = async function() {
      try {
        const newNum = warehouses.length + 1;
        const { data, error } = await sb
          .from('warehouses')
          .insert([{ tenant_id: currentTenantId, name: `Warehouse ${newNum}`, is_active: true }])
          .select()
          .single();
        if (error) throw error;
        data.managers = [];
        warehouses.push(data);
        renderWarehouses();
        showToast(`Warehouse ${newNum} created.`);
      } catch (err) {
        showToast('Failed to add warehouse: ' + err.message, true);
      }
    };

    // ── Toggle Active ──
    window.toggleWarehouseActive = async function(whId, isActive) {
      try {
        const { error } = await sb.from('warehouses').update({ is_active: isActive }).eq('id', whId);
        if (error) throw error;
        const wh = warehouses.find(w => w.id === whId);
        if (wh) wh.is_active = isActive;
        // Update status label
        const statusEl = document.getElementById(`wh-status-${whId}`);
        if (statusEl) {
          statusEl.textContent = isActive ? 'Active' : 'Inactive';
          statusEl.style.color = isActive ? 'var(--success)' : 'var(--text-muted)';
        }
        // Update summary counters
        const active = warehouses.filter(w => w.is_active).length;
        document.getElementById('wh-active-count').textContent = active;
        document.getElementById('wh-inactive-count').textContent = warehouses.length - active;
        showToast(`Warehouse marked as ${isActive ? 'Active' : 'Inactive'}.`);
      } catch (err) {
        showToast('Failed to update warehouse status.', true);
      }
    };

    // ── Save Name ──
    window.saveWarehouseName = async function(whId, newName) {
      const name = (newName || '').trim();
      if (!name) {
        const wh = warehouses.find(w => w.id === whId);
        if (wh) document.getElementById(`wh-name-${whId}`).value = wh.name;
        return;
      }
      const wh = warehouses.find(w => w.id === whId);
      if (wh && wh.name === name) return; // no change
      try {
        const { error } = await sb.from('warehouses').update({ name }).eq('id', whId);
        if (error) throw error;
        if (wh) wh.name = name;
        showToast('Warehouse name saved.');
      } catch (err) {
        showToast('Failed to save name: ' + err.message, true);
      }
    };

    // ── Delete Warehouse ──
    window.deleteWarehouse = function(whId) {
      if (warehouses.length <= 1) {
        showToast('Cannot delete: at least one warehouse is required.', true);
        return;
      }
      showConfirmModal('Are you sure you want to delete this warehouse? All assigned managers will be removed.', async () => {
        try {
          const { error } = await sb.from('warehouses').delete().eq('id', whId);
          if (error) throw error;
          warehouses = warehouses.filter(w => w.id !== whId);
          renderWarehouses();
          showToast('Warehouse deleted.');
        } catch (err) {
          showToast('Failed to delete warehouse: ' + err.message, true);
        }
      });
    };

    // ── Assign Manager Modal ──
    window.openAssignManagerModal = function(whId) {
      activeWarehouseId = whId;
      const wh = warehouses.find(w => w.id === whId);
      document.getElementById('assign-modal-wh-name').textContent = wh ? wh.name : '';

      const select = document.getElementById('assign-user-select');
      const existingManagerIds = new Set((wh?.managers || []).map(m => m.user_id));

      // Populate with non-owner/admin members not already assigned
      const eligibleMembers = allTeamMembers.filter(m =>
        !existingManagerIds.has(m.user_id) &&
        m.user_id &&
        m.user_id !== currentUser.id
      );

      select.innerHTML = '<option value="">-- Choose a member --</option>';
      eligibleMembers.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.user_id;
        opt.textContent = (m.full_name || m.user_email) + (m.full_name ? ` (${m.user_email})` : '');
        select.appendChild(opt);
      });

      // Reset checkboxes
      document.getElementById('perm-pack').checked = true;
      document.getElementById('perm-dispatch').checked = true;
      document.getElementById('perm-cancel').checked = true;
      document.getElementById('perm-receive').checked = true;
      document.getElementById('perm-manage-all-orders').checked = true;

      document.getElementById('assign-manager-modal').classList.add('open');
    };

    window.closeAssignManagerModal = function() {
      document.getElementById('assign-manager-modal').classList.remove('open');
      activeWarehouseId = null;
    };

    window.saveManagerAssignment = async function() {
      const userId = document.getElementById('assign-user-select').value;
      if (!userId) { showToast('Please select a team member.', true); return; }
      if (!activeWarehouseId) return;

      const payload = {
        warehouse_id: activeWarehouseId,
        user_id: userId,
        can_pack: document.getElementById('perm-pack').checked,
        can_dispatch: document.getElementById('perm-dispatch').checked,
        can_cancel: document.getElementById('perm-cancel').checked,
        can_receive: document.getElementById('perm-receive').checked,
        can_manage_all_orders: document.getElementById('perm-manage-all-orders').checked,
      };

      try {
        const { data, error } = await sb.from('warehouse_managers').insert([payload]).select().single();
        if (error) throw error;
        const wh = warehouses.find(w => w.id === activeWarehouseId);
        if (wh) wh.managers.push(data);
        closeAssignManagerModal();
        renderWarehouses();
        showToast('Manager assigned successfully.');
      } catch (err) {
        showToast('Failed to assign manager: ' + err.message, true);
      }
    };

    // ── Remove Manager ──
    window.removeManager = function(whId, managerId) {
      showConfirmModal('Remove this manager from the warehouse?', async () => {
        try {
          const { error } = await sb.from('warehouse_managers').delete().eq('id', managerId);
          if (error) throw error;
          const wh = warehouses.find(w => w.id === whId);
          if (wh) wh.managers = wh.managers.filter(m => m.id !== managerId);
          renderWarehouses();
          showToast('Manager removed.');
        } catch (err) {
          showToast('Failed to remove manager: ' + err.message, true);
        }
      });
    };

    // ── Commissions Logic ──
    window.eligibilityRules = [];
    window.adjustmentRules = [];



    window.toggleEligibilityScope = function() {
      const scope = document.querySelector('input[name="eligibility-scope"]:checked').value;
      const busBlock = document.getElementById('eligibility-businesses-block');
      const tagBlock = document.getElementById('eligibility-tags-block');
      if (scope === 'businesses') {
        busBlock.style.display = 'flex';
        tagBlock.style.display = 'none';
      } else {
        busBlock.style.display = 'none';
        tagBlock.style.display = 'flex';
      }
    };

    window.toggleAdjustmentScope = function() {
      const scope = document.querySelector('input[name="adjustment-scope"]:checked').value;
      const busBlock = document.getElementById('adjustment-businesses-block');
      const tagBlock = document.getElementById('adjustment-tags-block');
      if (scope === 'businesses') {
        busBlock.style.display = 'flex';
        tagBlock.style.display = 'none';
      } else {
        busBlock.style.display = 'none';
        tagBlock.style.display = 'flex';
      }
    };

    window.onEligibilityBusinessChange = function() {
      const biz = document.getElementById('el-business-select').value;
      const catContainer = document.getElementById('el-category-container');
      const skuContainer = document.getElementById('el-sku-container');
      const catSelect = document.getElementById('el-category-select');
      const skuSelect = document.getElementById('el-sku-select');

      if (biz === 'all') {
        catContainer.style.display = 'none';
        skuContainer.style.display = 'none';
        catSelect.value = 'all';
        skuSelect.value = 'all';
      } else {
        catContainer.style.display = 'block';
        skuContainer.style.display = 'none';
        skuSelect.value = 'all';
        
        const products = window.commissionsProductsData || [];
        const categories = [...new Set(products.filter(p => p.business === biz).map(p => p.category).filter(Boolean))].sort();
        catSelect.innerHTML = '<option value="all">All Categories</option>' + categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        catSelect.value = 'all';
      }
    };

    window.onEligibilityCategoryChange = function() {
      const biz = document.getElementById('el-business-select').value;
      const cat = document.getElementById('el-category-select').value;
      const skuContainer = document.getElementById('el-sku-container');
      const skuSelect = document.getElementById('el-sku-select');

      if (cat === 'all') {
        skuContainer.style.display = 'none';
        skuSelect.value = 'all';
      } else {
        skuContainer.style.display = 'block';
        
        const products = window.commissionsProductsData || [];
        const skus = products.filter(p => p.business === biz && p.category === cat).map(p => p.sku).filter(Boolean).sort();
        skuSelect.innerHTML = '<option value="all">All SKUs</option>' + skus.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
        skuSelect.value = 'all';
      }
    };

    window.onElRowBusinessChange = function(rowId, selectedCat = 'all', selectedSku = 'all') {
      const row = document.getElementById(rowId);
      if (!row) return;
      const val = row.querySelector('.el-row-business-tag').value;
      const catContainer = row.querySelector('.el-row-category-container');
      const skuContainer = row.querySelector('.el-row-sku-container');
      const catSelect = row.querySelector('.el-row-category');
      const skuSelect = row.querySelector('.el-row-sku');

      if (!val.startsWith('biz:')) {
        catContainer.style.display = 'none';
        skuContainer.style.display = 'none';
        catSelect.value = 'all';
        skuSelect.value = 'all';
      } else {
        const biz = val.replace('biz:', '');
        catContainer.style.display = 'block';
        skuContainer.style.display = 'none';
        skuSelect.value = 'all';
        
        const products = window.commissionsProductsData || [];
        const categories = [...new Set(products.filter(p => p.business === biz).map(p => p.category).filter(Boolean))].sort();
        catSelect.innerHTML = '<option value="all">All Categories</option>' + categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        catSelect.value = selectedCat;
        
        if (selectedCat !== 'all') {
          window.onElRowCategoryChange(rowId, selectedSku);
        }
      }
    };

    window.onElRowCategoryChange = function(rowId, selectedSku = 'all') {
      const row = document.getElementById(rowId);
      if (!row) return;
      const bizVal = row.querySelector('.el-row-business-tag').value;
      const biz = bizVal.replace('biz:', '');
      const cat = row.querySelector('.el-row-category').value;
      const skuContainer = row.querySelector('.el-row-sku-container');
      const skuSelect = row.querySelector('.el-row-sku');

      if (cat === 'all') {
        skuContainer.style.display = 'none';
        skuSelect.value = 'all';
      } else {
        skuContainer.style.display = 'block';
        
        const products = window.commissionsProductsData || [];
        const skus = products.filter(p => p.business === biz && p.category === cat).map(p => p.sku).filter(Boolean).sort();
        skuSelect.innerHTML = '<option value="all">All SKUs</option>' + skus.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
        skuSelect.value = selectedSku;
      }
    };

    window.onAdjRowBusinessChange = function(rowId, selectedCat = 'all', selectedSku = 'all') {
      const row = document.getElementById(rowId);
      if (!row) return;
      const val = row.querySelector('.adj-row-business-tag').value;
      const catContainer = row.querySelector('.adj-category-container');
      const skuContainer = row.querySelector('.adj-sku-container');
      const catSelect = row.querySelector('.adj-row-category');
      const skuSelect = row.querySelector('.adj-row-sku');

      if (!val.startsWith('biz:')) {
        catContainer.style.display = 'none';
        skuContainer.style.display = 'none';
        catSelect.value = 'all';
        skuSelect.value = 'all';
      } else {
        const biz = val.replace('biz:', '');
        catContainer.style.display = 'block';
        skuContainer.style.display = 'none';
        skuSelect.value = 'all';
        
        const products = window.commissionsProductsData || [];
        const categories = [...new Set(products.filter(p => p.business === biz).map(p => p.category).filter(Boolean))].sort();
        catSelect.innerHTML = '<option value="all">All Categories</option>' + categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        catSelect.value = selectedCat;

        if (selectedCat !== 'all') {
          window.onAdjRowCategoryChange(rowId, selectedSku);
        }
      }
    };

    window.onAdjRowCategoryChange = function(rowId, selectedSku = 'all') {
      const row = document.getElementById(rowId);
      if (!row) return;
      const bizVal = row.querySelector('.adj-row-business-tag').value;
      const biz = bizVal.replace('biz:', '');
      const cat = row.querySelector('.adj-row-category').value;
      const skuContainer = row.querySelector('.adj-sku-container');
      const skuSelect = row.querySelector('.adj-row-sku');

      if (cat === 'all') {
        skuContainer.style.display = 'none';
        skuSelect.value = 'all';
      } else {
        skuContainer.style.display = 'block';
        
        const products = window.commissionsProductsData || [];
        const skus = products.filter(p => p.business === biz && p.category === cat).map(p => p.sku).filter(Boolean).sort();
        skuSelect.innerHTML = '<option value="all">All SKUs</option>' + skus.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
        skuSelect.value = selectedSku;
      }
    };

    window.addEligibilityRow = function(initialData = null) {
      const container = document.getElementById('eligibility-rows-container');
      if (!container) return;

      const rowId = 'el-row-' + Date.now() + Math.random().toString(36).slice(2, 6);
      const products = window.commissionsProductsData || [];
      const tags = [...new Set(products.flatMap(p => p.tags || []).filter(Boolean))].sort();

      let dropdownOptionsHtml = `
        <option value="all">All Businesses & Tags</option>
        <optgroup label="Businesses">
          <option value="biz:smart_lock">Smart Lock</option>
          <option value="biz:solar_power">Solar Power</option>
          <option value="biz:cctv">CCTV</option>
          <option value="biz:fire_extinguisher">Fire Extinguisher</option>
        </optgroup>
      `;

      if (tags.length > 0) {
        dropdownOptionsHtml += `
          <optgroup label="Tags">
            ${tags.map(t => `<option value="tag:${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
          </optgroup>
        `;
      }

      const html = `
        <div class="eligibility-row" id="${rowId}" style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-start; margin-bottom: 0.5rem; width: 100%;">
          <div class="form-group" style="flex: 1; min-width: 150px; max-width: calc(33.333% - 0.67rem);">
            <label class="form-label" style="font-size: 0.65rem;">Business / Tag</label>
            <select class="form-select el-row-business-tag" onchange="onElRowBusinessChange('${rowId}')">
              ${dropdownOptionsHtml}
            </select>
          </div>
          <div class="form-group el-row-category-container" style="display: none; flex: 1; min-width: 150px; max-width: calc(33.333% - 0.67rem);">
            <label class="form-label" style="font-size: 0.65rem;">Product Category</label>
            <select class="form-select el-row-category" onchange="onElRowCategoryChange('${rowId}')">
              <option value="all">All Categories</option>
            </select>
          </div>
          <div class="form-group el-row-sku-container" style="display: none; flex: 1; min-width: 150px; max-width: calc(33.333% - 0.67rem);">
            <label class="form-label" style="font-size: 0.65rem;">SKU</label>
            <select class="form-select el-row-sku">
              <option value="all">All SKUs</option>
            </select>
          </div>
          <button class="btn btn-outline btn-sm" style="color: var(--danger); border-color: rgba(220,38,38,0.15); height: 38px; margin-top: 1.25rem;" onclick="removeEligibilityRow('${rowId}')">
            <svg viewBox="0 0 24 24" style="width:12px;height:12px;display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `;

      container.insertAdjacentHTML('beforeend', html);

      if (initialData) {
        const row = document.getElementById(rowId);
        row.querySelector('.el-row-business-tag').value = initialData.business_tag_val || 'all';
        window.onElRowBusinessChange(rowId, initialData.category || 'all', initialData.sku || 'all');
      }
    };

    window.removeEligibilityRow = function(rowId) {
      const row = document.getElementById(rowId);
      if (row) row.remove();
    };

    window.addAdjustmentRow = function(initialData = null) {
      const container = document.getElementById('adjustment-rows-container');
      if (!container) return;

      const rowId = 'adj-row-' + Date.now() + Math.random().toString(36).slice(2, 6);
      const products = window.commissionsProductsData || [];
      const tags = [...new Set(products.flatMap(p => p.tags || []).filter(Boolean))].sort();

      let dropdownOptionsHtml = `
        <option value="all">All Businesses & Tags</option>
        <optgroup label="Businesses">
          <option value="biz:smart_lock">Smart Lock</option>
          <option value="biz:solar_power">Solar Power</option>
          <option value="biz:cctv">CCTV</option>
          <option value="biz:fire_extinguisher">Fire Extinguisher</option>
        </optgroup>
      `;

      if (tags.length > 0) {
        dropdownOptionsHtml += `
          <optgroup label="Tags">
            ${tags.map(t => `<option value="tag:${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
          </optgroup>
        `;
      }
      
      const html = `
        <div class="adjustment-row-card" id="${rowId}" style="border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; background: var(--bg-elevated); position: relative; margin-bottom: 0.5rem;">
          <!-- Row 1: Filters (Business / Tag, Category, SKU) -->
          <div class="adj-row-filters" style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
            <div class="form-group" style="flex: 1; min-width: 150px; max-width: calc(33.333% - 0.67rem);">
              <label class="form-label" style="font-size: 0.65rem;">Business / Tag</label>
              <select class="form-select adj-row-business-tag" onchange="onAdjRowBusinessChange('${rowId}')">
                ${dropdownOptionsHtml}
              </select>
            </div>
            <div class="form-group adj-category-container" style="display: none; flex: 1; min-width: 150px; max-width: calc(33.333% - 0.67rem);">
              <label class="form-label" style="font-size: 0.65rem;">Product Category</label>
              <select class="form-select adj-row-category" onchange="onAdjRowCategoryChange('${rowId}')">
                <option value="all">All Categories</option>
              </select>
            </div>
            <div class="form-group adj-sku-container" style="display: none; flex: 1; min-width: 150px; max-width: calc(33.333% - 0.67rem);">
              <label class="form-label" style="font-size: 0.65rem;">SKU</label>
              <select class="form-select adj-row-sku">
                <option value="all">All SKUs</option>
              </select>
            </div>
          </div>
          <!-- Row 2: Details -->
          <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end;">
            <div class="form-group" style="flex: 1.5; min-width: 180px;">
              <label class="form-label" style="font-size: 0.65rem;">Commission Label</label>
              <select class="form-select adj-row-label">
                <option value="">-- Choose Commission Rate Label --</option>
              </select>
            </div>
            <div class="form-group" style="flex: 1; min-width: 100px;">
              <label class="form-label" style="font-size: 0.65rem;">Value (%)</label>
              <input type="number" class="form-input adj-row-value" placeholder="0.00" step="0.01" />
            </div>
            <div class="form-group" style="flex: 1.5; min-width: 140px;">
              <label class="form-label" style="font-size: 0.65rem;">Start Date</label>
              <input type="date" class="form-input adj-row-start-date" />
            </div>
            <div class="form-group" style="flex: 1.5; min-width: 140px;">
              <label class="form-label" style="font-size: 0.65rem;">End Date</label>
              <input type="date" class="form-input adj-row-end-date" />
            </div>
          </div>
          <!-- Delete button -->
          <button class="btn btn-outline btn-sm" style="position: absolute; top: 0.5rem; right: 0.5rem; color: var(--danger); border-color: rgba(220,38,38,0.15); padding: 0.25rem;" onclick="removeAdjustmentRow('${rowId}')">
            <svg viewBox="0 0 24 24" style="width:12px;height:12px;display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `;

      container.insertAdjacentHTML('beforeend', html);

      const row = document.getElementById(rowId);
      const labelSelect = row.querySelector('.adj-row-label');
      const labelInputs = document.querySelectorAll('.rate-label-input');
      let selectHtml = '<option value="">-- Choose Commission Rate Label --</option>';
      labelInputs.forEach(input => {
        const val = input.value.trim();
        if (val) {
          selectHtml += `<option value="${escapeHtml(val)}">${escapeHtml(val)}</option>`;
        }
      });
      labelSelect.innerHTML = selectHtml;

      if (initialData) {
        row.querySelector('.adj-row-business-tag').value = initialData.business_tag_val || 'all';
        window.onAdjRowBusinessChange(rowId, initialData.category || 'all', initialData.sku || 'all');
        row.querySelector('.adj-row-label').value = initialData.label || '';
        row.querySelector('.adj-row-value').value = initialData.value || '';
        row.querySelector('.adj-row-start-date').value = initialData.start_date || '';
        row.querySelector('.adj-row-end-date').value = initialData.end_date || '';
      }
    };

    window.removeAdjustmentRow = function(rowId) {
      const row = document.getElementById(rowId);
      if (row) row.remove();
    };

    window.addRateRow = function(label = '', value = '') {
      const container = document.getElementById('rates-container');
      if (!container) return;

      const rowId = 'rate-row-' + Date.now() + Math.random().toString(36).slice(2, 6);
      const html = `
        <div class="rate-row" id="${rowId}" style="display: flex; align-items: center; gap: 0.75rem;">
          <div style="flex: 1.5;">
            <input type="text" class="form-input rate-label-input" placeholder="Label (e.g. Bronze, Gold)" value="${escapeHtml(label)}" oninput="updateAdjustmentLabelSelect()" />
          </div>
          <div style="flex: 1; position: relative; display: flex; align-items: center;">
            <input type="number" class="form-input rate-val-input" placeholder="0.00" min="0" step="0.01" value="${value}" style="padding-right: 1.5rem;" />
            <span style="position: absolute; right: 0.75rem; font-weight: 600; color: var(--text-muted); pointer-events: none;">%</span>
          </div>
          <button class="btn btn-outline btn-sm" style="color: var(--danger); border-color: rgba(220,38,38,0.15); height: 38px;" onclick="removeRateRow('${rowId}')">
            <svg aria-hidden="true" viewBox="0 0 24 24" style="width:1em;height:1em;display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', html);
      updateAdjustmentLabelSelect();
    };

    window.removeRateRow = function(rowId) {
      const el = document.getElementById(rowId);
      if (el) el.remove();
      updateAdjustmentLabelSelect();
    };

    window.updateAdjustmentLabelSelect = function() {
      const labelSelects = document.querySelectorAll('.adj-row-label');
      const labelInputs = document.querySelectorAll('.rate-label-input');
      
      labelSelects.forEach(select => {
        const currentSelection = select.value;
        let selectHtml = '<option value="">-- Choose Commission Rate Label --</option>';
        labelInputs.forEach(input => {
          const val = input.value.trim();
          if (val) {
            const selected = val === currentSelection ? 'selected' : '';
            selectHtml += `<option value="${escapeHtml(val)}" ${selected}>${escapeHtml(val)}</option>`;
          }
        });
        select.innerHTML = selectHtml;
      });
    };

    function populateCommissionsDropdowns(productsData) {
      // Tags are populated dynamically per row now. Left as no-op to prevent calls throwing.
    }

    async function loadCommissionsSettings() {
      try {
        const { data, error } = await sb
          .from('global_settings')
          .select('value')
          .eq('key', 'commissions_config')
          .eq('company_id', currentCompanyId)
          .maybeSingle();

        if (error) throw error;

        const container = document.getElementById('rates-container');
        if (container) container.innerHTML = '';

        const elContainer = document.getElementById('eligibility-rows-container');
        if (elContainer) elContainer.innerHTML = '';

        const adjContainer = document.getElementById('adjustment-rows-container');
        if (adjContainer) adjContainer.innerHTML = '';

        if (data && data.value) {
          const v = data.value;

          if (Array.isArray(v.rates)) {
            v.rates.forEach(r => {
              addRateRow(r.label, r.value);
            });
          } else {
            addRateRow();
          }

          if (Array.isArray(v.eligibility_rules) && v.eligibility_rules.length > 0) {
            v.eligibility_rules.forEach(r => {
              let initialData;
              if (r.scope === 'businesses') {
                initialData = {
                  business_tag_val: r.business === 'all' ? 'all' : `biz:${r.business}`,
                  category: r.category,
                  sku: r.sku
                };
              } else {
                initialData = {
                  business_tag_val: `tag:${r.tag}`
                };
              }
              addEligibilityRow(initialData);
            });
          } else {
            addEligibilityRow();
          }

          if (Array.isArray(v.adjustment_rules) && v.adjustment_rules.length > 0) {
            v.adjustment_rules.forEach(r => {
              let initialData;
              if (r.scope === 'businesses') {
                initialData = {
                  business_tag_val: r.business === 'all' ? 'all' : `biz:${r.business}`,
                  category: r.category,
                  sku: r.sku
                };
              } else {
                initialData = {
                  business_tag_val: `tag:${r.tag}`
                };
              }
              initialData.label = r.label;
              let val = r.value || 0;
              if (r.operator === 'minus') {
                val = -Math.abs(val);
              }
              initialData.value = val;
              initialData.start_date = r.start_date;
              initialData.end_date = r.end_date;
              addAdjustmentRow(initialData);
            });
          } else {
            addAdjustmentRow();
          }
        } else {
          addRateRow();
          addEligibilityRow();
          addAdjustmentRow();
        }
      } catch (err) {
        console.error('Error loading commissions settings:', err);
      }
    }

    window.saveCommissionsSettings = async function() {
      const rates = [];
      const rateRows = document.querySelectorAll('#rates-container .rate-row');
      rateRows.forEach(row => {
        const label = row.querySelector('.rate-label-input').value.trim();
        const val = parseFloat(row.querySelector('.rate-val-input').value) || 0;
        if (label) {
          rates.push({ label, value: val });
        }
      });

      const eligibility_rules = [];
      const elRows = document.querySelectorAll('#eligibility-rows-container .eligibility-row');
      elRows.forEach(row => {
        const val = row.querySelector('.el-row-business-tag').value;
        const rule = {};
        if (val.startsWith('biz:')) {
          rule.scope = 'businesses';
          rule.business = val.replace('biz:', '');
          const catSelect = row.querySelector('.el-row-category');
          rule.category = (catSelect && row.querySelector('.el-row-category-container').style.display !== 'none') ? catSelect.value : 'all';
          const skuSelect = row.querySelector('.el-row-sku');
          rule.sku = (skuSelect && row.querySelector('.el-row-sku-container').style.display !== 'none') ? skuSelect.value : 'all';
        } else if (val.startsWith('tag:')) {
          rule.scope = 'tags';
          rule.tag = val.replace('tag:', '');
        } else {
          rule.scope = 'businesses';
          rule.business = 'all';
          rule.category = 'all';
          rule.sku = 'all';
        }
        eligibility_rules.push(rule);
      });

      const adjustment_rules = [];
      const adjRows = document.querySelectorAll('#adjustment-rows-container .adjustment-row-card');
      adjRows.forEach(row => {
        const val = row.querySelector('.adj-row-business-tag').value;
        const parsedVal = parseFloat(row.querySelector('.adj-row-value').value) || 0;
        const rule = {
          label: row.querySelector('.adj-row-label').value,
          operator: parsedVal < 0 ? 'minus' : 'plus',
          value: Math.abs(parsedVal),
          start_date: row.querySelector('.adj-row-start-date').value,
          end_date: row.querySelector('.adj-row-end-date').value
        };
        if (val.startsWith('biz:')) {
          rule.scope = 'businesses';
          rule.business = val.replace('biz:', '');
          const catSelect = row.querySelector('.adj-row-category');
          rule.category = (catSelect && row.querySelector('.adj-category-container').style.display !== 'none') ? catSelect.value : 'all';
          const skuSelect = row.querySelector('.adj-row-sku');
          rule.sku = (skuSelect && row.querySelector('.adj-sku-container').style.display !== 'none') ? skuSelect.value : 'all';
        } else if (val.startsWith('tag:')) {
          rule.scope = 'tags';
          rule.tag = val.replace('tag:', '');
        } else {
          rule.scope = 'businesses';
          rule.business = 'all';
          rule.category = 'all';
          rule.sku = 'all';
        }
        adjustment_rules.push(rule);
      });

      const value = {
        eligibility_rules,
        rates,
        adjustment_rules
      };

      try {
        const { error } = await sb.from('global_settings').upsert({
          key: 'commissions_config',
          company_id: currentCompanyId,
          value
        });

        if (error) throw error;
        showToast('Commissions settings saved successfully!');
      } catch (err) {
        console.error('Error saving commissions settings:', err);
        showToast('Failed to save commissions settings.', true);
      }
    };
    
    // ── Sales Managers & Permissions Logic ──
    let salesManagers = [];

    async function loadSalesManagers() {
      try {
        const { data } = await sb
          .from('global_settings')
          .select('value')
          .eq('key', 'sales_managers')
          .eq('company_id', currentCompanyId)
          .maybeSingle();

        if (data?.value && Array.isArray(data.value.managers)) {
          salesManagers = data.value.managers;
        } else {
          salesManagers = [];
        }
        
        await renderSalesManagersTable();
      } catch(e) {
        console.error('Error loading sales managers:', e);
      }
    }

    async function renderSalesManagersTable() {
      const tbody = document.getElementById('sales-managers-tbody');
      if (!tbody) return;
      tbody.innerHTML = '';

      if (salesManagers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 1rem;">No sales managers assigned.</td></tr>';
        return;
      }

      // Fetch names of these employees to be sure
      const { data: emps } = await sb
        .from('employees')
        .select('id, first_name, last_name')
        .in('id', salesManagers);

      const empMap = {};
      if (emps) {
        emps.forEach(e => { empMap[e.id] = `${e.first_name} ${e.last_name}`; });
      }

      salesManagers.forEach(empId => {
        const name = empMap[empId] || 'Unknown Employee';
        tbody.insertAdjacentHTML('beforeend', `
          <tr>
            <td><span style="font-weight: 600;">${escapeHtml(name)}</span></td>
            <td><span class="badge badge-cyan" style="font-size:0.7rem;">Goal Settings change</span></td>
            <td style="text-align: right;">
              <button class="btn btn-danger" style="padding: 0.28rem 0.55rem; font-size: 0.73rem;" onclick="removeSalesManager('${empId}')">Remove</button>
            </td>
          </tr>
        `);
      });
    }

    window.assignSalesManager = async function() {
      const select = document.getElementById('sales-manager-select');
      const empId = select.value;
      if (!empId) return;

      if (salesManagers.includes(empId)) {
        showToast('Employee is already assigned as a Sales Manager.', true);
        return;
      }

      salesManagers.push(empId);
      await saveSalesManagers();
    };

    window.removeSalesManager = async function(empId) {
      salesManagers = salesManagers.filter(id => id !== empId);
      await saveSalesManagers();
    };

    async function saveSalesManagers() {
      try {
        const { error } = await sb
          .from('global_settings')
          .upsert({
            key: 'sales_managers',
            company_id: currentCompanyId,
            value: { managers: salesManagers },
            updated_at: new Date().toISOString()
          });

        if (error) throw error;
        showToast('Sales managers updated successfully!');
        await renderSalesManagersTable();
      } catch(e) {
        console.error(e);
        showToast('Failed to save sales managers: ' + e.message, true);
      }
    }

    async function populateSalesManagersDropdown() {
      const select = document.getElementById('sales-manager-select');
      if (!select) return;
      
      try {
        const { data } = await sb
          .from('employees')
          .select('id, first_name, last_name')
          .eq('company_id', currentCompanyId);
          
        select.innerHTML = '<option value="">-- Select Employee --</option>';
        if (data) {
          data.forEach(emp => {
            const opt = document.createElement('option');
            opt.value = emp.id;
            opt.textContent = `${emp.first_name} ${emp.last_name}`;
            select.appendChild(opt);
          });
        }
      } catch(e) {
        console.error('Failed to populate sales managers dropdown:', e);
      }
    }

    // ── HR Settings ──
    async function loadHRSettings() {
      try {
        const { data, error } = await sb
          .from('global_settings')
          .select('value')
          .eq('key', 'hr_config')
          .eq('company_id', currentCompanyId)
          .maybeSingle();

        if (error) throw error;
        if (data && data.value) {
          employeePrefix = data.value.employee_prefix || 'BK';
          document.getElementById('hr-employee-prefix').value = employeePrefix;
          document.getElementById('hr-contractor-prefix').value = data.value.contractor_prefix || '';
        } else {
          employeePrefix = 'BK';
          document.getElementById('hr-employee-prefix').value = 'BK';
          document.getElementById('hr-contractor-prefix').value = '';
        }
      } catch (err) {
        console.error('Error loading HR settings:', err);
      }
    }

    window.saveHRSettings = async function() {
      const empPrefix = document.getElementById('hr-employee-prefix').value.trim().toUpperCase();
      const conPrefix = document.getElementById('hr-contractor-prefix').value.trim().toUpperCase();

      if (empPrefix.length < 1 || empPrefix.length > 3) {
        showToast('Employee prefix must be 1 to 3 letters.', true);
        return;
      }
      if (conPrefix.length < 1 || conPrefix.length > 3) {
        showToast('Contractor prefix must be 1 to 3 letters.', true);
        return;
      }

      try {
        const { error } = await sb.from('global_settings').upsert({
          key: 'hr_config',
          company_id: currentCompanyId,
          value: {
            employee_prefix: empPrefix,
            contractor_prefix: conPrefix
          }
        });
        if (error) throw error;
        employeePrefix = empPrefix;

        // Backfill employee numbers for existing employees with new prefix
        try {
          const { data: emps, error: fetchErr } = await sb
            .from('employees')
            .select('id, employee_number')
            .eq('company_id', currentCompanyId);
          if (fetchErr) throw fetchErr;

          const updates = [];
          (emps || []).forEach(emp => {
            const num = emp.employee_number || '';
            const match = num.match(/^([A-Z]{1,3})-(\d+)$/);
            if (match) {
              const oldPref = match[1];
              const suffix = match[2];
              if (oldPref !== empPrefix) {
                updates.push({
                  id: emp.id,
                  employee_number: `${empPrefix}-${suffix}`
                });
              }
            }
          });

          if (updates.length > 0) {
            for (const u of updates) {
              await sb
                .from('employees')
                .update({ employee_number: u.employee_number })
                .eq('id', u.id);
            }
          }
        } catch (backfillErr) {
          console.error('Failed to backfill employee prefixes:', backfillErr);
        }

        showToast('HR settings saved and employee numbers backfilled successfully!');
      } catch (err) {
        console.error('Error saving HR settings:', err);
        showToast('Failed to save HR settings.', true);
      }
    };

    window.handleLogoUpload = function(event, theme) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Url = e.target.result;
        if (theme === 'light') {
          window.companyLogoLight = base64Url;
          const imgEl = document.getElementById('company-logo-light-img');
          const prevEl = document.getElementById('company-logo-light-preview');
          if (imgEl) imgEl.src = base64Url;
          if (prevEl) prevEl.style.display = 'block';
        } else {
          window.companyLogoDark = base64Url;
          const imgEl = document.getElementById('company-logo-dark-img');
          const prevEl = document.getElementById('company-logo-dark-preview');
          if (imgEl) imgEl.src = base64Url;
          if (prevEl) prevEl.style.display = 'block';
        }
      };
      reader.readAsDataURL(file);
    };

     window.saveCompanySettings = async function() {
      const name = document.getElementById('company-name')?.value || '';
      const address1 = document.getElementById('company-address-line1')?.value || '';
      const address2 = document.getElementById('company-address-line2')?.value || '';
      const email = document.getElementById('company-email')?.value || '';
      const phone = document.getElementById('company-phone')?.value || '';
      
      try {
        const { error } = await sb.from('global_settings').upsert({
          key: 'company_profile_config',
          company_id: currentCompanyId,
          value: {
            companyName: name,
            companyAddressLine1: address1,
            companyAddressLine2: address2,
            email: email,
            phone: phone,
            logoLight: window.companyLogoLight || '',
            logoDark: window.companyLogoDark || ''
          }
        });
        if (error) throw error;
        showToast('Company profile settings saved successfully.');
      } catch (err) {
        console.error(err);
        showToast('Failed to save company settings.', true);
      }
    };

    async function loadCompanySettings() {
      try {
        const { data, error } = await sb
          .from('global_settings')
          .select('value')
          .eq('key', 'company_profile_config')
          .eq('company_id', currentCompanyId)
          .maybeSingle();

        if (error) throw error;
        
        const config = data?.value || {};
        const nameEl = document.getElementById('company-name');
        if (nameEl) nameEl.value = config.companyName || '';
        const address1El = document.getElementById('company-address-line1');
        if (address1El) address1El.value = config.companyAddressLine1 || '';
        const address2El = document.getElementById('company-address-line2');
        if (address2El) address2El.value = config.companyAddressLine2 || '';
        const emailEl = document.getElementById('company-email');
        if (emailEl) emailEl.value = config.email || '';
        const phoneEl = document.getElementById('company-phone');
        if (phoneEl) phoneEl.value = config.phone || '';

        window.companyLogoLight = config.logoLight || '';
        window.companyLogoDark = config.logoDark || '';

        const logoLightImg = document.getElementById('company-logo-light-img');
        const logoLightPrev = document.getElementById('company-logo-light-preview');
        if (window.companyLogoLight) {
          if (logoLightImg) logoLightImg.src = window.companyLogoLight;
          if (logoLightPrev) logoLightPrev.style.display = 'block';
        } else {
          if (logoLightPrev) logoLightPrev.style.display = 'none';
        }

        const logoDarkImg = document.getElementById('company-logo-dark-img');
        const logoDarkPrev = document.getElementById('company-logo-dark-preview');
        if (window.companyLogoDark) {
          if (logoDarkImg) logoDarkImg.src = window.companyLogoDark;
          if (logoDarkPrev) logoDarkPrev.style.display = 'block';
        } else {
          if (logoDarkPrev) logoDarkPrev.style.display = 'none';
        }
      } catch (err) {
        console.error('Error loading company settings:', err);
      } finally {
        const skeleton = document.getElementById('company-skeleton');
        const content = document.getElementById('company-content');
        if (skeleton) skeleton.style.display = 'none';
        if (content) content.style.display = 'flex';
      }
    }

    // ── Booking Settings ──
    let bookingChecklist = [];

    const defaultChecklist = [
      { text: "Door opens and closes smoothly without obstruction", indent: false },
      { text: "Smart lock operates properly (locking and unlocking)", indent: false },
      { text: "Smart lock is successfully connected to the mobile app", indent: false },
      { text: "I know how to create an account on the app", indent: true },
      { text: "I have registered RFID card on the device", indent: true },
      { text: "All components, including the camera, screen, handle, keypad, mechanical unlock, and deadbolt, are free of defects", indent: false },
      { text: "Screws and fasteners are securely installed", indent: false },
      { text: "I have been invited to leave a review for LOOCK Cavite and has consented to taking a photo with the device for documentation", indent: false },
      { text: "Warranty coverage: 1 year on factory defects, 7 days on installation warranty (excludes user-caused damage, service may apply)", indent: false }
    ];

    async function loadBookingSettings() {
      try {
        const { data, error } = await sb
          .from('global_settings')
          .select('value')
          .eq('key', 'booking_checklist')
          .eq('company_id', currentCompanyId)
          .maybeSingle();

        if (error) throw error;
        if (data && data.value && Array.isArray(data.value)) {
          bookingChecklist = data.value;
        } else {
          bookingChecklist = [...defaultChecklist];
        }
        renderBookingChecklist();
      } catch (err) {
        console.error('Error loading Booking settings:', err);
        bookingChecklist = [...defaultChecklist];
        renderBookingChecklist();
      }
    }

    let autosaveTimeout = null;
    function triggerAutosave(immediate = false) {
      updateAutosaveStatus('Saving...');
      if (autosaveTimeout) clearTimeout(autosaveTimeout);
      
      const saveFn = async () => {
        const validItems = bookingChecklist.map(item => ({
          text: (item.text || '').trim(),
          indent: !!item.indent
        })).filter(item => item.text !== '');

        try {
          const { error } = await sb.from('global_settings').upsert({
            key: 'booking_checklist',
            company_id: currentCompanyId,
            value: validItems
          }, { onConflict: 'key, company_id' });

          if (error) throw error;
          updateAutosaveStatus('Saved');
        } catch (err) {
          console.error('Autosave failed:', err);
          updateAutosaveStatus('Failed to save changes', true);
        }
      };

      if (immediate) {
        saveFn();
      } else {
        autosaveTimeout = setTimeout(saveFn, 1000);
      }
    }

    function updateAutosaveStatus(text, isError = false) {
      const statusEl = document.getElementById('autosave-status');
      if (!statusEl) return;
      statusEl.textContent = text;
      if (isError) {
        statusEl.style.color = 'var(--danger)';
      } else if (text === 'Saving...') {
        statusEl.style.color = 'var(--cyan-light)';
      } else {
        statusEl.style.color = 'var(--text-muted)';
      }
    }

    window.addChecklistItem = function() {
      bookingChecklist.push({ text: '', indent: false });
      renderBookingChecklist();
      triggerAutosave(true);
    };

    window.updateChecklistItem = function(index, field, value) {
      if (bookingChecklist[index]) {
        bookingChecklist[index][field] = value;
        triggerAutosave(false);
      }
    };

    window.toggleIndent = function(index) {
      if (bookingChecklist[index]) {
        bookingChecklist[index].indent = !bookingChecklist[index].indent;
        renderBookingChecklist();
        triggerAutosave(true);
        
        // Retain focus on the input if possible
        const input = document.getElementById(`checklist-text-input-${index}`);
        if (input) {
          input.focus();
          const val = input.value;
          input.value = '';
          input.value = val;
        }
      }
    };

    window.removeChecklistItem = function(index) {
      bookingChecklist.splice(index, 1);
      renderBookingChecklist();
      triggerAutosave(true);
    };

    let draggedIndex = null;

    window.handleDragStart = function(e, index) {
      draggedIndex = index;
      e.dataTransfer.effectAllowed = 'move';
      const row = e.target.closest('.checklist-builder-row');
      if (row) row.classList.add('dragging');
    };

    window.handleDragOver = function(e, index) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      e.currentTarget.classList.add('drag-over');
    };

    window.handleDragLeave = function(e) {
      e.currentTarget.classList.remove('drag-over');
    };

    window.handleDrop = function(e, targetIndex) {
      e.preventDefault();
      e.currentTarget.classList.remove('drag-over');
      if (draggedIndex !== null && draggedIndex !== targetIndex) {
        const item = bookingChecklist[draggedIndex];
        bookingChecklist.splice(draggedIndex, 1);
        bookingChecklist.splice(targetIndex, 0, item);
        renderBookingChecklist();
        triggerAutosave(true);
      }
      draggedIndex = null;
    };

    window.handleDragEnd = function(e) {
      const row = e.target.closest('.checklist-builder-row');
      if (row) row.classList.remove('dragging');
      draggedIndex = null;
    };

    function renderBookingChecklist() {
      const container = document.getElementById('booking-checklist-container');
      if (!container) return;

      if (bookingChecklist.length === 0) {
        container.innerHTML = `<div style="text-align: center; font-size: 0.82rem; color: var(--text-muted); padding: 1rem 0;">No checklist items configured. Click "+ Add Item" to create one.</div>`;
        return;
      }

      container.innerHTML = '';
      bookingChecklist.forEach((item, index) => {
        const itemRow = document.createElement('div');
        itemRow.className = `checklist-builder-row ${item.indent ? 'indented' : ''}`;
        itemRow.setAttribute('ondragover', `handleDragOver(event, ${index})`);
        itemRow.setAttribute('ondragleave', 'handleDragLeave(event)');
        itemRow.setAttribute('ondrop', `handleDrop(event, ${index})`);

        itemRow.innerHTML = `
          <div class="drag-handle" title="Drag to reorder" draggable="true" ondragstart="handleDragStart(event, ${index})" ondragend="handleDragEnd(event)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1.5"></circle><circle cx="9" cy="5" r="1.5"></circle><circle cx="9" cy="19" r="1.5"></circle><circle cx="15" cy="12" r="1.5"></circle><circle cx="15" cy="5" r="1.5"></circle><circle cx="15" cy="19" r="1.5"></circle></svg>
          </div>
          <button type="button" class="btn-indent-toggle ${item.indent ? 'active' : ''}" onclick="toggleIndent(${index})" title="Toggle Sub-item/Indentation">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform: ${item.indent ? 'rotate(180deg)' : 'none'}; transition: transform 0.2s;"><polyline points="9 18 15 12 9 6"></polyline></svg>
            Sub-item
          </button>
          <input type="text" id="checklist-text-input-${index}" class="form-input" style="flex: 1; padding: 0.35rem 0.6rem; font-size: 0.82rem; height: 32px; background: var(--bg-surface);" value="${escapeHtml(item.text)}" oninput="updateChecklistItem(${index}, 'text', this.value)" placeholder="Enter checklist item text..." />
          <div style="display: flex; align-items: center; gap: 0.35rem; flex-shrink: 0;">
            <button type="button" class="btn-action-danger" onclick="removeChecklistItem(${index})" title="Remove Item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
        `;
        container.appendChild(itemRow);
      });
    }

    // ── Booking Media Requirements ──
    let bookingMediaRequirements = [];

    async function loadBookingMediaRequirements() {
      try {
        const { data, error } = await sb
          .from('global_settings')
          .select('value')
          .eq('key', 'booking_media_requirements')
          .eq('company_id', currentCompanyId)
          .maybeSingle();

        if (error) throw error;
        if (data && data.value && Array.isArray(data.value)) {
          bookingMediaRequirements = data.value;
        } else {
          bookingMediaRequirements = [];
        }
        renderBookingMediaRequirements();
      } catch (err) {
        console.error('Error loading Booking media requirements:', err);
        bookingMediaRequirements = [];
        renderBookingMediaRequirements();
      }
    }

    let mediaAutosaveTimeout = null;
    function triggerMediaAutosave(immediate = false) {
      updateMediaAutosaveStatus('Saving...');
      if (mediaAutosaveTimeout) clearTimeout(mediaAutosaveTimeout);
      
      const saveFn = async () => {
        const validItems = bookingMediaRequirements.map(item => ({
          label: (item.label || '').trim(),
          type: item.type || 'image',
          guide_url: item.guide_url || ''
        })).filter(item => item.label !== '');

        try {
          const { error } = await sb.from('global_settings').upsert({
            key: 'booking_media_requirements',
            company_id: currentCompanyId,
            value: validItems
          }, { onConflict: 'key, company_id' });

          if (error) throw error;
          updateMediaAutosaveStatus('Saved');
        } catch (err) {
          console.error('Media autosave failed:', err);
          updateMediaAutosaveStatus('Failed to save changes', true);
        }
      };

      if (immediate) {
        saveFn();
      } else {
        mediaAutosaveTimeout = setTimeout(saveFn, 1000);
      }
    }

    function updateMediaAutosaveStatus(text, isError = false) {
      const statusEl = document.getElementById('media-autosave-status');
      if (!statusEl) return;
      statusEl.textContent = text;
      if (isError) {
        statusEl.style.color = 'var(--danger)';
      } else if (text === 'Saving...') {
        statusEl.style.color = 'var(--cyan-light)';
      } else {
        statusEl.style.color = 'var(--text-muted)';
      }
    }

    window.addMediaRequirementItem = function() {
      bookingMediaRequirements.push({ label: '', type: 'image', guide_url: '' });
      renderBookingMediaRequirements();
      triggerMediaAutosave(true);
    };

    window.updateMediaRequirementItem = function(index, field, value) {
      if (bookingMediaRequirements[index]) {
        bookingMediaRequirements[index][field] = value;
        triggerMediaAutosave(false);
      }
    };

    window.handleGuideImageUpload = function(event, index) {
      const file = event.target.files[0];
      if (!file) return;

      if (file.size > 1024 * 1024) {
        showToast('Guide image must be less than 1MB.', true);
        event.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Url = e.target.result;
        if (bookingMediaRequirements[index]) {
          bookingMediaRequirements[index].guide_url = base64Url;
          renderBookingMediaRequirements();
          triggerMediaAutosave(true);
        }
      };
      reader.readAsDataURL(file);
    };

    window.removeMediaRequirementItem = function(index) {
      bookingMediaRequirements.splice(index, 1);
      renderBookingMediaRequirements();
      triggerMediaAutosave(true);
    };

    function renderBookingMediaRequirements() {
      const container = document.getElementById('booking-media-container');
      if (!container) return;

      if (bookingMediaRequirements.length === 0) {
        container.innerHTML = `<div style="text-align: center; font-size: 0.82rem; color: var(--text-muted); padding: 1rem 0;">No media requirements configured. Click "+ Add Media Requirement" to create one.</div>`;
        return;
      }

      container.innerHTML = '';
      bookingMediaRequirements.forEach((item, index) => {
        const itemRow = document.createElement('div');
        itemRow.style.cssText = 'display: grid; grid-template-columns: 1fr auto auto auto; gap: 0.75rem; align-items: center; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-elevated);';

        const guidePreviewHtml = item.guide_url
          ? `<div style="position: relative; width: 48px; height: 48px; border: 1px solid var(--border); border-radius: 4px; overflow: hidden; background: #000;">
               <img src="${escapeHtml(item.guide_url)}" style="width: 100%; height: 100%; object-fit: contain;" />
               <button type="button" style="position: absolute; top: 0; right: 0; background: rgba(220,38,38,0.85); color: #fff; border: none; border-radius: 0 0 0 4px; width: 16px; height: 16px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; font-family: monospace;" onclick="event.stopPropagation(); updateMediaRequirementItem(${index}, 'guide_url', ''); renderBookingMediaRequirements(); triggerMediaAutosave(true);">×</button>
             </div>`
          : `<div style="width: 48px; height: 48px; border: 1px dashed var(--border); border-radius: 4px; display: flex; align-items: center; justify-content: center; background: var(--bg-surface); cursor: pointer;" onclick="document.getElementById('guide-file-input-${index}').click();">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted);"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
             </div>`;

        itemRow.innerHTML = `
          <input type="text" class="form-input" style="padding: 0.35rem 0.6rem; font-size: 0.82rem; height: 36px; background: var(--bg-surface);" value="${escapeHtml(item.label)}" oninput="updateMediaRequirementItem(${index}, 'label', this.value)" placeholder="Requirement Label (e.g. Front Door View)" />
          
          <select class="form-select" style="width: 140px; height: 36px; padding: 0.35rem 1.75rem 0.35rem 0.6rem; font-size: 0.82rem; background: var(--bg-surface);" onchange="updateMediaRequirementItem(${index}, 'type', this.value)">
            <option value="image" ${item.type === 'image' ? 'selected' : ''}>Image Only</option>
            <option value="video" ${item.type === 'video' ? 'selected' : ''}>Video Only</option>
            <option value="both" ${item.type === 'both' ? 'selected' : ''}>Image or Video</option>
          </select>

          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="file" id="guide-file-input-${index}" style="display: none;" accept="image/*" onchange="handleGuideImageUpload(event, ${index})" />
            ${guidePreviewHtml}
          </div>

          <button type="button" class="btn-action-danger" style="height: 36px; width: 36px;" onclick="removeMediaRequirementItem(${index})" title="Remove Requirement">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        `;
        container.appendChild(itemRow);
      });
    }
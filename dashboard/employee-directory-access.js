(() => {
  'use strict';

  const modules = ['Business', 'Products', 'Operations', 'Marketing', 'Sales', 'Customer Service', 'Logistics', 'HR', 'Finance'];
  let directoryMembers = [];

  function employeeName(employee) {
    return [employee.first_name, employee.middle_name, employee.last_name].filter(Boolean).join(' ');
  }

  function populateReportingManagers(employees) {
    const select = document.getElementById('new-emp-reporting');
    if (!select) return;
    const current = select.value;
    const managers = (employees || []).filter(employee => {
      const status = String(employee.employment_status || 'Active').trim().toLowerCase();
      const role = `${employee.title || ''} ${employee.level || ''}`.trim().toLowerCase();
      return status === 'active' && /\b(manager|lead|director)\b/.test(role);
    }).sort((a, b) => employeeName(a).localeCompare(employeeName(b)));

    select.replaceChildren(new Option('No reporting manager', ''));
    managers.forEach(employee => {
      const role = employee.title || employee.level || 'Manager';
      const option = new Option(`${employeeName(employee)} — ${role}`, employee.id);
      select.appendChild(option);
    });
    select.value = managers.some(employee => employee.id === current) ? current : '';
  }

  function sync(prefix, moduleName) {
    const parent = document.querySelector(`.${prefix}-custom-access[data-module="${moduleName}"]`);
    document.querySelectorAll(`.${prefix}-subpage-access[data-module="${moduleName}"]`).forEach(child => {
      child.checked = Boolean(parent?.checked);
      child.disabled = false;
    });
  }

  function syncParent(prefix, moduleName) {
    const parent = document.querySelector(`.${prefix}-custom-access[data-module="${moduleName}"]`);
    const children = Array.from(document.querySelectorAll(`.${prefix}-subpage-access[data-module="${moduleName}"]`));
    if (parent && children.length) parent.checked = children.every(child => child.checked);
  }

  function setExpanded(prefix, moduleName, expanded) {
    const group = document.querySelector(`.directory-access-group[data-prefix="${prefix}"][data-module="${moduleName}"]`);
    if (!group) return;
    group.classList.toggle('open', expanded);
    const toggle = group.querySelector('.directory-access-toggle');
    toggle?.setAttribute('aria-expanded', String(expanded));
    toggle?.setAttribute('aria-label', `${expanded ? 'Hide' : 'Show'} ${moduleName} subpages`);
  }

  function render(prefix) {
    const container = document.getElementById(`${prefix}-access-options`);
    if (!container) return;
    const scopedConfig = window.BKAuth?.subpageAccess || {};
    const options = modules.map(moduleName => {
      const subpages = scopedConfig[moduleName] || [];
      const parent = `<label class="directory-access-option"><input type="checkbox" class="${prefix}-custom-access directory-access-parent" value="${moduleName}" data-module="${moduleName}" /> <span>${moduleName}</span>${subpages.length ? '<small>Full access</small>' : ''}</label>`;
      if (!subpages.length) return { scoped: false, html: parent };
      const children = subpages.map(item => `<label class="directory-subpage-option"><input type="checkbox" class="${prefix}-subpage-access" value="${item.key}" data-module="${moduleName}" /> ${item.label}</label>`).join('');
      const toggle = `<button type="button" class="directory-access-toggle" aria-label="Show ${moduleName} subpages" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg></button>`;
      return { scoped: true, html: `<div class="directory-access-group" data-prefix="${prefix}" data-module="${moduleName}"><div class="directory-access-header">${parent}${toggle}</div><div class="directory-access-subpages">${children}</div></div>` };
    });
    const basic = options.filter(option => !option.scoped).map(option => option.html).join('');
    const scoped = options.filter(option => option.scoped).map(option => option.html).join('');
    container.innerHTML = `<div class="directory-access-basic">${basic}</div><div class="directory-access-scoped">${scoped}</div>`;
    container.querySelectorAll('.directory-access-parent').forEach(parent => {
      parent.addEventListener('change', () => sync(prefix, parent.dataset.module));
    });
    container.querySelectorAll(`.${prefix}-subpage-access`).forEach(child => {
      child.addEventListener('change', () => syncParent(prefix, child.dataset.module));
    });
    container.querySelectorAll('.directory-access-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const group = toggle.closest('.directory-access-group');
        setExpanded(prefix, group.dataset.module, !group.classList.contains('open'));
      });
    });
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (clipboardError) {
      const copyField = document.createElement('textarea');
      copyField.value = value;
      copyField.setAttribute('readonly', '');
      copyField.style.position = 'fixed';
      copyField.style.opacity = '0';
      document.body.appendChild(copyField);
      copyField.select();
      const copied = document.execCommand('copy');
      copyField.remove();
      if (!copied) throw clipboardError;
      return true;
    }
  }

  function availableDirectoryMembers(employees) {
    const linkedIds = new Set((employees || []).map(employee => employee.id).filter(Boolean));
    const linkedEmails = new Set((employees || []).map(employee => String(employee.email || '').toLowerCase()).filter(Boolean));
    return directoryMembers.filter(member => !linkedIds.has(member.user_id) && !linkedEmails.has(String(member.user_email).toLowerCase()));
  }

  function configureEmployeeAccount(mode, accountId = '') {
    const select = document.getElementById('new-emp-account');
    const email = document.getElementById('new-emp-email');
    if (!select || !email) return;
    select.value = mode === 'existing' ? accountId : '';
    const member = directoryMembers.find(item => item.user_id === select.value);
    email.value = member?.user_email || '';
    email.readOnly = Boolean(member);
    if (!member) return;
    const nameParts = String(member.full_name || '').trim().split(/\s+/).filter(Boolean);
    const firstName = document.getElementById('new-emp-first-name');
    const lastName = document.getElementById('new-emp-last-name');
    if (firstName && !firstName.value && nameParts.length) firstName.value = nameParts[0];
    if (lastName && !lastName.value && nameParts.length > 1) lastName.value = nameParts.slice(1).join(' ');
  }

  window.BKDirectoryAccess = {
    invitationEndpoint() {
      return /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
        ? 'https://www.brightkeysolutions.com/api/send-invitation'
        : '/api/send-invitation';
    },
    async loadDirectoryMembers(sb, tenantId) {
      directoryMembers = [];
      const { data, error } = await sb.from('tenant_members')
        .select('user_id, user_email, full_name').eq('tenant_id', tenantId).limit(500);
      if (error) throw error;
      directoryMembers = (data || []).filter(member => member.user_id && member.user_email);
      return directoryMembers;
    },
    openEmployeeEntryChooser(employees) {
      const modal = document.getElementById('employee-entry-choice-modal');
      const select = document.getElementById('employee-entry-account');
      if (!modal || !select) return;
      const available = availableDirectoryMembers(employees);
      const placeholder = new Option('Select an Access user', '');
      placeholder.disabled = true; placeholder.hidden = true;
      select.replaceChildren(placeholder);
      available.sort((a, b) => String(a.full_name || a.user_email).localeCompare(String(b.full_name || b.user_email))).forEach(member => {
        select.appendChild(new Option(`${member.full_name || 'BrightKey User'} — ${member.user_email}`, member.user_id));
      });
      document.querySelectorAll('input[name="employee-entry-type"]').forEach(input => { input.checked = false; });
      document.getElementById('employee-entry-account-wrap').hidden = true;
      const linkOutput = document.getElementById('employee-entry-link-output');
      const linkField = document.getElementById('employee-entry-link-url');
      if (linkOutput) linkOutput.hidden = true;
      if (linkField) linkField.value = '';
      const actionButton = document.getElementById('employee-entry-continue');
      actionButton.disabled = true;
      actionButton.textContent = 'Produce Link';
      const help = document.getElementById('employee-entry-account-help');
      if (help) help.textContent = available.length ? 'Only Access users who are not yet in the directory are shown.' : 'All Access users are already linked to directory profiles.';
      modal.classList.add('open');
    },
    closeEmployeeEntryChooser() { document.getElementById('employee-entry-choice-modal')?.classList.remove('open'); },
    updateEmployeeEntryChoice() {
      const type = document.querySelector('input[name="employee-entry-type"]:checked')?.value || '';
      const accountWrap = document.getElementById('employee-entry-account-wrap');
      const accountId = document.getElementById('employee-entry-account')?.value || '';
      if (accountWrap) accountWrap.hidden = type !== 'existing';
      const linkOutput = document.getElementById('employee-entry-link-output');
      const linkField = document.getElementById('employee-entry-link-url');
      if (linkOutput) linkOutput.hidden = true;
      if (linkField) linkField.value = '';
      const button = document.getElementById('employee-entry-continue');
      if (button) {
        button.textContent = type === 'manual' ? 'Fill out form' : 'Produce Link';
        button.disabled = !type || (type === 'existing' && !accountId);
      }
    },
    async continueEmployeeEntry() {
      const type = document.querySelector('input[name="employee-entry-type"]:checked')?.value || '';
      const accountId = document.getElementById('employee-entry-account')?.value || '';
      if (!type || (type === 'existing' && !accountId)) return;
      if (type === 'manual') {
        this.closeEmployeeEntryChooser();
        App.openAddEmployeeModal('new', '');
        return;
      }
      await this.createEmployeeRegistrationLink({
        button: document.getElementById('employee-entry-continue'),
        tenantId: App.tenantId,
        companyId: App.companyId,
        accountId: type === 'existing' ? accountId : '',
        sb: BKAuth.sb,
        toast: App.showToast
      });
    },
    backToEmployeeEntryChooser(employees) {
      App.closeAddEmployeeModal();
      window.setTimeout(() => this.openEmployeeEntryChooser(employees), 160);
    },
    configureEmployeeAccount,
    applySelectedEmployeeAccount(payload) {
      const selectedId = document.getElementById('new-emp-account')?.value || '';
      if (!selectedId) return payload;
      const member = directoryMembers.find(item => item.user_id === selectedId);
      if (!member) throw new Error('The selected BrightKey account is no longer available. Reopen the form and try again.');
      payload.id = member.user_id;
      payload.email = member.user_email;
      return payload;
    },
    async createEmployeeRegistrationLink({ button, tenantId, companyId, accountId = '', sb, toast }) {
      const originalText = button?.textContent || 'Produce Link';
      if (button) { button.disabled = true; button.textContent = 'Creating link…'; }
      try {
        if (!tenantId || !companyId) {
          toast('Your company could not be identified. Refresh the page and try again.', 'error');
          return;
        }
        const { data: { session } } = await sb.auth.getSession();
        if (!session?.access_token) {
          toast('Your session has expired. Sign in again and retry.', 'error');
          return;
        }
        const member = accountId ? directoryMembers.find(item => item.user_id === accountId) : null;
        if (accountId && !member) {
          toast('That Access user is no longer available. Choose another account.', 'error');
          return;
        }
        const response = await fetch(this.invitationEndpoint(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({
            tenant_id: tenantId,
            company_id: companyId,
            email: member?.user_email || `invite-${crypto.randomUUID()}@placeholder.brightkey.com`,
            full_name: member?.full_name || 'New Employee',
            role: 'employee',
            invite_type: 'full'
          })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.fallback_link) {
          toast(result.error || 'The employee registration link could not be created. Please try again.', 'error');
          return;
        }
        const linkOutput = document.getElementById('employee-entry-link-output');
        const linkField = document.getElementById('employee-entry-link-url');
        if (linkField) linkField.value = result.fallback_link;
        if (linkOutput) linkOutput.hidden = false;
        toast('Employee registration link created.', 'success');
      } catch (error) {
        console.error('Employee registration link creation failed:', error);
        toast('The employee registration link could not be created. Please try again.', 'error');
      } finally {
        if (button) { button.disabled = false; button.textContent = originalText; }
      }
    },
    async copyProducedEmployeeLink(toast) {
      const value = document.getElementById('employee-entry-link-url')?.value || '';
      if (!value) return;
      try {
        await copyText(value);
        toast('Employee registration link copied to clipboard!', 'success');
      } catch (error) {
        console.error('Employee registration link copy failed:', error);
        toast('The link could not be copied. Select it and copy it manually.', 'error');
      }
    },
    async fetchNextEmployeeNumber(sb, companyId) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token || !companyId) throw new Error('Your company or session could not be verified. Refresh and try again.');
      const response = await fetch('/api/next-employee-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ company_id: companyId })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.employee_number) throw new Error(result.error || 'The next employee number could not be generated.');
      return result.employee_number;
    },
    updatePayoutMode() {
      const mode = document.querySelector('input[name="new-emp-payout-mode"]:checked')?.value || 'account';
      const accountWrap = document.getElementById('new-emp-payout-account-wrap');
      const qrWrap = document.getElementById('new-emp-payout-qr-wrap');
      const details = document.getElementById('new-emp-payout');
      const qrUrl = document.getElementById('new-emp-payout-image');
      if (accountWrap) accountWrap.hidden = mode === 'qr';
      if (qrWrap) qrWrap.hidden = mode !== 'qr';
      if (details) details.required = mode === 'account';
      if (qrUrl) qrUrl.required = mode === 'qr';
    },
    collect(prefix) {
      const selected = Array.from(document.querySelectorAll(`.${prefix}-custom-access:checked`)).map(input => input.value);
      Object.keys(window.BKAuth?.subpageAccess || {}).forEach(moduleName => {
        if (selected.includes(moduleName)) return;
        const scoped = Array.from(document.querySelectorAll(`.${prefix}-subpage-access[data-module="${moduleName}"]:checked`)).map(input => input.value);
        if (!scoped.length) return;
        if (!selected.includes(moduleName)) selected.push(moduleName);
        selected.push(...scoped);
      });
      return selected;
    },
    setRole(prefix, role) {
      document.querySelectorAll(`.${prefix}-custom-access`).forEach(parent => { parent.checked = role === 'admin'; });
      document.querySelectorAll(`.${prefix}-subpage-access`).forEach(child => { child.checked = false; });
      Object.keys(window.BKAuth?.subpageAccess || {}).forEach(moduleName => {
        setExpanded(prefix, moduleName, false);
        sync(prefix, moduleName);
      });
    }
  };
  window.BKDirectoryReporting = { populate: populateReportingManagers };

  render('invite');
  render('link-invite');
})();

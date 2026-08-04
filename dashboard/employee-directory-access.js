(() => {
  'use strict';

  const modules = ['Business', 'Products', 'Operations', 'Marketing', 'Sales', 'Customer Service', 'Logistics', 'HR', 'Finance'];

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

  window.BKDirectoryAccess = {
    invitationEndpoint() {
      return /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
        ? 'https://www.brightkeysolutions.com/api/send-invitation'
        : '/api/send-invitation';
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

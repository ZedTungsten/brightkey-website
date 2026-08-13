(() => {
  'use strict';

  const TABS = [
    { key: 'contracts', label: 'Contracts', href: '/dashboard/hr-onboarding/contracts' },
    { key: 'handbook', label: 'Handbook', href: '/dashboard/hr-onboarding/handbook' },
    { key: 'materials', label: 'Materials', href: '/dashboard/hr-onboarding/materials' }
  ];

  function activeTab() {
    const path = window.location.pathname.replace(/\/+$/, '');
    return TABS.find(tab => path === tab.href)?.key || 'contracts';
  }

  function render() {
    const main = document.getElementById('hr-onboarding-main');
    if (!main) return;
    const selected = activeTab();
    main.innerHTML = `<header class="dash-topbar hr-onboarding-topbar"><h1>Onboarding</h1><nav class="drawer-tabs" aria-label="HR onboarding sections">${TABS.map(tab => `<a class="tab-btn${tab.key === selected ? ' active' : ''}" href="${tab.href}"${tab.key === selected ? ' aria-current="page"' : ''}>${tab.label}</a>`).join('')}</nav></header><section class="hr-onboarding-content" aria-live="polite"></section>`;
  }

  async function init() {
    const authInfo = await window.BKAuth.checkRoleGate(['HR'], '/admin.html');
    if (!authInfo) return;
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

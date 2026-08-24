(async function initCustomerServiceResources() {
  'use strict';

  if (!window.BKAuth) return;
  await window.BKAuth.checkRoleGate(['Customer Service'], '/admin.html');
})();

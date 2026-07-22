'use strict';

window.SettingsPage = {
  sb: null,
  currentUser: null,
  currentTenantId: null,
  currentCompanyId: '',
  allTeamMembers: [],

  // Helpers
  showToast: function(msg, isError = false) {
    if (isError && window.BKFriendlyError) msg = window.BKFriendlyError(msg);
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${isError ? 'error' : 'success'}`;
    el.innerText = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  },

  // Confirm Modal
  confirmCallback: null,
  showConfirmModal: function(message, onConfirm) {
    document.getElementById('confirm-message').textContent = message;
    this.confirmCallback = onConfirm;
    document.getElementById('confirm-modal').classList.add('open');
  },
  closeConfirmModal: function() {
    document.getElementById('confirm-modal').classList.remove('open');
    this.confirmCallback = null;
  },

  // Load team members (needed for dropdown options)
  loadAllTeamMembers: async function() {
    try {
      const { data, error } = await this.sb.from('tenant_members').select('id, user_email, full_name, role, user_id, accessible_modules').eq('tenant_id', this.currentTenantId);
      if (!error && data) {
        this.allTeamMembers = data;
      }
    } catch(e) {
      console.warn('Failed to load team members for dropdown:', e);
    }
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  const authInfo = await BKAuth.checkRoleGate([], '../../admin.html');
  if (!authInfo) return;

  SettingsPage.sb = BKAuth.sb;
  SettingsPage.currentUser = authInfo.user;
  SettingsPage.currentTenantId = authInfo.tenantId;

  try {
    const { data: companyData } = await SettingsPage.sb.from('companies').select('id').eq('tenant_id', SettingsPage.currentTenantId).limit(1);
    SettingsPage.currentCompanyId = companyData?.[0]?.id || '';
  } catch (err) {
    console.error('Error fetching company:', err);
  }

  // Setup confirm modal listeners
  const confirmYes = document.getElementById('btn-confirm-yes');
  if (confirmYes) {
    confirmYes.addEventListener('click', () => {
      if (SettingsPage.confirmCallback) SettingsPage.confirmCallback();
      SettingsPage.closeConfirmModal();
    });
  }

  // Bridge globals
  Object.defineProperty(window, 'sb', { get() { return SettingsPage.sb; } });
  Object.defineProperty(window, 'currentTenantId', { get() { return SettingsPage.currentTenantId; } });
  Object.defineProperty(window, 'currentUser', { get() { return SettingsPage.currentUser; } });
  Object.defineProperty(window, 'currentCompanyId', { get() { return SettingsPage.currentCompanyId; } });

  if (window.initSettingsPage) {
    await window.initSettingsPage();
  }
});

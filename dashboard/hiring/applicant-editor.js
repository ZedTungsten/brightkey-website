(() => {
  'use strict';

  const state = { applicationId: null };

  function ensureModal() {
    if (document.getElementById('applicant-edit-modal')) return;
    const modal = document.createElement('div');
    modal.className = 'hiring-modal-overlay';
    modal.id = 'applicant-edit-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'applicant-edit-title');
    modal.innerHTML = `
      <div class="hiring-modal-card applicant-edit-card">
        <div class="hiring-modal-header">
          <h3 id="applicant-edit-title">Edit applicant information</h3>
          <button class="hiring-icon-btn" type="button" aria-label="Close" onclick="BKApplicantEditor.close()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>
        <form id="applicant-edit-form">
          <div class="hiring-modal-body">
            <div class="hiring-form-grid">
              <div class="hiring-field">
                <label for="applicant-edit-first-name">First Name <span class="required">*</span></label>
                <input id="applicant-edit-first-name" name="first_name" type="text" maxlength="120" autocomplete="given-name" required />
              </div>
              <div class="hiring-field">
                <label for="applicant-edit-last-name">Last Name <span class="required">*</span></label>
                <input id="applicant-edit-last-name" name="last_name" type="text" maxlength="120" autocomplete="family-name" required />
              </div>
              <div class="hiring-field">
                <label for="applicant-edit-contact">Contact Number <span class="required">*</span></label>
                <input id="applicant-edit-contact" name="contact_number" type="tel" maxlength="40" autocomplete="tel" required />
              </div>
              <div class="hiring-field">
                <label for="applicant-edit-email">Email <span class="required">*</span></label>
                <input id="applicant-edit-email" name="email" type="email" maxlength="254" autocomplete="email" required />
              </div>
            </div>
          </div>
          <div class="hiring-modal-footer">
            <button class="btn btn-outline" type="button" onclick="BKApplicantEditor.close()">Cancel</button>
            <button class="btn btn-primary" id="applicant-edit-save" type="submit">Save Changes</button>
          </div>
        </form>
      </div>`;
    modal.addEventListener('click', event => {
      if (event.target === modal) window.BKApplicantEditor.close();
    });
    modal.querySelector('#applicant-edit-form').addEventListener('submit', save);
    document.body.appendChild(modal);
  }

  function application() {
    return window.HiringApp?.applications?.find(item => item.id === state.applicationId) || null;
  }

  function open(applicationId) {
    ensureModal();
    state.applicationId = applicationId;
    const record = application();
    if (!record) {
      window.HiringApp?.showToast('The applicant could not be found. Refresh the page and try again.', true);
      return;
    }
    document.getElementById('applicant-edit-first-name').value = record.first_name || '';
    document.getElementById('applicant-edit-last-name').value = record.last_name || '';
    document.getElementById('applicant-edit-contact').value = record.contact_number || '';
    document.getElementById('applicant-edit-email').value = record.email || '';
    window.HiringApp.openModal('applicant-edit-modal');
    document.getElementById('applicant-edit-first-name').focus();
  }

  function close() {
    window.HiringApp?.closeModal('applicant-edit-modal');
    state.applicationId = null;
  }

  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const record = application();
    if (!record || !window.HiringApp?.companyId) return;

    const updates = {
      first_name: form.elements.first_name.value.trim(),
      last_name: form.elements.last_name.value.trim(),
      contact_number: form.elements.contact_number.value.trim(),
      email: form.elements.email.value.trim().toLowerCase()
    };
    if (Object.values(updates).some(value => !value)) {
      window.HiringApp.showToast('Complete all applicant information fields.', true);
      return;
    }

    const saveButton = document.getElementById('applicant-edit-save');
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    try {
      const { data, error } = await window.HiringApp.sb
        .from('job_applications')
        .update(updates)
        .eq('company_id', window.HiringApp.companyId)
        .eq('id', record.id)
        .select('id, first_name, last_name, contact_number, email')
        .maybeSingle();
      if (error || !data) throw error || new Error('Applicant not found');

      Object.assign(record, data);
      window.HiringApp.renderApplicationsTable(window.HiringApp.selectedApplicantJob);
      window.HiringApp.showToast('Applicant information updated.');
      close();
    } catch (error) {
      console.error('Applicant update failed:', error);
      window.HiringApp.showToast('The applicant information could not be updated. Please try again.', true);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Save Changes';
    }
  }

  window.BKApplicantEditor = { open, close };
})();

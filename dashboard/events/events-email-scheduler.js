'use strict';

Object.assign(window.EventsApp, {
  // ── Email Scheduler & Status Modals Logic ─────────────────────────

  async openScheduleEmailModal() {
    const modal = document.getElementById('schedule-email-modal');
    if (!modal) return;

    // Reset fields
    document.getElementById('chk-all-depts').checked = false;
    document.getElementById('mode-send-now').checked = true;
    this.toggleScheduleDateInput(false);
    document.getElementById('schedule-datetime').value = '';

    const treeContainer = document.getElementById('scheduler-recipients-tree');
    treeContainer.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-muted); font-size:0.8rem;">Loading recipients list...</div>';

    modal.classList.add('open');

    try {
      // 1. Fetch all employees in company
      const { data: employees, error } = await getSb()
        .from('employees')
        .select('id, first_name, last_name, department, email')
        .eq('company_id', this.companyId)
        .order('department', { ascending: true })
        .order('first_name', { ascending: true });

      if (error) throw error;

      if (!employees || employees.length === 0) {
        treeContainer.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-muted); font-size:0.8rem;">No employees found in directory.</div>';
        return;
      }

      // Group employees by department
      const deptMap = {};
      employees.forEach(emp => {
        const d = emp.department || 'No Department';
        if (!deptMap[d]) deptMap[d] = [];
        deptMap[d].push(emp);
      });

      // Build checkbox tree
      let html = '';
      Object.keys(deptMap).forEach((dept, dIdx) => {
        const emps = deptMap[dept];
        html += `
          <div style="margin-top:0.4rem;">
            <!-- Department Header Checkbox -->
            <label style="display:flex; align-items:center; gap:0.45rem; font-weight:600; cursor:pointer; font-size:0.8rem; color:var(--text-primary);">
              <input type="checkbox" class="dept-group-chk" data-dept-idx="${dIdx}" onchange="EventsApp.toggleDeptGroup(${dIdx}, this.checked)" style="width:13px; height:13px; accent-color:var(--cyan);" />
              ${esc(dept)} (${emps.length})
            </label>

            <!-- Child Employees Container -->
            <div style="padding-left:1.35rem; display:flex; flex-direction:column; gap:0.35rem; margin-top:0.3rem;">
              ${emps.map(emp => {
                const fullName = `${emp.first_name} ${emp.last_name}`;
                return `
                  <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer; font-size:0.75rem; color:var(--text-secondary);">
                    <input type="checkbox" class="emp-chk" data-emp-id="${emp.id}" data-emp-email="${esc(emp.email)}" data-dept-idx="${dIdx}" onchange="EventsApp.syncDeptState(${dIdx})" style="width:12px; height:12px; accent-color:var(--cyan);" />
                    ${esc(fullName)} <span style="font-size:0.7rem; color:var(--text-muted);">(${esc(emp.email)})</span>
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        `;
      });

      treeContainer.innerHTML = html;

    } catch (e) {
      console.error(e);
      const errMsg = e.message || e.details || (typeof e === 'object' ? JSON.stringify(e) : String(e));
      treeContainer.innerHTML = `<div style="padding:1rem; text-align:center; color:var(--red); font-size:0.8rem;">Failed to load employee list: ${esc(errMsg)}</div>`;
    }
  },

  closeScheduleEmailModal() {
    const modal = document.getElementById('schedule-email-modal');
    if (modal) modal.classList.remove('open');
  },

  toggleAllDepartments(checked) {
    // Sync all department checkboxes
    const deptChks = document.querySelectorAll('.dept-group-chk');
    deptChks.forEach(chk => {
      chk.checked = checked;
    });

    // Sync all employee checkboxes
    const empChks = document.querySelectorAll('.emp-chk');
    empChks.forEach(chk => {
      chk.checked = checked;
    });
  },

  toggleDeptGroup(deptIdx, checked) {
    // Select all child checkboxes of this department
    const childChks = document.querySelectorAll(`.emp-chk[data-dept-idx="${deptIdx}"]`);
    childChks.forEach(chk => {
      chk.checked = checked;
    });

    // Sync the "All Departments" parent checkbox
    this.syncAllDeptsState();
  },

  syncDeptState(deptIdx) {
    const childChks = document.querySelectorAll(`.emp-chk[data-dept-idx="${deptIdx}"]`);
    const deptChk = document.querySelector(`.dept-group-chk[data-dept-idx="${deptIdx}"]`);

    if (childChks.length > 0 && deptChk) {
      const allChecked = Array.from(childChks).every(c => c.checked);
      deptChk.checked = allChecked;
    }

    // Sync the "All Departments" parent checkbox
    this.syncAllDeptsState();
  },

  syncAllDeptsState() {
    const deptChks = document.querySelectorAll('.dept-group-chk');
    const allDeptsChk = document.getElementById('chk-all-depts');

    if (deptChks.length > 0 && allDeptsChk) {
      const allChecked = Array.from(deptChks).every(c => c.checked);
      allDeptsChk.checked = allChecked;
    }
  },

  toggleScheduleDateInput(show) {
    const wrap = document.getElementById('schedule-datetime-wrap');
    const confirmBtn = document.getElementById('scheduler-confirm-btn');
    if (wrap) wrap.style.display = show ? 'block' : 'none';
    if (confirmBtn) confirmBtn.textContent = show ? 'Schedule' : 'Send Now';
  },

  async confirmScheduleOrSend() {
    // 1. Gather all selected employee emails
    const checkedEmpChks = document.querySelectorAll('.emp-chk:checked');
    if (checkedEmpChks.length === 0) {
      window.Toast?.error?.('Please select at least one recipient.');
      return;
    }

    const recipientEmails = Array.from(checkedEmpChks).map(c => c.getAttribute('data-emp-email')).filter(Boolean);
    const recipientIds = Array.from(checkedEmpChks).map(c => c.getAttribute('data-emp-id')).filter(Boolean);

    // 2. Identify scheduling mode
    const isSchedule = document.getElementById('mode-schedule').checked;
    let scheduledDateStr = null;

    if (isSchedule) {
      const dateVal = document.getElementById('schedule-datetime').value;
      if (!dateVal) {
        window.Toast?.error?.('Please select a date and time to schedule.');
        return;
      }

      const selectedDate = new Date(dateVal);
      const now = new Date();

      if (selectedDate <= now) {
        window.Toast?.error?.('Cannot schedule in the past.');
        return;
      }

      // Must be at least 5 minutes in future
      const fiveMinsFuture = new Date(now.getTime() + 5 * 60 * 1000);
      if (selectedDate < fiveMinsFuture) {
        window.Toast?.error?.('Please select a date/time at least 5 minutes in the future.');
        return;
      }

      scheduledDateStr = selectedDate.toISOString();
    }

    const loader = document.getElementById('email-builder-loading-overlay');
    if (loader) loader.style.display = 'flex';

    try {
      // 3. Force-trigger a local autosave first to ensure latest contents/styles are stored
      await this.autosaveEmailConfig();

      if (isSchedule) {
        // 4. Update the event table in DB to be scheduled
        const { error } = await getSb()
          .from('company_events')
          .update({
            email_scheduled: true,
            email_scheduled_at: scheduledDateStr,
            email_sent: false,
            email_recipients: { emails: recipientEmails, employee_ids: recipientIds }
          })
          .eq('id', this.builderEventId);

        if (error) throw error;

        window.Toast?.success?.('Email scheduled successfully!');
        this.closeScheduleEmailModal();
        this.closeEmailBuilder();
        this.loadEvents();

      } else {
        // 5. Send Now immediately!
        // Retrieve current editor values
        const subject = document.getElementById('builder-subject').value;
        const preheader = document.getElementById('builder-preheader').value;
        const attendeeCta = document.getElementById('builder-attendee-response').checked;

        // Settings config
        const settings = {
          bgColor: document.getElementById('style-bg-color').value,
          alignment: document.getElementById('style-alignment').value,
          logoSize: document.getElementById('style-logo-size').value,
          titleSize: document.getElementById('style-title-size').value,
          titleColor: document.getElementById('style-title-color').value,
          bodySize: document.getElementById('style-body-size').value,
          bodyColor: document.getElementById('style-body-color').value,
          indent: document.getElementById('style-indent').value,
          lineHeight: document.getElementById('style-line-height').value,
          gap: document.getElementById('style-gap').value,
          linkColor: document.getElementById('style-link-color').value,
          ctaAffirm: document.getElementById('style-cta-affirm').value,
          ctaNegative: document.getElementById('style-cta-negative').value,
          socialColor: document.getElementById('style-social-color').value,
          socialSize: document.getElementById('style-social-size').value,
          socialLinks: (this.availableSocialLinks || []).filter(item => {
            const chk = document.getElementById(`social-chk-${item.platform}`);
            return chk && chk.checked;
          }).map(item => ({ platform: item.platform, url: item.url }))
        };

        // Call the consolidated send-custom-email API
        const response = await window.BKAuth.authenticatedFetch('/api/send-custom-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: this.companyId,
            eventId: this.builderEventId,
            subject,
            preheader,
            attendeeCta,
            blocks: this.builderBlocks,
            settings,
            logo: this.companyLogo,
            address: this.companyAddress,
            testRecipient: recipientEmails.join(',') // Sending to resolved checked emails
          })
        });

        const resData = await response.json();
        if (!response.ok) throw new Error(resData.error || 'Failed to send emails.');

        // Update sent flags in DB
        await getSb()
          .from('company_events')
          .update({
            email_sent: true,
            email_sent_at: new Date().toISOString(),
            email_scheduled: false,
            email_scheduled_at: null,
            email_recipients: { emails: recipientEmails, employee_ids: recipientIds }
          })
          .eq('id', this.builderEventId);

        window.Toast?.success?.('Invitation emails sent successfully!');
        this.closeScheduleEmailModal();
        this.closeEmailBuilder();
        this.loadEvents();
      }

    } catch (e) {
      console.error(e);
      window.Toast?.error?.('Action failed: ' + e.message);
    } finally {
      if (loader) loader.style.display = 'none';
    }
  },

  async openScheduledStatusModal(ev) {
    const modal = document.getElementById('scheduled-status-modal');
    if (!modal) return;

    this.builderEventId = ev.id;

    // Populate metadata details
    document.getElementById('sched-event-title').textContent = ev.title || 'Event Title';
    document.getElementById('sched-event-date').textContent = fmtDate(ev.date_from);

    const schedDate = ev.email_scheduled_at ? new Date(ev.email_scheduled_at) : null;
    const formattedSchedTime = schedDate
      ? schedDate.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Not Scheduled';

    document.getElementById('sched-email-time').textContent = formattedSchedTime;
    document.getElementById('sched-email-subject').textContent = ev.email_subject || 'Subject Line';

    // Renders the email preview inside the phone frame
    const schedMockupRender = document.getElementById('sched-mockup-render');
    const mockupBody = document.getElementById('mockup-screen-body');

    if (schedMockupRender && mockupBody) {
      // Temporarily populate builder to let system compile preview
      this.builderBlocks = ev.email_body_json || [];

      // Load styling inputs to reflect current settings
      const settings = ev.email_settings || {};
      if (settings.bgColor) document.getElementById('style-bg-color').value = settings.bgColor;
      if (settings.alignment) document.getElementById('style-alignment').value = settings.alignment;
      if (settings.logoSize) document.getElementById('style-logo-size').value = settings.logoSize;
      if (settings.titleSize) document.getElementById('style-title-size').value = settings.titleSize;
      if (settings.titleColor) document.getElementById('style-title-color').value = settings.titleColor;
      if (settings.bodySize) document.getElementById('style-body-size').value = settings.bodySize;
      if (settings.bodyColor) document.getElementById('style-body-color').value = settings.bodyColor;
      if (settings.indent) document.getElementById('style-indent').value = settings.indent;
      if (settings.lineHeight) document.getElementById('style-line-height').value = settings.lineHeight;
      if (settings.gap) document.getElementById('style-gap').value = settings.gap;
      if (settings.linkColor) document.getElementById('style-link-color').value = settings.linkColor;
      if (settings.ctaAffirm) document.getElementById('style-cta-affirm').value = settings.ctaAffirm;
      if (settings.ctaNegative) document.getElementById('style-cta-negative').value = settings.ctaNegative;
      if (settings.socialColor) document.getElementById('style-social-color').value = settings.socialColor;
      if (settings.socialSize) document.getElementById('style-social-size').value = settings.socialSize;

      // Trigger render
      this.updatePreview();

      // Copy content and background color
      schedMockupRender.innerHTML = mockupBody.innerHTML;
      schedMockupRender.parentElement.style.backgroundColor = mockupBody.style.backgroundColor || '#ffffff';
    }

    modal.classList.add('open');
  },

  closeScheduledStatusModal() {
    const modal = document.getElementById('scheduled-status-modal');
    if (modal) modal.classList.remove('open');
  },

  async unscheduleEmail() {
    if (!this.builderEventId) return;

    try {
      const { error } = await getSb()
        .from('company_events')
        .update({
          email_scheduled: false,
          email_scheduled_at: null
        })
        .eq('id', this.builderEventId);

      if (error) throw error;

      window.Toast?.success?.('Email unscheduled successfully.');
      this.closeScheduledStatusModal();
      this.loadEvents();
    } catch (e) {
      console.error(e);
      window.Toast?.error?.('Unschedule failed: ' + e.message);
    }
  },

  async editScheduledEmail() {
    const eventId = this.builderEventId;
    this.closeScheduledStatusModal();

    // Relaunch the builder, bypassing the sched check since we explicitly clicked edit
    const loader = document.getElementById('email-builder-loading-overlay');
    if (loader) loader.style.display = 'flex';

    // Relaunch
    setTimeout(async () => {
      this.builderEventId = eventId;

      const { data: ev } = await getSb().from('company_events').select('*').eq('id', eventId).maybeSingle();
      const eventTitle = ev ? ev.title : 'Event';
      const eventDate = ev ? fmtDate(ev.date_from) : '';
      document.getElementById('builder-event-title').textContent = `Event: ${eventTitle} (${eventDate})`;

      document.getElementById('builder-subject').value = ev.email_subject || '';
      document.getElementById('builder-preheader').value = ev.email_preheader || '';
      document.getElementById('builder-attendee-response').checked = ev.email_attendee_response !== false;

      this.builderBlocks = ev.email_body_json || [];

      // Restore style values
      const settings = ev.email_settings || {};
      if (settings.bgColor) {
        document.getElementById('style-bg-color').value = settings.bgColor;
        document.getElementById('style-bg-color-hex').value = settings.bgColor.toUpperCase();
      }
      if (settings.alignment) document.getElementById('style-alignment').value = settings.alignment;
      if (settings.logoSize) document.getElementById('style-logo-size').value = settings.logoSize;
      if (settings.titleSize) document.getElementById('style-title-size').value = settings.titleSize;
      if (settings.titleColor) {
        document.getElementById('style-title-color').value = settings.titleColor;
        document.getElementById('style-title-color-hex').value = settings.titleColor.toUpperCase();
      }
      if (settings.bodySize) document.getElementById('style-body-size').value = settings.bodySize;
      if (settings.bodyColor) {
        document.getElementById('style-body-color').value = settings.bodyColor;
        document.getElementById('style-body-color-hex').value = settings.bodyColor.toUpperCase();
      }
      if (settings.indent) document.getElementById('style-indent').value = settings.indent;
      if (settings.lineHeight) document.getElementById('style-line-height').value = settings.lineHeight;
      if (settings.gap) document.getElementById('style-gap').value = settings.gap;
      if (settings.linkColor) {
        document.getElementById('style-link-color').value = settings.linkColor;
        document.getElementById('style-link-color-hex').value = settings.linkColor.toUpperCase();
      }
      if (settings.ctaAffirm) {
        document.getElementById('style-cta-affirm').value = settings.ctaAffirm;
        document.getElementById('style-cta-affirm-hex').value = settings.ctaAffirm.toUpperCase();
      }
      if (settings.ctaNegative) {
        document.getElementById('style-cta-negative').value = settings.ctaNegative;
        document.getElementById('style-cta-negative-hex').value = settings.ctaNegative.toUpperCase();
      }
      if (settings.socialColor) {
        document.getElementById('style-social-color').value = settings.socialColor;
        document.getElementById('style-social-color-hex').value = settings.socialColor.toUpperCase();
      }
      if (settings.socialSize) document.getElementById('style-social-size').value = settings.socialSize;

      this.updatePreview();
      this.updateCharCounts();

      if (loader) loader.style.display = 'none';
      document.getElementById('email-builder-modal').classList.add('open');
    }, 200);
  }
});

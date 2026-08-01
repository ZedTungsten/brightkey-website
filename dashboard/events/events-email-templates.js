'use strict';

Object.assign(window.EventsApp, {
  async openAttendeesModal(eventId) {
    const modal = document.getElementById('event-attendees-modal');
    if (!modal) return;

    document.getElementById('attendees-modal-event-title').textContent = 'Loading event info...';
    document.getElementById('stat-sent-count').textContent = '0';
    document.getElementById('stat-opened-count').textContent = '0';
    document.getElementById('stat-attending-count').textContent = '0';
    document.getElementById('stat-declined-count').textContent = '0';

    const tbody = document.getElementById('attendees-modal-table-body');
    const emptyMsg = document.getElementById('attendees-modal-empty-msg');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted);">Loading analytics data...</td></tr>';
    emptyMsg.style.display = 'none';

    modal.classList.add('open');

    try {
      // 1. Fetch Event details
      const { data: event } = await getSb()
        .from('company_events')
        .select('title, date_from')
        .eq('id', eventId)
        .maybeSingle();

      if (event) {
        document.getElementById('attendees-modal-event-title').textContent = `${event.title} (${fmtDate(event.date_from)})`;
      }

      // 2. Fetch Attendees tracking data
      const { data: records, error } = await getSb()
        .from('company_event_attendees')
        .select(`
          status,
          opened,
          responded_via,
          updated_at,
          employees (
            first_name,
            last_name,
            department
          )
        `)
        .eq('event_id', eventId);

      if (error) throw error;

      if (!records || records.length === 0) {
        tbody.innerHTML = '';
        emptyMsg.style.display = 'block';
        return;
      }

      let sentCount = records.filter(r => r.responded_via !== 'calendar').length;
      let calendarCount = records.filter(r => r.responded_via === 'calendar').length;
      let openedCount = 0;
      let attendingCount = 0;
      let declinedCount = 0;

        const chronologicalRecords = [...records].sort((a, b) => {
            const aTime = a.updated_at ? new Date(a.updated_at).getTime() : Number.POSITIVE_INFINITY;
            const bTime = b.updated_at ? new Date(b.updated_at).getTime() : Number.POSITIVE_INFINITY;
            return aTime - bTime;
        });

        tbody.innerHTML = chronologicalRecords.map(r => {
        const emp = r.employees || {};
        const firstName = String(emp.first_name || '').trim();
        const lastName = String(emp.last_name || '').trim();
        const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown Recipient';
        const dept = emp.department || '—';

        if (r.opened) openedCount++;
        if (r.status === 'attending') attendingCount++;
        else if (r.status === 'not_attending') declinedCount++;

        // Responded Via badge
        const respondedViaBadge = r.responded_via === 'calendar'
          ? `<span style="display:inline-block;padding:2px 6px;font-size:0.68rem;font-weight:700;border-radius:4px;background:#e0f2fe;color:#0369a1;">Calendar</span>`
          : `<span style="display:inline-block;padding:2px 6px;font-size:0.68rem;font-weight:700;border-radius:4px;background:#f5f3ff;color:#6d28d9;">Email</span>`;

        // Opened badge
        const openedBadge = r.opened
          ? `<span style="display:inline-block;padding:2px 6px;font-size:0.68rem;font-weight:700;border-radius:4px;background:#ecfdf5;color:#10b981;">Yes</span>`
          : `<span style="display:inline-block;padding:2px 6px;font-size:0.68rem;font-weight:700;border-radius:4px;background:#f3f4f6;color:#6b7280;">No</span>`;

        // RSVP status badge
        let rsvpBadge = '';
        if (r.status === 'attending') {
          rsvpBadge = `<span style="display:inline-block;padding:2px 6px;font-size:0.68rem;font-weight:700;border-radius:4px;background:#ecfdf5;color:#10b981;">Attending</span>`;
        } else if (r.status === 'not_attending') {
          rsvpBadge = `<span style="display:inline-block;padding:2px 6px;font-size:0.68rem;font-weight:700;border-radius:4px;background:#fef2f2;color:#ef4444;">Declined</span>`;
        } else {
          rsvpBadge = `<span style="display:inline-block;padding:2px 6px;font-size:0.68rem;font-weight:700;border-radius:4px;background:#f3f4f6;color:#6b7280;">No Response</span>`;
        }

        const lastResponse = r.updated_at
          ? new Date(r.updated_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '—';

        return `
          <tr>
            <td style="font-weight:400;white-space:nowrap;">${esc(fullName)}</td>
            <td>${esc(dept)}</td>
            <td style="text-align:center;">${respondedViaBadge}</td>
            <td style="text-align:center;">${openedBadge}</td>
            <td style="text-align:center;">${rsvpBadge}</td>
            <td style="text-align:center;color:var(--text-muted);font-size:0.75rem;">${lastResponse}</td>
          </tr>
        `;
      }).join('');

      document.getElementById('stat-sent-count').textContent = sentCount;
      document.getElementById('stat-opened-count').textContent = openedCount;
      document.getElementById('stat-calendar-count').textContent = calendarCount;
      document.getElementById('stat-attending-count').textContent = attendingCount;
      document.getElementById('stat-declined-count').textContent = declinedCount;

    } catch (e) {
      console.error(e);
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--red);">Failed to load analytics tracking data.</td></tr>';
    }
  },

  closeAttendeesModal() {
    const modal = document.getElementById('event-attendees-modal');
    if (modal) modal.classList.remove('open');
  },

  async loadTemplatesList() {
    const tbody = document.getElementById('templates-modal-table-body');
    const emptyMsg = document.getElementById('templates-modal-empty-msg');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:1.5rem;color:var(--text-muted);">Loading templates...</td></tr>';
    emptyMsg.style.display = 'none';

    try {
      const { data: templates, error } = await getSb()
        .from('email_templates')
        .select('id, name, created_at')
        .eq('company_id', this.companyId)
        .eq('category', 'HR')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!templates || templates.length === 0) {
        tbody.innerHTML = '';
        emptyMsg.style.display = 'block';
        return;
      }

      tbody.innerHTML = templates.map(t => {
        const createdDate = new Date(t.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        const nameEscaped = (t.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `
          <tr>
            <td style="border-left: none;">
              <a href="javascript:void(0)" onclick="EventsApp.selectTemplate('${t.id}')" style="font-weight:600; color:var(--cyan-light); text-decoration:none; display:block; padding:0.2rem 0;">
                ${t.name}
              </a>
            </td>
            <td>${createdDate}</td>
            <td style="border-right: none; text-align: center; white-space: nowrap; padding: 0.35rem 0.2rem;">
              <button onclick="EventsApp.renameTemplatePrompt('${t.id}', '${nameEscaped}')" class="btn-action" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:0.25rem 0.4rem; margin-right:0.25rem;" title="Rename">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
              </button>
              <button onclick="EventsApp.deleteTemplatePrompt('${t.id}', '${nameEscaped}')" class="btn-action" style="background:none; border:none; color:#ef4444; cursor:pointer; padding:0.25rem 0.4rem;" title="Delete">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      console.error(e);
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:1.5rem;color:#ef4444;">Failed to load templates.</td></tr>';
    }
  },

  renameTemplatePrompt(id, oldName) {
    this.activeRenameId = id;
    document.getElementById('template-rename-input').value = oldName;
    document.getElementById('template-rename-modal').classList.add('open');
  },

  closeRenameTemplate() {
    document.getElementById('template-rename-modal').classList.remove('open');
    this.activeRenameId = null;
  },

  async confirmRenameTemplate() {
    const newName = document.getElementById('template-rename-input').value.trim();
    if (!newName) {
      window.Toast?.error?.('Please enter a template name.');
      return;
    }
    try {
      const { error } = await getSb()
        .from('email_templates')
        .update({ name: newName })
        .eq('id', this.activeRenameId);

      if (error) throw error;

      window.Toast?.success?.('Template renamed successfully!');
      this.closeRenameTemplate();
      this.loadTemplatesList();
    } catch (e) {
      console.error(e);
      window.Toast?.error?.('Failed to rename template: ' + e.message);
    }
  },

  deleteTemplatePrompt(id, name) {
    this.activeDeleteId = id;
    document.getElementById('delete-template-name-label').textContent = name;
    document.getElementById('template-delete-modal').classList.add('open');
  },

  closeDeleteTemplate() {
    document.getElementById('template-delete-modal').classList.remove('open');
    this.activeDeleteId = null;
  },

  async confirmDeleteTemplate() {
    try {
      const { error } = await getSb()
        .from('email_templates')
        .delete()
        .eq('id', this.activeDeleteId);

      if (error) throw error;

      window.Toast?.success?.('Template deleted successfully!');
      this.closeDeleteTemplate();
      this.loadTemplatesList();
    } catch (e) {
      console.error(e);
      window.Toast?.error?.('Failed to delete template: ' + e.message);
    }
  },

  async selectTemplate(templateId) {
    if (!templateId) return;
    try {
      const { data: t } = await getSb()
        .from('email_templates')
        .select('*')
        .eq('id', templateId)
        .maybeSingle();

      if (t) {
        this.builderBlocks = t.body_json || [];

        // Set style inputs
        const settings = t.settings || {};
        if (settings.bgColor) {
          document.getElementById('style-bg-color').value = settings.bgColor;
          document.getElementById('style-bg-color-hex').value = settings.bgColor.toUpperCase();
        }
        if (settings.alignment) document.getElementById('style-alignment').value = settings.alignment;
        if (settings.logoSize) document.getElementById('style-logo-size').value = settings.logoSize;
        if (settings.headerSize) document.getElementById('style-header-size').value = settings.headerSize;
        if (settings.subSize) document.getElementById('style-subheader-size').value = settings.subSize;
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


        // Restore check state for social links
        const activeSocials = settings.socialLinks || [];
        (this.availableSocialLinks || []).forEach(item => {
          const chk = document.getElementById(`social-chk-${item.platform}`);
          if (chk) {
            chk.checked = activeSocials.some(s => s.platform === item.platform);
          }
        });

        this.renderBlocksList();
        this.updatePreview();
        window.Toast?.success?.('Template loaded successfully.');
        this.closeTemplatesModal();
      }
    } catch (e) {
      console.error(e);
      window.Toast?.error?.('Failed to load template.');
    }
  },

  async saveTemplatePrompt() {
    document.getElementById('template-name-input').value = '';
    document.getElementById('template-name-input').disabled = false;
    document.getElementById('template-overwrite-confirm').style.display = 'none';
    document.getElementById('template-overwrite-name-label').textContent = '';
    document.getElementById('template-save-btn').textContent = 'Save Template';

    // Populate overwrite dropdown with existing templates
    const sel = document.getElementById('template-overwrite-select');
    sel.innerHTML = '<option value="">-- None --</option>';
    try {
      const { data: templates } = await getSb()
        .from('email_templates')
        .select('id, name')
        .eq('company_id', this.companyId)
        .eq('category', 'HR')
        .order('name');
      if (templates) {
        templates.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = t.name;
          sel.appendChild(opt);
        });
      }
    } catch (e) { console.error(e); }

    document.getElementById('template-name-modal').classList.add('open');
  },

  closeSaveTemplate() {
    document.getElementById('template-name-modal').classList.remove('open');
  },

  onOverwriteSelectChange() {
    const sel = document.getElementById('template-overwrite-select');
    const confirmDiv = document.getElementById('template-overwrite-confirm');
    const nameLabel = document.getElementById('template-overwrite-name-label');
    const nameInput = document.getElementById('template-name-input');
    const saveBtn = document.getElementById('template-save-btn');
    const selectedName = sel.options[sel.selectedIndex]?.textContent || '';

    if (sel.value) {
      // Overwrite mode
      nameLabel.textContent = selectedName;
      confirmDiv.style.display = 'block';
      nameInput.value = '';
      nameInput.disabled = true;
      saveBtn.textContent = 'Overwrite';
    } else {
      // New template mode
      confirmDiv.style.display = 'none';
      nameInput.disabled = false;
      saveBtn.textContent = 'Save Template';
    }
  },

  async confirmSaveTemplate() {
    const overwriteSelect = document.getElementById('template-overwrite-select');
    const overwriteId = overwriteSelect.value;
    const name = document.getElementById('template-name-input').value.trim();

    if (!overwriteId && !name) {
      window.Toast?.error?.('Please enter a template name or select one to overwrite.');
      return;
    }

    const subject = document.getElementById('builder-subject').value.trim();
    const settings = {
      bgColor: document.getElementById('style-bg-color').value,
      alignment: document.getElementById('style-alignment').value,
      logoSize: document.getElementById('style-logo-size').value,
      headerSize: document.getElementById('style-header-size').value,
      subSize: document.getElementById('style-subheader-size').value,
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

    try {
      if (overwriteId) {
        // Overwrite existing template
        const { error } = await getSb()
          .from('email_templates')
          .update({ subject, body_json: this.builderBlocks, settings })
          .eq('id', overwriteId)
          .eq('company_id', this.companyId);
        if (error) throw error;
        window.Toast?.success?.('Template overwritten successfully!');
      } else {
        // Insert new template
        const payload = {
          company_id: this.companyId,
          name,
          category: 'HR',
          subject,
          body_json: this.builderBlocks,
          settings
        };
        const { error } = await getSb().from('email_templates').insert([payload]);
        if (error) throw error;
        window.Toast?.success?.('Template saved successfully!');
      }
      this.closeSaveTemplate();
    } catch (e) {
      console.error(e);
      window.Toast?.error?.('Failed to save template: ' + e.message);
    }
  },

  async sendEmailBuilder() {
    const subject = document.getElementById('builder-subject').value.trim();
    const preheader = document.getElementById('builder-preheader').value.trim();
    const attendeeCta = document.getElementById('builder-attendee-response').checked;
    const btn = document.getElementById('builder-send-btn');

    if (!subject) { window.Toast?.error?.('Please enter a subject line.'); return; }

    // Fetch style settings
    const settings = {
      bgColor: document.getElementById('style-bg-color').value,
      alignment: document.getElementById('style-alignment').value,
      logoSize: document.getElementById('style-logo-size').value,
      headerSize: document.getElementById('style-header-size').value,
      subSize: document.getElementById('style-subheader-size').value,
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

    btn.disabled = true;
    btn.innerHTML = 'Sending...';

    try {
      const res = await window.BKAuth.authenticatedFetch('/api/send-custom-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          companyId: this.companyId,
          eventId: this.builderEventId,
          subject,
          preheader,
          attendeeCta,
          blocks: this.builderBlocks,
          settings,
          logo: this.companyLogo,
          address: this.companyAddress
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send email.');

      window.Toast?.success?.(`Invitation dispatch triggered! Sent to ${data.count} staff members.`);
      this.closeEmailBuilder();
    } catch (e) {
      console.error(e);
      window.Toast?.error?.(e.message || 'Failed to dispatch invitation.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.25rem;"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        Send Email
      `;
    }
  },

  sendTestPrompt() {
    document.getElementById('test-email-input').value = '';
    document.getElementById('send-test-modal').classList.add('open');
  },

  closeSendTest() {
    document.getElementById('send-test-modal').classList.remove('open');
  },

  async confirmSendTest() {
    const testEmail = document.getElementById('test-email-input').value.trim();
    if (!testEmail) { window.Toast?.error?.('Please enter a test email address.'); return; }

    const subject = document.getElementById('builder-subject').value.trim();
    const preheader = document.getElementById('builder-preheader').value.trim();
    const attendeeCta = document.getElementById('builder-attendee-response').checked;
    const btn = document.getElementById('test-send-btn');

    if (!subject) { window.Toast?.error?.('Please enter a subject line.'); return; }

    // Fetch style settings
    const settings = {
      bgColor: document.getElementById('style-bg-color').value,
      alignment: document.getElementById('style-alignment').value,
      logoSize: document.getElementById('style-logo-size').value,
      headerSize: document.getElementById('style-header-size').value,
      subSize: document.getElementById('style-subheader-size').value,
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

    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      const res = await window.BKAuth.authenticatedFetch('/api/send-custom-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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
          testRecipient: testEmail
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send test email.');

      window.Toast?.success?.(`Test email successfully sent to ${testEmail}!`);
      this.closeSendTest();
    } catch (e) {
      console.error(e);
      window.Toast?.error?.(e.message || 'Failed to send test email.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Test';
    }
  },

});

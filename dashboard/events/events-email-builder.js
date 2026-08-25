'use strict';

Object.assign(window.EventsApp, {
  /* ── Send Email (stub) ── */
  /* ── Email Builder Logic ── */
  builderEventId: null,
  builderBlocks: [],
  companyLogo: '',
  companyAddress: '123 Business Road, Suite 100, Manila',
  hrSenderName: 'BrightKey HR',
  hrSenderEmail: '',

  async openEmailBuilder(id) {
    this.builderEventId = id;
    const loader = document.getElementById('email-builder-loading-overlay');
    if (loader) loader.style.display = 'flex';

    // Fetch Event details
    const { data: ev } = await getSb().from('company_events').select('*').eq('id', id).maybeSingle();

    if (ev && ev.email_scheduled) {
      if (loader) loader.style.display = 'none';
      this.openScheduledStatusModal(ev);
      return;
    }

    const eventTitle = ev ? ev.title : 'Event';
    const eventDesc = ev ? (ev.description || '') : '';
    const eventDate = ev ? fmtDate(ev.date_from) : '';
    document.getElementById('builder-event-title').textContent = `Event: ${eventTitle} (${eventDate})`;

    // Fetch Sender details
    try {
      const { data: integration } = await getSb()
        .from('company_integrations')
        .select('hr_sender_name, hr_resend_from_email, hr_smtp_user')
        .eq('company_id', this.companyId)
        .maybeSingle();

      if (integration) {
        this.hrSenderName = integration.hr_sender_name || 'BrightKey HR';
        this.hrSenderEmail = integration.hr_resend_from_email || integration.hr_smtp_user || 'onboarding@mycompany.com';
      }
      document.getElementById('builder-sender-name').value = this.hrSenderName;
      document.getElementById('builder-sender-email').value = this.hrSenderEmail;
    } catch (e) { console.error('Error fetching integration data:', e); }

    // Fetch company logo and address
    try {
      const { data: coProfile } = await getSb()
        .from('global_settings')
        .select('value')
        .eq('key', 'company_profile_config')
        .eq('company_id', this.companyId)
        .maybeSingle();

      if (coProfile?.value) {
        this.companyLogo = coProfile.value.logoDark || coProfile.value.logoLight || '';
        const coName = coProfile.value.companyName || 'BrightKey Solutions';
        const addr1 = coProfile.value.companyAddressLine1 || '';
        const addr2 = coProfile.value.companyAddressLine2 || '';
        const coPhone = coProfile.value.phone || '';
        const coEmail = coProfile.value.email || '';

        this.companyAddress = `
          <div style="font-weight: 700; font-size: 13px; margin-bottom: 2px;">${esc(coName)}</div>
          ${addr1 ? `<div>${esc(addr1)}</div>` : ''}
          ${addr2 ? `<div>${esc(addr2)}</div>` : ''}
          ${(coPhone || coEmail) ? `<div style="margin-top: 2px; color: var(--text-muted);">${esc(coPhone)}${coPhone && coEmail ? ' | ' : ''}${esc(coEmail)}</div>` : ''}
        `.trim();

        // Populate social links options dynamically
        const savedLinks = coProfile.value.socialLinks || [];
        this.availableSocialLinks = savedLinks;

        const chkContainer = document.getElementById('builder-social-checkboxes');
        if (chkContainer) {
          if (savedLinks.length === 0) {
            chkContainer.innerHTML = '<span style="font-size:0.75rem; color:var(--text-muted); font-style:italic; grid-column:span 2;">No social links configured in settings.</span>';
          } else {
            chkContainer.innerHTML = savedLinks.map(item => `
              <label class="vis-label" style="padding: 0.35rem 0.5rem; font-size: 0.72rem; display: flex; align-items: center; gap: 0.4rem;">
                <input type="checkbox" id="social-chk-${item.platform}" checked onchange="EventsApp.updatePreview()" />
                <span>${item.platform}</span>
              </label>
            `).join('');
          }
        }
      }
    } catch (e) { console.error('Error fetching company profile:', e); }

    // Set up company logo and address in preview
    const logoContainer = document.getElementById('mockup-logo-container');
    if (this.companyLogo) {
      logoContainer.innerHTML = `<img src="${this.companyLogo}" alt="Logo" style="max-height: 48px; object-fit: contain; display: block !important; margin: 0 auto !important;" />`;
    } else {
      logoContainer.innerHTML = `<div style="font-size: 0.78rem; font-weight: 800; color: var(--text-muted); border: 1.5px dashed var(--border); padding: 0.4rem; display: inline-block; margin: 0 auto !important;">Company Logo</div>`;
    }
    document.getElementById('mockup-address-container').innerHTML = this.companyAddress;



    // Check if the event already has an autosaved email config
    if (ev && ev.email_body_json) {
      this.builderBlocks = ev.email_body_json || [];
      document.getElementById('builder-subject').value = ev.email_subject || '';
      document.getElementById('builder-preheader').value = ev.email_preheader || '';
      document.getElementById('builder-attendee-response').checked = (ev.email_attendee_response !== false);
      if (ev.email_sender_name) document.getElementById('builder-sender-name').value = ev.email_sender_name;
      if (ev.email_sender_email) document.getElementById('builder-sender-email').value = ev.email_sender_email;

      // Restore style settings inputs
      const settings = ev.email_settings || {};
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
    } else {
      // Autoload last used template if one exists
      try {
        const { data: lastTemplate } = await getSb()
          .from('email_templates')
          .select('*')
          .eq('company_id', this.companyId)
          .eq('category', 'HR')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastTemplate) {
          this.builderBlocks = lastTemplate.body_json || [];

          // Restore style settings inputs
          const settings = lastTemplate.settings || {};
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
        } else {
          // Default layout setup
          this.builderBlocks = [
            { id: '1', type: 'header', value: eventTitle },
            { id: '2', type: 'subheader', value: `Join us on ${eventDate}` },
            { id: '3', type: 'body', value: eventDesc || 'We are excited to invite you to our upcoming team event! Please see details below and let us know if you can make it.' },
            { id: '4', type: 'signature', value: 'Best regards,\nHR Department' }
          ];
        }
      } catch (e) {
        console.error('Error autoloading template:', e);
        this.builderBlocks = [
          { id: '1', type: 'header', value: eventTitle },
          { id: '2', type: 'subheader', value: `Join us on ${eventDate}` },
          { id: '3', type: 'body', value: eventDesc || 'We are excited to invite you to our upcoming team event! Please see details below and let us know if you can make it.' },
          { id: '4', type: 'signature', value: 'Best regards,\nHR Department' }
        ];
      }

      document.getElementById('builder-subject').value = `Invitation: ${eventTitle}`;
      document.getElementById('builder-preheader').value = `You are invited to join us for ${eventTitle}`;
      document.getElementById('builder-attendee-response').checked = true;
    }

    // Initialize hex input text values from color inputs
    const colorFields = ['style-bg-color', 'style-body-color', 'style-link-color', 'style-cta-affirm', 'style-cta-negative', 'style-social-color'];
    colorFields.forEach(f => {
      const colVal = document.getElementById(f)?.value || '';
      const hexEl = document.getElementById(f + '-hex');
      if (hexEl) hexEl.value = colVal.toUpperCase();
    });

    this.updateCharCounts();
    this.renderBlocksList();
    this.toggleAttendeeResponse();
    this.updatePreview();

    if (loader) loader.style.display = 'none';
    document.getElementById('email-builder-modal').classList.add('open');

    if (!this.builderEscapeGuard) {
      this.builderEscapeGuard = (event) => {
        if (event.key !== 'Escape' || !document.getElementById('email-builder-modal')?.classList.contains('open')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.openSaveChangesConfirm();
      };
      document.addEventListener('keydown', this.builderEscapeGuard, true);
    }
  },

  openSaveChangesConfirm() {
    document.getElementById('content-builder-save-confirm-modal')?.classList.add('open');
  },

  closeSaveChangesConfirm() {
    document.getElementById('content-builder-save-confirm-modal')?.classList.remove('open');
  },

  async confirmSaveBuilderChanges() {
    this.closeSaveChangesConfirm();
    await this.closeEmailBuilder();
  },

  discardBuilderChangesFromConfirm() {
    this.closeSaveChangesConfirm();
    this.discardEmailBuilder();
  },

  async closeEmailBuilder() {
    if (this.autosaveTimeout) {
      clearTimeout(this.autosaveTimeout);
      this.autosaveTimeout = null;
    }
    const saved = await this.autosaveEmailConfig({ showToast: true });
    if (saved) this.hideEmailBuilder();
  },

  discardEmailBuilder() {
    if (this.autosaveTimeout) {
      clearTimeout(this.autosaveTimeout);
      this.autosaveTimeout = null;
    }
    this.hideEmailBuilder();
  },

  hideEmailBuilder() {
    this.closeSaveChangesConfirm();
    document.getElementById('email-builder-modal').classList.remove('open');
    this.closeAutocomplete();
  },

  updateCharCounts() {
    const subjectInput = document.getElementById('builder-subject');
    const preheaderInput = document.getElementById('builder-preheader');

    if (subjectInput) {
      const remaining = 100 - subjectInput.value.length;
      document.getElementById('subject-char-count').textContent = `${remaining} remaining`;
    }
    if (preheaderInput) {
      const remaining = 50 - preheaderInput.value.length;
      document.getElementById('preheader-char-count').textContent = `${remaining} remaining`;
    }
  },


  addBlock(type) {
    let defaultValue = '';
    let defaultConfig = {};
    if (type === 'header') defaultValue = 'New Header';
    else if (type === 'subheader') defaultValue = 'New Subheader';
    else if (type === 'section-header') defaultValue = 'Section Title';
    else if (type === 'signature') defaultValue = 'Sincerely,\nHR';
    else if (type === 'spacer') defaultConfig = { size: 'medium' };
    else if (type === 'hr') defaultConfig = { color: '#d1d5db', thickness: 'thin', length: 'full' };

    this.builderBlocks.push({
      id: String(Date.now() + Math.random()),
      type,
      value: defaultValue,
      config: defaultConfig
    });
    this.renderBlocksList();
    this.updatePreview();
  },

  removeBlock(id) {
    this.builderBlocks = this.builderBlocks.filter(b => b.id !== id);
    this.renderBlocksList();
    this.updatePreview();
  },

  moveBlock(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= this.builderBlocks.length) return;
    const temp = this.builderBlocks[index];
    this.builderBlocks[index] = this.builderBlocks[targetIndex];
    this.builderBlocks[targetIndex] = temp;
    this.renderBlocksList();
    this.updatePreview();
  },

  renderBlocksList() {
    const container = document.getElementById('builder-blocks-container');
    container.innerHTML = '';

    if (this.builderBlocks.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted); font-style:italic; font-size:0.8rem; text-align:center; padding:1.5rem; border: 1px dashed var(--border);">No blocks added. Insert blocks above.</div>';
      return;
    }

    const richTypes = ['body', 'signature', 'section-body', 'bullet-list', 'num-list'];

    // SVG arrows for thicker appearance
    const svgUp = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;
    const svgDown = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

    this.builderBlocks.forEach((block, idx) => {
      const card = document.createElement('div');
      card.className = 'block-card';

      const isRich = richTypes.includes(block.type);
      const textareaId = `block-ta-${block.id}`;

      let formatToolbar = '';
      if (isRich) {
        formatToolbar = `
          <div style="display:inline-flex; gap:2px; margin-left:0.5rem;">
            <button type="button" class="action-btn format-btn" data-editor-id="${textareaId}" data-format="bold" style="width:22px;height:22px;font-weight:900;font-size:0.85rem;" onmousedown="event.preventDefault()" onclick="EventsApp.applyFormat('${block.id}','${textareaId}','bold')" title="Bold">B</button>
            <button type="button" class="action-btn format-btn" data-editor-id="${textareaId}" data-format="italic" style="width:22px;height:22px;font-style:italic;font-weight:700;font-size:0.85rem;" onmousedown="event.preventDefault()" onclick="EventsApp.applyFormat('${block.id}','${textareaId}','italic')" title="Italic">I</button>
            <button type="button" class="action-btn format-btn" data-editor-id="${textareaId}" data-format="underline" style="width:22px;height:22px;text-decoration:underline;font-weight:700;font-size:0.85rem;" onmousedown="event.preventDefault()" onclick="EventsApp.applyFormat('${block.id}','${textareaId}','underline')" title="Underline">U</button>
          </div>
        `;
      }

      let inputHtml = '';
      if (block.type === 'spacer') {
        const sz = block.config?.size || 'medium';
        inputHtml = `
          <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
            <span style="font-size:0.72rem; color:var(--text-muted);">Size:</span>
            ${['small','medium','large'].map(s => `
              <label style="display:inline-flex;align-items:center;gap:3px;font-size:0.72rem;cursor:pointer;">
                <input type="radio" name="spacer-sz-${block.id}" value="${s}" ${sz === s ? 'checked' : ''}
                  onchange="EventsApp.updateBlockConfig('${block.id}', 'size', this.value)">
                ${s.charAt(0).toUpperCase() + s.slice(1)}
              </label>
            `).join('')}
          </div>
        `;
      } else if (block.type === 'hr') {
        const cfg = block.config || {};
        const col = cfg.color || '#d1d5db';
        const thk = cfg.thickness || 'thin';
        const len = cfg.length || 'full';
        inputHtml = `
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:0.75rem;">
            <label style="display:inline-flex;align-items:center;gap:4px;font-size:0.72rem;">
              Color:
              <div style="display:inline-flex;align-items:center;gap:3px;">
                <input type="color" id="hr-col-picker-${block.id}" value="${col}" style="width:24px;height:22px;padding:0;border:1px solid var(--border);border-radius:3px;cursor:pointer;"
                  oninput="EventsApp.syncColorText(this, 'hr-col-hex-${block.id}'); EventsApp.updateBlockConfig('${block.id}', 'color', this.value)">
                <input type="text" id="hr-col-hex-${block.id}" value="${col.toUpperCase()}" style="width:58px;height:22px;font-size:0.68rem;padding:0 3px;font-family:monospace;border:1px solid var(--border);border-radius:3px;background:var(--bg-surface);color:var(--text-primary);text-transform:uppercase;" maxlength="7"
                  oninput="EventsApp.syncTextColor(this, 'hr-col-picker-${block.id}'); EventsApp.updateBlockConfig('${block.id}', 'color', document.getElementById('hr-col-picker-${block.id}').value)">
              </div>
            </label>
            <span style="font-size:0.72rem; color:var(--text-muted);">Thickness:</span>
            ${['thin','medium','thick'].map(t => `
              <label style="display:inline-flex;align-items:center;gap:3px;font-size:0.72rem;cursor:pointer;">
                <input type="radio" name="hr-thk-${block.id}" value="${t}" ${thk === t ? 'checked' : ''}
                  onchange="EventsApp.updateBlockConfig('${block.id}', 'thickness', this.value)">
                ${t.charAt(0).toUpperCase() + t.slice(1)}
              </label>
            `).join('')}
            <span style="font-size:0.72rem; color:var(--text-muted);">Length:</span>
            ${['short','medium','full'].map(l => `
              <label style="display:inline-flex;align-items:center;gap:3px;font-size:0.72rem;cursor:pointer;">
                <input type="radio" name="hr-len-${block.id}" value="${l}" ${len === l ? 'checked' : ''}
                  onchange="EventsApp.updateBlockConfig('${block.id}', 'length', this.value)">
                ${l.charAt(0).toUpperCase() + l.slice(1)}
              </label>
            `).join('')}
          </div>
        `;
      } else if (block.type === 'bullet-list' || block.type === 'num-list') {
        const listTag = block.type === 'bullet-list' ? 'ul' : 'ol';
        const items = String(block.value || '').split('\n').filter(item => item.trim() !== '');
        const listItems = (items.length ? items : ['']).map(item => `<li>${this._renderRichText(item)}</li>`).join('');
        inputHtml = `<div id="${textareaId}" class="form-input rich-block-editor rich-list-editor" contenteditable="true" role="textbox" aria-multiline="true" oninput="EventsApp.updateBlockRichValue('${block.id}', this)" onkeyup="EventsApp.updateFormatToolbar('${textareaId}')" onmouseup="EventsApp.updateFormatToolbar('${textareaId}')" onfocus="EventsApp.updateFormatToolbar('${textareaId}')"><${listTag}>${listItems}</${listTag}></div>`;
      } else if (isRich) {
        const keydownHandler = block.type === 'signature' ? ' onkeydown="EventsApp.handleSignatureKeydown(event)"' : '';
        inputHtml = `<div id="${textareaId}" class="form-input rich-block-editor" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Enter paragraph text"${keydownHandler} oninput="EventsApp.updateBlockRichValue('${block.id}', this)" onkeyup="EventsApp.updateFormatToolbar('${textareaId}')" onmouseup="EventsApp.updateFormatToolbar('${textareaId}')" onfocus="EventsApp.updateFormatToolbar('${textareaId}')">${this._renderRichText(block.value)}</div>`;
      } else {
        inputHtml = `<input type="text" class="form-input" style="font-size:0.85rem;" placeholder="Enter header text" value="${esc(block.value)}" oninput="EventsApp.updateBlockValue('${block.id}', this.value)" />`;
      }

      card.innerHTML = `
        <div class="block-header">
          <div style="display:flex;align-items:center;">
            <span>${block.type.replace('-', ' ')}</span>
            ${formatToolbar}
          </div>
          <div style="display:flex; gap:0.25rem;">
            <button class="action-btn" style="width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;" onclick="EventsApp.moveBlock(${idx}, -1)" title="Move Up">${svgUp}</button>
            <button class="action-btn" style="width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;" onclick="EventsApp.moveBlock(${idx}, 1)" title="Move Down">${svgDown}</button>
            <button class="action-btn danger" style="width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:1rem;line-height:1;background:var(--danger,#ef4444);color:#fff;border-color:var(--danger,#ef4444);border-radius:4px;" onclick="EventsApp.removeBlock('${block.id}')" title="Delete Block">&times;</button>
          </div>
        </div>
        ${inputHtml}
      `;
      container.appendChild(card);
    });
  },

  applyFormat(blockId, editorId, format) {
    const editor = document.getElementById(editorId);
    if (!editor) return;
    editor.focus();
    document.execCommand('styleWithCSS', false, false);
    document.execCommand(format, false, null);
    this.updateBlockRichValue(blockId, editor);
    this.updateFormatToolbar(editorId);
  },

  updateFormatToolbar(editorId) {
    document.querySelectorAll('.format-btn').forEach(button => {
      if (button.dataset.editorId !== editorId) return;
      button.classList.toggle('active', document.queryCommandState(button.dataset.format));
    });
  },

  handleSignatureKeydown(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const lineCount = (event.currentTarget.innerText || '').replace(/\r/g, '').split('\n').length;
    if (lineCount >= 3) return;
    document.execCommand('insertLineBreak', false, null);
  },

  updateBlockRichValue(id, editor) {
    const wrapFormattedLines = (content, before, after) => content
      .split('\n')
      .map(line => line ? `${before}${line}${after}` : '')
      .join('\n');
    const serialize = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName.toLowerCase();
      const content = Array.from(node.childNodes).map(serialize).join('');
      if (tag === 'br') return '\n';
      if (tag === 'strong' || tag === 'b') return wrapFormattedLines(content, '**', '**');
      if (tag === 'em' || tag === 'i') return wrapFormattedLines(content, '_', '_');
      if (tag === 'u') return wrapFormattedLines(content, '<u>', '</u>');
      if (tag === 'li') return `${content}\n`;
      if (tag === 'div' || tag === 'p') return `\n${content}\n`;
      return content;
    };
    const value = Array.from(editor.childNodes).map(serialize).join('')
      .replace(/\u00a0/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+|\n+$/g, '');
    this.updateBlockValue(id, value);
    this.updateFormatToolbar(editor.id);
  },

  updateBlockValue(id, value) {
    const block = this.builderBlocks.find(b => b.id === id);
    if (block) {
      block.value = value;
      this.updatePreview();
    }
  },

  updateBlockConfig(id, key, value) {
    const block = this.builderBlocks.find(b => b.id === id);
    if (block) {
      if (!block.config) block.config = {};
      block.config[key] = value;
      this.updatePreview();
    }
  },

  _renderRichText(text) {
    if (!text) return '';
    // Escape HTML first, but preserve intentional <u> tags added by applyFormat
    let out = String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Restore <u> tags that were stored literally
      .replace(/&lt;u&gt;/g, '<u>')
      .replace(/&lt;\/u&gt;/g, '</u>');
    // Convert **bold** and _italic_ markdown-lite
    out = out
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>');
    // Convert newlines to <br>
    out = out.replace(/\n/g, '<br/>');
    return out;
  },

  toggleAttendeeResponse() {
    const checked = document.getElementById('builder-attendee-response').checked;
    document.getElementById('mockup-cta-container').style.display = checked ? 'flex' : 'none';
  },

  updatePreview() {
    const renderContainer = document.getElementById('mockup-blocks-render');
    renderContainer.innerHTML = '';

    const alignment = document.getElementById('style-alignment').value;
    const bodyColor = document.getElementById('style-body-color').value;
    const bodySize = document.getElementById('style-body-size').value;
    const lineH = document.getElementById('style-line-height').value;
    const indent = document.getElementById('style-indent').value;
    const gap = document.getElementById('style-gap').value;
    const headSize = document.getElementById('style-header-size').value;
    const subSize = document.getElementById('style-subheader-size').value;

    // Apply logo size and alignment (center locked)
    const logoSize = document.getElementById('style-logo-size').value;
    let logoHeight = '48px';
    if (logoSize === 'smallest') logoHeight = '24px';
    else if (logoSize === 'small') logoHeight = '36px';
    else if (logoSize === 'medium') logoHeight = '48px';
    else if (logoSize === 'large') logoHeight = '72px';

    const logoContainer = document.getElementById('mockup-logo-container');
    logoContainer.style.textAlign = 'center';
    logoContainer.style.display = 'flex';
    logoContainer.style.justifyContent = 'center';
    logoContainer.style.alignItems = 'center';
    const logoImg = logoContainer.querySelector('img');
    if (logoImg) {
      logoImg.style.maxHeight = logoHeight;
      logoImg.style.display = 'block';
      logoImg.style.margin = '0 auto';
    }

    // Footer address is center aligned regardless
    document.getElementById('mockup-address-container').style.textAlign = 'center';

    this.builderBlocks.forEach(b => {
      const el = document.createElement('div');
      el.style.marginBottom = gap;
      el.style.textAlign = alignment;
      el.style.lineHeight = lineH;
      el.style.color = bodyColor;
      el.style.fontSize = bodySize;

      if (b.type === 'header') {
        el.style.fontSize = headSize;
        el.style.fontWeight = '800';
        el.style.color = 'var(--text-primary)';
        el.textContent = b.value || 'Header Block';
      } else if (b.type === 'subheader') {
        el.style.fontSize = subSize;
        el.style.fontWeight = '600';
        el.style.color = 'var(--text-secondary)';
        el.textContent = b.value || 'Subheader Block';
      } else if (b.type === 'section-header') {
        el.style.fontWeight = '700';
        el.style.fontSize = '1.05rem';
        el.style.color = 'var(--text-primary)';
        el.style.borderBottom = '1px solid var(--border)';
        el.style.paddingBottom = '0.2rem';
        el.textContent = b.value || 'Section Title';
      } else if (b.type === 'section-body') {
        el.style.paddingLeft = indent;
        el.innerHTML = this._renderRichText(b.value || 'Section content paragraph.');
      } else if (b.type === 'body') {
        el.innerHTML = this._renderRichText(b.value || 'Body paragraph text.');
      } else if (b.type === 'signature') {
        el.style.marginTop = '1.5rem';
        el.style.textAlign = 'left';
        el.innerHTML = this._renderRichText(b.value || 'Warm regards,\nHR Team');
      } else if (b.type === 'bullet-list') {
        const items = (b.value || '').split('\n').filter(i => i.trim() !== '');
        if (items.length === 0) {
          el.innerHTML = '<ul style="margin:0; padding-left:1.5rem; list-style-type:disc;"><li>Bullet item</li></ul>';
        } else {
          el.innerHTML = `<ul style="margin:0; padding-left:1.5rem; list-style-type:disc; text-align:${alignment};">${items.map(i => `<li>${this._renderRichText(i)}</li>`).join('')}</ul>`;
        }
      } else if (b.type === 'num-list') {
        const items = (b.value || '').split('\n').filter(i => i.trim() !== '');
        if (items.length === 0) {
          el.innerHTML = '<ol style="margin:0; padding-left:1.5rem; list-style-type:decimal;"><li>List item</li></ol>';
        } else {
          el.innerHTML = `<ol style="margin:0; padding-left:1.5rem; list-style-type:decimal; text-align:${alignment};">${items.map(i => `<li>${this._renderRichText(i)}</li>`).join('')}</ol>`;
        }
      } else if (b.type === 'spacer') {
        const sizeMap = { small: '0.75rem', medium: '1.75rem', large: '3rem' };
        el.style.display = 'block';
        el.style.height = sizeMap[b.config?.size || 'medium'];
        el.style.margin = '0';
      } else if (b.type === 'hr') {
        const cfg = b.config || {};
        const color = cfg.color || '#d1d5db';
        const thkMap = { thin: '1px', medium: '2px', thick: '4px' };
        const lenMap = { short: '40%', medium: '70%', full: '100%' };
        const borderWidth = thkMap[cfg.thickness || 'thin'];
        const lineWidth = lenMap[cfg.length || 'full'];
        el.style.margin = '0';
        el.style.textAlign = 'center';
        el.innerHTML = `<div style="display:inline-block; width:${lineWidth}; height:${borderWidth}; background:${color}; border-radius:2px;"></div>`;
      }

      renderContainer.appendChild(el);
    });

    // Render mockup social links above the address footer
    const socialColor = document.getElementById('style-social-color').value;
    const socialSize = document.getElementById('style-social-size').value;
    let iconSize = '18px';
    let wrapperSize = '28px';
    if (socialSize === 'small') { iconSize = '24px'; wrapperSize = '36px'; }
    else if (socialSize === 'medium') { iconSize = '32px'; wrapperSize = '44px'; }

    const socialContainer = document.getElementById('mockup-social-container');
    if (socialContainer) {
      socialContainer.style.textAlign = 'center';
      socialContainer.style.justifyContent = 'center';

      const activeLinks = (this.availableSocialLinks || []).filter(item => {
        const chk = document.getElementById(`social-chk-${item.platform}`);
        return chk && chk.checked;
      });

      if (activeLinks.length === 0) {
        socialContainer.style.display = 'none';
        socialContainer.innerHTML = '';
      } else {
        socialContainer.style.display = 'flex';
        socialContainer.innerHTML = activeLinks.map(item => {
          let svgHtml = window.SocialIcons[item.platform] || '';
          svgHtml = svgHtml.replace('<svg', `<svg style="width: ${iconSize} !important; height: ${iconSize} !important;"`);
          return `
            <a href="${esc(item.url)}" target="_blank" style="color: ${socialColor}; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; width: ${wrapperSize}; height: ${wrapperSize}; transition: opacity 0.15s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">
              ${svgHtml}
            </a>
          `;
        }).join('');
      }
    }

    this.updateStyles();
  },

  updateStyles() {
    const bgColor = document.getElementById('style-bg-color').value;
    const screen = document.getElementById('mockup-screen-body');
    screen.style.backgroundColor = bgColor;

    const affirmColor = document.getElementById('style-cta-affirm').value;
    const negColor = document.getElementById('style-cta-negative').value;
    const btnAffirm = document.getElementById('mockup-btn-affirm');
    const btnNeg = document.getElementById('mockup-btn-negative');
    if (btnAffirm) btnAffirm.style.backgroundColor = affirmColor;
    if (btnNeg) btnNeg.style.backgroundColor = negColor;

  },

  // Templates List Modal & Management Flow
  openTemplatesModal() {
    document.getElementById('templates-list-modal').classList.add('open');
    this.loadTemplatesList();
  },

  closeTemplatesModal() {
    document.getElementById('templates-list-modal').classList.remove('open');
  },

});

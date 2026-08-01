'use strict';

Object.assign(window.EventsApp, {
  // Autocomplete Dropdown Logic
  showAutocompleteDropdown(inputEl, triggerIndex, query) {
    let dropdown = document.getElementById('autocomplete-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'autocomplete-dropdown';
      dropdown.className = 'autocomplete-dropdown';
      document.body.appendChild(dropdown);
    }

    this.activeAutocompleteInput = inputEl;
    this.autocompleteTriggerPos = triggerIndex;

    const placeholders = [
      '{{firstname}}',
      '{{lastname}}',
      '{{email}}',
      '{{workemail}}',
      '{{city}}',
      '{{department}}',
      '{{team}}',
      '{{position}}',
      '{{reportingto}}'
    ];

    const filtered = placeholders.filter(p => p.slice(2).toLowerCase().startsWith(query.toLowerCase()));

    if (filtered.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    dropdown.innerHTML = filtered.map((p, idx) => `
      <div class="autocomplete-item ${idx === 0 ? 'active' : ''}" data-value="${p}" onclick="EventsApp.insertPlaceholder('${p}')">
        ${p}
      </div>
    `).join('');

    this.autocompleteActiveIndex = 0;
    this.autocompleteItems = filtered;

    const rect = inputEl.getBoundingClientRect();
    dropdown.style.left = `${rect.left + window.scrollX}px`;
    dropdown.style.top = `${rect.bottom + window.scrollY}px`;
    dropdown.style.display = 'block';
  },

  insertPlaceholder(placeholder) {
    const input = this.activeAutocompleteInput;
    if (!input) return;

    const val = input.value;
    const triggerPos = this.autocompleteTriggerPos;
    const caretPos = input.selectionStart;

    const before = val.slice(0, triggerPos);
    const after = val.slice(caretPos);
    input.value = before + placeholder + after;

    const newCursorPos = triggerPos + placeholder.length;
    input.setSelectionRange(newCursorPos, newCursorPos);
    input.focus();

    // Trigger update preview & config
    input.dispatchEvent(new Event('input', { bubbles: true }));

    this.closeAutocomplete();
  },

  closeAutocomplete() {
    const dropdown = document.getElementById('autocomplete-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    this.activeAutocompleteInput = null;
    this.autocompleteTriggerPos = -1;
    this.autocompleteActiveIndex = -1;
    this.autocompleteItems = [];
  },

  handleAutocompleteKeydown(e) {
    const dropdown = document.getElementById('autocomplete-dropdown');
    if (!dropdown || dropdown.style.display === 'none') return;

    const items = dropdown.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.autocompleteActiveIndex = (this.autocompleteActiveIndex + 1) % items.length;
      this.highlightAutocompleteItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.autocompleteActiveIndex = (this.autocompleteActiveIndex - 1 + items.length) % items.length;
      this.highlightAutocompleteItem(items);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const activeItem = items[this.autocompleteActiveIndex];
      if (activeItem) {
        this.insertPlaceholder(activeItem.getAttribute('data-value'));
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.closeAutocomplete();
    }
  },

  highlightAutocompleteItem(items) {
    items.forEach((item, idx) => {
      if (idx === this.autocompleteActiveIndex) {
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  },

  syncColorText(colorInput, textInputId) {
    const txt = document.getElementById(textInputId);
    if (txt) {
      txt.value = colorInput.value.toUpperCase();
    }
  },

  syncTextColor(textInput, colorInputId) {
    let val = textInput.value.trim();
    if (!val.startsWith('#')) {
      val = '#' + val;
    }
    const colorReg = /^#[0-9A-F]{6}$/i;
    if (colorReg.test(val)) {
      const colorInput = document.getElementById(colorInputId);
      if (colorInput) {
        colorInput.value = val;
      }
    }
  },

  debouncedAutosave() {
    if (this.autosaveTimeout) clearTimeout(this.autosaveTimeout);
    this.autosaveTimeout = setTimeout(() => {
      this.autosaveEmailConfig();
    }, 1000);
  },

  async autosaveEmailConfig() {
    if (!this.builderEventId) return;

    // Fetch values from DOM safely
    const senderNameEl = document.getElementById('builder-sender-name');
    const senderEmailEl = document.getElementById('builder-sender-email');
    const subjectEl = document.getElementById('builder-subject');
    const preheaderEl = document.getElementById('builder-preheader');
    const attendeeResponseEl = document.getElementById('builder-attendee-response');

    const payload = {
      email_sender_name: senderNameEl ? senderNameEl.value.trim() : '',
      email_sender_email: senderEmailEl ? senderEmailEl.value.trim() : '',
      email_subject: subjectEl ? subjectEl.value.trim() : '',
      email_preheader: preheaderEl ? preheaderEl.value.trim() : '',
      email_body_json: this.builderBlocks,
      email_attendee_response: attendeeResponseEl ? attendeeResponseEl.checked : true,
      email_settings: {
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
      }
    };

    try {
      const { error } = await getSb()
        .from('company_events')
        .update(payload)
        .eq('id', this.builderEventId);
      if (error) throw error;
      console.log('Email configuration autosaved for event:', this.builderEventId);
      window.Toast?.success?.('Email template autosaved.');
    } catch (e) {
      console.error('Autosave failed:', e);
      window.Toast?.error?.('Autosave failed: ' + e.message);
    }
  },

});

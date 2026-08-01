/* ── Holiday Calendar ───────────────────────────────────────────────────── */

(() => {
  const HOLIDAY_TYPES = {
    regular_holiday: 'Regular Holiday',
    special_non_working_holiday: 'Special Non-working Holiday',
    company_break: 'Company Break'
  };

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const formatDate = (value) => {
    if (!value) return '—';
    return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  const dateForYear = (value, sourceYear, targetYear) => {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    const shiftedYear = targetYear + (year - sourceYear);
    return `${shiftedYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  window.HolidayApp = {
    companyId: null,
    currentUserId: null,
    currentYear: new Date().getFullYear(),
    holidays: [],
    editingId: null,

    async init() {
      const isHolidayPage = window.location.pathname.replace(/\/+$/, '').endsWith('/holiday');
      if (!isHolidayPage) return;

      this.bindEvents();
      try {
        const authInfo = await window.BKAuth.checkRoleGate(['Owner', 'Admin', 'HR'], '/dashboard/admin.html');
        if (!authInfo?.tenantId) return;

        const { data: company, error: companyError } = await window.BKAuth.sb
          .from('companies')
          .select('id')
          .eq('tenant_id', authInfo.tenantId)
          .limit(1)
          .maybeSingle();
        if (companyError) throw companyError;
        if (!company?.id) throw new Error('Company record could not be resolved.');

        this.companyId = company.id;
        const { data: { user } } = await window.BKAuth.sb.auth.getUser();
        this.currentUserId = user?.id || null;
        await this.loadHolidays();
      } catch (error) {
        console.error(error);
        this.renderError('Holidays could not be loaded. Please refresh and try again.');
      }
    },

    bindEvents() {
      document.getElementById('holiday-prev-year')?.addEventListener('click', () => this.changeYear(-1));
      document.getElementById('holiday-next-year')?.addEventListener('click', () => this.changeYear(1));
      document.getElementById('add-holiday-btn')?.addEventListener('click', () => this.openModal());
      document.getElementById('close-holiday-modal')?.addEventListener('click', () => this.closeModal());
      document.getElementById('cancel-holiday-btn')?.addEventListener('click', () => this.closeModal());
      document.getElementById('delete-holiday-btn')?.addEventListener('click', () => this.openDeleteConfirm());
      document.getElementById('cancel-delete-holiday-btn')?.addEventListener('click', () => this.closeDeleteConfirm());
      document.getElementById('confirm-delete-holiday-btn')?.addEventListener('click', () => this.deleteHoliday());
      document.getElementById('holiday-form')?.addEventListener('submit', (event) => this.saveHoliday(event));
      document.getElementById('holidays-table-body')?.addEventListener('click', (event) => {
        const action = event.target.closest('[data-holiday-action]');
        if (!action) return;
        const holidayId = action.dataset.holidayId;
        if (action.dataset.holidayAction === 'edit') this.openModal(holidayId);
        if (action.dataset.holidayAction === 'remove') {
          this.editingId = holidayId;
          this.openDeleteConfirm();
        }
      });
      document.getElementById('holiday-is-range')?.addEventListener('change', (event) => this.toggleDateRange(event.target.checked));
      document.getElementById('holiday-modal')?.addEventListener('click', (event) => {
        if (event.target.id === 'holiday-modal') this.closeModal();
      });
    },

    async changeYear(delta) {
      this.currentYear += delta;
      await this.loadHolidays();
    },

    async loadHolidays() {
      if (!this.companyId) return;
      document.getElementById('holiday-year-label').textContent = String(this.currentYear);
      const tbody = document.getElementById('holidays-table-body');
      tbody.innerHTML = '<tr class="shimmer-row"><td>Loading...</td><td></td><td></td><td></td><td></td></tr>';

      try {
        const { data, error } = await window.BKAuth.sb
          .from('company_holidays')
          .select('id, holiday_name, holiday_type, date_from, date_to, calendar_year, inactive_from_year, consistent_date_annually')
          .eq('company_id', this.companyId)
          .lte('calendar_year', this.currentYear)
          .or(`inactive_from_year.is.null,inactive_from_year.gt.${this.currentYear}`)
          .order('calendar_year', { ascending: false })
          .order('holiday_name', { ascending: true })
          .limit(500);
        if (error) throw error;
        const inherited = new Map();
        (data || []).forEach((holiday) => {
          const key = holiday.holiday_name.trim().toLowerCase();
          if (!inherited.has(key)) inherited.set(key, holiday);
        });
        this.holidays = Array.from(inherited.values()).sort((a, b) => {
          const aDate = a.calendar_year === this.currentYear ? (a.date_from || '9999-12-31') : '9999-12-31';
          const bDate = b.calendar_year === this.currentYear ? (b.date_from || '9999-12-31') : '9999-12-31';
          return aDate.localeCompare(bDate) || a.holiday_name.localeCompare(b.holiday_name);
        });
        this.renderTable();
      } catch (error) {
        console.error(error);
        this.renderError('Holidays could not be loaded. Please refresh and try again.');
      }
    },

    renderTable() {
      const tbody = document.getElementById('holidays-table-body');
      if (!this.holidays.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="holiday-empty-cell">No holidays added for ${this.currentYear}.</td></tr>`;
        return;
      }

      tbody.innerHTML = this.holidays.map((holiday) => `<tr>
        <td>${esc(holiday.holiday_name)}</td>
        <td>${esc(HOLIDAY_TYPES[holiday.holiday_type] || holiday.holiday_type)}</td>
        <td>${formatDate(holiday.calendar_year === this.currentYear || holiday.consistent_date_annually ? dateForYear(holiday.date_from, holiday.calendar_year, this.currentYear) : null)}</td>
        <td>${formatDate(holiday.calendar_year === this.currentYear || holiday.consistent_date_annually ? dateForYear(holiday.date_to, holiday.calendar_year, this.currentYear) : null)}</td>
        <td class="holiday-actions-cell">
          <button type="button" class="action-btn holiday-action-btn" data-holiday-action="edit" data-holiday-id="${esc(holiday.id)}" aria-label="Edit ${esc(holiday.holiday_name)}" title="Edit">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button type="button" class="action-btn holiday-action-btn danger" data-holiday-action="remove" data-holiday-id="${esc(holiday.id)}" aria-label="Remove ${esc(holiday.holiday_name)}" title="Remove">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </td>
      </tr>`).join('');
    },

    renderError(message) {
      const tbody = document.getElementById('holidays-table-body');
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="holiday-error-cell">${esc(message)}</td></tr>`;
    },

    openModal(holidayId = null) {
      const form = document.getElementById('holiday-form');
      form.reset();
      this.editingId = holidayId;
      const holiday = holidayId ? this.holidays.find((item) => item.id === holidayId) : null;
      document.getElementById('holiday-modal-title').textContent = holiday ? 'Edit Holiday' : 'Add Holiday';
      document.getElementById('save-holiday-btn').textContent = holiday ? 'Save Changes' : 'Save Holiday';
      document.getElementById('delete-holiday-btn').style.display = holiday ? 'inline-flex' : 'none';
      if (holiday) {
        document.getElementById('holiday-name').value = holiday.holiday_name;
        document.getElementById('holiday-type').value = holiday.holiday_type;
        const carriesDate = holiday.calendar_year === this.currentYear || holiday.consistent_date_annually;
        document.getElementById('holiday-date-from').value = carriesDate ? (dateForYear(holiday.date_from, holiday.calendar_year, this.currentYear) || '') : '';
        this.toggleDateRange(carriesDate && Boolean(holiday.date_to));
        document.getElementById('holiday-date-to').value = carriesDate ? (dateForYear(holiday.date_to, holiday.calendar_year, this.currentYear) || '') : '';
        document.getElementById('holiday-consistent-date').checked = Boolean(holiday.consistent_date_annually);
      }
      document.getElementById('holiday-date-from').required = true;
      if (!holiday) this.toggleDateRange(false);
      document.getElementById('holiday-modal').classList.add('open');
      document.getElementById('holiday-name').focus();
    },

    closeModal() {
      document.getElementById('holiday-modal').classList.remove('open');
      this.editingId = null;
    },

    toggleDateRange(enabled) {
      const checkbox = document.getElementById('holiday-is-range');
      const wrap = document.getElementById('holiday-date-to-wrap');
      const dateTo = document.getElementById('holiday-date-to');
      const fromLabel = document.getElementById('holiday-date-from-label');
      checkbox.checked = enabled;
      wrap.hidden = !enabled;
      dateTo.disabled = !enabled;
      dateTo.required = enabled;
      if (!enabled) dateTo.value = '';
      if (fromLabel) {
        fromLabel.textContent = enabled ? 'Date From' : 'Date';
      }
    },

    async saveHoliday(event) {
      event.preventDefault();
      if (!this.companyId) return;

      const name = document.getElementById('holiday-name').value.trim();
      const type = document.getElementById('holiday-type').value;
      const dateFrom = document.getElementById('holiday-date-from').value;
      const isRange = document.getElementById('holiday-is-range').checked;
      const dateTo = isRange ? document.getElementById('holiday-date-to').value : null;
      const consistentDateAnnually = document.getElementById('holiday-consistent-date').checked;

      if (!name || !HOLIDAY_TYPES[type] || !dateFrom) {
        window.Toast?.error?.('Enter the holiday name, type, and start date.');
        return;
      }
      if (Number(dateFrom.slice(0, 4)) !== this.currentYear) {
        window.Toast?.error?.(`The start date must be within ${this.currentYear}.`);
        return;
      }
      if (dateTo && dateTo < dateFrom) {
        window.Toast?.error?.('The end date must be on or after the start date.');
        return;
      }

      const saveButton = document.getElementById('save-holiday-btn');
      saveButton.disabled = true;
      try {
        const wasEditing = Boolean(this.editingId);
        const existingHoliday = wasEditing ? this.holidays.find((holiday) => holiday.id === this.editingId) : null;
        const payload = {
          company_id: this.companyId,
          holiday_name: name,
          holiday_type: type,
          calendar_year: this.currentYear,
          date_from: dateFrom,
          date_to: dateTo,
          consistent_date_annually: consistentDateAnnually
        };
        if (!wasEditing) payload.created_by = this.currentUserId;
        let request;
        if (existingHoliday && existingHoliday.calendar_year < this.currentYear) {
          const { error: closeError } = await window.BKAuth.sb
            .from('company_holidays')
            .update({ inactive_from_year: this.currentYear })
            .eq('id', existingHoliday.id)
            .eq('company_id', this.companyId);
          if (closeError) throw closeError;
          payload.created_by = this.currentUserId;
          request = window.BKAuth.sb.from('company_holidays').insert(payload);
        } else {
          request = wasEditing
          ? window.BKAuth.sb.from('company_holidays').update(payload).eq('id', this.editingId).eq('company_id', this.companyId)
          : window.BKAuth.sb.from('company_holidays').insert(payload);
        }
        const { error } = await request;
        if (error) throw error;
        this.closeModal();
        window.Toast?.success?.(wasEditing ? 'Holiday updated.' : 'Holiday added.');
        await this.loadHolidays();
      } catch (error) {
        console.error(error);
        const message = error.code === '23505'
          ? `A holiday with this name already exists for ${this.currentYear}.`
          : 'The holiday could not be saved. Please try again.';
        window.Toast?.error?.(message);
      } finally {
        saveButton.disabled = false;
      }
    },

    openDeleteConfirm() {
      if (!this.editingId) return;
      document.getElementById('holiday-delete-modal').classList.add('open');
    },

    closeDeleteConfirm() {
      document.getElementById('holiday-delete-modal').classList.remove('open');
    },

    async deleteHoliday() {
      const holiday = this.holidays.find((item) => item.id === this.editingId);
      if (!holiday || !this.companyId) return;
      const button = document.getElementById('confirm-delete-holiday-btn');
      button.disabled = true;
      try {
        const request = holiday.calendar_year < this.currentYear
          ? window.BKAuth.sb.from('company_holidays').update({ inactive_from_year: this.currentYear }).eq('id', holiday.id).eq('company_id', this.companyId)
          : window.BKAuth.sb.from('company_holidays').delete().eq('id', holiday.id).eq('company_id', this.companyId);
        const { error } = await request;
        if (error) throw error;
        this.closeDeleteConfirm();
        this.closeModal();
        window.Toast?.success?.(`Holiday removed from ${this.currentYear} onward.`);
        await this.loadHolidays();
      } catch (error) {
        console.error(error);
        window.Toast?.error?.('The holiday could not be deleted. Please try again.');
      } finally {
        button.disabled = false;
      }
    }
  };
})();

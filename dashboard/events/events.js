'use strict';

const getSb = () => window.BKAuth.sb;
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const esc = (v) => {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
};

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
};

window.SocialIcons = {
  Facebook: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="display:inline-block;vertical-align:middle;"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c4.56-.93 8-4.96 8-9.75z"/></svg>`,
  Messenger: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="display:inline-block;vertical-align:middle;"><path d="M12 2C6.48 2 2 6.14 2 11.25c0 2.91 1.45 5.51 3.73 7.15V22l3.41-1.87c.88.24 1.8.37 2.86.37 5.52 0 10-4.14 10-9.25S17.52 2 12 2zm1.14 12.03l-2.58-2.75-5.04 2.75 5.54-5.89 2.63 2.75 4.99-2.75-5.54 5.89z"/></svg>`,
  Instagram: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="display:inline-block;vertical-align:middle;"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>`,
  X: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="display:inline-block;vertical-align:middle;"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  LinkedIn: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="display:inline-block;vertical-align:middle;"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>`,
  Tiktok: `<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" style="display:inline-block;vertical-align:middle;"><path d="M9 0h1.98c.144.715.54 1.617 1.235 2.512C12.895 3.389 13.797 4 15 4v2c-1.753 0-3.07-.814-4-1.829V11a5 5 0 1 1-5-5v2a3 3 0 1 0 3 3z"/></svg>`,
  YouTube: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="display:inline-block;vertical-align:middle;"><path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.508 9.388.508 9.388.508s7.518 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  Pinterest: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="display:inline-block;vertical-align:middle;"><path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z"/></svg>`,
  Amazon: `<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" style="display:inline-block;vertical-align:middle;"><path d="M10.813 11.968c.157.083.36.074.5-.05l.005.005a90 90 0 0 1 1.623-1.405c.173-.143.143-.372.006-.563l-.125-.17c-.345-.465-.673-.906-.673-1.791v-3.3l.001-.335c.008-1.265.014-2.421-.933-3.305C10.404.274 9.06 0 8.03 0 6.017 0 3.77.75 3.296 3.24c-.047.264.143.404.316.443l2.054.22c.19-.009.33-.196.366-.387.176-.857.896-1.271 1.703-1.271.435 0 .929.16 1.188.55.264.39.26.91.257 1.376v.432q-.3.033-.621.065c-1.113.114-2.397.246-3.36.67C3.873 5.91 2.94 7.08 2.94 8.798c0 2.2 1.387 3.298 3.168 3.298 1.506 0 2.328-.354 3.489-1.54l.167.246c.274.405.456.675 1.047 1.166ZM6.03 8.431C6.03 6.627 7.647 6.3 9.177 6.3v.57c.001.776.002 1.434-.396 2.133-.336.595-.87.961-1.465.961-.812 0-1.286-.619-1.286-1.533M.435 12.174c2.629 1.603 6.698 4.084 13.183.997.28-.116.475.078.199.431C13.538 13.96 11.312 16 7.57 16 3.832 16 .968 13.446.094 12.386c-.24-.275.036-.4.199-.299z"/><path d="M13.828 11.943c.567-.07 1.468-.027 1.645.204.135.176-.004.966-.233 1.533-.23.563-.572.961-.762 1.115s-.333.094-.23-.137c.105-.23.684-1.663.455-1.963-.213-.278-1.177-.177-1.625-.13l-.09.009q-.142.013-.233.024c-.193.021-.245.027-.274-.032-.074-.209.779-.556 1.347-.623"/></svg>`,
  Medium: `<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" style="display:inline-block;vertical-align:middle;"><path d="M9.025 8c0 2.485-2.02 4.5-4.513 4.5A4.506 4.506 0 0 1 0 8c0-2.486 2.02-4.5 4.512-4.5A4.506 4.506 0 0 1 9.025 8m4.95 0c0 2.34-1.01 4.236-2.256 4.236S9.463 10.339 9.463 8c0-2.34 1.01-4.236 2.256-4.236S13.975 5.661 13.975 8M16 8c0 2.096-.355 3.795-.794 3.795-.438 0-.793-1.7-.793-3.795 0-2.096.355-3.795.794-3.795.438 0 .793 1.699.793 3.795"/></svg>`
};

window.EventsApp = {
  tenantId: null,
  companyId: null,
  currentUserId: null,
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth(),
  editingId: null,
  deletingId: null,

  async init() {
    try {
      const authInfo = await window.BKAuth.checkRoleGate(['Owner','Admin','HR'], '../admin.html');
      if (!authInfo) return;
      this.tenantId = authInfo.tenantId;

      const { data: { user } } = await getSb().auth.getUser();
      this.currentUserId = user?.id || null;

      const { data: co } = await getSb().from('companies').select('id').eq('tenant_id', this.tenantId).limit(1).maybeSingle();
      this.companyId = co?.id || null;
      if (!this.companyId) return;

      await this.loadData();
    } catch (e) { console.error(e); }
  },

  changeMonth(delta) {
    this.currentMonth += delta;
    if (this.currentMonth < 0)  { this.currentMonth = 11; this.currentYear--; }
    if (this.currentMonth > 11) { this.currentMonth = 0;  this.currentYear++; }
    this.loadData();
  },

  async loadData() {
    document.getElementById('month-label').textContent = `${MONTH_NAMES[this.currentMonth]} ${this.currentYear}`;
    const tbody = document.getElementById('events-table-body');
    tbody.innerHTML = '<tr class="shimmer-row"><td>Loading...</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';

    const startDate = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2,'0')}-01`;
    const lastDay   = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
    const endDate   = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

    try {
      // Fetch events whose date_from falls within the selected month
      const { data, error } = await getSb()
        .from('company_events')
        .select('*')
        .eq('company_id', this.companyId)
        .gte('date_from', startDate)
        .lte('date_from', endDate)
        .order('date_from', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      this.renderTable(data || []);
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger);text-align:center;padding:2rem;">Failed to load: ${esc(err.message)}</td></tr>`;
    }
  },

  renderTable(events) {
    const tbody = document.getElementById('events-table-body');
    if (!events.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);font-style:italic;padding:2rem;">No events for this month.</td></tr>';
      return;
    }

    tbody.innerHTML = events.map(ev => {
      const createdAt = ev.created_at ? new Date(ev.created_at).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }) : '—';
      const toDate    = ev.is_date_range && ev.date_to ? fmtDate(ev.date_to) : '—';

      return `<tr>
        <td style="color:var(--text-muted);font-size:9pt;">${createdAt}</td>
        <td style="font-weight:600;">${esc(ev.title)}</td>
        <td style="color:var(--text-secondary);font-size:9pt;">${esc(ev.description || '—')}</td>
        <td class="num-col"><span class="level-badge">${esc(ev.visibility_level)}</span></td>
        <td>${fmtDate(ev.date_from)}</td>
        <td>${toDate}</td>
        <td class="action-col">
          <div style="display:inline-flex;gap:0.3rem;">
            <button class="action-btn" title="Send Email" onclick="EventsApp.openEmailBuilder('${esc(ev.id)}')">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </button>
            <button class="action-btn" title="Edit" onclick="EventsApp.openEditModal(${JSON.stringify(ev).replace(/"/g,'&quot;')})">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="action-btn danger" title="Delete" onclick="EventsApp.openConfirm('${esc(ev.id)}', '${esc(ev.title)}')">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  },

  /* ── Modal helpers ── */
  openCreateModal() {
    this.editingId = null;
    document.getElementById('modal-title').textContent = 'Create Event';
    document.getElementById('modal-save-btn').textContent = 'Create';
    document.getElementById('event-title').value = '';
    document.getElementById('event-description').value = '';
    document.getElementById('event-level').value = '1';
    document.getElementById('is-date-range').checked = false;
    document.getElementById('event-date').value = '';
    document.getElementById('event-date-from').value = '';
    document.getElementById('event-date-to').value = '';
    document.getElementById('event-time-start').value = '';
    document.getElementById('event-time-end').value = '';
    document.getElementById('duration-display').textContent = '';
    document.getElementById('is-whole-day').checked = false;
    this.toggleDateRange();
    this.toggleWholeDay();
    document.getElementById('event-modal').classList.add('open');
  },

  openEditModal(ev) {
    this.editingId = ev.id;
    document.getElementById('modal-title').textContent = 'Edit Event';
    document.getElementById('modal-save-btn').textContent = 'Save Changes';
    document.getElementById('event-title').value = ev.title || '';
    document.getElementById('event-description').value = ev.description || '';
    document.getElementById('event-level').value = String(ev.visibility_level || 1);
    document.getElementById('is-date-range').checked = !!ev.is_date_range;

    if (ev.is_date_range) {
      document.getElementById('event-date-from').value = ev.date_from || '';
      document.getElementById('event-date-to').value = ev.date_to || '';
    } else {
      document.getElementById('event-date').value = ev.date_from || '';
    }

    document.getElementById('event-time-start').value = ev.time_start || '';
    document.getElementById('event-time-end').value = ev.time_end || '';
    document.getElementById('is-whole-day').checked = !!ev.is_whole_day;
    this.toggleDateRange();
    this.toggleWholeDay();
    this.updateDuration();
    document.getElementById('event-modal').classList.add('open');
  },

  closeModal() {
    document.getElementById('event-modal').classList.remove('open');
  },

  toggleDateRange() {
    const isRange = document.getElementById('is-date-range').checked;
    document.getElementById('single-date-wrap').style.display = isRange ? 'none' : 'block';
    document.getElementById('range-date-wrap').style.display  = isRange ? 'block' : 'none';
    
    const wholeDayCb = document.getElementById('is-whole-day');
    if (isRange) {
      wholeDayCb.checked = false;
      wholeDayCb.disabled = true;
      this.toggleWholeDay();
    } else {
      wholeDayCb.disabled = false;
    }
  },

  toggleWholeDay() {
    const isWhole = document.getElementById('is-whole-day').checked;
    const tStart = document.getElementById('event-time-start');
    const tEnd = document.getElementById('event-time-end');
    if (isWhole) {
      tStart.value = '';
      tEnd.value = '';
      tStart.disabled = true;
      tEnd.disabled = true;
      this.updateDuration();
    } else {
      tStart.disabled = false;
      tEnd.disabled = false;
    }
  },

  async saveEvent() {
    const title = document.getElementById('event-title').value.trim();
    const description = document.getElementById('event-description').value.trim() || null;
    const visibilityLevel = parseInt(document.getElementById('event-level').value, 10);
    const isRange = document.getElementById('is-date-range').checked;
    const isWhole = document.getElementById('is-whole-day').checked;
    const timeStart = document.getElementById('event-time-start').value || null;
    const timeEnd   = document.getElementById('event-time-end').value || null;

    let dateFrom, dateTo = null;
    if (isRange) {
      dateFrom = document.getElementById('event-date-from').value;
      dateTo   = document.getElementById('event-date-to').value || null;
    } else {
      dateFrom = document.getElementById('event-date').value;
    }

    if (!title) { window.Toast?.error?.('Title is required.'); return; }
    if (!dateFrom) { window.Toast?.error?.('Date is required.'); return; }

    if (!isWhole && timeStart && timeEnd) {
      const [sh, sm] = timeStart.split(':').map(Number);
      const [eh, em] = timeEnd.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      if (startMin >= endMin) {
        window.Toast?.error?.('Start time must be earlier than end time.');
        return;
      }
    }

    const payload = {
      company_id: this.companyId,
      title,
      description,
      visibility_level: visibilityLevel,
      is_date_range: isRange,
      is_whole_day: isWhole,
      date_from: dateFrom,
      date_to: isRange ? dateTo : null,
      time_start: timeStart,
      time_end: timeEnd,
    };

    try {
      let err;
      if (this.editingId) {
        ({ error: err } = await getSb().from('company_events').update(payload).eq('id', this.editingId));
      } else {
        payload.created_by = this.currentUserId;
        ({ error: err } = await getSb().from('company_events').insert(payload));
      }

      if (err) throw err;
      this.closeModal();
      await this.loadData();
    } catch (e) {
      console.error(e);
      window.Toast?.error?.('Failed to save event. Please try again.');
    }
  },

  /* ── Delete ── */
  openConfirm(id, title) {
    this.deletingId = id;
    document.getElementById('confirm-event-title').textContent = title;
    document.getElementById('confirm-modal').classList.add('open');
  },

  closeConfirm() {
    this.deletingId = null;
    document.getElementById('confirm-modal').classList.remove('open');
  },

  async confirmDelete() {
    if (!this.deletingId) return;
    try {
      const { error } = await getSb().from('company_events').delete().eq('id', this.deletingId);
      if (error) throw error;
      this.closeConfirm();
      await this.loadData();
    } catch (e) {
      console.error(e);
      window.Toast?.error?.('Failed to delete event.');
    }
  },

  /* ── Duration calculator ── */
  updateDuration() {
    const start = document.getElementById('event-time-start').value;
    const end   = document.getElementById('event-time-end').value;
    const el    = document.getElementById('duration-display');
    if (!start || !end) { el.textContent = ''; return; }

    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let totalMin = (eh * 60 + em) - (sh * 60 + sm);
    if (totalMin <= 0) { el.textContent = ''; return; }

    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    const parts = [];
    if (hrs > 0)  parts.push(hrs  === 1 ? '1 hour'        : `${hrs} hours`);
    if (mins > 0) parts.push(mins === 1 ? '1 minute'      : `${mins} minutes`);
    el.textContent = parts.join(' and ');
  },

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
        if (settings.bgColor) document.getElementById('style-bg-color').value = settings.bgColor;
        if (settings.alignment) document.getElementById('style-alignment').value = settings.alignment;
        if (settings.logoSize) document.getElementById('style-logo-size').value = settings.logoSize;
        if (settings.headerSize) document.getElementById('style-header-size').value = settings.headerSize;
        if (settings.subSize) document.getElementById('style-subheader-size').value = settings.subSize;
        if (settings.bodySize) document.getElementById('style-body-size').value = settings.bodySize;
        if (settings.bodyColor) document.getElementById('style-body-color').value = settings.bodyColor;
        if (settings.indent) document.getElementById('style-indent').value = settings.indent;
        if (settings.lineHeight) document.getElementById('style-line-height').value = settings.lineHeight;
        if (settings.gap) document.getElementById('style-gap').value = settings.gap;
        if (settings.linkColor) document.getElementById('style-link-color').value = settings.linkColor;
        if (settings.ctaAffirm) document.getElementById('style-cta-affirm').value = settings.ctaAffirm;
        if (settings.socialColor) document.getElementById('style-social-color').value = settings.socialColor;
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

    this.updateCharCounts();
    this.renderBlocksList();
    this.toggleAttendeeResponse();
    this.updatePreview();

    if (loader) loader.style.display = 'none';
    document.getElementById('email-builder-modal').classList.add('open');
  },

  closeEmailBuilder() {
    document.getElementById('email-builder-modal').classList.remove('open');
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
            <button class="action-btn" style="width:22px;height:22px;font-weight:900;font-size:0.85rem;" onclick="EventsApp.applyFormat('${block.id}','${textareaId}','bold')" title="Bold">B</button>
            <button class="action-btn" style="width:22px;height:22px;font-style:italic;font-weight:700;font-size:0.85rem;" onclick="EventsApp.applyFormat('${block.id}','${textareaId}','italic')" title="Italic">I</button>
            <button class="action-btn" style="width:22px;height:22px;text-decoration:underline;font-weight:700;font-size:0.85rem;" onclick="EventsApp.applyFormat('${block.id}','${textareaId}','underline')" title="Underline">U</button>
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
              <input type="color" value="${col}" style="width:28px;height:22px;padding:0;border:1px solid var(--border);border-radius:3px;cursor:pointer;"
                onchange="EventsApp.updateBlockConfig('${block.id}', 'color', this.value)">
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
        inputHtml = `<textarea id="${textareaId}" class="form-input" style="font-size:0.85rem;" rows="3" placeholder="Enter list items (one per line)" oninput="EventsApp.updateBlockValue('${block.id}', this.value)">${esc(block.value)}</textarea>`;
      } else if (isRich) {
        inputHtml = `<textarea id="${textareaId}" class="form-input" style="font-size:0.85rem;" rows="3" placeholder="Enter paragraph text" oninput="EventsApp.updateBlockValue('${block.id}', this.value)">${esc(block.value)}</textarea>`;
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

  applyFormat(blockId, textareaId, format) {
    const ta = document.getElementById(textareaId);
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);
    let wrapped = selected;
    if (format === 'bold')      wrapped = `**${selected}**`;
    else if (format === 'italic')     wrapped = `_${selected}_`;
    else if (format === 'underline')  wrapped = `<u>${selected}</u>`;
    ta.value = ta.value.substring(0, start) + wrapped + ta.value.substring(end);
    ta.selectionStart = start;
    ta.selectionEnd = start + wrapped.length;
    ta.focus();
    this.updateBlockValue(blockId, ta.value);
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
        if (settings.bgColor) document.getElementById('style-bg-color').value = settings.bgColor;
        if (settings.alignment) document.getElementById('style-alignment').value = settings.alignment;
        if (settings.logoSize) document.getElementById('style-logo-size').value = settings.logoSize;
        if (settings.headerSize) document.getElementById('style-header-size').value = settings.headerSize;
        if (settings.subSize) document.getElementById('style-subheader-size').value = settings.subSize;
        if (settings.bodySize) document.getElementById('style-body-size').value = settings.bodySize;
        if (settings.bodyColor) document.getElementById('style-body-color').value = settings.bodyColor;
        if (settings.indent) document.getElementById('style-indent').value = settings.indent;
        if (settings.lineHeight) document.getElementById('style-line-height').value = settings.lineHeight;
        if (settings.gap) document.getElementById('style-gap').value = settings.gap;
        if (settings.linkColor) document.getElementById('style-link-color').value = settings.linkColor;
        if (settings.ctaAffirm) document.getElementById('style-cta-affirm').value = settings.ctaAffirm;
        if (settings.socialColor) document.getElementById('style-social-color').value = settings.socialColor;
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
      const res = await fetch('/api/send-custom-email', {
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
      const res = await fetch('/api/send-custom-email', {
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
  }
};

document.addEventListener('DOMContentLoaded', () => EventsApp.init());

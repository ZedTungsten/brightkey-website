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
      await this.loadVisibilityOptions();

      // Setup global delegate listeners for template autocomplete dropdown in email builder
      const builderModal = document.getElementById('email-builder-modal');
      if (builderModal) {
        builderModal.addEventListener('input', (e) => {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            const val = e.target.value;
            const caretPos = e.target.selectionStart;
            const textBefore = val.slice(0, caretPos);
            const triggerIndex = textBefore.lastIndexOf('{{');
            if (triggerIndex !== -1) {
              const query = textBefore.slice(triggerIndex + 2);
              if (!query.includes(' ') && !query.includes('}') && !query.includes('{')) {
                this.showAutocompleteDropdown(e.target, triggerIndex, query);
                return;
              }
            }
            this.closeAutocomplete();
          }
        });

        builderModal.addEventListener('keydown', (e) => {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            this.handleAutocompleteKeydown(e);
          }
        });

        // Close autocomplete on clicking outside
        document.addEventListener('click', (e) => {
          const dropdown = document.getElementById('autocomplete-dropdown');
          if (dropdown && !dropdown.contains(e.target) && e.target !== this.activeAutocompleteInput) {
            this.closeAutocomplete();
          }
        });
      }
    } catch (e) { console.error(e); }
  },

  changeMonth(delta) {
    this.currentMonth += delta;
    if (this.currentMonth < 0)  { this.currentMonth = 11; this.currentYear--; }
    if (this.currentMonth > 11) { this.currentMonth = 0;  this.currentYear++; }
    this.loadData();
  },

  async archivePastOccurrences(events) {
    const recurringEvents = events.filter(ev => ev.is_recurring);
    if (!recurringEvents.length) return false;

    let archivedSomething = false;

    for (const ev of recurringEvents) {
      const start = new Date(ev.created_at || '2026-07-01');
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      const pastDates = [];

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        let matches = false;
        const pattern = ev.recurrence_pattern;
        let days = [];
        try {
          days = typeof ev.recurrence_days === 'string' ? JSON.parse(ev.recurrence_days) : (ev.recurrence_days || []);
        } catch (e) {}

        if (pattern === 'weekly') {
          const weekdayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
          matches = (Array.isArray(days) && days.includes(weekdayNames[d.getDay()]));
        } else if (pattern === 'monthly') {
          const dayVal = Array.isArray(days) ? days[0] : days;
          if (dayVal === 'last') {
            const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            matches = (d.getDate() === lastDay);
          } else if (dayVal) {
            const targetDay = parseInt(dayVal, 10);
            const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            matches = (d.getDate() === Math.min(targetDay, lastDay));
          }
        } else if (pattern === 'annual') {
          matches = (d.getMonth() === days?.month && d.getDate() === days?.day);
        }

        if (matches) {
          const occurrenceEnd = new Date(d);
          if (ev.time_end) {
            const [h, m] = ev.time_end.split(':').map(Number);
            occurrenceEnd.setHours(h, m, 0, 0);
          } else {
            occurrenceEnd.setHours(23, 59, 59, 999);
          }

          if (occurrenceEnd < new Date()) {
            pastDates.push(d.toISOString().split('T')[0]);
          }
        }
      }

      for (const dateStr of pastDates) {
        const alreadyArchived = events.some(e => e.recurring_source_id === ev.id && e.date_from === dateStr);
        if (alreadyArchived) continue;

        try {
          const archivePayload = {
            company_id: ev.company_id,
            title: ev.title,
            description: ev.description,
            visibility_level: ev.visibility_level,
            visibility_type: ev.visibility_type,
            visibility_departments: ev.visibility_departments,
            visibility_teams: ev.visibility_teams,
            visibility_employees: ev.visibility_employees,
            is_recurring: false,
            recurring_source_id: ev.id,
            is_date_range: false,
            is_whole_day: ev.is_whole_day,
            date_from: dateStr,
            date_to: null,
            time_start: ev.time_start,
            time_end: ev.time_end,
            created_by: ev.created_by,
            email_subject: ev.email_subject,
            email_preheader: ev.email_preheader,
            email_attendee_response: ev.email_attendee_response,
            email_body_json: ev.email_body_json,
            email_settings: ev.email_settings
          };

          const { data: newEv, error: insertError } = await getSb()
            .from('company_events')
            .insert(archivePayload)
            .select()
            .maybeSingle();

          if (insertError) {
            if (insertError.code === '23505') continue;
            throw insertError;
          }

          if (newEv) {
            const { error: updateError } = await getSb()
              .from('company_event_attendees')
              .update({ event_id: newEv.id })
              .eq('event_id', ev.id);

            if (updateError) throw updateError;
            archivedSomething = true;
          }
        } catch (err) {
          console.error(`Failed to archive occurrence ${dateStr} of recurring event ${ev.id}:`, err);
        }
      }
    }

    return archivedSomething;
  },

  async loadData() {
    document.getElementById('month-label').textContent = `${MONTH_NAMES[this.currentMonth]} ${this.currentYear}`;
    const tbody = document.getElementById('events-table-body');
    const recurTbody = document.getElementById('recurring-events-table-body');
    if (tbody) tbody.innerHTML = '<tr class="shimmer-row"><td>Loading...</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
    if (recurTbody) recurTbody.innerHTML = '<tr class="shimmer-row"><td>Loading...</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';

    const startDate = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2,'0')}-01`;
    const lastDay   = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
    const endDate   = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

    try {
      const { data, error } = await getSb()
        .from('company_events')
        .select('*')
        .eq('company_id', this.companyId)
        .order('date_from', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;

      const didArchive = await this.archivePastOccurrences(data || []);
      if (didArchive) {
        return this.loadData();
      }

      this.renderTable(data || [], startDate, endDate);
    } catch (err) {
      console.error(err);
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger);text-align:center;padding:2rem;">Failed to load: ${esc(err.message)}</td></tr>`;
      if (recurTbody) recurTbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger);text-align:center;padding:2rem;">Failed to load: ${esc(err.message)}</td></tr>`;
    }
  },

  renderTable(events, startDate, endDate) {
    const tbody = document.getElementById('events-table-body');
    const recurTbody = document.getElementById('recurring-events-table-body');

    // 1. Separate single instance and recurring
    const singleEvents = events.filter(ev => !ev.is_recurring && ev.date_from >= startDate && ev.date_from <= endDate);
    const recurringEvents = events.filter(ev => ev.is_recurring);

    // 2. Render Single Instance Table
    if (tbody) {
      if (!singleEvents.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);font-style:italic;padding:2rem;">No events for this month.</td></tr>';
      } else {
        tbody.innerHTML = singleEvents.map(ev => {
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
                <button class="action-btn" title="Attendees" onclick="EventsApp.openAttendeesModal('${esc(ev.id)}')">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                </button>
                <button class="action-btn" title="Edit" onclick="EventsApp.openEditModal(${JSON.stringify(ev).replace(/"/g,'&quot;')})">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="action-btn" title="Duplicate" onclick="EventsApp.duplicateEvent(${JSON.stringify(ev).replace(/"/g,'&quot;')})">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
                <button class="action-btn danger" title="Delete" onclick="EventsApp.openConfirm('${esc(ev.id)}', '${esc(ev.title)}')">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              </div>
            </td>
          </tr>`;
        }).join('');
      }
    }

    // 3. Render Recurring Table
    if (recurTbody) {
      if (!recurringEvents.length) {
        recurTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);font-style:italic;padding:2rem;">No recurring events.</td></tr>';
      } else {
        recurTbody.innerHTML = recurringEvents.map(ev => {
          const createdAt = ev.created_at ? new Date(ev.created_at).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }) : '—';
          
          let detailsText = '—';
          const pattern = ev.recurrence_pattern || 'weekly';
          let days = [];
          try {
            days = typeof ev.recurrence_days === 'string' ? JSON.parse(ev.recurrence_days) : (ev.recurrence_days || []);
          } catch(e) {}

          if (pattern === 'weekly') {
            const dayLabels = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
            detailsText = 'Every ' + (Array.isArray(days) ? days.map(d => dayLabels[d] || d).join(', ') : '—');
          } else if (pattern === 'monthly') {
            const dayVal = Array.isArray(days) ? days[0] : days;
            detailsText = dayVal === 'last' ? 'End of Month' : `Every ${dayVal}${dayVal === '1' ? 'st' : dayVal === '2' ? 'nd' : dayVal === '3' ? 'rd' : 'th'}`;
          } else if (pattern === 'annual') {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = days?.month;
            const day = days?.day;
            detailsText = (month !== undefined && day !== undefined) ? `Every ${monthNames[month]} ${day}` : '—';
          }

          const patternLabel = pattern.charAt(0).toUpperCase() + pattern.slice(1);

          return `<tr>
            <td style="color:var(--text-muted);font-size:9pt;">${createdAt}</td>
            <td style="font-weight:600;">${esc(ev.title)}</td>
            <td style="color:var(--text-secondary);font-size:9pt;">${esc(ev.description || '—')}</td>
            <td class="num-col"><span class="level-badge">${esc(ev.visibility_level)}</span></td>
            <td style="font-weight:600;color:var(--cyan-light);">${patternLabel}</td>
            <td>${esc(detailsText)}</td>
            <td class="action-col">
              <div style="display:inline-flex;gap:0.3rem;">
                <button class="action-btn" title="Send Email" onclick="EventsApp.openEmailBuilder('${esc(ev.id)}')">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </button>
                <button class="action-btn" title="Attendees" onclick="EventsApp.openAttendeesModal('${esc(ev.id)}')">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                </button>
                <button class="action-btn" title="Edit" onclick="EventsApp.openEditModal(${JSON.stringify(ev).replace(/"/g,'&quot;')})">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="action-btn" title="Duplicate" onclick="EventsApp.duplicateEvent(${JSON.stringify(ev).replace(/"/g,'&quot;')})">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
                <button class="action-btn danger" title="Delete" onclick="EventsApp.openConfirm('${esc(ev.id)}', '${esc(ev.title)}')">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              </div>
            </td>
          </tr>`;
        }).join('');
      }
    }
  },

  /* ── Modal helpers ── */
  loadedDepartments: [],
  loadedTeams: [],
  loadedEmployees: [],

  toggleVisibilityType(type) {
    const types = ['level', 'department', 'team', 'employee'];
    types.forEach(t => {
      const el = document.getElementById(`vis-container-${t}`);
      if (el) el.style.display = t === type ? 'block' : 'none';
    });
  },

  async loadVisibilityOptions() {
    try {
      const { data: emps, error } = await getSb()
        .from('employees')
        .select('id, first_name, last_name, department, title')
        .eq('employment_status', 'Active')
        .order('first_name');

      if (error) throw error;

      this.loadedEmployees = emps || [];
      
      const depts = new Set();
      const teams = new Set();
      this.loadedEmployees.forEach(e => {
        if (e.department) depts.add(e.department);
        if (e.title) teams.add(e.title);
      });

      this.loadedDepartments = Array.from(depts).sort();
      this.loadedTeams = Array.from(teams).sort();

      const deptList = document.getElementById('vis-list-departments');
      const teamList = document.getElementById('vis-list-teams');
      const empList = document.getElementById('vis-list-employees');

      if (deptList) {
        deptList.innerHTML = this.loadedDepartments.map(d => `
          <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;color:var(--text-secondary);cursor:pointer;margin-bottom:2px;">
            <input type="checkbox" class="vis-dept-checkbox" value="${esc(d)}" />
            <span>${esc(d)}</span>
          </label>
        `).join('') || '<div style="font-size:0.8rem;color:var(--text-muted);">No departments found</div>';
      }

      if (teamList) {
        teamList.innerHTML = this.loadedTeams.map(t => `
          <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;color:var(--text-secondary);cursor:pointer;margin-bottom:2px;">
            <input type="checkbox" class="vis-team-checkbox" value="${esc(t)}" />
            <span>${esc(t)}</span>
          </label>
        `).join('') || '<div style="font-size:0.8rem;color:var(--text-muted);">No teams found</div>';
      }

      if (empList) {
        empList.innerHTML = this.loadedEmployees.map(e => `
          <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;color:var(--text-secondary);cursor:pointer;margin-bottom:2px;">
            <input type="checkbox" class="vis-emp-checkbox" value="${e.id}" />
            <span>${esc(e.first_name)} ${esc(e.last_name)} (${esc(e.department || 'No Dept')})</span>
          </label>
        `).join('') || '<div style="font-size:0.8rem;color:var(--text-muted);">No employees found</div>';
      }
    } catch (err) {
      console.error('Failed to load visibility checklist options:', err);
    }
  },

  populateVisibilityForm(ev) {
    const radios = document.querySelectorAll('input[name="event-visibility-type"]');
    const activeType = ev?.visibility_type || 'level';
    radios.forEach(r => {
      r.checked = r.value === activeType;
    });

    document.getElementById('event-level').value = String(ev?.visibility_level || 1);

    document.querySelectorAll('.vis-dept-checkbox, .vis-team-checkbox, .vis-emp-checkbox').forEach(cb => {
      cb.checked = false;
    });

    this.toggleVisibilityType(activeType);

    if (ev) {
      if (ev.visibility_type === 'department' && ev.visibility_departments) {
        let depts = [];
        try {
          depts = typeof ev.visibility_departments === 'string' ? JSON.parse(ev.visibility_departments) : (ev.visibility_departments || []);
        } catch(e) {}
        document.querySelectorAll('.vis-dept-checkbox').forEach(cb => {
          if (depts.includes(cb.value)) cb.checked = true;
        });
      } else if (ev.visibility_type === 'team' && ev.visibility_teams) {
        let teams = [];
        try {
          teams = typeof ev.visibility_teams === 'string' ? JSON.parse(ev.visibility_teams) : (ev.visibility_teams || []);
        } catch(e) {}
        document.querySelectorAll('.vis-team-checkbox').forEach(cb => {
          if (teams.includes(cb.value)) cb.checked = true;
        });
      } else if (ev.visibility_type === 'employee' && ev.visibility_employees) {
        let emps = [];
        try {
          emps = typeof ev.visibility_employees === 'string' ? JSON.parse(ev.visibility_employees) : (ev.visibility_employees || []);
        } catch(e) {}
        document.querySelectorAll('.vis-emp-checkbox').forEach(cb => {
          if (emps.includes(cb.value)) cb.checked = true;
        });
      }
    }
  },

  toggleEventType(type) {
    const singleWrap = document.getElementById('single-instance-fields-wrap');
    const rangeWrap = document.getElementById('single-instance-range-wrap');
    const recurWrap = document.getElementById('recurring-settings-wrap');

    if (singleWrap) singleWrap.style.display = type === 'single' ? 'flex' : 'none';
    if (rangeWrap) rangeWrap.style.display = type === 'single' ? 'block' : 'none';
    if (recurWrap) recurWrap.style.display = type === 'recurring' ? 'flex' : 'none';
  },

  toggleRecurrencePattern(pattern) {
    const patterns = ['weekly', 'monthly', 'annual'];
    patterns.forEach(p => {
      const el = document.getElementById(`recur-${p}-wrap`);
      if (el) el.style.display = p === pattern ? 'block' : 'none';
    });
  },

  populateRecurrenceForm(ev) {
    const isRecur = !!ev?.is_recurring;
    const typeRadios = document.querySelectorAll('input[name="event-type"]');
    typeRadios.forEach(r => {
      r.checked = r.value === (isRecur ? 'recurring' : 'single');
    });
    this.toggleEventType(isRecur ? 'recurring' : 'single');

    const patternSelect = document.getElementById('recurrence-pattern');
    if (patternSelect) patternSelect.value = ev?.recurrence_pattern || 'weekly';
    this.toggleRecurrencePattern(ev?.recurrence_pattern || 'weekly');

    document.querySelectorAll('.weekly-day-cb').forEach(cb => {
      cb.checked = false;
    });

    const monthlySelect = document.getElementById('recur-monthly-day');
    if (monthlySelect) monthlySelect.value = '1';

    const annualMonthSelect = document.getElementById('recur-annual-month');
    const annualDaySelect = document.getElementById('recur-annual-day');
    if (annualMonthSelect) annualMonthSelect.value = '0';
    if (annualDaySelect) annualDaySelect.value = '1';

    if (isRecur && ev) {
      const pattern = ev.recurrence_pattern || 'weekly';
      let days = [];
      try {
        days = typeof ev.recurrence_days === 'string' ? JSON.parse(ev.recurrence_days) : (ev.recurrence_days || []);
      } catch(e) {}

      if (pattern === 'weekly') {
        document.querySelectorAll('.weekly-day-cb').forEach(cb => {
          if (Array.isArray(days) && days.includes(cb.value)) cb.checked = true;
        });
      } else if (pattern === 'monthly') {
        const dayVal = Array.isArray(days) ? days[0] : days;
        if (monthlySelect) monthlySelect.value = String(dayVal || '1');
      } else if (pattern === 'annual') {
        if (annualMonthSelect && days?.month !== undefined) annualMonthSelect.value = String(days.month);
        if (annualDaySelect && days?.day !== undefined) annualDaySelect.value = String(days.day);
      }
    }
  },

  openCreateModal() {
    this.editingId = null;
    this.duplicateSourceEvent = null;
    document.getElementById('modal-title').textContent = 'Create Event';
    document.getElementById('modal-save-btn').textContent = 'Create';
    document.getElementById('event-title').value = '';
    document.getElementById('event-description').value = '';
    this.populateVisibilityForm(null);
    this.populateRecurrenceForm(null);
    document.getElementById('is-date-range').checked = false;
    document.getElementById('event-date').value = '';
    document.getElementById('event-date-from').value = '';
    document.getElementById('event-date-to').value = '';
    document.getElementById('event-time-start').value = '';
    document.getElementById('event-time-end').value = '';
    document.getElementById('duration-display').textContent = '';
    document.getElementById('is-whole-day').checked = false;
    
    const inputs = ['event-date', 'event-date-from', 'event-date-to', 'event-time-start', 'event-time-end'];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.border = '';
    });

    this.toggleDateRange();
    this.toggleWholeDay();
    document.getElementById('event-modal').classList.add('open');
  },

  openEditModal(ev) {
    this.editingId = ev.id;
    this.duplicateSourceEvent = null;
    document.getElementById('modal-title').textContent = 'Edit Event';
    document.getElementById('modal-save-btn').textContent = 'Save Changes';
    document.getElementById('event-title').value = ev.title || '';
    document.getElementById('event-description').value = ev.description || '';
    this.populateVisibilityForm(ev);
    this.populateRecurrenceForm(ev);
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

    const inputs = ['event-date', 'event-date-from', 'event-date-to', 'event-time-start', 'event-time-end'];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.border = '';
    });

    this.toggleDateRange();
    this.toggleWholeDay();
    this.updateDuration();
    document.getElementById('event-modal').classList.add('open');
  },

  duplicateEvent(ev) {
    this.editingId = null;
    this.duplicateSourceEvent = ev;
    
    document.getElementById('modal-title').textContent = 'Duplicate Event';
    document.getElementById('modal-save-btn').textContent = 'Duplicate';
    
    document.getElementById('event-title').value = (ev.title || '') + ' (Copy)';
    document.getElementById('event-description').value = ev.description || '';
    this.populateVisibilityForm(ev);
    this.populateRecurrenceForm(ev);
    document.getElementById('is-date-range').checked = !!ev.is_date_range;
    document.getElementById('is-whole-day').checked = !!ev.is_whole_day;

    document.getElementById('event-date').value = '';
    document.getElementById('event-date-from').value = '';
    document.getElementById('event-date-to').value = '';
    document.getElementById('event-time-start').value = '';
    document.getElementById('event-time-end').value = '';
    document.getElementById('duration-display').textContent = '';

    // Apply red borders to highlight the empty date & time inputs
    const highlightInputs = ['event-date', 'event-date-from', 'event-date-to', 'event-time-start', 'event-time-end'];
    highlightInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.border = '1.5px solid var(--red, #ef4444)';
        // Clear red border on input/change once a value is entered
        el.addEventListener('input', function handler() {
          if (el.value) {
            el.style.border = '';
            el.removeEventListener('input', handler);
          }
        });
      }
    });

    this.toggleDateRange();
    this.toggleWholeDay();
    document.getElementById('event-modal').classList.add('open');
  },

  closeModal() {
    this.editingId = null;
    this.duplicateSourceEvent = null;
    document.getElementById('event-modal').classList.remove('open');
    
    // Clear any red borders when modal is closed
    const inputs = ['event-date', 'event-date-from', 'event-date-to', 'event-time-start', 'event-time-end'];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.border = '';
    });
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
    const eventType = document.querySelector('input[name="event-type"]:checked').value;

    const visibilityType = document.querySelector('input[name="event-visibility-type"]:checked').value;
    let visibilityLevel = 1;
    let visibilityDepartments = [];
    let visibilityTeams = [];
    let visibilityEmployees = [];

    if (visibilityType === 'level') {
      visibilityLevel = parseInt(document.getElementById('event-level').value, 10);
    } else if (visibilityType === 'department') {
      const checked = document.querySelectorAll('.vis-dept-checkbox:checked');
      visibilityDepartments = Array.from(checked).map(c => c.value);
    } else if (visibilityType === 'team') {
      const checked = document.querySelectorAll('.vis-team-checkbox:checked');
      visibilityTeams = Array.from(checked).map(c => c.value);
    } else if (visibilityType === 'employee') {
      const checked = document.querySelectorAll('.vis-emp-checkbox:checked');
      visibilityEmployees = Array.from(checked).map(c => c.value);
    }

    if (!title) { window.Toast?.error?.('Title is required.'); return; }

    let isRecurring = false;
    let recurrencePattern = null;
    let recurrenceDays = null;
    let isRange = false;
    let isWhole = document.getElementById('is-whole-day').checked;
    let timeStart = document.getElementById('event-time-start').value || null;
    let timeEnd   = document.getElementById('event-time-end').value || null;
    let dateFrom = null;
    let dateTo = null;

    if (eventType === 'single') {
      isRange = document.getElementById('is-date-range').checked;
      if (isRange) {
        dateFrom = document.getElementById('event-date-from').value;
        dateTo   = document.getElementById('event-date-to').value || null;
      } else {
        dateFrom = document.getElementById('event-date').value;
      }
      if (!dateFrom) { window.Toast?.error?.('Date is required.'); return; }
    } else {
      // Recurring Event
      isRecurring = true;
      recurrencePattern = document.getElementById('recurrence-pattern').value;
      
      // Default dummy date for DB NOT NULL constraints
      dateFrom = '2020-01-01';

      if (recurrencePattern === 'weekly') {
        const checked = document.querySelectorAll('.weekly-day-cb:checked');
        const days = Array.from(checked).map(c => c.value);
        if (days.length === 0) {
          window.Toast?.error?.('Please select at least one day of the week.');
          return;
        }
        recurrenceDays = days;
      } else if (recurrencePattern === 'monthly') {
        const dayVal = document.getElementById('recur-monthly-day').value;
        recurrenceDays = [dayVal];
      } else if (recurrencePattern === 'annual') {
        const monthVal = parseInt(document.getElementById('recur-annual-month').value, 10);
        const dayVal = parseInt(document.getElementById('recur-annual-day').value, 10);
        recurrenceDays = { month: monthVal, day: dayVal };
      }
    }

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
      visibility_type: visibilityType,
      visibility_departments: JSON.stringify(visibilityDepartments),
      visibility_teams: JSON.stringify(visibilityTeams),
      visibility_employees: JSON.stringify(visibilityEmployees),
      is_recurring: isRecurring,
      recurrence_pattern: recurrencePattern,
      recurrence_days: recurrenceDays ? JSON.stringify(recurrenceDays) : null,
      is_date_range: isRange,
      is_whole_day: isWhole,
      date_from: dateFrom,
      date_to: dateTo,
      time_start: timeStart,
      time_end: timeEnd,
    };

    try {
      let err;
      if (this.editingId) {
        ({ error: err } = await getSb().from('company_events').update(payload).eq('id', this.editingId));
      } else {
        payload.created_by = this.currentUserId;
        if (this.duplicateSourceEvent) {
          payload.email_subject = this.duplicateSourceEvent.email_subject;
          payload.email_preheader = this.duplicateSourceEvent.email_preheader;
          payload.email_attendee_response = this.duplicateSourceEvent.email_attendee_response;
          payload.email_body_json = this.duplicateSourceEvent.email_body_json;
          payload.email_settings = this.duplicateSourceEvent.email_settings;
        }
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
};

function loadEventsChunk(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

let emailChunksPromise = null;
function ensureEventEmailChunks() {
  if (!emailChunksPromise) {
    emailChunksPromise = Promise.all([
      loadEventsChunk('/dashboard/events/events-email-builder.js?v=1.0.0'),
      loadEventsChunk('/dashboard/events/events-email-templates.js?v=1.0.0'),
      loadEventsChunk('/dashboard/events/events-email-helpers.js?v=1.0.0'),
      loadEventsChunk('/dashboard/events/events-email-scheduler.js?v=1.0.0')
    ]);
  }
  return emailChunksPromise;
}

window.EventsApp.openEmailBuilder = async function openEmailBuilder(id) {
  await ensureEventEmailChunks();
  return window.EventsApp.openEmailBuilder(id);
};

(async () => {
  const isHolidayPage = window.location.pathname.replace(/\/+$/, '').endsWith('/holiday');
  try {
    if (isHolidayPage) {
      await loadEventsChunk('/dashboard/events/events-holiday.js?v=1.0.2');
      await window.HolidayApp.init();
    } else {
      await window.EventsApp.init();
    }
  } catch (error) {
    console.error(error);
    window.Toast?.error?.('This page could not finish loading. Please refresh and try again.');
  }
})();

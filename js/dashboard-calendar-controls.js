/* Dashboard calendar visibility and operational sources. */
(function initDashboardCalendarControls() {
  'use strict';

  if (!window.App) {
    document.addEventListener('DOMContentLoaded', initDashboardCalendarControls, { once: true });
    return;
  }

  const COLORS = {
    holidays: '#eab308',
    birthdays: '#e35d2f',
    events: '#06b6d4',
    leaves: '#ef4444',
    bookings: '#8b5cf6',
    logistics: '#22c55e'
  };

  const LABELS = {
    holidays: 'Holidays',
    birthdays: 'Birthdays',
    events: 'Company Events',
    leaves: 'Leaves',
    bookings: 'Bookings (Installation)',
    logistics: 'Logistics (Warehouse)'
  };

  const state = {
    visibility: {
      holidays: true,
      birthdays: true,
      events: true,
      leaves: false,
      bookings: false,
      logistics: false
    },
    leaveScope: 'company',
    teamLeaveEmployeeIds: new Set(),
    bookings: [],
    logistics: [],
    leaves: []
  };

  function visibilitySettingsKey() {
    return `dashboard_calendar_visibility_${App.employeeId}`;
  }

  async function loadVisibilityPreferences() {
    if (!App.companyId || !App.employeeId) return;
    try {
      const { data, error } = await window.BKAuth.sb.from('global_settings')
        .select('value')
        .eq('company_id', App.companyId)
        .eq('key', visibilitySettingsKey())
        .maybeSingle();
      if (error) throw error;
      const saved = data?.value;
      if (!saved || typeof saved !== 'object') return;
      Object.keys(LABELS).forEach(type => {
        if (typeof saved.visibility?.[type] === 'boolean') state.visibility[type] = saved.visibility[type];
      });
      if (saved.leaveScope === 'team' || saved.leaveScope === 'company') state.leaveScope = saved.leaveScope;
    } catch (error) {
      console.error('Dashboard calendar visibility could not be loaded:', error);
    }
  }

  let visibilitySavePromise = Promise.resolve();
  function saveVisibilityPreferences() {
    const value = { visibility: { ...state.visibility }, leaveScope: state.leaveScope };
    visibilitySavePromise = visibilitySavePromise.catch(() => {}).then(async () => {
      const { error } = await window.BKAuth.sb.from('global_settings').upsert({
        company_id: App.companyId,
        key: visibilitySettingsKey(),
        value
      }, { onConflict: 'company_id,key' });
      if (error) throw error;
    }).catch(error => {
      console.error('Dashboard calendar visibility could not be saved:', error);
      window.toast?.('Your calendar visibility could not be saved. Please try again.', 'error');
    });
    return visibilitySavePromise;
  }

  function calendarRange() {
    const year = App.calendarDate.getFullYear();
    const month = App.calendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(year, month, 1 - firstDay.getDay());
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 41);
    return { start: App.getCalendarKey(startDate), end: App.getCalendarKey(endDate) };
  }

  function eachDate(start, end, callback) {
    const cursor = new Date(`${start}T00:00:00`);
    const last = new Date(`${end}T00:00:00`);
    while (!Number.isNaN(cursor.getTime()) && cursor <= last) {
      callback(App.getCalendarKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  function timeSlot(value) {
    return /afternoon|\bpm\b/i.test(String(value || '')) ? 'Afternoon' : 'Morning';
  }

  function resolveLeaveManagerId(employee, structure) {
    if (employee?.reporting_to) return employee.reporting_to;
    if (!employee?.id) return null;

    for (const department of (structure?.departments || [])) {
      const departmentManagerId = department?.managerId || null;
      for (const team of (department?.subteams || [])) {
        if (team?.managerId === employee.id) return departmentManagerId;
        if ((team?.colleagueIds || []).includes(employee.id)) {
          return team?.managerId || departmentManagerId;
        }
      }
    }
    return null;
  }

  function buildTeamLeaveScope(structure, employees) {
    const employeeIds = new Set([App.employeeId].filter(Boolean));
    if (App.reportingTo) employeeIds.add(App.reportingTo);

    for (const department of (structure?.departments || [])) {
      for (const team of (department?.subteams || [])) {
        const colleagueIds = team?.colleagueIds || [];
        const isTeamMember = team?.managerId === App.employeeId || colleagueIds.includes(App.employeeId);
        if (!isTeamMember) continue;
        const directManagerId = team?.managerId === App.employeeId
          ? department?.managerId
          : (team?.managerId || department?.managerId);
        if (directManagerId) employeeIds.add(directManagerId);
        if (team?.managerId) employeeIds.add(team.managerId);
        colleagueIds.forEach(employeeId => employeeIds.add(employeeId));
      }
    }

    employees.forEach(employee => {
      if (resolveLeaveManagerId(employee, structure) === App.employeeId) employeeIds.add(employee.id);
    });
    return employeeIds;
  }

  async function loadOperationalSources() {
    if (!App.companyId) return;
    const { start, end } = calendarRange();
    const sb = window.BKAuth.sb;

    try {
      const [bookingResult, leaveResult, structureResult] = await Promise.all([
        sb.from('installation_bookings')
          .select('id, order_no, customer_name, scheduled_date, scheduled_time, pickup_date, pickup_time, status')
          .eq('company_id', App.companyId)
          .neq('status', 'cancelled')
          .or(`and(scheduled_date.gte.${start},scheduled_date.lte.${end}),and(pickup_date.gte.${start},pickup_date.lte.${end})`)
          .order('scheduled_date', { ascending: true, nullsFirst: false })
          .limit(500),
        sb.from('leave_requests')
          .select('id, employee_id, leave_type, date_from, date_to')
          .eq('company_id', App.companyId)
          .eq('status', 'approved')
          .lte('date_from', end)
          .gte('date_to', start)
          .order('date_from', { ascending: true })
          .limit(500),
        sb.from('global_settings')
          .select('value')
          .eq('company_id', App.companyId)
          .eq('key', 'company_structure')
          .maybeSingle()
      ]);

      if (bookingResult.error) throw bookingResult.error;
      if (leaveResult.error) throw leaveResult.error;
      if (structureResult.error) throw structureResult.error;

      const rows = bookingResult.data || [];
      state.bookings = rows.filter(row => row.scheduled_date >= start && row.scheduled_date <= end);
      state.logistics = rows.filter(row => row.pickup_date >= start && row.pickup_date <= end);

      const leaves = leaveResult.data || [];
      const employeeIds = [...new Set(leaves.map(leave => leave.employee_id).filter(Boolean))];
      let employeeMap = new Map();
      if (employeeIds.length) {
        const { data: employees, error: employeeError } = await sb.from('employees')
          .select('id, first_name, last_name, reporting_to')
          .eq('company_id', App.companyId)
          .in('id', employeeIds)
          .limit(500);
        if (employeeError) throw employeeError;
        employeeMap = new Map((employees || []).map(employee => [employee.id, employee]));
      }
      const leaveEmployees = [...employeeMap.values()];
      state.teamLeaveEmployeeIds = buildTeamLeaveScope(
        structureResult.data?.value || { departments: [] },
        leaveEmployees
      );
      state.leaves = leaves.map(leave => ({ ...leave, employee: employeeMap.get(leave.employee_id) || null }));
    } catch (error) {
      console.error('Dashboard calendar operational sources could not be loaded:', error);
      state.bookings = [];
      state.logistics = [];
      state.leaves = [];
    }
  }

  function getDayItems(dateKey) {
    const items = [];
    const event = App.calendarEvents[dateKey];

    if (state.visibility.holidays) {
      (App.calendarHolidays[dateKey] || []).forEach(holiday => items.push({
        type: 'holidays', title: holiday.name, meta: 'Holiday'
      }));
    }
    if (state.visibility.birthdays && event?.birthdayNames?.length) {
      event.birthdayNames.forEach(name => items.push({ type: 'birthdays', title: `${name}'s Birthday`, meta: 'Birthday' }));
    }
    if (state.visibility.events && event?.eventId) {
      const companyEvent = (App.companyEvents || []).find(item => item.id === event.eventId);
      if (companyEvent) items.push({ type: 'events', title: companyEvent.title, meta: 'Company Event', eventId: companyEvent.id });
    }
    if (state.visibility.leaves) {
      state.leaves.forEach(leave => {
        if (dateKey < leave.date_from || dateKey > leave.date_to) return;
        if (state.leaveScope === 'team' && !state.teamLeaveEmployeeIds.has(leave.employee_id)) return;
        const employee = leave.employee;
        const name = [employee?.first_name, employee?.last_name].filter(Boolean).join(' ') || 'Employee';
        items.push({ type: 'leaves', title: `${name} — Leave`, meta: leave.leave_type || 'Approved Leave' });
      });
    }
    if (state.visibility.bookings) {
      state.bookings.filter(booking => booking.scheduled_date === dateKey).forEach(booking => items.push({
        type: 'bookings',
        title: booking.customer_name || booking.order_no || 'Installation Booking',
        meta: `${timeSlot(booking.scheduled_time)} · ${booking.order_no || 'Installation'}`
      }));
    }
    if (state.visibility.logistics) {
      state.logistics.filter(booking => booking.pickup_date === dateKey).forEach(booking => items.push({
        type: 'logistics',
        title: booking.customer_name || booking.order_no || 'Warehouse Logistics',
        meta: `${timeSlot(booking.pickup_time)} · ${booking.order_no || 'Warehouse pickup'}`
      }));
    }
    return items;
  }

  function decorateCalendar() {
    document.querySelectorAll('[data-calendar-date]').forEach(day => {
      day.querySelector('.home-calendar-markers')?.remove();
      const types = [...new Set(getDayItems(day.dataset.calendarDate).map(item => item.type))];
      if (!types.length) return;

      const markers = document.createElement('span');
      markers.className = 'home-calendar-markers';
      markers.setAttribute('aria-hidden', 'true');
      types.forEach(type => {
        const marker = document.createElement('span');
        marker.className = 'home-calendar-marker';
        marker.style.backgroundColor = COLORS[type];
        markers.appendChild(marker);
      });
      day.appendChild(markers);
    });
  }

  function renderUpcoming() {
    const container = document.getElementById('home-events-list');
    if (!container) return;
    const { start, end } = calendarRange();
    const today = App.getCalendarKey(new Date());
    const first = today > start ? today : start;
    const upcoming = [];
    eachDate(first, end, dateKey => {
      getDayItems(dateKey).forEach(item => upcoming.push({ ...item, dateKey }));
    });
    upcoming.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.title.localeCompare(b.title));
    container.replaceChildren();

    if (!upcoming.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No upcoming events.';
      empty.style.cssText = 'color:var(--text-muted);font-style:italic;padding:0.25rem 0;';
      container.appendChild(empty);
      return;
    }

    upcoming.slice(0, 5).forEach(item => {
      const row = document.createElement(item.eventId ? 'button' : 'div');
      row.className = 'home-calendar-upcoming-row';
      if (item.eventId) {
        row.type = 'button';
        row.classList.add('is-clickable');
        row.setAttribute('aria-label', `View company event: ${item.title}`);
        row.addEventListener('click', () => App.openCorpEventModal(item.eventId, item.dateKey));
      }
      const color = document.createElement('span');
      color.className = 'home-calendar-upcoming-color';
      color.style.backgroundColor = COLORS[item.type];
      const title = document.createElement('span');
      title.className = 'home-calendar-upcoming-title';
      title.textContent = item.type === 'bookings' ? `${item.title} · ${item.meta.split(' · ')[0]}` : item.title;
      title.title = title.textContent;
      const date = document.createElement('span');
      date.className = 'home-calendar-upcoming-date';
      const [year, month, day] = item.dateKey.split('-').map(Number);
      date.textContent = new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      row.append(color, title, date);
      container.appendChild(row);
    });
  }

  function renderVisibilityOptions() {
    const container = document.getElementById('calendar-visibility-options');
    if (!container || container.childElementCount) return;
    Object.keys(LABELS).forEach(type => {
      const group = document.createElement('div');
      group.className = type === 'leaves' ? 'calendar-visibility-group has-subitems' : 'calendar-visibility-group';
      const label = document.createElement('label');
      label.className = 'calendar-visibility-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state.visibility[type];
      checkbox.addEventListener('change', () => {
        state.visibility[type] = checkbox.checked;
        if (type === 'leaves') {
          group.querySelectorAll('input[type="radio"]').forEach(radio => { radio.disabled = !checkbox.checked; });
        }
        decorateCalendar();
        renderUpcoming();
        saveVisibilityPreferences();
      });
      const text = document.createElement('span');
      text.textContent = LABELS[type];
      const color = document.createElement('span');
      color.className = 'calendar-visibility-color';
      color.style.backgroundColor = COLORS[type];
      label.append(checkbox, text, color);
      group.appendChild(label);

      if (type === 'leaves') {
        const scopeOptions = document.createElement('div');
        scopeOptions.className = 'calendar-leave-scope';
        [
          { value: 'team', label: 'Team' },
          { value: 'company', label: 'Company' }
        ].forEach(option => {
          const scopeLabel = document.createElement('label');
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'calendar-leave-scope';
          radio.value = option.value;
          radio.checked = state.leaveScope === option.value;
          radio.disabled = !state.visibility.leaves;
          radio.addEventListener('change', () => {
            if (!radio.checked) return;
            state.leaveScope = option.value;
            decorateCalendar();
            renderUpcoming();
            saveVisibilityPreferences();
          });
          const scopeText = document.createElement('span');
          scopeText.textContent = option.label;
          scopeLabel.append(radio, scopeText);
          scopeOptions.appendChild(scopeLabel);
        });
        group.appendChild(scopeOptions);
      }

      container.appendChild(group);
    });
  }

  App.openCalendarVisibilityModal = function openCalendarVisibilityModal() {
    renderVisibilityOptions();
    const modal = document.getElementById('calendar-visibility-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('open');
    modal.querySelector('input')?.focus();
  };

  App.closeCalendarVisibilityModal = function closeCalendarVisibilityModal() {
    const modal = document.getElementById('calendar-visibility-modal');
    if (!modal) return;
    modal.classList.remove('open');
    window.setTimeout(() => { modal.style.display = 'none'; }, 150);
  };

  const originalRenderCalendar = App.renderCalendar.bind(App);
  App.renderCalendar = function renderCalendarWithSources() {
    originalRenderCalendar();
    decorateCalendar();
  };

  App.renderUpcomingEvents = renderUpcoming;

  App.showCalendarDayModal = function showCombinedCalendarDayModal(dateKey) {
    const modal = document.getElementById('calendar-day-modal');
    const title = document.getElementById('calendar-day-title');
    const name = document.getElementById('calendar-event-name');
    const description = document.getElementById('calendar-event-desc');
    if (!modal || !title || !name || !description) return;

    const [year, month, day] = dateKey.split('-').map(Number);
    title.textContent = App.formatCalendarDate(new Date(year, month - 1, day));
    name.replaceChildren();
    name.className = 'calendar-day-items';
    name.style.display = 'flex';
    description.style.display = 'none';
    const items = getDayItems(dateKey);

    if (!items.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No visible events for this day.';
      empty.style.color = 'var(--text-muted)';
      name.appendChild(empty);
    } else {
      items.forEach(item => {
        const row = document.createElement(item.eventId ? 'button' : 'div');
        row.className = 'calendar-day-item';
        if (item.eventId) {
          row.type = 'button';
          row.classList.add('is-clickable');
          row.setAttribute('aria-label', `View company event: ${item.title}`);
          row.addEventListener('click', () => {
            App.closeCalendarDayModal();
            App.openCorpEventModal(item.eventId, dateKey);
          });
        }
        const color = document.createElement('span');
        color.className = 'calendar-day-item-color';
        color.style.backgroundColor = COLORS[item.type];
        const copy = document.createElement('div');
        const itemTitle = document.createElement('div');
        itemTitle.className = 'calendar-day-item-title';
        itemTitle.textContent = item.title;
        const meta = document.createElement('div');
        meta.className = 'calendar-day-item-meta';
        meta.textContent = item.meta;
        copy.append(itemTitle, meta);
        row.append(color, copy);
        name.appendChild(row);
      });
    }

    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('open');
  };

  const originalInit = App.init.bind(App);
  App.init = async function initWithCalendarSources() {
    await originalInit();
    await loadVisibilityPreferences();
    await loadOperationalSources();
    App.renderCalendar();
    renderUpcoming();
  };

  const originalChangeMonth = App.changeCalendarMonth.bind(App);
  App.changeCalendarMonth = async function changeCalendarMonthWithSources(direction) {
    await originalChangeMonth(direction);
    await loadOperationalSources();
    App.renderCalendar();
    renderUpcoming();
  };
}());

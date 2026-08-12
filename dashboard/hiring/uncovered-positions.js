(() => {
  const state = { positions: [], selectedEmployeeIds: [] };

  async function load(app, employeesPromise, jobPostsPromise) {
    const timeout = new Promise(resolve => setTimeout(() => resolve([false, false]), 15000));
    const results = await Promise.race([
      Promise.all([employeesPromise, jobPostsPromise].map(promise => Promise.resolve(promise).catch(error => {
        console.error('Uncovered positions load failed:', error);
        return false;
      }))),
      timeout
    ]);
    if (results.every(Boolean)) {
      render(app);
      return;
    }
    const host = document.getElementById('uncovered-positions-list');
    const count = document.getElementById('uncovered-positions-count');
    if (count) count.textContent = '—';
    if (host) host.innerHTML = '<div class="hiring-empty uncovered-positions-empty">Employee positions could not be checked. <button class="uncovered-positions-retry" type="button" onclick="window.location.reload()">Retry</button></div>';
  }

  function render(app) {
    const host = document.getElementById('uncovered-positions-list');
    const count = document.getElementById('uncovered-positions-count');
    if (!host || !count) return;

    const coveredTitles = new Set(app.jobPosts.map(post => String(post.job_title || '').trim().toLocaleLowerCase()).filter(Boolean));
    const byTitle = new Map();
    app.employees.forEach((employee) => {
      if (employee.job_post_id) return;
      const title = String(employee.title || '').trim();
      const key = title.toLocaleLowerCase();
      if (!key || coveredTitles.has(key)) return;
      if (!byTitle.has(key)) byTitle.set(key, { title, employees: [] });
      byTitle.get(key).employees.push(employee);
    });
    state.positions = [...byTitle.values()].sort((a, b) => a.title.localeCompare(b.title));
    count.textContent = String(state.positions.length);
    count.setAttribute('aria-label', `${state.positions.length} positions without job posts`);

    if (!state.positions.length) {
      host.innerHTML = '<div class="hiring-empty uncovered-positions-empty">Every active employee position has a job post.</div>';
      return;
    }

    host.innerHTML = `<div class="uncovered-position-grid">${state.positions.map((position, positionIndex) => {
      const departments = [...new Set(position.employees.map(employee => String(employee.department || '').trim()).filter(Boolean))];
      const salaries = position.employees
        .filter(employee => employee.salary != null && employee.salary !== '')
        .map(employee => Number(employee.salary))
        .filter(Number.isFinite);
      const compensation = salaries.length
        ? `${app.formatCurrency(Math.min(...salaries))}${Math.min(...salaries) !== Math.max(...salaries) ? ` – ${app.formatCurrency(Math.max(...salaries))}` : ''} / mo`
        : 'Not set in directory';
      const employeeNames = position.employees.map(employee => [employee.first_name, employee.last_name].filter(Boolean).join(' ').trim()).filter(Boolean);
      const managerNames = [...new Set(position.employees.map((employee) => {
        const manager = app.employees.find(candidate => candidate.id === employee.reporting_to);
        return manager ? [manager.first_name, manager.last_name].filter(Boolean).join(' ').trim() : '';
      }).filter(Boolean))];
      const schedules = [...new Set(position.employees.map(employee => [employee.shift_days, employee.shift_time_1].filter(Boolean).join(' · ')).filter(Boolean))];
      const reporting = [managerNames.length ? `Reports to ${managerNames.join(', ')}` : '', schedules.join(', ')].filter(Boolean).join(' · ') || 'Not set in directory';
      return `<article class="uncovered-position-card">
        <div class="uncovered-position-card-main"><h3>${app.esc(position.title)}</h3><p>${app.esc(departments.join(', ') || 'Department not set')}</p></div>
        <dl class="uncovered-position-details">
          <div><dt>Compensation</dt><dd>${app.esc(compensation)}</dd></div>
          <div><dt>Reporting</dt><dd>${app.esc(reporting)}</dd></div>
          <div><dt>Directory employees</dt><dd>${app.esc(employeeNames.join(', ') || `${position.employees.length} employee${position.employees.length === 1 ? '' : 's'}`)}</dd></div>
        </dl>
        <button class="btn btn-primary uncovered-position-action" type="button" onclick="BKHiringUncoveredPositions.open(${positionIndex})">Create Job Post</button>
      </article>`;
    }).join('')}</div>`;
  }

  function findTeam(app, employeeId) {
    for (const department of app.organizationStructure || []) {
      for (const team of department.subteams || []) {
        if (team.managerId === employeeId || (team.colleagueIds || []).includes(employeeId)) return team.name || '';
      }
    }
    return '';
  }

  function parseShiftTime(value) {
    const match = String(value || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return ['', ''];
    const normalize = (hour, minute, period) => {
      let hours = Number(hour);
      if (period) hours = (hours % 12) + (period.toUpperCase() === 'PM' ? 12 : 0);
      return `${String(hours).padStart(2, '0')}:${minute}`;
    };
    return [normalize(match[1], match[2], match[3]), normalize(match[4], match[5], match[6])];
  }

  function parseShiftDays(value) {
    const normalized = String(value || '').replace(/Saturday/gi, 'Sa').replace(/Sunday/gi, 'Su');
    const matches = normalized.match(/Th|Sa|Su|M|T|W|F|S/g) || [];
    return [...new Set(matches.map(day => day === 'S' ? 'Sa' : day))];
  }

  async function open(positionIndex) {
    const app = window.HiringApp;
    const position = state.positions[positionIndex];
    if (!app || !position) return;
    app.openCreateModal();
    state.selectedEmployeeIds = position.employees.map(employee => employee.id).filter(Boolean);
    const employee = position.employees[0];
    document.getElementById('job-type').value = 'regular';
    app.updateTypeFields();
    document.getElementById('job-position').value = position.title;
    document.getElementById('job-title').value = position.title;
    document.getElementById('job-department').value = employee.department || '';
    document.getElementById('job-team').value = findTeam(app, employee.id);
    document.getElementById('job-level').value = employee.level || '';
    document.getElementById('job-description').value = String(employee.job_description || '').slice(0, 500);
    document.getElementById('job-hiring-manager').value = employee.reporting_to || '';
    if (employee.salary != null) document.getElementById('monthly-salary').value = employee.salary;
    app.selectedDays = new Set(parseShiftDays(employee.shift_days));
    document.querySelectorAll('#reporting-days .day-chip').forEach(button => button.classList.toggle('active', app.selectedDays.has(button.dataset.day)));
    const [start, end] = parseShiftTime(employee.shift_time_1);
    document.getElementById('reporting-time-start').value = start;
    document.getElementById('reporting-time-end').value = end;
    app.updateCharacterCount('job-title', 'job-title-count', 100);
    app.updateCharacterCount('job-description', 'job-description-count', 500);

    const { data, error } = await app.sb.from('team_tasks')
      .select('title, kpi, task_type')
      .eq('company_id', app.companyId)
      .eq('assigned_to', employee.id)
      .in('task_type', ['daily', 'weekly', 'monthly'])
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) {
      console.error('Employee responsibilities load failed:', error);
      app.showToast('The employee details were loaded, but responsibilities could not be fetched. You can still add them manually.', true);
      return;
    }
    const responsibilities = { daily: [], weekly: [], monthly: [] };
    (data || []).forEach(task => responsibilities[task.task_type].push({ item: task.title, kpi: task.kpi || '' }));
    app.setResponsibilityValues(responsibilities);
  }

  async function linkCreatedPost(app, jobPostId, isEditing) {
    if (isEditing || !jobPostId || !state.selectedEmployeeIds.length) return true;
    const employeeIds = [...new Set(state.selectedEmployeeIds)];
    const { data, error } = await app.sb.from('employees')
      .update({ job_post_id: jobPostId })
      .eq('company_id', app.companyId)
      .in('id', employeeIds)
      .is('job_post_id', null)
      .select('id');
    if (error) {
      console.error('Directory employees could not be linked to the new job post:', error);
      return false;
    }
    const linkedIds = new Set((data || []).map(employee => employee.id));
    app.employees.forEach((employee) => {
      if (linkedIds.has(employee.id)) employee.job_post_id = jobPostId;
    });
    state.selectedEmployeeIds = [];
    render(app);
    return true;
  }

  function clearSelection() {
    state.selectedEmployeeIds = [];
  }

  window.BKHiringUncoveredPositions = { load, render, open, linkCreatedPost, clearSelection };
})();

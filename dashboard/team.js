    'use strict';

    function esc(s) {
      return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function formatTextWithLinks(text) {
      if (!text) return '';
      // Escape first
      let escaped = esc(text);
      // Regex to recognize URLs
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      return escaped.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" style="color:var(--cyan-light); text-decoration:none; font-weight:600;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${url}</a>`;
      });
    }

    function toast(msg, type = 'success') {
      const container = document.getElementById('toast-container');
      const el = document.createElement('div');
      el.className = `toast toast-${type}`;
      el.textContent = msg;
      container.appendChild(el);
      setTimeout(() => el.remove(), 3500);
    }

    const App = {
      sb: null,
      currentUser: null,
      companyId: null,
      loggedInEmployee: null,
      userRole: null,
      isOwnerOrAdmin: false,

      // Company structure and subordinate lists
      companyStructure: null,
      subordinates: [], // [{ id, first_name, last_name, employee_number }]
      selectedEmployeeId: null,
      hasEditAccess: false,
      memberRoles: {}, // user_id -> role

      // Current view states
      activeMainTab: 'tasks', // 'tasks', 'milestones', 'projects'
      tasks: [],
      milestones: [],
      projects: [],
      managementDirections: [],
      allProjects: [],
      allProjectMembers: [],
      allActiveEmployees: [],

      async init() {
        const user = await window.BKAuth.requireAuth('../login.html');
        if (!user) return;

        const roleInfo = await window.BKAuth.getUserRole();
        if (!roleInfo) {
          window.location.href = '../login.html';
          return;
        }

        this.sb = window.BKAuth.sb;
        this.currentUser = user;
        this.userRole = roleInfo.role;
        this.isOwnerOrAdmin = ['owner', 'admin'].includes(this.userRole);

        // Fetch company details
        try {
          const { data: co } = await this.sb.from('companies').select('id').eq('tenant_id', roleInfo.tenantId).limit(1).maybeSingle();
          this.companyId = co?.id || null;
        } catch(e) { this.companyId = null; }

        if (!this.companyId) {
          toast('Error: Company ID not found.', 'error');
          return;
        }

        // Fetch logged-in employee record
        try {
          const { data: emp } = await this.sb.from('employees').select('*').eq('id', this.currentUser.id).maybeSingle();
          this.loggedInEmployee = emp;
        } catch(e) { this.loggedInEmployee = null; }

        if (!this.loggedInEmployee && !this.isOwnerOrAdmin) {
          toast('Error: Employee profile not found.', 'error');
          return;
        }

        // Fetch all tenant member roles to verify superior/subordinate levels
        try {
          const { data: members } = await this.sb.from('tenant_members').select('user_id, role').eq('tenant_id', roleInfo.tenantId);
          this.memberRoles = {};
          if (members) {
            members.forEach(m => {
              this.memberRoles[m.user_id] = m.role;
            });
          }
        } catch(e) {
          this.memberRoles = {};
        }

        // Fetch company structure settings to determine subordinates
        await this.loadCompanyStructure();

        // Build list of subordinates
        await this.buildSubordinatesList();

        // Populate employee select dropdown
        this.populateEmployeeSelect();

        // Load initially selected employee data
        this.selectedEmployeeId = document.getElementById('select-employee').value;
        await this.loadEmployeeData();
      },

      async loadCompanyStructure() {
        try {
          const { data: settings } = await this.sb
            .from('global_settings')
            .select('value')
            .eq('key', 'company_structure')
            .eq('company_id', this.companyId)
            .maybeSingle();
          this.companyStructure = settings?.value || { departments: [] };
        } catch(e) {
          this.companyStructure = { departments: [] };
        }
      },

      async buildSubordinatesList() {
        this.subordinates = [];
        
        // Fetch all active employees with details for cards
        let allEmployees = [];
        try {
          const { data } = await this.sb.from('employees').select('id, first_name, last_name, employee_number, picture_link, cv_link, title, job_description, department').eq('employment_status', 'Active');
          allEmployees = data || [];
          this.allActiveEmployees = allEmployees;
        } catch (e) {
          console.error(e);
          this.allActiveEmployees = [];
        }

        // Check if the current user has subordinates in the company structure
        const loggedId = this.currentUser.id;
        let managedEmployeeIds = new Set();

        const struct = this.companyStructure || { departments: [] };
        if (struct.departments) {
          struct.departments.forEach(dept => {
            const deptHeadId = dept.managerId;
            if (deptHeadId === loggedId) {
              // Department Head manages subteam managers and colleagues
              if (dept.subteams) {
                dept.subteams.forEach(sub => {
                  if (sub.managerId) managedEmployeeIds.add(sub.managerId);
                  if (sub.colleagueIds) {
                    sub.colleagueIds.forEach(colId => managedEmployeeIds.add(colId));
                  }
                });
              }
            } else {
              // Check if logged in user is a subteam manager
              if (dept.subteams) {
                dept.subteams.forEach(sub => {
                  if (sub.managerId === loggedId) {
                    if (sub.colleagueIds) {
                      sub.colleagueIds.forEach(colId => managedEmployeeIds.add(colId));
                    }
                  }
                });
              }
            }
          });
        }

        if (this.isOwnerOrAdmin) {
          // Owners and Admins can view/edit everyone
          this.subordinates = allEmployees;
        } else {
          // Managers see their subordinates + themselves
          const managedList = allEmployees.filter(e => managedEmployeeIds.has(e.id));
          const selfRecord = allEmployees.find(e => e.id === loggedId);
          
          if (selfRecord) {
            this.subordinates = [selfRecord, ...managedList];
          } else {
            this.subordinates = managedList;
          }
        }
      },

      populateEmployeeSelect() {
        const select = document.getElementById('select-employee');
        const container = document.getElementById('topbar-select-container');
        const mainTabsNav = document.getElementById('main-section-tabs');

        if (this.isOwnerOrAdmin) {
          // Show top bar select container for Owner/Admin
          container.style.display = 'flex';
          mainTabsNav.style.display = 'none'; // No tabs needed for admin
          
          select.innerHTML = this.subordinates.map(emp => {
            const label = `${emp.first_name} ${emp.last_name ? emp.last_name[0] + '.' : ''} (${emp.title || 'Specialist'})`;
            return `<option value="${esc(emp.id)}">${esc(label)}</option>`;
          }).join('');
          
          if (select.options.length > 0) {
            const hasSelf = this.subordinates.some(emp => emp.id === this.currentUser.id);
            select.value = hasSelf ? this.currentUser.id : this.subordinates[0].id;
          }
        } else {
          container.style.display = 'none';
          
          // Check if they are a manager (has subordinates other than themselves)
          const hasSubordinates = this.subordinates.some(e => e.id !== this.currentUser.id);
          if (hasSubordinates) {
            mainTabsNav.style.display = 'flex';
            this.renderProfileCards();
          } else {
            mainTabsNav.style.display = 'none';
          }

          select.innerHTML = `<option value="${esc(this.currentUser.id)}">Self</option>`;
          select.value = this.currentUser.id;
        }
      },

      switchMainSection(section) {
        if (section === 'my-tasks') {
          document.getElementById('btn-main-my-tasks').classList.add('active');
          document.getElementById('btn-main-team').classList.remove('active');
          document.getElementById('profile-cards-grid').style.display = 'none';
          this.selectEmployee(this.currentUser.id);
        } else {
          document.getElementById('btn-main-my-tasks').classList.remove('active');
          document.getElementById('btn-main-team').classList.add('active');
          document.getElementById('profile-cards-grid').style.display = 'grid';
          
          const teamMembers = this.subordinates.filter(e => e.id !== this.currentUser.id);
          if (teamMembers.length > 0) {
            const nextSel = teamMembers.find(t => t.id === this.selectedEmployeeId) || teamMembers[0];
            this.selectEmployee(nextSel.id);
            this.renderProfileCards();
          }
        }
      },

      renderProfileCards() {
        const grid = document.getElementById('profile-cards-grid');
        if (!grid) return;

        const teamMembers = this.subordinates.filter(e => e.id !== this.currentUser.id);
        if (teamMembers.length === 0) {
          grid.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; padding:1rem;">No subordinates assigned.</div>';
          return;
        }

        grid.innerHTML = teamMembers.map(emp => {
          const initials = `${emp.first_name?.[0] || ''}${emp.last_name?.[0] || ''}`.toUpperCase();
          const avatarHtml = emp.picture_link 
            ? `<img src="${esc(emp.picture_link)}" class="profile-card__avatar" alt="" loading="lazy" />`
            : `<div class="profile-card__avatar">${esc(initials)}</div>`;

          const role = emp.title || this.memberRoles[emp.id] || 'Colleague';
          const desc = emp.job_description || 'No job description provided.';
          const cvHtml = emp.cv_link
            ? `<a href="${esc(emp.cv_link)}" target="_blank" class="profile-card__cv-link" onclick="event.stopPropagation();">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                View CV
               </a>`
            : `<span class="profile-card__cv-link disabled">No CV Uploaded</span>`;

          const activeClass = this.selectedEmployeeId === emp.id ? 'active' : '';

          return `
            <div class="profile-card ${activeClass}" onclick="App.selectSubordinate('${esc(emp.id)}')">
              ${avatarHtml}
              <div class="profile-card__name">${esc(emp.first_name)} ${esc(emp.last_name)}</div>
              <div class="profile-card__role">${esc(role.replace('_', ' '))}</div>
              <div class="profile-card__desc">${esc(desc)}</div>
              ${cvHtml}
            </div>
          `;
        }).join('');
      },

      async selectSubordinate(empId) {
        await this.selectEmployee(empId);
        this.renderProfileCards();
      },

      isSuperior(A_Id, B_Id) {
        if (!A_Id || !B_Id || A_Id === B_Id) return false;

        // 1. Check Owner/Admin role
        const roleA = this.memberRoles[A_Id] || '';
        const roleB = this.memberRoles[B_Id] || '';
        const isOwnerAdminA = ['owner', 'admin'].includes(roleA);
        const isOwnerAdminB = ['owner', 'admin'].includes(roleB);

        if (isOwnerAdminA && !isOwnerAdminB) return true;
        if (!isOwnerAdminA && isOwnerAdminB) return false;
        if (isOwnerAdminA && isOwnerAdminB) return false; // Equal rank

        // 2. Check company structure
        const struct = this.companyStructure || { departments: [] };
        let deptAIdx = -1;
        let deptBIdx = -1;
        let isDeptHeadA = false;
        let isDeptHeadB = false;
        let isManagerA = false;
        let isManagerB = false;

        struct.departments.forEach((dept, dIdx) => {
          if (dept.managerId === A_Id) {
            deptAIdx = dIdx;
            isDeptHeadA = true;
          }
          if (dept.managerId === B_Id) {
            deptBIdx = dIdx;
            isDeptHeadB = true;
          }

          if (dept.subteams) {
            dept.subteams.forEach(sub => {
              if (sub.managerId === A_Id) {
                deptAIdx = dIdx;
                isManagerA = true;
              }
              if (sub.managerId === B_Id) {
                deptBIdx = dIdx;
                isManagerB = true;
              }
              if (sub.colleagueIds) {
                if (sub.colleagueIds.includes(A_Id)) deptAIdx = dIdx;
                if (sub.colleagueIds.includes(B_Id)) deptBIdx = dIdx;
              }
            });
          }
        });

        // If they are in different departments, they don't have direct superiority unless one is Admin
        if (deptAIdx !== deptBIdx || deptAIdx === -1) {
          return false;
        }

        // Same department hierarchy: Dept Head (3) > Subteam Manager (2) > Colleague (1)
        let tierA = 1;
        if (isDeptHeadA) tierA = 3;
        else if (isManagerA) tierA = 2;

        let tierB = 1;
        if (isDeptHeadB) tierB = 3;
        else if (isManagerB) tierB = 2;

        return tierA > tierB;
      },

      canEditTask(task) {
        if (!task) return false;
        // If task is not saved yet (newly created in UI), it can always be edited by the creator (the logged-in user)
        if (task.id && (task.id.startsWith('temp_') || !task.created_at)) {
          return true;
        }

        const loggedId = this.currentUser.id;

        // Owners and Admins can edit everything
        if (this.isOwnerOrAdmin) {
          return true;
        }

        // You cannot edit tasks assigned to yourself unless you are Owner/Admin
        if (task.assigned_to === loggedId) {
          return false;
        }

        // Is the assignee a subordinate of the logged-in user?
        const isAssigneeSubordinate = this.isSuperior(loggedId, task.assigned_to);
        if (!isAssigneeSubordinate) {
          return false;
        }

        // Is the creator a superior of the logged-in user?
        const isCreatorSuperior = this.isSuperior(task.assigned_by, loggedId);
        if (isCreatorSuperior) {
          return false;
        }

        return true;
      },

      async selectEmployee(empId) {
        this.selectedEmployeeId = empId;
        await this.loadEmployeeData();
      },

      determinePermissions() {
        const loggedId = this.currentUser.id;
        const targetId = this.selectedEmployeeId;

        if (this.isOwnerOrAdmin) {
          this.hasEditAccess = true;
          return;
        }

        // Colleague viewing their own dashboard is view-only (managers edit colleague tasks)
        if (loggedId === targetId) {
          this.hasEditAccess = false;
          return;
        }

        // Check if logged in user is supervisor of targetId
        let isSupervisor = false;
        const struct = this.companyStructure || { departments: [] };
        if (struct.departments) {
          struct.departments.forEach(dept => {
            const deptHeadId = dept.managerId;
            if (deptHeadId === loggedId) {
              // Department Head is supervisor of everyone in the department (except themselves)
              if (dept.subteams) {
                dept.subteams.forEach(sub => {
                  if (sub.managerId === targetId) isSupervisor = true;
                  if (sub.colleagueIds && sub.colleagueIds.includes(targetId)) isSupervisor = true;
                });
              }
            } else {
              // Subteam manager is supervisor of subteam colleagues
              if (dept.subteams) {
                dept.subteams.forEach(sub => {
                  if (sub.managerId === loggedId) {
                    if (sub.colleagueIds && sub.colleagueIds.includes(targetId)) {
                      isSupervisor = true;
                    }
                  }
                });
              }
            }
          });
        }

        this.hasEditAccess = isSupervisor;
      },

      updateUIIndicators() {
        const btnAddTasks = document.querySelectorAll('.btn-add-task-cls');
        const btnAddMilestone = document.getElementById('btn-add-milestone');
        const btnCreateGroup = document.getElementById('btn-create-group');
        const btnAddProject = document.getElementById('btn-add-project');
        
        // Show/hide actions column header based on edit access state
        const thActions = document.querySelectorAll('.th-actions');
        thActions.forEach(el => {
          el.style.display = this.hasEditAccess ? '' : 'none';
        });

        // Show/hide milestones actions column based on edit access OR if viewing own milestones
        const showMilestonesActions = this.hasEditAccess || (this.currentUser && this.selectedEmployeeId === this.currentUser.id);
        const thMilestonesActions = document.querySelectorAll('.th-milestones-actions');
        thMilestonesActions.forEach(el => {
          el.style.display = showMilestonesActions ? '' : 'none';
        });

        // Top bar controls element for Edit Mode (Import/Export buttons)
        const controls = document.getElementById('edit-mode-controls');
        if (controls) {
          if (this.hasEditAccess) {
            controls.innerHTML = `
              <button class="btn btn-outline" onclick="App.exportTasksToCSV()" style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; height: 32px; padding: 0 0.75rem;">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export CSV
              </button>
              <button class="btn btn-outline" onclick="App.triggerImportCSV()" style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; height: 32px; padding: 0 0.75rem;">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Import CSV
              </button>
              <input type="file" id="import-tasks-csv-file" accept=".csv" style="display: none;" onchange="App.importTasksFromCSV(event)" />
            `;
          } else {
            controls.innerHTML = '';
          }
        }

        if (this.hasEditAccess) {
          btnAddTasks.forEach(btn => btn.style.display = 'inline-flex');
          if (btnAddMilestone) btnAddMilestone.style.display = 'inline-flex';
          if (btnCreateGroup) btnCreateGroup.style.display = 'inline-flex';
          if (btnAddProject) btnAddProject.style.display = 'inline-flex';
        } else {
          btnAddTasks.forEach(btn => btn.style.display = 'none');
          if (btnAddMilestone) btnAddMilestone.style.display = 'none';
          if (btnCreateGroup) btnCreateGroup.style.display = 'none';
          if (btnAddProject) btnAddProject.style.display = 'none';
        }
      },

      exportTasksToCSV() {
        if (!this.tasks || this.tasks.length === 0) {
          toast('No tasks to export.', 'error');
          return;
        }
        
        // Find employee name for filename
        const select = document.getElementById('select-employee');
        let empName = 'Employee';
        if (select) {
          const opt = select.options[select.selectedIndex];
          if (opt) empName = opt.textContent.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        }

        const headers = ['Title', 'Description', 'KPI', 'Task Type'];
        const csvRows = [headers.join(',')];

        for (const task of this.tasks) {
          const row = [
            `"${(task.title || '').replace(/"/g, '""')}"`,
            `"${(task.description || '').replace(/"/g, '""')}"`,
            `"${(task.kpi || '').replace(/"/g, '""')}"`,
            `"${(task.task_type || '').replace(/"/g, '""')}"`
          ];
          csvRows.push(row.join(','));
        }

        const csvString = csvRows.join("\n");
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `${empName}_tasks.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast('Tasks exported successfully.', 'success');
      },

      triggerImportCSV() {
        const fileInput = document.getElementById('import-tasks-csv-file');
        if (fileInput) {
          fileInput.value = '';
          fileInput.click();
        }
      },

      async importTasksFromCSV(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!this.selectedEmployeeId) {
          toast('No employee selected.', 'error');
          return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const text = e.target.result;
            const rows = this.parseCSV(text);
            if (rows.length < 2) {
              toast('CSV is empty or invalid.', 'error');
              return;
            }

            const headers = rows[0].map(h => h.trim().toLowerCase());
            const titleIndex = headers.indexOf('title');
            const descIndex = headers.indexOf('description');
            const kpiIndex = headers.indexOf('kpi');
            const typeIndex = headers.indexOf('task type');

            if (titleIndex === -1 || typeIndex === -1) {
              toast('CSV must contain "Title" and "Task Type" columns.', 'error');
              return;
            }

            const payloads = [];
            for (let i = 1; i < rows.length; i++) {
              const row = rows[i];
              if (row.length < 2) continue; // Skip empty rows

              const title = (row[titleIndex] || '').trim();
              const description = descIndex !== -1 ? (row[descIndex] || '').trim() : '';
              const kpi = kpiIndex !== -1 ? (row[kpiIndex] || '').trim() : '';
              let taskType = typeIndex !== -1 ? (row[typeIndex] || '').trim().toLowerCase() : 'daily';

              if (!title) continue; // Skip rows without a title
              if (!['daily', 'weekly', 'monthly'].includes(taskType)) {
                taskType = 'daily';
              }

              payloads.push({
                company_id: this.companyId,
                assigned_to: this.selectedEmployeeId,
                assigned_by: this.currentUser.id,
                title: title,
                description: description.substring(0, 500),
                kpi: kpi,
                task_type: taskType
              });
            }

            if (payloads.length === 0) {
              toast('No valid tasks found in CSV.', 'error');
              return;
            }

            const { error } = await this.sb.from('team_tasks').insert(payloads);
            if (error) throw error;

            toast(`Successfully imported ${payloads.length} tasks.`, 'success');
            await this.loadEmployeeData();
          } catch (err) {
            toast('Import failed: ' + err.message, 'error');
          }
        };
        reader.readAsText(file);
      },

      parseCSV(text) {
        const lines = [];
        let row = [""];
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
          const c = text[i];
          const next = text[i+1];
          if (c === '"') {
            if (inQuotes && next === '"') {
              row[row.length - 1] += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (c === ',' && !inQuotes) {
            row.push("");
          } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && next === '\n') i++;
            lines.push(row);
            row = [""];
          } else {
            row[row.length - 1] += c;
          }
        }
        if (row.length > 1 || row[0] !== "") {
          lines.push(row);
        }
        return lines;
      },

      async loadEmployeeData() {
        this.determinePermissions();
        this.updateUIIndicators();
        
        const btnTabManagement = document.getElementById('btn-tab-management');
        if (btnTabManagement) {
          btnTabManagement.style.display = this.isOwnerOrAdmin ? 'inline-flex' : 'none';
        }
        
        // Clear tasks tables
        document.getElementById('daily-tbody').innerHTML = '<tr><td colspan="4" class="empty-row">Loading daily tasks...</td></tr>';
        document.getElementById('weekly-tbody').innerHTML = '<tr><td colspan="4" class="empty-row">Loading weekly tasks...</td></tr>';
        document.getElementById('monthly-tbody').innerHTML = '<tr><td colspan="4" class="empty-row">Loading monthly tasks...</td></tr>';
        
        try {
          const { data, error } = await this.sb
            .from('team_tasks')
            .select('*')
            .eq('assigned_to', this.selectedEmployeeId)
            .order('created_at', { ascending: true });
          this.tasks = data || [];
        } catch(e) {
          this.tasks = [];
        }

        // Fetch milestones
        document.getElementById('milestones-tbody').innerHTML = '<tr><td colspan="3" class="empty-row">Loading milestones...</td></tr>';
        try {
          const { data, error } = await this.sb
            .from('team_milestones')
            .select('*')
            .eq('assigned_to', this.selectedEmployeeId)
            .order('created_at', { ascending: true });
          this.milestones = data || [];
        } catch(e) {
          this.milestones = [];
        }

        // Fetch projects & memberships
        const grid = document.getElementById('projects-grid');
        if (grid) grid.innerHTML = '<div class="empty-row" style="padding: 2rem; text-align: center; color: var(--text-muted); width: 100%; grid-column: 1 / -1;">Loading projects...</div>';
        try {
          const { data: projData } = await this.sb
            .from('team_projects')
            .select('*')
            .eq('company_id', this.companyId)
            .order('created_at', { ascending: true });
          this.allProjects = projData || [];

          const { data: memData } = await this.sb
            .from('project_members')
            .select('*');
          this.allProjectMembers = memData || [];

          const myProjectIds = this.allProjectMembers.filter(m => m.employee_id === this.selectedEmployeeId).map(m => m.project_id);
          this.projects = this.allProjects.filter(p => myProjectIds.includes(p.id));
        } catch(e) {
          this.allProjects = [];
          this.allProjectMembers = [];
          this.projects = [];
        }

        // Fetch management directions if Owner/Admin
        if (this.isOwnerOrAdmin) {
          try {
            const { data: mData, error: mErr } = await this.sb
              .from('management_directions')
              .select('*')
              .eq('company_id', this.companyId)
              .order('created_at', { ascending: true });
            if (mErr) throw mErr;
            this.managementDirections = mData || [];
          } catch(e) {
            console.error('Error fetching management directions:', e);
            this.managementDirections = [];
          }
        }

        // Render all
        this.renderTasks();
        this.renderMilestones();
        this.renderProjects();
        if (this.isOwnerOrAdmin) {
          this.renderManagementDirections();
        }
      },

      switchMainTab(tab) {
        this.activeMainTab = tab;
        const nav = document.getElementById('btn-tab-tasks').parentElement;
        nav.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`btn-tab-${tab}`).classList.add('active');
        
        document.getElementById('panel-tasks').classList.remove('active');
        document.getElementById('panel-milestones').classList.remove('active');
        document.getElementById('panel-projects').classList.remove('active');
        document.getElementById('panel-management').classList.remove('active');

        document.getElementById(`panel-${tab}`).classList.add('active');

        if (tab === 'tasks') {
          document.querySelectorAll('#daily-tbody textarea, #weekly-tbody textarea, #monthly-tbody textarea').forEach(tx => {
            tx.style.height = 'auto';
            tx.style.height = tx.scrollHeight + 'px';
          });
        }
      },

      openTaskModal(id = null, type = 'daily') {
        document.getElementById('task-modal-id').value = id || '';
        document.getElementById('task-modal-type').value = type;
        
        const titleInput = document.getElementById('task-modal-title-input');
        const descInput = document.getElementById('task-modal-desc-input');
        const kpiInput = document.getElementById('task-modal-kpi-input');
        const modalTitle = document.getElementById('task-modal-title');

        const formattedType = type.charAt(0).toUpperCase() + type.slice(1);
        if (id) {
          modalTitle.textContent = 'Edit ' + formattedType + ' Task';
          const task = this.tasks.find(t => t.id === id);
          titleInput.value = task?.title || '';
          descInput.value = task?.description || '';
          kpiInput.value = task?.kpi || '';
        } else {
          modalTitle.textContent = 'Assign New ' + formattedType + ' Task';
          titleInput.value = '';
          descInput.value = '';
          kpiInput.value = '';
        }

        document.getElementById('task-modal').classList.add('open');
      },

      closeTaskModal() {
        document.getElementById('task-modal').classList.remove('open');
      },

      async saveTask(e) {
        e.preventDefault();
        const id = document.getElementById('task-modal-id').value;
        const type = document.getElementById('task-modal-type').value;
        const title = document.getElementById('task-modal-title-input').value.trim();
        const description = document.getElementById('task-modal-desc-input').value.trim();
        const kpi = document.getElementById('task-modal-kpi-input').value.trim();

        if (!title) return;

        const btn = document.getElementById('btn-submit-task');
        btn.disabled = true;
        const origText = btn.innerText;
        btn.innerText = 'Saving...';

        const payload = {
          company_id: this.companyId,
          assigned_to: this.selectedEmployeeId,
          assigned_by: this.currentUser.id,
          title: title,
          description: description,
          kpi: kpi || null,
          task_type: type
        };

        try {
          if (id) {
            const { error } = await this.sb.from('team_tasks').update(payload).eq('id', id);
            if (error) throw error;
            toast('Task updated successfully.', 'success');
          } else {
            const { error } = await this.sb.from('team_tasks').insert([payload]);
            if (error) throw error;
            toast('Task assigned successfully.', 'success');
          }
          this.closeTaskModal();
          await this.refreshTasksAndMilestones();
        } catch (err) {
          toast('Error saving task: ' + err.message, 'error');
        } finally {
          btn.disabled = false;
          btn.innerText = origText;
        }
      },

      async deleteTask(id) {
        const ok = await BKDialog.ask({
          title: 'Delete Task',
          message: 'This task will be permanently deleted.',
          okText: 'Delete',
          danger: true
        });
        if (!ok) return;
        try {
          const { error } = await this.sb.from('team_tasks').delete().eq('id', id);
          if (error) throw error;
          toast('Task deleted successfully.', 'success');
          await this.refreshTasksAndMilestones();
        } catch (err) {
          toast('Error deleting task: ' + err.message, 'error');
        }
      },

      populateMilestoneParentSelect(selectedParentId = null, excludeId = null) {
        const select = document.getElementById('milestone-modal-parent-input');
        if (!select) return;

        // Find all groups for this user
        const groups = this.milestones.filter(m => m.is_group && m.id !== excludeId);
        
        let html = '<option value="">(None)</option>';
        groups.forEach(g => {
          const selAttr = g.id === selectedParentId ? 'selected' : '';
          html += `<option value="${esc(g.id)}" ${selAttr}>${esc(g.title)}</option>`;
        });
        select.innerHTML = html;
      },

      openMilestoneModal(id = null) {
        document.getElementById('milestone-modal-id').value = id || '';
        
        const titleInput = document.getElementById('milestone-modal-title-input');
        const descInput = document.getElementById('milestone-modal-desc-input');
        const deadlineInput = document.getElementById('milestone-modal-deadline-input');
        const modalTitle = document.getElementById('milestone-modal-title');

        if (id) {
          modalTitle.textContent = 'Edit Milestone';
          const ms = this.milestones.find(m => m.id === id);
          titleInput.value = ms?.title || '';
          descInput.value = ms?.description || '';
          deadlineInput.value = ms?.deadline || '';
          
          this.populateMilestoneParentSelect(ms?.parent_id || null, id);
        } else {
          modalTitle.textContent = 'Assign New Milestone';
          titleInput.value = '';
          descInput.value = '';
          deadlineInput.value = '';
          
          this.populateMilestoneParentSelect(null, null);
        }

        document.getElementById('milestone-modal').classList.add('open');
      },

      closeMilestoneModal() {
        document.getElementById('milestone-modal').classList.remove('open');
      },

      async saveMilestone(e) {
        e.preventDefault();
        const id = document.getElementById('milestone-modal-id').value;
        const title = document.getElementById('milestone-modal-title-input').value.trim();
        const description = document.getElementById('milestone-modal-desc-input').value.trim();
        const deadline = document.getElementById('milestone-modal-deadline-input').value || null;
        const parent_id = document.getElementById('milestone-modal-parent-input').value || null;

        if (!title) return;

        const btn = document.getElementById('btn-submit-milestone');
        btn.disabled = true;
        const origText = btn.innerText;
        btn.innerText = 'Saving...';

        const payload = {
          company_id: this.companyId,
          assigned_to: this.selectedEmployeeId,
          assigned_by: this.currentUser.id,
          title: title,
          description: description,
          deadline: deadline,
          parent_id: parent_id,
          is_group: false
        };

        try {
          if (id) {
            const { error } = await this.sb.from('team_milestones').update(payload).eq('id', id);
            if (error) throw error;
            toast('Milestone updated successfully.', 'success');
          } else {
            const { error } = await this.sb.from('team_milestones').insert([payload]);
            if (error) throw error;
            toast('Milestone registered successfully.', 'success');
          }
          this.closeMilestoneModal();
          await this.refreshTasksAndMilestones();
        } catch (err) {
          toast('Error saving milestone: ' + err.message, 'error');
        } finally {
          btn.disabled = false;
          btn.innerText = origText;
        }
      },

      async deleteMilestone(id) {
        const ok = await BKDialog.ask({
          title: 'Delete Milestone',
          message: 'This milestone will be permanently deleted.',
          okText: 'Delete',
          danger: true
        });
        if (!ok) return;
        try {
          const { error } = await this.sb.from('team_milestones').delete().eq('id', id);
          if (error) throw error;
          toast('Milestone deleted successfully.', 'success');
          await this.refreshTasksAndMilestones();
        } catch (err) {
          toast('Error deleting milestone: ' + err.message, 'error');
        }
      },

      async toggleMilestoneCompletion(id, isCompleted) {
        const completed_at = isCompleted ? new Date().toISOString() : null;
        try {
          const { error } = await this.sb.from('team_milestones').update({ completed_at }).eq('id', id);
          if (error) throw error;
          toast(isCompleted ? 'Milestone marked as completed.' : 'Milestone marked as active.', 'success');
          await this.refreshTasksAndMilestones();
        } catch (err) {
          toast('Error toggling milestone: ' + err.message, 'error');
        }
      },

      openGroupModal(id = null) {
        document.getElementById('group-modal-id').value = id || '';
        const nameInput = document.getElementById('group-modal-name-input');
        const modalTitle = document.getElementById('group-modal-title');
        
        if (id) {
          modalTitle.textContent = 'Rename Milestone Group';
          const group = this.milestones.find(m => m.id === id);
          nameInput.value = group?.title || '';
        } else {
          modalTitle.textContent = 'Create Milestone Group';
          nameInput.value = '';
        }
        document.getElementById('group-modal').classList.add('open');
      },

      closeGroupModal() {
        document.getElementById('group-modal').classList.remove('open');
      },

      async saveGroup(e) {
        e.preventDefault();
        const id = document.getElementById('group-modal-id').value;
        const name = document.getElementById('group-modal-name-input').value.trim();
        if (!name) return;

        const btn = document.getElementById('btn-submit-group');
        btn.disabled = true;
        const origText = btn.innerText;
        btn.innerText = 'Saving...';

        try {
          if (id) {
            const { error } = await this.sb.from('team_milestones').update({ title: name }).eq('id', id);
            if (error) throw error;
            toast('Group renamed successfully.', 'success');
          } else {
            const payload = {
              company_id: this.companyId,
              assigned_to: this.selectedEmployeeId,
              assigned_by: this.currentUser.id,
              title: name,
              is_group: true
            };
            const { error } = await this.sb.from('team_milestones').insert([payload]);
            if (error) throw error;
            toast('Group created successfully.', 'success');
          }
          this.closeGroupModal();
          await this.refreshTasksAndMilestones();
        } catch (err) {
          toast('Error saving group: ' + err.message, 'error');
        } finally {
          btn.disabled = false;
          btn.innerText = origText;
        }
      },

      async renameGroupInline(id, currentTitle) {
        this.openGroupModal(id);
      },

      handleDragStart(e, id) {
        if (!this.hasEditAccess) return;
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
        const row = document.querySelector(`tr[data-milestone-id="${id}"]`);
        if (row) {
          row.style.opacity = '0.4';
        }
      },

      handleDragOver(e) {
        if (!this.hasEditAccess) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const row = e.target.closest('tr');
        if (row && row.dataset.milestoneId) {
          row.style.borderTop = '2px solid var(--cyan)';
        }
      },

      handleDragLeave(e) {
        if (!this.hasEditAccess) return;
        const row = e.target.closest('tr');
        if (row) {
          row.style.borderTop = '';
        }
      },

      handleDragEnd(e) {
        if (!this.hasEditAccess) return;
        const rows = document.querySelectorAll('tr[data-milestone-id]');
        rows.forEach(row => {
          row.style.opacity = '';
          row.style.borderTop = '';
        });
      },

      async handleDrop(e, targetId) {
        if (!this.hasEditAccess) return;
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        if (!draggedId || draggedId === targetId) return;

        const draggedItem = this.milestones.find(m => m.id === draggedId);
        const targetItem = this.milestones.find(m => m.id === targetId);
        if (!draggedItem || !targetItem) return;

        // We only allow reordering within the same group (same parent_id)
        if (draggedItem.parent_id !== targetItem.parent_id) {
          toast('Cannot move milestones between different groups.', 'error');
          return;
        }

        // Get all items in this group
        const groupItems = this.milestones.filter(m => !m.is_group && m.parent_id === draggedItem.parent_id);
        
        // Sort them by current positions/scores
        const getSortScore = (ms) => {
          if (ms.completed_at) return 1e15 + (1e12 - new Date(ms.completed_at).getTime());
          if (ms.deadline) return new Date(ms.deadline).getTime();
          return 1e14;
        };
        groupItems.sort((a, b) => {
          const posA = a.position || 0;
          const posB = b.position || 0;
          if (posA !== posB) return posA - posB;
          return getSortScore(a) - getSortScore(b);
        });

        const draggedIndex = groupItems.findIndex(m => m.id === draggedId);
        const targetIndex = groupItems.findIndex(m => m.id === targetId);

        if (draggedIndex === -1 || targetIndex === -1) return;

        // Remove from old position and insert at new position
        groupItems.splice(draggedIndex, 1);
        groupItems.splice(targetIndex, 0, draggedItem);

        // Update positions local + DB
        const updates = groupItems.map((item, index) => {
          item.position = index; // locally update
          return this.sb.from('team_milestones').update({ position: index }).eq('id', item.id);
        });

        try {
          await Promise.all(updates);
          toast('Order updated.', 'success');
          this.renderMilestones();
        } catch (err) {
          toast('Failed to save ordering: ' + err.message, 'error');
        }
      },

      async refreshTasksAndMilestones() {
        try {
          const { data: tasksData } = await this.sb
            .from('team_tasks')
            .select('*')
            .eq('assigned_to', this.selectedEmployeeId)
            .order('created_at', { ascending: true });
          this.tasks = tasksData || [];

          const { data: msData } = await this.sb
            .from('team_milestones')
            .select('*')
            .eq('assigned_to', this.selectedEmployeeId)
            .order('position', { ascending: true })
            .order('created_at', { ascending: true });
          this.milestones = msData || [];

          const { data: projData } = await this.sb
            .from('team_projects')
            .select('*')
            .eq('company_id', this.companyId)
            .order('created_at', { ascending: true });
          this.allProjects = projData || [];

          const { data: memData } = await this.sb
            .from('project_members')
            .select('*');
          this.allProjectMembers = memData || [];

          const myProjectIds = this.allProjectMembers.filter(m => m.employee_id === this.selectedEmployeeId).map(m => m.project_id);
          this.projects = this.allProjects.filter(p => myProjectIds.includes(p.id));

          this.renderTasks();
          this.renderMilestones();
          this.renderProjects();
        } catch (e) {
          console.error('Error refreshing tasks, milestones and projects:', e);
        }
      },

      renderTasks() {
        const types = ['daily', 'weekly', 'monthly'];
        types.forEach(type => {
          const tbody = document.getElementById(`${type}-tbody`);
          const activeTasks = this.tasks.filter(t => t.task_type === type);

          if (activeTasks.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="empty-row">No ${type} tasks assigned.</td></tr>`;
            return;
          }

          tbody.innerHTML = activeTasks.map(task => {
            const actionsTd = this.hasEditAccess
              ? `<td style="text-align: center; vertical-align: middle;">
                  <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
                    <button class="btn-edit-link" onclick="App.openTaskModal('${esc(task.id)}', '${esc(task.task_type)}')" title="Edit Task">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-danger-link" onclick="App.deleteTask('${esc(task.id)}')" title="Remove Task">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  </div>
                 </td>`
              : '';

            const titleHtml = this.hasEditAccess
              ? `<textarea oninput="this.style.height='auto'; this.style.height=this.scrollHeight+'px'" onchange="App.autosaveTask('${esc(task.id)}', 'title', this.value)" placeholder="Task Title" style="font-weight: 700; width: 100%; height: auto; border: 1px solid transparent; background: transparent; padding: 0.35rem 0.5rem; border-radius: 4px; outline: none; resize: none; font-family: inherit; font-size: inherit; line-height: 1.4; transition: border-color 0.15s, background-color 0.15s; word-break: break-word; overflow-wrap: break-word; white-space: pre-wrap; overflow-y: hidden;" onfocus="this.style.background='var(--bg-base)'; this.style.borderColor='var(--border)';" onblur="this.style.background='transparent'; this.style.borderColor='transparent';">${esc(task.title)}</textarea>`
              : `<span style="font-weight: 700; padding: 0.35rem 0.5rem; display: block; word-break: break-word; overflow-wrap: break-word; white-space: pre-wrap; line-height: 1.4;">${esc(task.title)}</span>`;

            const descHtml = this.hasEditAccess
              ? `<textarea oninput="this.style.height='auto'; this.style.height=this.scrollHeight+'px'" onchange="App.autosaveTask('${esc(task.id)}', 'description', this.value)" placeholder="Description..." style="width: 100%; height: auto; border: 1px solid transparent; background: transparent; padding: 0.35rem 0.5rem; border-radius: 4px; outline: none; resize: none; font-family: inherit; font-size: inherit; line-height: 1.4; transition: border-color 0.15s, background-color 0.15s; word-break: break-word; overflow-wrap: break-word; overflow-y: hidden;" onfocus="this.style.background='var(--bg-base)'; this.style.borderColor='var(--border)';" onblur="this.style.background='transparent'; this.style.borderColor='transparent';">${esc(task.description || '')}</textarea>`
              : `<div style="white-space: pre-wrap; line-height: 1.4; padding: 0.35rem 0.5rem; word-break: break-word; overflow-wrap: break-word;">${formatTextWithLinks(task.description)}</div>`;

            const kpiHtml = this.hasEditAccess
              ? `<textarea oninput="this.style.height='auto'; this.style.height=this.scrollHeight+'px'" onchange="App.autosaveTask('${esc(task.id)}', 'kpi', this.value)" placeholder="None" style="width: 100%; height: auto; border: 1px solid transparent; background: transparent; padding: 0.35rem 0.5rem; border-radius: 4px; outline: none; resize: none; font-family: inherit; font-size: inherit; line-height: 1.4; transition: border-color 0.15s, background-color 0.15s; word-break: break-word; overflow-wrap: break-word; overflow-y: hidden;" onfocus="this.style.background='var(--bg-base)'; this.style.borderColor='var(--border)';" onblur="this.style.background='transparent'; this.style.borderColor='transparent';">${esc(task.kpi || '')}</textarea>`
              : `<span style="padding: 0.35rem 0.5rem; display: block; word-break: break-word; overflow-wrap: break-word; white-space: pre-wrap; line-height: 1.4;">${task.kpi ? esc(task.kpi) : '<span style="color:var(--text-muted); font-style:italic;">None</span>'}</span>`;

            return `<tr data-task-id="${esc(task.id)}">
              <td style="vertical-align: middle; padding: 0.35rem 0.5rem;">${titleHtml}</td>
              <td style="vertical-align: middle; padding: 0.35rem 0.5rem;">${descHtml}</td>
              <td style="vertical-align: middle; padding: 0.35rem 0.5rem;">${kpiHtml}</td>
              ${actionsTd}
            </tr>`;
          }).join('');
        });

        // Auto-adjust height of all textareas to fit content and hide scrollbars
        document.querySelectorAll('#daily-tbody textarea, #weekly-tbody textarea, #monthly-tbody textarea').forEach(tx => {
          tx.style.height = 'auto';
          tx.style.height = tx.scrollHeight + 'px';
        });

        this.updateUIIndicators();
      },

      async autosaveTask(id, field, value) {
        // Update local state
        const task = this.tasks.find(t => t.id === id);
        if (task) {
          task[field] = value;
        }

        try {
          const { error } = await this.sb
            .from('team_tasks')
            .update({ [field]: value })
            .eq('id', id);
          if (error) throw error;
          toast('Changes saved.', 'success');
        } catch (err) {
          toast('Failed to save: ' + err.message, 'error');
        }
      },

      renderMilestones() {
        const tbody = document.getElementById('milestones-tbody');
        if (!tbody) return;

        if (this.milestones.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No milestones registered.</td></tr>`;
          return;
        }

        const formatDate = (dateStr) => {
          if (!dateStr) return '';
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const parts = dateStr.split('-');
            const year = parts[0];
            const monthVal = parseInt(parts[1], 10) - 1;
            const dayVal = parts[2];
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${months[monthVal]} ${dayVal}, ${year}`;
          }
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) return '';
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const month = months[d.getMonth()];
          const day = String(d.getDate()).padStart(2, '0');
          const year = d.getFullYear();
          return `${month} ${day}, ${year}`;
        };

        const getSortScore = (ms) => {
          if (ms.completed_at) {
            return 1e15 + (1e12 - new Date(ms.completed_at).getTime());
          }
          if (ms.deadline) {
            return new Date(ms.deadline).getTime();
          }
          return 1e14;
        };

        const sortMilestones = (a, b) => {
          const posA = a.position || 0;
          const posB = b.position || 0;
          if (posA !== posB) return posA - posB;
          return getSortScore(a) - getSortScore(b);
        };

        const groups = this.milestones.filter(m => m.is_group);
        const childrenMap = {};
        const rootMilestones = [];

        this.milestones.forEach(m => {
          if (m.is_group) return;
          if (m.parent_id) {
            if (!childrenMap[m.parent_id]) childrenMap[m.parent_id] = [];
            childrenMap[m.parent_id].push(m);
          } else {
            rootMilestones.push(m);
          }
        });

        // Sort children inside each group
        Object.keys(childrenMap).forEach(groupId => {
          childrenMap[groupId].sort(sortMilestones);
        });

        // Sort groups by their nearest incomplete child deadline
        groups.sort((a, b) => {
          const childrenA = childrenMap[a.id] || [];
          const childrenB = childrenMap[b.id] || [];
          const minScoreA = childrenA.length > 0 ? Math.min(...childrenA.map(getSortScore)) : 1e14;
          const minScoreB = childrenB.length > 0 ? Math.min(...childrenB.map(getSortScore)) : 1e14;
          return minScoreA - minScoreB;
        });

        // Sort root milestones
        rootMilestones.sort(sortMilestones);

        const todayString = new Date().toISOString().slice(0, 10);

        const renderMilestoneRow = (ms, isSub = false) => {
          const isCompleted = !!ms.completed_at;
          const isOverdue = ms.deadline && !isCompleted && ms.deadline < todayString;

          const rowStyle = isCompleted ? 'opacity: 0.6; color: var(--text-muted); background: var(--bg-elevated);' : '';
          const textDecor = isCompleted ? 'text-decoration: line-through;' : '';
          const titleStyle = isOverdue ? 'color: var(--danger); font-weight: 700;' : 'font-weight: 700;';

          const dragHandleHtml = this.hasEditAccess
            ? `<svg class="drag-handle" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="cursor: grab; color: var(--text-muted); margin-right: 0.5rem; vertical-align: middle;"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`
            : '';

          const isAssignee = this.currentUser && this.selectedEmployeeId === this.currentUser.id;

          let actionsTd = '';
          if (this.hasEditAccess) {
            actionsTd = `<td style="text-align: center; vertical-align: middle;">
                <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
                  <button class="btn-check-link ${isCompleted ? 'active' : ''}" onclick="App.toggleMilestoneCompletion('${esc(ms.id)}', ${!isCompleted})" title="${isCompleted ? 'Mark Active' : 'Mark Done'}">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                  <button class="btn-edit-link" onclick="App.openMilestoneModal('${esc(ms.id)}')" title="Edit Milestone">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="btn-danger-link" onclick="App.deleteMilestone('${esc(ms.id)}')" title="Remove Milestone">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </div>
               </td>`;
          } else if (isAssignee) {
            actionsTd = `<td style="text-align: center; vertical-align: middle;">
                <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
                  <button class="btn-check-link ${isCompleted ? 'active' : ''}" onclick="App.toggleMilestoneCompletion('${esc(ms.id)}', ${!isCompleted})" title="${isCompleted ? 'Mark Active' : 'Mark Done'}">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                </div>
               </td>`;
          }

          const draggableAttr = this.hasEditAccess ? `draggable="true" ondragstart="App.handleDragStart(event, '${esc(ms.id)}')" ondragover="App.handleDragOver(event)" ondragleave="App.handleDragLeave(event)" ondragend="App.handleDragEnd(event)" ondrop="App.handleDrop(event, '${esc(ms.id)}')"` : '';

          return `<tr data-milestone-id="${esc(ms.id)}" style="${rowStyle} transition: border-top 0.15s;" ${draggableAttr}>
            <td style="vertical-align: middle;">
              <div style="display: flex; align-items: center; gap: 0.25rem; padding-left: ${isSub ? '1.5rem' : '0'};">
                ${dragHandleHtml}
                <span style="${titleStyle} ${textDecor}">${esc(ms.title)}</span>
              </div>
            </td>
            <td style="white-space: pre-wrap; line-height: 1.4; vertical-align: middle; ${textDecor}">${formatTextWithLinks(ms.description)}</td>
            <td style="vertical-align: middle; color: var(--danger); font-weight: 700;">
              ${ms.deadline ? formatDate(ms.deadline) : '<span style="color:var(--text-muted); font-style:italic; font-weight:normal;">None</span>'}
            </td>
            <td style="font-size: 0.72rem; color: var(--text-secondary); vertical-align: middle; line-height: 1.3;">
              <div>${formatDate(ms.created_at)}</div>
              ${isCompleted 
                ? `<div style="font-style: italic; color: var(--text-muted); margin-top: 0.15rem;">${formatDate(ms.completed_at)}</div>` 
                : `<div style="font-style: italic; color: var(--text-muted); margin-top: 0.15rem;">Not yet done</div>`
              }
            </td>
            ${actionsTd}
          </tr>`;
        };

        let rowsHtml = '';
        const showMilestonesActions = this.hasEditAccess || (this.currentUser && this.selectedEmployeeId === this.currentUser.id);

        // Render Groups and their children
        groups.forEach(group => {
          let groupHeaderCols = '';
          if (this.hasEditAccess) {
            groupHeaderCols = `<td colspan="4" style="vertical-align: middle; padding: 0.65rem 1rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color: var(--cyan-light);"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  <span style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem;">${esc(group.title)}</span>
                </div>
              </td>
              <td style="text-align: center; vertical-align: middle; padding: 0.65rem 1rem;">
                <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
                  <button class="btn-edit-link" onclick="App.renameGroupInline('${esc(group.id)}', '${esc(group.title)}')" title="Rename Group">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="btn-danger-link" onclick="App.deleteMilestone('${esc(group.id)}')" title="Delete Group">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </div>
              </td>`;
          } else {
            const colspan = showMilestonesActions ? 5 : 4;
            groupHeaderCols = `<td colspan="${colspan}" style="vertical-align: middle; padding: 0.65rem 1rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color: var(--cyan-light);"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  <span style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem;">${esc(group.title)}</span>
                </div>
              </td>`;
          }

          rowsHtml += `<tr style="background: var(--bg-elevated); border-bottom: 1px solid var(--border);">${groupHeaderCols}</tr>`;

          const children = childrenMap[group.id] || [];
          if (children.length === 0) {
            rowsHtml += `<tr><td colspan="5" class="empty-row" style="padding: 1rem 0; font-style: italic; font-size: 0.8rem; padding-left: 1.5rem; text-align: left;">No sub-milestones in this group.</td></tr>`;
          } else {
            children.forEach(child => {
              rowsHtml += renderMilestoneRow(child, true);
            });
          }
        });

        // Render Root/General Milestones (if any)
        if (rootMilestones.length > 0) {
          const colspan = showMilestonesActions ? 5 : 4;
          const rootHeaderCols = `<td colspan="${colspan}" style="vertical-align: middle; padding: 0.65rem 1rem; background: var(--bg-elevated); border-bottom: 1px solid var(--border);">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <span style="font-weight: 700; color: var(--text-secondary); font-size: 0.85rem;">General Milestones</span>
                </div>
              </td>`;

          rowsHtml += `<tr>${rootHeaderCols}</tr>`;
          rootMilestones.forEach(ms => {
            rowsHtml += renderMilestoneRow(ms, false);
          });
        }

        tbody.innerHTML = rowsHtml;
        this.updateUIIndicators();
      },

      renderProjects() {
        const grid = document.getElementById('projects-grid');
        if (!grid) return;

        if (this.projects.length === 0) {
          grid.innerHTML = `<div class="empty-row" style="padding: 2rem; text-align: center; color: var(--text-muted); width: 100%; grid-column: 1 / -1;">No projects registered.</div>`;
          return;
        }

        const formatDate = (dateStr) => {
          if (!dateStr) return '';
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const parts = dateStr.split('-');
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${months[parseInt(parts[1], 10) - 1]} ${parts[2]}, ${parts[0]}`;
          }
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) return '';
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
        };

        const todayString = new Date().toISOString().slice(0, 10);
        let html = '';

        this.projects.forEach(p => {
          const isCompleted = !!p.completed_at;
          const isOverdue = p.deadline && !isCompleted && p.deadline < todayString;
          const deadlineText = p.deadline ? formatDate(p.deadline) : 'None';
          const deadlineClass = isOverdue ? 'project-deadline overdue' : 'project-deadline';

          // Get members for this project
          const projectMems = this.allProjectMembers.filter(m => m.project_id === p.id);
          let membersHtml = '';

          projectMems.forEach(pm => {
            const emp = this.allActiveEmployees.find(e => e.id === pm.employee_id);
            if (emp) {
              const first = emp.first_name || '';
              const lastInitial = emp.last_name ? emp.last_name.trim().charAt(0) + '.' : '';
              const displayName = `${first} ${lastInitial}`.trim();
              const avatar = emp.picture_link
                ? `<img src="${esc(emp.picture_link)}" alt="${esc(displayName)}" loading="lazy" />`
                : displayName.split(' ').map(n => n[0]).join('').toUpperCase();

              membersHtml += `
                <div class="project-member-avatar">
                  ${avatar}
                  <div class="project-member-tooltip">${esc(displayName)}</div>
                </div>
              `;
            }
          });

          if (projectMems.length === 0) {
            membersHtml = '<span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">No members</span>';
          }

          // Show action buttons
          let actionButtons = '';
          const showActions = this.hasEditAccess || (this.currentUser && this.selectedEmployeeId === this.currentUser.id);
          
          if (showActions) {
            actionButtons = `
              <button class="btn-check-link ${isCompleted ? 'active' : ''}" onclick="App.toggleProjectCompletion('${esc(p.id)}', ${!isCompleted})" title="${isCompleted ? 'Mark Active' : 'Mark Done'}">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
            `;
            if (this.hasEditAccess) {
              actionButtons += `
                <button class="btn-edit-link" onclick="App.openProjectModal('${esc(p.id)}')" title="Edit Project">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="btn-danger-link" onclick="App.deleteProject('${esc(p.id)}')" title="Delete Project">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              `;
            }
          }

          let addMemberBtnHtml = '';
          if (this.hasEditAccess) {
            addMemberBtnHtml = `
              <button class="btn btn-outline btn-sm" style="padding: 0.2rem 0.4rem; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center;" onclick="App.openMembersModal('${esc(p.id)}')" title="Manage Members">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="8.5" cy="7" r="4"></circle>
                  <line x1="20" y1="8" x2="20" y2="14"></line>
                  <line x1="17" y1="11" x2="23" y2="11"></line>
                </svg>
              </button>
            `;
          }

          html += `
            <div class="project-card ${isCompleted ? 'completed' : ''}">
              <div class="project-card-header">
                <h4 class="project-title">${esc(p.title)}</h4>
                <div class="project-actions">${actionButtons}</div>
              </div>
              <p class="project-description">${formatTextWithLinks(p.description)}</p>
              <div class="project-meta">
                <div class="${deadlineClass}">Deadline: ${deadlineText}</div>
                <div style="font-size: 0.72rem;">Created: ${formatDate(p.created_at)}</div>
              </div>
              <div class="project-members-section">
                <div style="display: flex; flex-direction: column;">
                  <span class="project-members-title">Members</span>
                  <div class="project-members-list">${membersHtml}</div>
                </div>
                ${addMemberBtnHtml}
              </div>
            </div>
          `;
        });

        grid.innerHTML = html;
      },

      openProjectModal(id = null) {
        document.getElementById('project-modal-id').value = id || '';
        const titleInput = document.getElementById('project-modal-title-input');
        const descInput = document.getElementById('project-modal-desc-input');
        const deadlineInput = document.getElementById('project-modal-deadline-input');
        const modalTitle = document.getElementById('project-modal-title');

        if (id) {
          modalTitle.textContent = 'Edit Project';
          const p = this.allProjects.find(x => x.id === id);
          titleInput.value = p?.title || '';
          descInput.value = p?.description || '';
          deadlineInput.value = p?.deadline || '';
        } else {
          modalTitle.textContent = 'Add New Project';
          titleInput.value = '';
          descInput.value = '';
          deadlineInput.value = '';
        }

        document.getElementById('project-modal').classList.add('open');
      },

      closeProjectModal() {
        document.getElementById('project-modal').classList.remove('open');
      },

      async saveProject(e) {
        e.preventDefault();
        const id = document.getElementById('project-modal-id').value;
        const title = document.getElementById('project-modal-title-input').value.trim();
        const description = document.getElementById('project-modal-desc-input').value.trim();
        const deadline = document.getElementById('project-modal-deadline-input').value || null;

        if (!title) return;

        const btn = document.getElementById('btn-submit-project');
        btn.disabled = true;
        const origText = btn.innerText;
        btn.innerText = 'Saving...';

        const payload = {
          company_id: this.companyId,
          assigned_by: this.currentUser.id,
          title: title,
          description: description,
          deadline: deadline
        };

        try {
          if (id) {
            const { error } = await this.sb.from('team_projects').update(payload).eq('id', id);
            if (error) throw error;
            toast('Project updated successfully.', 'success');
          } else {
            const { data, error } = await this.sb.from('team_projects').insert([payload]).select();
            if (error) throw error;
            
            // Auto add the current selected employee as a member when project is created
            if (data && data.length > 0) {
              await this.sb.from('project_members').insert([{
                project_id: data[0].id,
                employee_id: this.selectedEmployeeId
              }]);
            }
            toast('Project created successfully.', 'success');
          }
          this.closeProjectModal();
          await this.refreshTasksAndMilestones();
        } catch (err) {
          toast('Error saving project: ' + err.message, 'error');
        } finally {
          btn.disabled = false;
          btn.innerText = origText;
        }
      },

      async deleteProject(id) {
        const ok = await BKDialog.ask({
          title: 'Delete Project',
          message: 'This project and all its memberships will be permanently deleted.',
          okText: 'Delete',
          danger: true
        });
        if (!ok) return;

        try {
          const { error } = await this.sb.from('team_projects').delete().eq('id', id);
          if (error) throw error;
          toast('Project deleted successfully.', 'success');
          await this.refreshTasksAndMilestones();
        } catch (err) {
          toast('Error deleting project: ' + err.message, 'error');
        }
      },

      async toggleProjectCompletion(id, isCompleted) {
        const completed_at = isCompleted ? new Date().toISOString() : null;
        try {
          const { error } = await this.sb.from('team_projects').update({ completed_at }).eq('id', id);
          if (error) throw error;
          toast(isCompleted ? 'Project marked as completed.' : 'Project marked as active.', 'success');
          await this.refreshTasksAndMilestones();
        } catch (err) {
          toast('Error toggling project: ' + err.message, 'error');
        }
      },

      getEmployeeDepartmentName(employeeId) {
        if (!this.companyStructure || !this.companyStructure.departments) {
          return 'No Dept';
        }
        for (const dept of this.companyStructure.departments) {
          // Check if department manager
          if (dept.managerId === employeeId) {
            return dept.name || 'No Dept';
          }
          // Check inside subteams
          if (dept.subteams) {
            for (const sub of dept.subteams) {
              if (sub.managerId === employeeId || (sub.colleagueIds && sub.colleagueIds.includes(employeeId))) {
                return dept.name || 'No Dept';
              }
            }
          }
        }
        return 'No Dept';
      },

      openMembersModal(projectId) {
        document.getElementById('project-members-modal-id').value = projectId;
        
        // Populate employee dropdown with active employees who are NOT yet members
        const select = document.getElementById('project-member-select');
        const currentMems = this.allProjectMembers.filter(m => m.project_id === projectId);
        const currentMemIds = currentMems.map(m => m.employee_id);

        const nonMembers = this.allActiveEmployees.filter(e => !currentMemIds.includes(e.id));
        let selectHtml = '';
        nonMembers.forEach(emp => {
          const name = `${emp.first_name} ${emp.last_name || ''}`.trim();
          const deptName = this.getEmployeeDepartmentName(emp.id);
          selectHtml += `<option value="${esc(emp.id)}">${esc(name)} (${esc(deptName)})</option>`;
        });
        select.innerHTML = selectHtml || '<option value="">All employees assigned</option>';

        // Render current list of members
        const listDiv = document.getElementById('project-members-current-list');
        let listHtml = '';
        currentMems.forEach(pm => {
          const emp = this.allActiveEmployees.find(e => e.id === pm.employee_id);
          if (emp) {
            const first = emp.first_name || '';
            const lastInitial = emp.last_name ? emp.last_name.trim().charAt(0) + '.' : '';
            const displayName = `${first} ${lastInitial}`.trim();
            const avatar = emp.picture_link
              ? `<img src="${esc(emp.picture_link)}" alt="" style="width:24px; height:24px; border-radius:50%; object-fit:cover;" />`
              : `<div style="width:24px; height:24px; border-radius:50%; background:var(--cyan-dim); color:var(--cyan-light); display:flex; align-items:center; justify-content:center; font-size:0.6rem; font-weight:700;">${displayName.split(' ').map(n => n[0]).join('').toUpperCase()}</div>`;

            listHtml += `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem; background: var(--bg-elevated); border-radius: 4px;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  ${avatar}
                  <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-primary);">${esc(displayName)}</span>
                </div>
                <button class="btn-danger-link" onclick="App.removeProjectMember('${esc(projectId)}', '${esc(pm.employee_id)}')" title="Remove member" style="padding: 0.2rem; background: none; border: none; cursor: pointer; color: var(--danger);">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            `;
          }
        });

        if (currentMems.length === 0) {
          listHtml = '<div style="font-size:0.8rem; color:var(--text-muted); font-style:italic; padding:0.5rem; text-align:center;">No members assigned to this project yet.</div>';
        }
        listDiv.innerHTML = listHtml;

        document.getElementById('project-members-modal').classList.add('open');
      },

      closeMembersModal() {
        document.getElementById('project-members-modal').classList.remove('open');
      },

      async addSelectedProjectMember() {
        const projectId = document.getElementById('project-members-modal-id').value;
        const employeeId = document.getElementById('project-member-select').value;
        if (!employeeId) return;

        try {
          const { error } = await this.sb.from('project_members').insert([{
            project_id: projectId,
            employee_id: employeeId
          }]);
          if (error) throw error;

          toast('Member added to project.', 'success');
          
          // Optimistically update local cache so list updates instantly!
          this.allProjectMembers.push({ project_id: projectId, employee_id: employeeId });
          
          // Refresh list inside modal instantly
          this.openMembersModal(projectId);
          
          // Sync with server in background
          await this.refreshTasksAndMilestones();
        } catch (err) {
          toast('Error adding member: ' + err.message, 'error');
        }
      },

      async removeProjectMember(projectId, employeeId) {
        const ok = await BKDialog.ask({
          title: 'Remove Member',
          message: 'Are you sure you want to remove this member from the project?',
          okText: 'Remove',
          danger: true
        });
        if (!ok) return;

        try {
          const { error } = await this.sb
            .from('project_members')
            .delete()
            .eq('project_id', projectId)
            .eq('employee_id', employeeId);
          if (error) throw error;

          toast('Member removed from project.', 'success');
          
          // Optimistically update local cache so list updates instantly!
          this.allProjectMembers = this.allProjectMembers.filter(
            m => !(m.project_id === projectId && m.employee_id === employeeId)
          );
          
          // Refresh list inside modal instantly
          this.openMembersModal(projectId);
          
          // Sync with server in background
          await this.refreshTasksAndMilestones();
        } catch (err) {
          toast('Error removing member: ' + err.message, 'error');
        }
      },

      openDirectionModal(id = null) {
        console.log('openDirectionModal called, id:', id);
        const modalEl = document.getElementById('direction-modal');
        console.log('modal element:', modalEl);
        document.getElementById('direction-modal-id').value = id || '';
        const titleInput = document.getElementById('direction-modal-title-input');
        const descInput = document.getElementById('direction-modal-desc-input');
        const dateInput = document.getElementById('direction-modal-date-input');
        const bucketSelect = document.getElementById('direction-modal-bucket-input');
        const parentSelect = document.getElementById('direction-modal-parent-input');
        const modalTitle = document.getElementById('direction-modal-title');

        let parentHtml = '<option value="">(None - Main Direction)</option>';
        const mainDirs = (this.managementDirections || []).filter(d => !d.parent_id && d.id !== id);
        mainDirs.forEach(d => {
          parentHtml += `<option value="${esc(d.id)}">${esc(d.title)}</option>`;
        });
        parentSelect.innerHTML = parentHtml;

        if (id) {
          modalTitle.textContent = 'Edit Direction';
          const dir = this.managementDirections.find(x => x.id === id);
          titleInput.value = dir?.title || '';
          descInput.value = dir?.description || '';
          dateInput.value = dir?.target_date || '';
          bucketSelect.value = dir?.bucket || 'urgent_important';
          parentSelect.value = dir?.parent_id || '';
        } else {
          modalTitle.textContent = 'Add New Direction';
          titleInput.value = '';
          descInput.value = '';
          dateInput.value = '';
          bucketSelect.value = 'urgent_important';
          parentSelect.value = '';
        }

        document.getElementById('direction-modal').classList.add('open');
      },

      closeDirectionModal() {
        document.getElementById('direction-modal').classList.remove('open');
      },

      async saveDirection(e) {
        e.preventDefault();
        const id = document.getElementById('direction-modal-id').value;
        const title = document.getElementById('direction-modal-title-input').value.trim();
        const description = document.getElementById('direction-modal-desc-input').value.trim();
        const target_date = document.getElementById('direction-modal-date-input').value || null;
        const bucket = document.getElementById('direction-modal-bucket-input').value;
        const parent_id = document.getElementById('direction-modal-parent-input').value || null;

        if (!title) return;

        const btn = document.getElementById('btn-submit-direction');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
          if (id) {
            const { error } = await this.sb
              .from('management_directions')
              .update({ title, description, target_date, bucket, parent_id, updated_at: new Date().toISOString() })
              .eq('id', id);
            if (error) throw error;
            toast('Direction updated successfully!', 'success');
          } else {
            const { error } = await this.sb
              .from('management_directions')
              .insert([{
                company_id: this.companyId,
                title,
                description,
                target_date,
                bucket,
                parent_id
              }]);
            if (error) throw error;
            toast('Direction created successfully!', 'success');
          }
          this.closeDirectionModal();
          await this.loadEmployeeData();
        } catch (err) {
          console.error(err);
          toast('Failed to save direction: ' + err.message, 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = 'Save Direction';
        }
      },

      async deleteDirection(id) {
        const ok = await BKDialog.ask({
          title: 'Delete Direction',
          message: 'Are you sure you want to delete this management direction and all its sub-directions?',
          okText: 'Delete',
          danger: true
        });
        if (!ok) return;

        try {
          const { error } = await this.sb.from('management_directions').delete().eq('id', id);
          if (error) throw error;
          toast('Direction deleted successfully.', 'success');
          await this.loadEmployeeData();
        } catch (err) {
          toast('Error deleting direction: ' + err.message, 'error');
        }
      },

      async toggleDirectionCompletion(id, isCompleted) {
        try {
          const completedAtVal = isCompleted ? new Date().toISOString() : null;
          const { error } = await this.sb
            .from('management_directions')
            .update({ completed_at: completedAtVal })
            .eq('id', id);
          if (error) throw error;
          
          toast(isCompleted ? 'Direction completed' : 'Direction active', 'success');
          await this.loadEmployeeData();
        } catch (err) {
          toast('Error updating direction status: ' + err.message, 'error');
        }
      },

      renderManagementDirections() {
        if (!this.isOwnerOrAdmin) return;

        const buckets = ['urgent_important', 'not_urgent_important'];
        
        buckets.forEach(bucket => {
          const listEl = document.getElementById(`mgmt-${bucket.replace('_', '-')}-list`);
          if (!listEl) return;

          const bucketDirs = (this.managementDirections || []).filter(d => d.bucket === bucket);
          
          if (bucketDirs.length === 0) {
            listEl.innerHTML = `<div style="color: var(--text-muted); font-size: 0.82rem; font-style: italic;">No items in this bucket.</div>`;
            return;
          }

          const mainDirs = bucketDirs.filter(d => !d.parent_id);
          
          let html = '';
          mainDirs.forEach(mainDir => {
            html += this.buildDirectionRowHtml(mainDir, 0);
            
            const subDirs = bucketDirs.filter(d => d.parent_id === mainDir.id);
            subDirs.forEach(subDir => {
              html += this.buildDirectionRowHtml(subDir, 1);
            });
          });

          const orphanSubDirs = bucketDirs.filter(d => d.parent_id && !bucketDirs.some(p => p.id === d.parent_id));
          orphanSubDirs.forEach(subDir => {
            html += this.buildDirectionRowHtml(subDir, 1);
          });

          listEl.innerHTML = html;
        });
      },

      buildDirectionRowHtml(dir, depth = 0) {
        const isCompleted = dir.completed_at !== null;
        const checkedAttr = isCompleted ? 'checked' : '';
        const titleStyle = isCompleted ? 'text-decoration: line-through; color: var(--text-muted); font-weight: 600;' : 'font-weight: 600; color: var(--text-primary);';
        const indentStyle = depth > 0 ? `margin-left: ${depth * 2}rem; border-left: 2px dashed var(--border); padding-left: 1rem;` : '';
        
        const descHtml = dir.description 
          ? `<div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.2rem; word-break: break-all;">${esc(dir.description)}</div>` 
          : '';
        
        const dateHtml = dir.target_date 
          ? `<span style="font-size: 0.72rem; font-weight: 600; padding: 0.15rem 0.4rem; background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--border); border-radius: 4px; display: inline-flex; align-items: center; gap: 0.25rem;">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              ${dir.target_date}
             </span>` 
          : '';

        return `
          <div class="mgmt-direction-item" style="display: flex; justify-content: space-between; align-items: flex-start; padding: 0.65rem 0.85rem; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; gap: 1rem; box-sizing: border-box; ${indentStyle}">
            <div style="display: flex; align-items: flex-start; gap: 0.75rem; flex: 1; min-width: 0;">
              <input type="checkbox" ${checkedAttr} onchange="App.toggleDirectionCompletion('${esc(dir.id)}', this.checked)" style="width: 18px; height: 18px; cursor: pointer; flex-shrink: 0; margin-top: 0.15rem;" />
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 0.84rem; line-height: 1.4; ${titleStyle}">${esc(dir.title)}</div>
                ${descHtml}
                <div style="margin-top: 0.4rem; display: flex; align-items: center; gap: 0.5rem;">
                  ${dateHtml}
                </div>
              </div>
            </div>
            <div style="display: flex; gap: 0.35rem; align-items: center; flex-shrink: 0;">
              <button class="btn-edit-link" onclick="App.openDirectionModal('${esc(dir.id)}')" title="Edit Direction" style="padding: 0.25rem; background: none; border: none; cursor: pointer; color: var(--text-muted);">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn-danger-link" onclick="App.deleteDirection('${esc(dir.id)}')" title="Remove Direction" style="padding: 0.25rem; background: none; border: none; cursor: pointer; color: var(--danger);">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            </div>
          </div>
        `;
      }
    };

    document.addEventListener('DOMContentLoaded', () => {
      App.init();
    });

    /* ── Nav (from main.js) ── */
    if (typeof initNav === 'function') initNav();
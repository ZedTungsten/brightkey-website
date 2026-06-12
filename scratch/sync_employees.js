import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function sync() {
  console.log('Fetching company structure...');
  const { data: settings, error: sErr } = await sb
    .from('global_settings')
    .select('value')
    .eq('key', 'company_structure')
    .maybeSingle();

  if (sErr || !settings) {
    console.error('Failed to load company structure:', sErr);
    return;
  }

  const companyStructure = settings.value;
  const reportingToMap = {};
  const employeeDeptMap = {};

  const struct = companyStructure || { departments: [] };
  if (struct.departments) {
    struct.departments.forEach(dept => {
      const deptHeadId = dept.managerId;
      const deptName = dept.name;
      if (deptHeadId) {
        employeeDeptMap[deptHeadId] = deptName;
      }
      if (dept.subteams) {
        dept.subteams.forEach(sub => {
          const subteamManagerId = sub.managerId;
          if (subteamManagerId) {
            employeeDeptMap[subteamManagerId] = deptName;
            if (deptHeadId) {
              reportingToMap[subteamManagerId] = deptHeadId;
            }
            if (sub.colleagueIds) {
              sub.colleagueIds.forEach(colId => {
                reportingToMap[colId] = subteamManagerId;
                employeeDeptMap[colId] = deptName;
              });
            }
          } else {
            if (deptHeadId && sub.colleagueIds) {
              sub.colleagueIds.forEach(colId => {
                reportingToMap[colId] = deptHeadId;
                employeeDeptMap[colId] = deptName;
              });
            } else if (sub.colleagueIds) {
              sub.colleagueIds.forEach(colId => {
                employeeDeptMap[colId] = deptName;
              });
            }
          }
        });
      }
    });
  }

  console.log('Fetching all employees...');
  const { data: employees, error: eErr } = await sb.from('employees').select('id, first_name, last_name');
  if (eErr || !employees) {
    console.error('Failed to load employees:', eErr);
    return;
  }

  console.log('Updating employees...');
  for (const emp of employees) {
    const targetDept = employeeDeptMap[emp.id] || null;
    const targetReportTo = reportingToMap[emp.id] || null;
    console.log(`Syncing ${emp.first_name} ${emp.last_name}: Dept=${targetDept}, ReportsTo=${targetReportTo}`);
    const { error: uErr } = await sb
      .from('employees')
      .update({
        department: targetDept || '',
        reporting_to: targetReportTo
      })
      .eq('id', emp.id);
    if (uErr) {
      console.error(`Error updating ${emp.first_name}:`, uErr);
    }
  }
  console.log('Sync complete.');
}

sync();

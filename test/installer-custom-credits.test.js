import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Assignments exposes custom-credit controls only through its route header', () => {
  const page = read('dashboard/booking-schedules.html');
  const route = read('dashboard/booking-schedules/index.js');
  assert.match(page, /id="add-installer-custom-credit"[^>]*>Add Custom Credits<\/button>/);
  assert.match(page, /id="edit-installer-custom-credits"[^>]*>Edit Custom Credits<\/button>/);
  assert.ok(page.indexOf('id="edit-installer-custom-credits"') < page.indexOf('id="add-installer-custom-credit"'));
  assert.match(page, /for="installer-custom-credit-employee">Installer<\/label>[\s\S]*for="installer-custom-credit-label">Label<\/label>[\s\S]*for="installer-custom-credit-value">Credits<\/label>[\s\S]*for="installer-custom-credit-date">Date<\/label>/);
  assert.match(page, /id="installer-custom-credit-value" type="number" min="0\.01" step="0\.01" value="1" required/);
  assert.match(route, /customCreditButton\.style\.display = isInstallerAssignments \? 'inline-flex' : 'none'/);
  const manager = read('dashboard/booking-schedules/custom-credits.js');
  assert.match(manager, /window\.location\.pathname === '\/dashboard\/installers\/assignments' \? 'inline-flex' : 'none'/);
});

test('custom-credit manager has a month navigator, requested columns, and scoped mutations', () => {
  const page = read('dashboard/booking-schedules.html');
  const manager = read('dashboard/booking-schedules/custom-credits.js');
  assert.match(page, /id="manage-installer-custom-credits-modal"[\s\S]*id="custom-credit-month-title"/);
  assert.match(page, /<th>Name<\/th>[\s\S]*<th>Custom Credit Label<\/th>[\s\S]*<th>Amount<\/th>[\s\S]*<th>Date<\/th>[\s\S]*<th>Action<\/th>/);
  assert.match(manager, /\.gte\('credit_date', start\)[\s\S]*\.lte\('credit_date', end\)[\s\S]*\.limit\(500\)/);
  assert.match(manager, /\.update\(\{ label, credit_value: creditValue, credit_date: creditDate \}\)[\s\S]*\.eq\('id', id\)[\s\S]*\.eq\('company_id', currentCompanyId\)/);
  assert.match(manager, /\.delete\(\)[\s\S]*\.eq\('id', id\)[\s\S]*\.eq\('company_id', currentCompanyId\)/);
  assert.match(manager, /Promise\.allSettled\(\[loadManagerCredits\(\), loadMonthBookings\(\)\]\)/);
  assert.match(manager, /Saved, but an affected view could not refresh/);
  assert.match(page, /id="delete-installer-custom-credit-modal"/);
});

test('custom credits are company scoped, recorded as Custom, and loaded downstream', () => {
  const create = read('dashboard/booking-schedules/custom-credits.js');
  const assignments = read('dashboard/booking-schedules/installers.js');
  const portalSync = read('js/smartlock-calendar/sync.js');
  const portalJobs = read('js/smartlock-calendar/job-tracker.js');
  const payout = read('dashboard/payout-tracker/payout/index.html');
  assert.match(create, /from\('installer_custom_credits'\)\.insert\(\{[\s\S]*company_id: currentCompanyId/);
  assert.match(create, /const creditValue = Number\([\s\S]*credit_value: creditValue/);
  assert.match(assignments, /appendHistoryRows\(rows, employee\)/);
  assert.match(create, /assignment: 'Custom'/);
  assert.match(portalSync, /rpc\(\s*'get_installer_custom_credits'/);
  assert.match(portalJobs, />Custom<\/span>[\s\S]*>Completed<\/span>/);
  assert.match(payout, /from\('installer_custom_credits'\)[\s\S]*\.eq\('company_id', this\.companyId\)/);
});

test('custom-credit migration has authorization and installer-session isolation', () => {
  const migration = read('supabase/migrations/20260912061617_add_installer_custom_credits.sql');
  const permissionFix = read('supabase/migrations/20260912075710_allow_authenticated_installer_custom_credits.sql');
  assert.match(migration, /alter table public\.installer_custom_credits enable row level security/i);
  assert.match(migration, /has_module_access\(\(select auth\.uid\(\)\), company_id, 'Operations'\)/i);
  assert.match(migration, /session\.employee_id = credit\.employee_id/);
  assert.match(migration, /revoke all on function public\.get_installer_custom_credits\(uuid\) from public, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_installer_custom_credits\(uuid\) to anon/i);
  assert.match(permissionFix, /grant execute on function public\.get_installer_custom_credits\(uuid\)\s+to anon, authenticated/i);
});

test('custom-credit management migration restricts changes to Operations', () => {
  const migration = read('supabase/migrations/20260912083720_manage_installer_custom_credits.sql');
  assert.match(migration, /for update to authenticated[\s\S]*has_module_access\(\(select auth\.uid\(\)\), company_id, 'Operations'\)[\s\S]*with check/i);
  assert.match(migration, /employee\.id = employee_id[\s\S]*employee\.company_id = company_id/i);
  assert.match(migration, /for delete to authenticated[\s\S]*has_module_access\(\(select auth\.uid\(\)\), company_id, 'Operations'\)/i);
  assert.match(migration, /grant update, delete on public\.installer_custom_credits to authenticated/i);
});

test('custom-credit sync failure does not prevent the installer calendar from loading', () => {
  const sync = read('js/smartlock-calendar/sync.js');
  assert.match(sync, /if \(error\) throw error;[\s\S]*try \{[\s\S]*get_installer_custom_credits/);
  assert.match(sync, /catch \(customCreditsError\) \{[\s\S]*installerCustomCredits = \[\];[\s\S]*Custom credits could not be synced/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/attendance.html', import.meta.url), 'utf8');

test('Attendance exposes the member dropdown in the main header', () => {
  const header = source.match(/<div class="top-bar">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="content-area">/)?.[1] || '';
  assert.match(header, /class="attendance-member-filter" id="attendance-member-filter" hidden>[\s\S]*?id="attendance-member-select"[^>]*aria-label="Show attendance for"/);
  assert.match(source, /\.attendance-member-filter\s*\{[\s\S]*?margin-left:\s*auto;/);
});

test('Attendance limits member choices using owner and org-chart scope', () => {
  assert.match(source, /const isOwner = this\.userRole === 'owner';/);
  assert.match(source, /department\?\.managerId === this\.employee\?\.id[\s\S]*?team\?\.managerId[\s\S]*?team\?\.colleagueIds/);
  assert.match(source, /team\?\.managerId === this\.employee\?\.id[\s\S]*?team\.colleagueIds/);
  assert.match(source, /this\.attendanceEmployees = allEmployees\.filter\(member => visibleIds\.has\(member\.id\)\)/);
  assert.doesNotMatch(source, /loadAttendanceMemberAccess[\s\S]*?\.eq\('employment_status',\s*'Active'\)/);
});

test('Attendance log queries use the selected authorized member', () => {
  assert.match(source, /const viewingEmployee = this\.selectedAttendanceEmployee \|\| this\.employee;/);
  assert.match(source, /\.eq\('employee_id', viewingEmployee\.id\)/);
  assert.match(source, /onAttendanceEmployeeChange\(employeeId\)[\s\S]*?this\.attendanceEmployees\.find[\s\S]*?this\.loadLogs\(\);/);
});

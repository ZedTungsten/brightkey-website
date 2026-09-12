import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/employee-directory.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../dashboard/employee-directory.js', import.meta.url), 'utf8');

test('employee directory keeps personal, government, and document columns in the requested order', () => {
  assert.match(page, /colspan="11" class="grp-personal">Personal Information/);
  assert.match(page, /colspan="15" class="grp-hr">HR \/ Employment/);
  assert.match(page, /colspan="4" class="grp-gov">Gov't Numbers/);
  assert.match(page, /colspan="4" class="grp-docs">Documents/);
  assert.match(page, /data-col="email">Email[\s\S]*?<th class="grp-personal">Profile Picture<\/th>[\s\S]*?data-col="job_post_id"/);
  assert.match(page, /data-col="tin">TIN[\s\S]*?data-col="sss">SSS[\s\S]*?data-col="pagibig">PAG-IBIG[\s\S]*?data-col="philhealth">PhilHealth[\s\S]*?<th class="grp-docs">Gov't ID/);
  assert.match(page, /<th class="grp-docs">Company ID<\/th>/);
  assert.match(script, /cell\(emp\.email,[\s\S]*?\$\{cellPicture\(\)\}[\s\S]*?\$\{jobPostCell\(\)\}/);
  assert.match(page, /employee-directory\.js\?v=11/);
});

test('add employee form keeps profile picture in Personal Information', () => {
  const personalStart = page.indexOf('Personal Information');
  const employmentStart = page.indexOf('HR & Employment Details', personalStart);
  const profilePicture = page.indexOf('for="new-emp-pic-link"');
  const governmentStart = page.indexOf('Government IDs & Documents', employmentStart);

  assert.ok(profilePicture > personalStart && profilePicture < employmentStart);
  assert.ok(governmentStart > profilePicture);
});

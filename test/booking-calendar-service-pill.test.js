import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('service-only calendar jobs use an orange installer pill', () => {
  const source = fs.readFileSync(new URL('../dashboard/booking-schedules/index.js', import.meta.url), 'utf8');

  assert.match(source, /new Set\(\['BACKJOB', 'OCULAR', 'ADD-ON LABOR'\]\)/);
  assert.match(source, /const hasServiceProduct = activeProducts\.some/);
  assert.match(source, /category \|\| ''\)\.trim\(\)\.toLowerCase\(\) !== 'service'/);
  assert.match(source, /const isServiceOnly = !hasHardwareProduct/);
  assert.match(source, /installers\.every\(installer => String\(installer\?\.role \|\| ''\)\.trim\(\)\.toLowerCase\(\) === 'service'\)/);
  assert.match(source, /installerBadgeColor = calendarDoorState\.isServiceOnly \? '#F59E0B' : 'var\(--success\)'/);
  assert.match(source, /background:\$\{installerBadgeColor\}/);
  assert.doesNotMatch(source, /completedBadgeColor/);
});

test('calendar completion state uses smartlock-style markers before the installer pill', () => {
  const source = fs.readFileSync(new URL('../dashboard/booking-schedules/index.js', import.meta.url), 'utf8');

  assert.match(source, /class=\"calendar-progress-check\" title=\"Done\"/);
  assert.match(source, /class=\"calendar-progress-check media-uploaded\" title=\"All media uploaded\"/);
  assert.match(source, /const completionMarker = hasMedia[\s\S]*?: \(isMarkedDone \?/);
  assert.match(source, /\$\{completionMarker\}<span class=\"calendar-inst-badge\"/);
  assert.doesNotMatch(source, /Done, Media Uploaded/);
});

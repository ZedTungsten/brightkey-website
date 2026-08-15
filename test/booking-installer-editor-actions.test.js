import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/booking-schedules/installers.js', import.meta.url), 'utf8');

test('installer editor separates role removal from cancelling changes', () => {
  assert.match(source, /clearDoorInstallerEdit\(\$\{doorIndex\}, 'lead'\)/);
  assert.match(source, /clearDoorInstallerEdit\(\$\{doorIndex\}, 'service'\)/);
  assert.match(source, /removeAssistInstallerEdit\(\$\{doorIndex\}, 2\)/);
  assert.match(source, /onclick="cancelDoorInstallersEdit\(\$\{doorIndex\}\)"[\s\S]*?>Cancel<\/button>/);
  assert.match(source, /onclick="cancelBookingInstallersEdit\(\$\{index\}\)"[\s\S]*?>Cancel<\/button>/);
  assert.match(source, /background:var\(--danger,#dc2626\)/);
});

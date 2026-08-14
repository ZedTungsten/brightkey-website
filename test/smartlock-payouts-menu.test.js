import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../smartlock-calendar.html', import.meta.url), 'utf8');
const authSource = fs.readFileSync(new URL('../js/smartlock-calendar/auth.js', import.meta.url), 'utf8');
const payoutsSource = fs.readFileSync(new URL('../js/smartlock-calendar/payouts.js', import.meta.url), 'utf8');

test('SmartLock Calendar registers payout rules in its payouts module', () => {
  assert.match(html, /\/js\/smartlock-calendar\/payouts\.js/);
  const context = {};
  context.globalThis = context;
  const registration = payoutsSource.slice(0, payoutsSource.indexOf('function isOwnerInstaller'));
  vm.runInNewContext(registration, context);
  assert.equal(typeof context.BKInstallerPayoutRules?.serviceRules, 'function');
});

test('view switching closes and updates the drawer before rendering the selected page', () => {
  const switchBody = authSource.match(/function switchView\(view\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.ok(switchBody.indexOf('toggleSidebar(false)') < switchBody.indexOf('drawPayouts()'));
  assert.ok(switchBody.indexOf("item.classList.add('active')") < switchBody.indexOf('drawPayouts()'));
});

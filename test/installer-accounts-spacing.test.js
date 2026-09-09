import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/booking-schedules.html', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../dashboard/booking-schedules.css', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../dashboard/booking-schedules/index.js', import.meta.url), 'utf8');

test('installer accounts uses compact spacing below the shared tabs', () => {
  assert.match(page, /id="tab-panel-installer-accounts" style="display: none;"/);
  assert.match(styles, /body\.installer-accounts-page \.scroll-container\s*\{[\s\S]*?padding-top: 0\.75rem;/);
  assert.match(styles, /body\.installer-accounts-page #installer-tabs \{ margin-bottom: 0; \}/);
  assert.match(script, /classList\.toggle\('installer-accounts-page', isInstallerAccounts\)/);
});

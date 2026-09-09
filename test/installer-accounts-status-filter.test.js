import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/booking-schedules.html', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../dashboard/booking-schedules.css', import.meta.url), 'utf8');

test('installer account status filter has a label and custom SVG select treatment', () => {
  assert.match(page, /class="installer-accounts-status-filter"[\s\S]*?<span>Status<\/span>[\s\S]*?id="installer-accounts-status"[\s\S]*?<svg/);
  assert.match(styles, /\.installer-accounts-select-shell \.form-input\s*\{[\s\S]*?appearance: none;[\s\S]*?background: #FFFFFF;/);
  assert.match(styles, /\.installer-accounts-select-shell svg\s*\{[\s\S]*?pointer-events: none;/);
});

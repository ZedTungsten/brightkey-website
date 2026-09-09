import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/booking-schedules.html', import.meta.url), 'utf8');
const sharedStyles = fs.readFileSync(new URL('../dashboard/booking-schedules.css', import.meta.url), 'utf8');
const toolsStyles = fs.readFileSync(new URL('../dashboard/booking-schedules/tools.css', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../dashboard/booking-schedules/index.js', import.meta.url), 'utf8');

test('installer tools uses compact tab spacing and the saved navigator component', () => {
  assert.match(sharedStyles, /body\.installer-tools-page \.scroll-container\s*\{[\s\S]*?padding-top: 0\.75rem;/);
  assert.match(sharedStyles, /body\.installer-tools-page \.booking-controls-row\s*\{[\s\S]*?display: none;/);
  assert.match(sharedStyles, /body\.installer-tools-page #installer-tabs \{ margin-bottom: 0; \}/);
  assert.match(toolsStyles, /\.installer-tools-panel \{ padding-top: 0; \}/);
  assert.match(toolsStyles, /\.installer-tools-subtabs \{[\s\S]*?margin: 0;[\s\S]*?padding-left: 2rem;[\s\S]*?border-top: 0;/);
  assert.match(toolsStyles, /\.installer-tools-subtabs \.tab-btn \{[\s\S]*?padding-top: \.65rem;[\s\S]*?padding-bottom: \.65rem;[\s\S]*?font-size: \.78rem;/);
  assert.match(script, /classList\.toggle\('installer-tools-page', isInstallerTools\)/);
  assert.match(page, /id="installer-tabs"[\s\S]*?id="installer-tools-subtabs"[\s\S]*?class="scroll-container"/);
  assert.match(page, /class="month-picker tools-year-nav"/);
  assert.match(page, /id="installer-tools-prev-year"[\s\S]*?<svg[\s\S]*?id="installer-tools-year"[\s\S]*?id="installer-tools-next-year"[\s\S]*?<svg/);
});

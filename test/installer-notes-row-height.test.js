import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const styles = fs.readFileSync(new URL('../dashboard/booking-schedules/notes.css', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../dashboard/booking-schedules/notes.js', import.meta.url), 'utf8');

test('note rows remain content-height while the spacer fills unused table space', () => {
  assert.match(styles, /tbody tr:not\(\.installer-notes-spacer-row\) \{ height: 1px; \}/);
  assert.match(styles, /\.installer-notes-spacer-row[\s\S]*?height: auto !important;/);
  assert.match(script, /spacer\.className = 'installer-notes-spacer-row'/);
});

test('notes search sits close beneath the installer tabs', () => {
  assert.match(styles, /\.scroll-container\.installer-notes-active \{[\s\S]*?padding-top: 0\.25rem;/);
  assert.match(styles, /#tab-panel-installer-notes \{[\s\S]*?padding-top: 0;/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const details = fs.readFileSync(new URL('../dashboard/booking-schedules/booking-details.js', import.meta.url), 'utf8');
const editor = fs.readFileSync(new URL('../dashboard/booking-schedules/door-spec-editor.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../dashboard/booking-schedules.css', import.meta.url), 'utf8');

test('door type section uses one pencil action and three specification dropdowns', () => {
  assert.match(details, /id="door-spec-edit-button-\$\{i\}"[\s\S]*?aria-label="Edit door specifications"[\s\S]*?<svg/);
  assert.match(details, /M11 4H4a2 2 0 0 0-2 2v14/);
  assert.match(details, /data-door-spec="doorMaterial"/);
  assert.match(details, /data-door-spec="jambMaterial"/);
  assert.match(details, /data-door-spec="swing"/);
  assert.match(details, />Save<\/button>/);
  assert.match(details, /toggleDoorSpecificationsEdit\(\$\{i\}, false\)[^>]*>Cancel<\/button>/);
});

test('door specification save preserves the door object and scopes the update by company', () => {
  assert.match(editor, /doors\[doorIndex\]\s*=\s*\{\s*\.\.\.doors\[doorIndex\],\s*doorMaterial,\s*jambMaterial,\s*swing\s*\}/);
  assert.match(editor, /\.update\(\{ doors \}\)[\s\S]*?\.eq\('id', selectedBooking\.id\)[\s\S]*?\.eq\('company_id', currentCompanyId\)/);
  assert.match(styles, /\.booking-door-spec-field \.form-input[\s\S]*?min-height:\s*36px[\s\S]*?font-weight:\s*400/);
  assert.match(styles, /> \.booking-door-spec-section[\s\S]*?flex-direction:\s*row !important[\s\S]*?align-items:\s*center !important/);
});

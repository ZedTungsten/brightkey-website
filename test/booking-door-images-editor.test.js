import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const assets = fs.readFileSync(new URL('../dashboard/booking-schedules/booking-assets.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../dashboard/booking-schedules.css', import.meta.url), 'utf8');

test('door image edit mode uses one consistent thumbnail grid and footer', () => {
  assert.match(assets, /class="door-pics-editor"/);
  assert.match(assets, /class="door-pics-edit-grid"/);
  assert.match(assets, /class="door-pics-edit-item"/);
  assert.match(assets, /class="door-pics-upload-button"/);
  assert.match(assets, /class="door-pics-edit-actions"[\s\S]*?>Done<\/button>/);
  assert.doesNotMatch(assets, /width:\s*44px;\s*height:\s*44px/);
});

test('door image edit controls share the rendered 76px thumbnail dimensions', () => {
  assert.match(styles, /\.door-pics-edit-grid[\s\S]*?grid-template-columns:\s*repeat\(auto-fill, 76px\)[\s\S]*?grid-auto-rows:\s*76px/);
  assert.match(styles, /\.door-pics-edit-item[\s\S]*?width:\s*76px[\s\S]*?height:\s*76px/);
  assert.match(styles, /\.door-pics-upload-button[\s\S]*?width:\s*76px[\s\S]*?height:\s*76px/);
  assert.match(assets, /aria-label="Delete door photo"[\s\S]*?<svg/);
});

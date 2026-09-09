import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/booking-schedules.html', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../dashboard/booking-schedules/tools.css', import.meta.url), 'utf8');

test('both tool modals use the larger SVG close control', () => {
  const controls = page.match(/class="modal-close tool-modal-close"/g) || [];
  assert.equal(controls.length, 2);
  assert.match(styles, /\.tool-modal-close \{[\s\S]*?width: 36px;[\s\S]*?height: 36px;/);
  assert.match(styles, /\.tool-modal-close svg \{[\s\S]*?width: 20px;[\s\S]*?height: 20px;/);
});

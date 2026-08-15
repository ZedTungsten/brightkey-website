import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const js = fs.readFileSync(new URL('../dashboard/hr-onboarding/handbook/handbook.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../dashboard/hr-onboarding/hr-onboarding.css', import.meta.url), 'utf8');

test('general and job materials place Group immediately to the right of Name', () => {
  assert.match(js, /<th class="hr-material-order-column" aria-label="Order"><\/th><th>Name<\/th><th>Group<\/th>/);
  assert.match(js, /rows\(state\.general,'general'\)/);
  assert.match(js, /rows\(jobFiles,'job'\)/);
  assert.match(js, /class="hr-material-group-header"/);
});

test('material modal supports existing or newly created groups during create and edit', () => {
  assert.match(js, /<select id="material-group" onchange="HRMaterials\.changeGroup\(this\.value\)"><\/select>/);
  assert.match(js, /<option value="__new__">Create New Group\.\.\.<\/option>/);
  assert.match(js, /group:group\.slice\(0,80\)/);
});

test('drag and drop can reassign materials to another group', () => {
  assert.match(js, /moved\.group=targetGroup/);
  assert.match(js, /async function dropGroup/);
  assert.match(js, /moved\.group=group/);
  assert.match(js, /encodeURIComponent\(group\)\.replace\(\/'\/g,'%27'\)/);
  assert.match(css, /\.hr-material-group-header\.dragover td/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../dashboard/payout-tracker/payout/index.html', import.meta.url), 'utf8');

test('payout tracker applies Smartlock Calendar cancelled-door rules', () => {
  assert.match(source, /isInstallerDoorCancelled\(booking, door, doorIndex, doors\)/);
  assert.match(source, /door\?\.cancelled === true/);
  assert.match(source, /matches\.every\(product => product\?\.cancelled === true\)/);
  assert.match(source, /if \(this\.isInstallerDoorCancelled\(b, door, index, doorsArr\)\) return;/);
});

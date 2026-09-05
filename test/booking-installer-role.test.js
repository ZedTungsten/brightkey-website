import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const details = fs.readFileSync(new URL('../dashboard/booking-schedules/booking-details.js', import.meta.url), 'utf8');
const installers = fs.readFileSync(new URL('../dashboard/booking-schedules/installers.js', import.meta.url), 'utf8');

test('booking details show both primary roles for mixed product and service orders', () => {
  assert.match(details, /if \(roleKey\.includes\('service'\)\) return 'Service Installer'/);
  assert.match(details, /if \(hasHardwareProduct && !hasRole\('lead'\)\)/);
  assert.match(details, /if \(hasServiceProduct && !hasRole\('service'\)\)/);
});

test('installer editor independently shows Lead for products and Service for service SKUs', () => {
  assert.match(installers, /const leadHtml = hasHardwareProduct \? `/);
  assert.match(installers, /const serviceHtml = hasServiceProduct \? `/);
  assert.match(installers, /leadInst\?\.id \|\| serviceInst\?\.id \|\| currentInstallers\[0\]\?\.id/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const calendarSource = fs.readFileSync(new URL('../dashboard/booking-schedules/index.js', import.meta.url), 'utf8');
const installerSource = fs.readFileSync(new URL('../dashboard/booking-schedules/installers.js', import.meta.url), 'utf8');
const pageSource = fs.readFileSync(new URL('../dashboard/booking-schedules.html', import.meta.url), 'utf8');

test('installer assignments use the Smart Lock Calendar completion source', () => {
  assert.match(calendarSource, /window\.BKBookingCompletion = Object\.freeze\(\{ isDoorCompletedForDisplay \}\)/);
  assert.match(installerSource, /window\.BKBookingCompletion\?\.isDoorCompletedForDisplay/);
  assert.match(installerSource, /isDoorCompletedForDisplay\(booking, door, doorIndex, doors, products\)/);
  assert.match(pageSource, /window\.BKBookingCompletion\?\.isDoorCompletedForDisplay/);
});

test('the shared completion source preserves signature and media completion', () => {
  assert.match(calendarSource, /Boolean\(door\?\.signature\) && doorHasCompletionMedia\(door\)/);
});

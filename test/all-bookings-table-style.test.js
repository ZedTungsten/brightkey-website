import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../dashboard/booking-schedules.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../dashboard/booking-schedules.css', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../dashboard/booking-schedules/index.js', import.meta.url), 'utf8');

test('All Bookings uses the CS Customers viewport-contained table pattern', () => {
  assert.match(html, /class="table-responsive all-bookings-table-scroll"/);
  assert.match(html, /class="prod-table all-bookings-table"/);
  assert.match(css, /body\.booking-all-bookings-page \.dash-layout,[\s\S]*?height: 100dvh;[\s\S]*?min-height: 0;/);
  assert.match(css, /body\.booking-all-bookings-page \.scroll-container \{[\s\S]*?padding-bottom: 4rem;/);
  assert.match(css, /\.all-bookings-table-scroll \{[\s\S]*?overflow: auto;[\s\S]*?overscroll-behavior: contain;/);
  assert.match(css, /#tab-panel-all-bookings \.all-bookings-table th \{[\s\S]*?position: sticky;[\s\S]*?background: #F4F4F5;/);
  assert.match(script, /panelAllBookings\.style\.display = currentSubpage === 'all-bookings' \? 'flex' : 'none'/);
  assert.match(script, /classList\.toggle\('booking-all-bookings-page', currentSubpage === 'all-bookings'\)/);
  assert.match(script, /class="table-spacer-row"/);
});

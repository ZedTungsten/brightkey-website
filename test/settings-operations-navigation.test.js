import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const settingsPages = ['company', 'access', 'businesses', 'catalog', 'assignments', 'logistics', 'sales', 'hr'];

test('settings exposes Operations as one top-level tab', () => {
  for (const page of settingsPages) {
    const html = read(`dashboard/settings/${page}.html`);
    assert.match(html, /href="\/dashboard\/settings\/operations">Operations<\/a>/);
    assert.doesNotMatch(html, /href="\/dashboard\/settings\/(?:booking|installers)">/);
  }
});

test('Operations pages expose canonical Booking and Installers subtabs', () => {
  const booking = read('dashboard/settings/booking.html');
  const installers = read('dashboard/settings/installers.html');

  for (const html of [booking, installers]) {
    assert.match(html, /class="tab-btn active" href="\/dashboard\/settings\/operations">Operations<\/a>/);
    assert.match(html, /class="settings-subtabs" aria-label="Operations settings"/);
    assert.match(html, /href="\/dashboard\/settings\/operations\/booking"/);
    assert.match(html, /href="\/dashboard\/settings\/operations\/installers"/);
  }
  assert.match(booking, /href="\/dashboard\/settings\/operations\/booking" aria-current="page">Booking/);
  assert.match(installers, /href="\/dashboard\/settings\/operations\/installers" aria-current="page">Installers/);
});

test('legacy settings routes redirect and canonical Operations routes rewrite to existing pages', () => {
  const config = JSON.parse(read('vercel.json'));
  const redirects = new Map(config.redirects.map(rule => [rule.source, rule.destination]));
  const rewrites = new Map(config.rewrites.map(rule => [rule.source, rule.destination]));

  assert.equal(redirects.get('/dashboard/settings/operations'), '/dashboard/settings/operations/booking');
  assert.equal(redirects.get('/dashboard/settings/booking'), '/dashboard/settings/operations/booking');
  assert.equal(redirects.get('/dashboard/settings/installers'), '/dashboard/settings/operations/installers');
  assert.equal(rewrites.get('/dashboard/settings/operations/booking'), '/dashboard/settings/booking.html');
  assert.equal(rewrites.get('/dashboard/settings/operations/installers'), '/dashboard/settings/installers.html');
});

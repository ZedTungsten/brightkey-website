import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const payoutsSource = fs.readFileSync(new URL('../js/smartlock-calendar/payouts.js', import.meta.url), 'utf8');

test('SmartLock excludes expired special payouts from later months without the shared dashboard helper', () => {
  const start = payoutsSource.indexOf('function getSpecialPayoutSchedulesForMonth');
  const end = payoutsSource.indexOf('function getInstallerPayoutCutoffBucket');
  const context = { window: {} };
  vm.runInNewContext(`${payoutsSource.slice(start, end)};globalThis.forMonth = getSpecialPayoutSchedulesForMonth;`, context);
  const schedules = [
    { id: 'old', value: 2000, effectiveTo: '2026-07' },
    { id: 'day-15', value: 1000, effectiveFrom: '2026-08' },
    { id: 'day-30', value: 1000, effectiveFrom: '2026-08' }
  ];
  assert.deepEqual(Array.from(context.forMonth(schedules, '2026-08'), item => item.id), ['day-15', 'day-30']);
});

test('SmartLock payout summary identifies prior-month threshold rollover without changing the total', () => {
  assert.match(payoutsSource, /if \(sourceMonth !== targetMonthKey\)/);
  assert.match(payoutsSource, /Rollover from \$\{escapeHtml\(monthLabel\)\}/);
  assert.match(payoutsSource, /rollover\.credit\.toFixed\(1\)/);
  assert.match(payoutsSource, /rollover\.amount\.toLocaleString\(\)/);
  assert.equal((payoutsSource.match(/thresholdEarnings \+= thresholdPayForJob/g) || []).length, 1);
});

test('SmartLock payout summary labels missed-threshold rollover as credit only', () => {
  assert.match(payoutsSource, /settledCreditBySourceMonth\[sourceMonth\].*>= threshold/);
  assert.match(payoutsSource, /const totalCredit = completedMonthCredit \+ creditRollover/);
  assert.match(payoutsSource, /Credit rollover from \$\{escapeHtml\(monthLabel\)\}/);
  assert.match(payoutsSource, /not yet payable/);
});

test('SmartLock payout earnings show source amounts without a redundant calculation line or standalone rates', () => {
  assert.match(payoutsSource, /currentExtraCredit\.toFixed\(1\).*currentExtraAmount\.toLocaleString\(\)/s);
  assert.match(payoutsSource, /rollover\.credit\.toFixed\(1\).*rollover\.amount\.toLocaleString\(\)/s);
  assert.doesNotMatch(payoutsSource, /<span>Calculation:<\/span>/);
  assert.doesNotMatch(payoutsSource, /Lead Payout Rate/);
  assert.doesNotMatch(payoutsSource, /Assist Payout Rate/);
});

test('SmartLock threshold card shows credited services without the redundant credit summary row', () => {
  const pageSource = fs.readFileSync(new URL('../smartlock-calendar.html', import.meta.url), 'utf8');
  assert.match(pageSource, /Credited Service:.*payout-credited-service-count/s);
  assert.doesNotMatch(pageSource, /Calculated Credit:/);
  assert.doesNotMatch(pageSource, /Target Threshold:/);
  assert.doesNotMatch(payoutsSource, /payout-target-threshold/);
  assert.match(payoutsSource, /else if \(weight > 0\) creditedServiceCredit \+= weight/);
  assert.match(payoutsSource, /creditedServiceCredit\.toFixed\(1\)/);
});

test('SmartLock threshold card totals lead and assist credits and colors service credit purple', () => {
  const pageSource = fs.readFileSync(new URL('../smartlock-calendar.html', import.meta.url), 'utf8');
  assert.match(pageSource, /Lead Credits:/);
  assert.match(pageSource, /Assist Credits:/);
  assert.match(pageSource, /payout-credited-service-count[^>]+color:#8b5cf6/);
  assert.match(payoutsSource, /leadCredit \+= weight/);
  assert.match(payoutsSource, /assistCredit \+= weight/);
  assert.match(payoutsSource, /leadCredit\.toFixed\(1\)/);
  assert.match(payoutsSource, /assistCredit\.toFixed\(1\)/);
});

test('SmartLock uses locked Payout Tracker snapshots instead of recalculating paid cutoffs', () => {
  const pageSource = fs.readFileSync(new URL('../smartlock-calendar.html', import.meta.url), 'utf8');
  assert.match(pageSource, /\/js\/payout-snapshots\.js/);
  assert.match(payoutsSource, /BKPayoutSnapshots\?\.isSnapshot\(payoutEntry\)/);
  assert.match(payoutsSource, /BKPayoutSnapshots\.fromCents\(payoutEntry\.paid_value_centavos\)/);
  assert.match(payoutsSource, /lockedCutoffDays\.has\(day\)/);
  assert.match(payoutsSource, /lockedSupplementalTotal/);
});

test('SmartLock hides service detail rows that produced no payable earnings', () => {
  assert.match(payoutsSource, /serviceEarningsBySku\[service\.sku\].*\+ service\.amount/);
  assert.match(payoutsSource, /payableServiceEntries.*serviceEarningsBySku\[sku\].*> 0/);
  assert.match(payoutsSource, /const subtotal = serviceEarningsBySku\[sku\]/);
  assert.doesNotMatch(payoutsSource, /const subtotal = count \* rate/);
});

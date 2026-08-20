import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(currentDirectory, '..', 'js', 'main.js'), 'utf8');
const start = source.indexOf('// BK_INSTALLER_PAYOUTS_START');
const end = source.indexOf('// BK_INSTALLER_PAYOUTS_END') + '// BK_INSTALLER_PAYOUTS_END'.length;
const context = { globalThis: {} };
vm.runInNewContext(source.slice(start, end), context);
const rules = context.globalThis.BKInstallerPayoutRules;

test('legacy Lead and Assist settings retain their existing values', () => {
  const settings = { lead_credit: 1, assist_credit: 0.5, lead_rate: 1000, assist_rate: 500 };
  assert.equal(rules.creditForJob(settings, { roles: ['lead'], skus: [], workDate: '2026-08-01' }), 1);
  assert.equal(rules.creditForJob(settings, { roles: ['assist'], skus: [], workDate: '2026-08-01' }), 0.5);
  assert.equal(rules.thresholdRateForJob(settings, { roles: ['lead'], skus: [], workDate: '2026-08-01' }), 1000);
});

test('new Service rules apply by SKU only from their effective date', () => {
  const settings = {
    credit_rules: [{ assignment: 'Service', sku: 'OCULAR', credit: 0.75, effective_from: '2026-08-14' }],
    extra_payout_rules: [{ assignment: 'Service', sku: 'OCULAR', amount: 350, effective_from: '2026-08-14' }]
  };
  const oldJob = { roles: ['service'], skus: ['OCULAR'], workDate: '2026-08-13' };
  const newJob = { roles: ['service'], skus: ['OCULAR'], workDate: '2026-08-14' };
  assert.equal(rules.creditForJob(settings, oldJob), 0);
  assert.equal(rules.thresholdRateForJob(settings, oldJob), 0);
  assert.equal(rules.creditForJob(settings, newJob), 0.75);
  assert.equal(rules.thresholdRateForJob(settings, newJob), 350);
});

test('flat Service payouts match all configured SKUs on a Service assignment', () => {
  const settings = {
    extra_payout_rules: [
      { assignment: 'Service', sku: 'REPAIR', amount: 250 },
      { assignment: 'Service', sku: 'BASEPLATE-M', amount: 700 }
    ]
  };
  const payouts = rules.servicePayoutsForJob(settings, { roles: ['service'], skus: ['REPAIR', 'BASEPLATE-M'], workDate: '2026-08-14' });
  assert.deepEqual(Array.from(payouts, item => ({ ...item })), [
    { sku: 'REPAIR', amount: 250 },
    { sku: 'BASEPLATE-M', amount: 700 }
  ]);
});

test('versioned rules preserve assignments made before an exact internal change timestamp', () => {
  const settings = {
    credit_rule_history: [
      { assignment: 'Lead', credit: 1, effective_from: null },
      { assignment: 'Lead', credit: 1.5, effective_from: '2026-08-19T10:30:00.000Z' }
    ],
    payout_rule_history: [
      { assignment: 'Lead', amount: 1000, effective_from: null },
      { assignment: 'Lead', amount: 1250, effective_from: '2026-08-19T10:30:00.000Z' }
    ],
    threshold_history: [
      { value: 15, effective_from: null },
      { value: 12, effective_from: '2026-08-01' }
    ]
  };
  const priorAssignment = { roles: ['lead'], skus: [], assignmentDate: '2026-08-19T10:29:59.999Z', workDate: '2026-08-25' };
  const futureAssignment = { roles: ['lead'], skus: [], assignmentDate: '2026-08-19T10:30:00.000Z', workDate: '2026-08-20' };
  assert.equal(rules.creditForJob(settings, priorAssignment), 1);
  assert.equal(rules.thresholdRateForJob(settings, priorAssignment), 1000);
  assert.equal(rules.creditForJob(settings, futureAssignment), 1.5);
  assert.equal(rules.thresholdRateForJob(settings, futureAssignment), 1250);
  assert.equal(rules.thresholdForDate(settings, '2026-07-31'), 15);
  assert.equal(rules.thresholdForDate(settings, '2026-08-01'), 12);
});

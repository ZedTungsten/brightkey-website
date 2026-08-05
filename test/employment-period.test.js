import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const mainScript = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const helperSource = mainScript.match(/\/\/ BK_EMPLOYMENT_PERIOD_START([\s\S]*?)\/\/ BK_EMPLOYMENT_PERIOD_END/)?.[1];
assert.ok(helperSource, 'employment-period helper must remain available in main.js');
const context = vm.createContext({ Date, Object, String, Number });
vm.runInContext(helperSource, context);
const salaryHelperSource = mainScript.match(/\/\/ BK_OPEX_SALARIES_START([\s\S]*?)\/\/ BK_OPEX_SALARIES_END/)?.[1];
assert.ok(salaryHelperSource, 'OPEX salary helper must remain available in main.js');
vm.runInContext(salaryHelperSource, context);
const installerHelperSource = mainScript.match(/\/\/ BK_INSTALLER_PAYOUTS_START([\s\S]*?)\/\/ BK_INSTALLER_PAYOUTS_END/)?.[1];
assert.ok(installerHelperSource, 'Payout Tracker installation helper must remain available in main.js');
vm.runInContext(installerHelperSource, context);

const period = context.BKEmploymentPeriod;

test('employees hired in August are excluded from July', () => {
  assert.equal(period.isHiredByMonthEnd({ date_hired: '2026-08-03' }, 2026, 6), false);
});

test('employees are included in their hire month and later months', () => {
  const employee = { date_hired: '2026-08-03' };
  assert.equal(period.isHiredByMonthEnd(employee, 2026, 7), true);
  assert.equal(period.isHiredByMonthEnd(employee, 2026, 8), true);
});

test('cutoffs before the hire date are excluded', () => {
  const employee = { date_hired: '2026-08-20' };
  assert.equal(period.isHiredByDate(employee, '2026-08-15'), false);
  assert.equal(period.isHiredByDate(employee, '2026-08-30'), true);
});

test('legacy employees without a hire date remain historically visible', () => {
  assert.equal(period.isHiredByMonthEnd({ date_hired: null }, 2026, 6), true);
});

test('shared OPEX salaries exclude employees hired after the report month', () => {
  const rows = context.BKOpexSalaries.calculateMonth({
    employees: [
      { id: 'july', salary: 1000, employment_status: 'Active', date_hired: '2026-07-01' },
      { id: 'august', salary: 1200, employment_status: 'Active', date_hired: '2026-08-01' }
    ],
    monthKey: '2026-07'
  });

  assert.deepEqual(Array.from(rows, row => row.employee.id), ['july']);
  assert.equal(rows[0].total, 1000);
});

test('shared OPEX salaries use recorded monthly salary and special payout', () => {
  const [row] = context.BKOpexSalaries.calculateMonth({
    employees: [{ id: 'employee', salary: 3000, employment_status: 'Active', date_hired: '2026-01-01' }],
    payslipRecords: [{ employee_id: 'employee', payout_month: '2026-07', basic_paid: 2500, special_payouts: 400 }],
    monthKey: '2026-07'
  });

  assert.equal(row.baseSalary, 2500);
  assert.equal(row.specialPayout, 400);
  assert.equal(row.total, 2900);
});

test('shared installer payout uses the actual role rate after threshold', () => {
  const [row] = context.BKInstallerPayouts.calculateMonth({
    employees: [{ id: 'installer' }],
    bookings: [
      { id: 'lead', status: 'done', scheduled_date: '2026-08-01', product_skus: '' },
      { id: 'assist', status: 'done', scheduled_date: '2026-08-02', product_skus: '' }
    ],
    payoutSettings: { installations_before_crediting: 1, lead_credit: 1, assist_credit: 0.5, lead_rate: 1000, assist_rate: 500 },
    payoutSchedules: [15, 30],
    monthKey: '2026-08',
    resolveAssignedDoors: booking => [{ completed: true, roles: [booking.id], skus: [] }]
  });

  assert.equal(row.completedCredit, 1.5);
  assert.equal(row.thresholdEarnings, 500);
  assert.equal(row.total, 500);
});

test('shared installer payout rolls work after the final cutoff into next month', () => {
  const [row] = context.BKInstallerPayouts.calculateMonth({
    employees: [{ id: 'installer' }],
    bookings: [
      { id: 'first', status: 'done', scheduled_date: '2026-07-30', product_skus: '' },
      { id: 'rollover', status: 'done', scheduled_date: '2026-07-31', product_skus: '' }
    ],
    payoutSettings: { installations_before_crediting: 1, lead_credit: 1, lead_rate: 1000 },
    payoutSchedules: [15, 30],
    monthKey: '2026-08',
    resolveAssignedDoors: () => [{ completed: true, roles: ['lead'], skus: [] }]
  });

  assert.equal(row.completedCredit, 0);
  assert.equal(row.thresholdEarnings, 1000);
});

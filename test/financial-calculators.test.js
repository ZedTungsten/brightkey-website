import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../dashboard/js/financial-calculators.js', import.meta.url), 'utf8');
const context = vm.createContext({ window: {}, Map, Set, Date, Number, String, Math, Array, Object, JSON });
vm.runInContext(source, context);
const calc = context.window.BKFinancialCalculators;

test('supplier cost combines ledger and adjustments for one month', () => {
  const result = calc.calculateSupplierCostMonth(
    [{ recognized_at: '2026-07-10', total_cost_centavos: 10000 }, { recognized_at: '2026-08-01', total_cost_centavos: 50000 }],
    [{ adjustment_date: '2026-07-20', amount_cents: -1500 }],
    '2026-07'
  );
  assert.equal(result.total, 8500);
});

test('commissions include only completed, non-cancelled work in the month', () => {
  const result = calc.calculateCommissionMonth(
    [{ id: 'employee' }],
    [{ employee_id: 'employee', booking_id: 'done', product_index: 0, amount: 2500 }, { employee_id: 'employee', booking_id: 'open', product_index: 0, amount: 9000 }],
    [{ id: 'done', scheduled_date: '2026-07-01', status: 'open', doors: [{ completed: true }] }, { id: 'open', scheduled_date: '2026-07-02', status: 'open', doors: [{ completed: false }] }],
    '2026-07'
  );
  assert.equal(result.total, 2500);
});

test('shipping deduplicates dispatched references', () => {
  const result = calc.calculateShippingMonth(
    [{ reference_id: 'ORD-1', timestamp_dispatched: '2026-07-01' }, { reference_id: 'ORD-1', timestamp_dispatched: '2026-07-02' }],
    [{ reference_id: 'ORD-1', base_fee: 100, tip_1: 20, tip_2: 0, toll: 5 }],
    '2026-07'
  );
  assert.equal(result.total, 125);
});

test('journal entries share category and account totals', () => {
  const result = calc.calculateJournalMonth(
    [{ name: 'Gas Allowance', category: 'COGS' }],
    [{ account: 'Gas Allowance', debit: 12.34, date: '2026-07-01' }],
    '2026-07'
  );
  assert.equal(result.COGS.total, 1234);
  assert.equal(result.COGS.accounts['Gas Allowance'], 1234);
});

test('software monthly cost applies annual allocation once', () => {
  const result = calc.calculateSoftwareMonth(
    [{ id: 'annual', mode: 'annual', cost_centavos: 12000, subscribed_date: '2026-01-01' }],
    [],
    '2026-07'
  );
  assert.equal(result.total, 1000);
});

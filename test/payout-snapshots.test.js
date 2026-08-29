import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
await import('../js/payout-snapshots.js');

const snapshots = globalThis.window.BKPayoutSnapshots;
const employeeId = 'employee-1';
const originKey = `2026-08|${employeeId}|15`;

test('a lower recalculated paid cutoff does not reduce the next payout', () => {
  const app = {
    regularPayoutState: {
      '2026-08': {
        [`${employeeId}_15`]: snapshots.createSnapshot({ sourceValue: 100, paidValue: 100 })
      }
    },
    getReconcilablePayoutCentavos: () => 9700
  };

  const result = snapshots.systemAdjustment(app, employeeId, '2026-08', 30);
  assert.equal(result.value, 0);
  assert.deepEqual(result.systemSources, {});
});

test('a positive late backfill is still added to the next payout', () => {
  const app = {
    regularPayoutState: {
      '2026-08': {
        [`${employeeId}_15`]: snapshots.createSnapshot({ sourceValue: 100, paidValue: 100 })
      }
    },
    getReconcilablePayoutCentavos: () => 12500
  };

  const result = snapshots.systemAdjustment(app, employeeId, '2026-08', 30);
  assert.equal(result.value, 25);
  assert.deepEqual(result.systemSources, { [originKey]: 2500 });
});

test('a System correction is not repeated after a later payout carries it', () => {
  const app = {
    regularPayoutState: {
      '2026-08': {
        [`${employeeId}_15`]: snapshots.createSnapshot({ sourceValue: 100, paidValue: 100 }),
        [`${employeeId}_30`]: snapshots.createSnapshot({
          sourceValue: 200,
          paidValue: 197,
          systemSources: { [originKey]: -300 }
        })
      }
    },
    getReconcilablePayoutCentavos: (_employeeId, monthKey, day) => (
      monthKey === '2026-08' && day === 15 ? 9700 : 20000
    )
  };

  const result = snapshots.systemAdjustment(app, employeeId, '2026-09', 15);
  assert.equal(result.value, 0);
  assert.deepEqual(result.systemSources, {});
});

test('legacy checked values remain recognized as paid', () => {
  assert.equal(snapshots.isPaid(true), true);
  assert.equal(snapshots.isPaid(false), false);
  assert.equal(snapshots.isPaid({ checked: true }), true);
});

test('a correction from a paid commission cutoff is labeled System Comm', () => {
  const result = {
    systemSources: { [originKey]: 25000 }
  };

  assert.equal(snapshots.systemAdjustmentLabel(result, key => key === originKey), 'System Comm');
  assert.equal(snapshots.systemAdjustmentLabel(result, () => false), 'System');
});

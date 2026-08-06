import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const mainSource = fs.readFileSync('js/main.js', 'utf8');
const source = mainSource.match(/\/\/ BK_SPECIAL_PAYOUT_HISTORY_START([\s\S]*?)\/\/ BK_SPECIAL_PAYOUT_HISTORY_END/)[1];
const context = { globalThis: {}, Date, Math };
vm.runInNewContext(source, context);
const history = context.globalThis.BKSpecialPayoutHistory;

test('legacy schedules remain visible in historical months', () => {
  const schedules = [{ id: 'legacy', day: 15 }];
  assert.equal(history.forMonth(schedules, '2025-01').length, 1);
  assert.equal(history.forMonth(schedules, '2026-12').length, 1);
});

test('effective dates select the correct historical version', () => {
  const schedules = [
    { id: 'old', day: 15, effectiveTo: '2026-07' },
    { id: 'new', day: 20, effectiveFrom: '2026-08' }
  ];
  assert.equal(history.forMonth(schedules, '2026-07')[0].day, 15);
  assert.equal(history.forMonth(schedules, '2026-08')[0].day, 20);
});

test('editing a legacy schedule creates a new current version', () => {
  const nowKey = history.currentMonthKey();
  const result = history.edit([{ id: 'legacy', day: 15, value: 100 }], 'legacy', { day: 20 });
  assert.equal(result.length, 2);
  assert.equal(history.forMonth(result, history.previousMonthKey(nowKey))[0].day, 15);
  assert.equal(history.forMonth(result, nowKey)[0].day, 20);
});

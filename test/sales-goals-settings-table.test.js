import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/sales-goals.html', import.meta.url), 'utf8');

test('goal settings use a separate four-column table with SVG actions', () => {
  assert.match(source, /class="settings-layout"/);
  assert.match(source, /<th class="goal-column">Goal<\/th>/);
  assert.match(source, /<th class="reward-column">Reward<\/th>/);
  assert.match(source, /<th class="achieved-column">Achieved \(Date\)<\/th>/);
  assert.match(source, /<th class="actions-column">Actions<\/th>/);
  assert.match(source, /aria-label="Edit goal"[\s\S]*?<svg/);
  assert.match(source, /aria-label="Delete goal"[\s\S]*?<svg/);
});

test('goal settings allow unlimited additions and retain achievement dates', () => {
  assert.match(source, />\s*Add Goals\s*</);
  assert.doesNotMatch(source, /globalGoals\.length\s*>=\s*5/);
  assert.match(source, /Number\(sourceGoal\.amount\)\s*===\s*amt\s*\?\s*\(sourceGoal\.achieved_date\s*\|\|\s*null\)\s*:\s*null/);
  assert.match(source, /persistGoalAchievementDate\(activeGoalObj, achievedDate\)/);
  assert.match(source, /Boolean\(activeGoalObj\.achieved_date\)\s*\|\|\s*fillPercent\s*>=\s*100/);
});

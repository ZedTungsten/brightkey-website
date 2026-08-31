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
  assert.match(source, /onclick="toggleGoalSkipped\(\$\{idx\}\)"[\s\S]*?<polygon points="5 4 15 12 5 20 5 4"><\/polygon>/);
});

test('skipped goals persist and advance the Goals tab to the next milestone', () => {
  assert.match(source, /window\.toggleGoalSkipped = function\(index\)/);
  assert.match(source, /globalGoals\[index\]\.skipped = !globalGoals\[index\]\.skipped/);
  assert.match(source, /skipped:\s*sourceGoal\.skipped === true/);
  assert.match(source, /\.filter\(g => g\.amount > 0 && g\.skipped !== true\)/);
  assert.match(source, /aria-pressed="\$\{g\.skipped \? 'true' : 'false'\}"/);
  assert.match(source, /\.goal-row-action\s*\{[\s\S]*?width:\s*28px;[\s\S]*?height:\s*28px;[\s\S]*?flex:\s*0 0 28px;/);
  assert.match(source, /\.goal-row-action\.skip\.active\s*\{[\s\S]*?border-radius:\s*50%;[\s\S]*?background:\s*var\(--cyan\);[\s\S]*?color:\s*#fff;/);
});

test('goal settings allow unlimited additions and retain achievement dates', () => {
  assert.match(source, />\s*Add Goals\s*</);
  assert.doesNotMatch(source, /globalGoals\.length\s*>=\s*5/);
  assert.match(source, /Number\(sourceGoal\.amount\)\s*===\s*amt\s*\?\s*\(sourceGoal\.achieved_date\s*\|\|\s*null\)\s*:\s*null/);
  assert.match(source, /persistGoalAchievementDate\(activeGoalObj, achievedDate\)/);
  assert.match(source, /Boolean\(activeGoalObj\.achieved_date\)\s*\|\|\s*fillPercent\s*>=\s*100/);
});

test('goal settings place Save in the topmost Sales Goals header and keep target/date typography aligned', () => {
  assert.match(source, /<div class="top-bar">[\s\S]*?<span class="top-bar-title">Sales Goals<\/span>[\s\S]*?<button id="btn-save-goal-settings" class="btn btn-primary" onclick="saveGoalSettings\(\)"/);
  assert.match(source, /html\[data-sales-goals-tab="settings"\] #btn-save-goal-settings\s*\{\s*display:\s*inline-flex;/);
  assert.equal((source.match(/>\s*Save Goal Settings\s*</g) || []).length, 1);
  assert.match(source, /\.goal-settings-table td\.achieved-column\s*\{\s*font-size:\s*0\.85rem;/);
  assert.match(source, /\.stats-target-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(150px, 0\.75fr\) minmax\(220px, 1\.25fr\);/);
  assert.match(source, /\.stats-target-grid > :nth-child\(2\) \.form-label\s*\{\s*white-space:\s*nowrap;/);
});

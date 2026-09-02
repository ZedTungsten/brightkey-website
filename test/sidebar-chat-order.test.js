import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('sidebar chat orders conversations by latest message before presence and name', () => {
  const source = fs.readFileSync(new URL('../js/sidebar.js', import.meta.url), 'utf8');
  const latestSort = source.indexOf("Date.parse(a.last_message_at || '')");
  const presenceSort = source.indexOf('const scoreA = getPriorityScore(a)', latestSort);

  assert.match(source, /last_message_at: thread\.last_message_at \|\| null/);
  assert.ok(latestSort >= 0, 'latest-message comparison must exist');
  assert.ok(presenceSort > latestSort, 'latest message must be compared before presence');
  assert.match(source, /return latestB - latestA/);
});

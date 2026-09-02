import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('smart-lock booking notes render every line with a yellow highlight', () => {
  const script = fs.readFileSync(new URL('../js/smartlock-calendar/booking-details.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../css/smartlock-calendar.css', import.meta.url), 'utf8');

  assert.match(script, /split\(\/\\r\?\\n\/\)/);
  assert.match(script, /highlightedLine\.textContent = line \|\| '\\u00a0'/);
  assert.match(script, /highlightedLine\.className = 'booking-note-highlight-line'/);
  assert.match(script, /content\.push\(document\.createElement\('br'\)\)/);
  assert.match(styles, /\.booking-note-highlight-line \{[\s\S]*background: #fef08a;/);
  assert.match(styles, /box-decoration-break: clone/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../dashboard/payout-tracker/payout/index.html', import.meta.url), 'utf8');

test('payout tracker labels automatic post-lock additions by source', () => {
  assert.match(source, /Roll Inst:/);
  assert.match(source, /Roll Com:/);
  assert.match(source, /Roll Adj:/);
  assert.match(source, /Roll Reimb:/);
  assert.match(source, /class="payout-rollover"/);
  assert.match(source, /\.payout-rollover \{ color: #1e3a5f; \}/);
  assert.match(source, /sourceComponents: values\.sourceComponents/);
  assert.match(source, /rolloverSources: system\.rolloverSources/);
  assert.match(source, /entry\.legacy_outstanding_centavos/);
  assert.match(source, /entry\.source_components_centavos/);
  assert.doesNotMatch(source, /Rol (Inst|Com|Adj|Reimb|Cash Adv)/);
});

test('journal reconciliation loads the full prior month for cross-month rollover', () => {
  assert.match(source, /const start = `\$\{priorYear\}-\$\{pad\(priorMonth \+ 1\)\}-01`/);
});

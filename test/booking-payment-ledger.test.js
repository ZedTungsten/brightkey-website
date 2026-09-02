import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/booking-schedules/payment-ledger.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../dashboard/booking-schedules.html', import.meta.url), 'utf8');

test('payment ledger defaults to two rows and remains note-only', () => {
  assert.match(source, /PAYMENT_LEDGER_DEFAULT_ROWS = 2/);
  assert.match(source, /update\(\{ payment_ledger: ledger \}\)/);
  assert.doesNotMatch(source, /balance_due|grand_total\s*:/);
  assert.match(html, />Payment Notes</);
  assert.doesNotMatch(html, /Notes only\. This does not affect finances\./);
});

test('amount entry sets its date and reduces grand total plus deposit', () => {
  assert.match(source, /if \(entry\.amount > 0 && !entry\.date\) entry\.date = paymentLedgerToday\(\)/);
  assert.match(source, /booking\?\.deposit_amount/);
  assert.match(source, /deduction_labels/);
  assert.match(source, /\^deposit\$/i);
  assert.match(source, /paymentLedgerRows\.reduce/);
  assert.match(source, /originalTotalCents - paidCents/);
  assert.match(source, /classList\.toggle\('is-paid', remainingCents <= 0\)/);
  assert.match(source, /getElementById\('det-total'\).*classList\.toggle\('is-paid', remainingCents <= 0\)/);
});

test('delete row targets only the last row and blocks deletion when it contains data', () => {
  assert.match(html, /id="payment-ledger-delete-row"/);
  assert.match(html, /Delete data first then try again\./);
  assert.match(source, /const lastRow = paymentLedgerRows\.at\(-1\)/);
  assert.match(source, /lastRow\.amount > 0 \|\| lastRow\.channel\.trim\(\)/);
  assert.match(source, /paymentLedgerRows\.pop\(\)/);
});

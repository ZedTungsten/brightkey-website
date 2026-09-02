import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/orders-invoices.html', import.meta.url), 'utf8');

test('cancelled order products stay persisted for history but do not return to the receipt', () => {
  assert.match(source, /cancelled: Boolean\(p\.cancelled\)/);
  assert.match(source, /if \(p\.cancelled\) return;[\s\S]*addInvoiceProductRow/);
  assert.match(source, /loadedBookingState = \{[\s\S]*products: productsList\.map\(p => \(\{[\s\S]*cancelled: Boolean\(p\.cancelled\)/);
  assert.match(source, /loadedBookingState\.products\.filter\(p => !p\.cancelled\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
globalThis.document = { addEventListener() {} };
await import('../dashboard/cs-customers.js');

const page = globalThis.window.BKCustomerOrders;

test('unavailable values consistently render as a dash', () => {
  ['N/A', 'n/a', 'NA', 'Not Applicable', 'none', ''].forEach(value => {
    assert.equal(page.display(value), '—');
  });
});

test('booking statuses normalize to the three customer-table states', () => {
  assert.equal(page.statusLabel('cancelled'), 'Cancelled');
  assert.equal(page.statusLabel('completed'), 'Done');
  assert.equal(page.statusLabel('reserved'), 'Scheduled');
  assert.equal(page.statusLabel('scheduled', [{ completed: true }]), 'Done');
  assert.equal(page.statusLabel('scheduled', [{ completed: true }, { completed: false }]), 'Scheduled');
});

test('pagination shows at most ten page numbers with first, middle, and last groups', () => {
  assert.deepEqual(page.paginationItems(25, 13), [1, 2, 3, 'ellipsis', 12, 13, 14, 15, 'ellipsis', 23, 24, 25]);
  assert.deepEqual(page.paginationItems(8, 4), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('orders sharing a customer phone are rendered as one customer group', () => {
  const groups = page.groupOrders([
    { id: 'one', customer_first_name: 'Ana', customer_last_name: 'Reyes', customer_phone: '0917 123 4567' },
    { id: 'two', customer_first_name: 'Ana', customer_last_name: 'Reyes', customer_phone: '09171234567' },
    { id: 'three', customer_first_name: 'Ben', customer_last_name: 'Cruz', customer_phone: '09990001111' }
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].map(order => order.id), ['one', 'two']);
});

test('username uses the first given-name word and final surname word', () => {
  assert.equal(page.username({ customer_first_name: 'John', customer_last_name: 'Zeus Taller' }), 'johntaller');
  assert.equal(page.username({ customer_name: 'Maria Luisa De Leon' }), 'marialeon');
});

test('SKU and quantity lines stay paired within an order', () => {
  assert.deepEqual(page.productLines({ product_skus: 'A12 TT | B11 TT', product_qtys: '2 | 1' }), {
    skus: ['A12 TT', 'B11 TT'],
    quantities: ['2', '1']
  });
});

test('total sales restores deposits while retaining other deductions and additions', () => {
  assert.equal(page.totalSalesCentavos({
    grand_total: 1150000,
    deposit_amount: 0,
    deduction_labels: 'Discount | Deposit',
    deduction_values: '500.00 | 2,000.00'
  }), 1350000);
});

test('legacy total sales falls back to balance due plus deposit', () => {
  assert.equal(page.totalSalesCentavos({
    balance_due: 900000,
    deposit_amount: 100000
  }), 1100000);
});

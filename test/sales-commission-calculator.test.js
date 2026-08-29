import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
await import('../js/sales-commission-calculator.js');

test('Sales Goals commission calculation splits the authoritative amount between assignees', () => {
  const totals = window.BKSalesCommissionCalculator.amountsByEmployee({
    assignments: [
      { employee_id: 'sales-1', booking_id: 'order-1', sku: 'LOCK', product_index: 0, rate_label: 'Sales' },
      { employee_id: 'sales-2', booking_id: 'order-1', sku: 'LOCK', product_index: 0, rate_label: 'Sales' }
    ],
    bookings: [{
      id: 'order-1', scheduled_date: '2026-08-04', product_skus: 'LOCK',
      product_qtys: '1', product_unit_prices: '10000', deposit_amount: 0
    }],
    products: [{ sku: 'LOCK', business: 'Smart Lock', category: 'Lock', tags: [] }],
    config: {
      rates: [{ label: 'Sales', value: 10 }],
      eligibility_rules: [{ scope: 'businesses', business: 'all' }]
    }
  });

  assert.equal(totals.get('sales-1'), 50000);
  assert.equal(totals.get('sales-2'), 50000);
});

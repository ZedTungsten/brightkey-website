import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const commissions = fs.readFileSync(new URL('../dashboard/sales-commissions.html', import.meta.url), 'utf8');
const bookingIndex = fs.readFileSync(new URL('../dashboard/booking-schedules/index.js', import.meta.url), 'utf8');
const bookingDetails = fs.readFileSync(new URL('../dashboard/booking-schedules/booking-details.js', import.meta.url), 'utf8');
const bookingCompletion = fs.readFileSync(new URL('../dashboard/booking-schedules/completion.js', import.meta.url), 'utf8');
const helperStart = commissions.indexOf('function getCommissionBasisBooking');
const helperEnd = commissions.indexOf('\n    function showToast', helperStart);
const context = {};
vm.createContext(context);
vm.runInContext(commissions.slice(helperStart, helperEnd), context);
const calculationStart = commissions.indexOf('function checkSkuEligibility');
const calculationEnd = commissions.indexOf('\n    function getCommissionAdjustmentForSku', calculationStart);
vm.runInContext(commissions.slice(calculationStart, calculationEnd), context);

const productOnlyBooking = {
  order_no: 'ORD-PRODUCT-ONLY',
  products: [{ sku: 'G24B TY', qty: 1 }],
  doors: [{ products: ['G24B TY'], installers: [] }],
  _received_photo_url: 'https://example.com/received.jpg'
};

test('a received product-only line is commission-ready without a signature', () => {
  assert.equal(context.isCommissionReady(productOnlyBooking), true);
});

test('ORD-20260911-632 live shape is recognized as completed for commissions', () => {
  assert.equal(context.isCommissionReady({
    ...productOnlyBooking,
    order_no: 'ORD-20260911-632',
    status: 'scheduled',
    scheduled_date: '2026-09-11'
  }), true);
});

test('unlocked Jennie order uses latest active lines instead of the stale AR snapshot', () => {
  const booking = {
    commissions_locked: false,
    product_skus: 'F04 TY | F04 TY | G06B TT SWING',
    product_qtys: '1 | 1 | 1',
    product_unit_prices: '13799.00 | 13799.00 | 7999.00',
    products: [
      { sku: 'F04 TY' }, { sku: 'F04 TY' }, { sku: 'G06B TT SWING' }, { sku: 'A11 TT', cancelled: true }
    ],
    grand_total: 3259700,
    deduction_labels: 'Deposit',
    deduction_values: '3000.00',
    commission_basis_snapshot: {
      product_skus: 'F04 TY | F04 TY | A11 TT',
      product_qtys: '1 | 1 | 1',
      product_unit_prices: '13799.00 | 13799.00 | 5999.00',
      grand_total: 3059700
    }
  };
  const productMap = {
    'f04 ty': { sku: 'F04 TY', business: 'smart_lock', category: 'Main Door' },
    'g06b tt swing': { sku: 'G06B TT SWING', business: 'smart_lock', category: 'Sliding Door' }
  };
  const rules = [
    { scope: 'businesses', business: 'smart_lock', category: 'Main Door', sku: 'all' },
    { scope: 'businesses', business: 'smart_lock', category: 'Sliding Door', sku: 'all' }
  ];
  const result = context.getBookingEligibleCentavos(booking, productMap, rules);
  assert.equal(result.totalPriceCentavos, 3559700);
  assert.equal(result.finalEligibleCentavos, 3559700);
});

test('a product-only line is not done until Received has photo proof', () => {
  assert.equal(context.isCommissionReady({ ...productOnlyBooking, _received_photo_url: '' }), false);
});

test('Received does not complete a line assigned to an installer', () => {
  const assigned = {
    ...productOnlyBooking,
    doors: [{ products: ['G24B TY'], installers: [{ id: 'installer-1', name: 'Installer' }] }]
  };
  assert.equal(context.isCommissionReady(assigned), false);
});

test('cancelled product-only lines do not make an order commission-ready', () => {
  const cancelled = {
    ...productOnlyBooking,
    products: [{ sku: 'G24B TY', qty: 1, cancelled: true }]
  };
  assert.equal(context.isCommissionReady(cancelled), false);
});

test('booking schedules use Received Photo as product-only installer media and completion proof', () => {
  assert.match(bookingCompletion, /isProductOnlyDoor[\s\S]*getReceivedPhotoUrl/);
  assert.match(bookingCompletion, /\.from\('delivery_bookings'\)[\s\S]*received_photo_url/);
  assert.match(bookingIndex, /const bookingCompletion = window\.BKBookingCompletion;[\s\S]*isDoorCancelledForCompletion[\s\S]*window\.BKBookingCompletion = Object\.freeze/);
  assert.match(bookingDetails, /productOnlyReceivedPhoto[\s\S]*mediaUrlsList\.push\(productOnlyReceivedPhoto\)/);
  assert.match(bookingDetails, /Product only — received/);
  assert.match(bookingDetails, /productOnlyDoor \? 'Product Only' : 'None Assigned'/);
  assert.match(bookingIndex, /isProductOnlyBooking && isFullyDone \? completionMarker/);
});

test('the shared five-argument completion API remains compatible with installer summaries', () => {
  const browser = { window: null };
  browser.window = browser;
  vm.createContext(browser);
  vm.runInContext(bookingCompletion, browser);
  browser.isDoorCancelledForCompletion = () => false;
  const wrapperStart = bookingIndex.indexOf('const bookingCompletion = window.BKBookingCompletion;');
  const wrapperEnd = bookingIndex.indexOf('\n\n    function useBookingWorkflowForDoor', wrapperStart);
  vm.runInContext(bookingIndex.slice(wrapperStart, wrapperEnd), browser);

  assert.doesNotThrow(() => browser.window.BKBookingCompletion.isDoorCompletedForDisplay(
    productOnlyBooking,
    productOnlyBooking.doors[0],
    0,
    productOnlyBooking.doors,
    productOnlyBooking.products
  ));
  assert.equal(browser.window.BKBookingCompletion.isDoorCompletedForDisplay(
    productOnlyBooking,
    productOnlyBooking.doors[0],
    0,
    productOnlyBooking.doors,
    productOnlyBooking.products
  ), true);
});

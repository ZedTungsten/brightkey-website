import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relativePath => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const MODULES = [
  'Business',
  'Products',
  'Operations',
  'Marketing',
  'Sales',
  'Customer Service',
  'Logistics',
  'HR',
  'Finance'
];

test('browser and database authorization use the same assigned-module contract', () => {
  const browserAuth = read('js/auth.js');
  const databaseAuth = read('database/migrations/01_core_tenancy.sql');

  assert.match(browserAuth, /requiredModules\.some\(mod => hasModuleAccessForPath\(modules, mod\)\)/);
  assert.match(browserAuth, /role === 'owner' \|\| role === 'admin'/);
  assert.match(databaseAuth, /CREATE OR REPLACE FUNCTION public\.has_module_access/);
  assert.match(databaseAuth, /member\.user_id = p_user_id[\s\S]*member\.tenant_id = v_tenant_id/);
  assert.match(databaseAuth, /lower\(trim\(module_name\)\) = lower\(trim\(p_module\)\)/);
  assert.match(databaseAuth, /IF public\.is_tenant_admin\(p_user_id, v_tenant_id\) THEN RETURN true/);
});

test('every module page is gated by its assigned module, including shared pages', () => {
  const accessSettings = read('dashboard/settings/access.html');
  const modulePages = {
    Business: [
      'dashboard/business/directions/planning.js',
      'dashboard/pricing-strategy/calculator/index.html'
    ],
    Products: ['dashboard/catalog.js', 'dashboard/add-products.html'],
    Operations: ['dashboard/booking.html', 'dashboard/orders-invoices.html', 'dashboard/booking-schedules/index.js'],
    Marketing: [
      'dashboard/global-promo.html',
      'dashboard/marketing-logs/marketing-logs.js',
      'dashboard/media/media.js',
      'dashboard/posting/image-editor/image-editor.js'
    ],
    Sales: [
      'dashboard/sales-goals.html',
      'dashboard/sales-crm/customers/app.js',
      'dashboard/sales-schedule.html',
      'dashboard/sales-stocks.html',
      'dashboard/media/media.js'
    ],
    'Customer Service': [
      'dashboard/cs-customers.js',
      'dashboard/support-inbox.html',
      'dashboard/cs-message-flow.js',
      'dashboard/product-reviews.html',
      'dashboard/cs-resources.js'
    ],
    Logistics: [
      'dashboard/logistics-calendar/calendar.html',
      'dashboard/logistics-calendar/all-orders.html',
      'dashboard/warehouse/inspect.html',
      'dashboard/warehouse/pack.html',
      'dashboard/warehouse/dispatch.html',
      'dashboard/warehouse/receive.html',
      'dashboard/warehouse/return.html',
      'dashboard/warehouse/damaged.html',
      'dashboard/warehouse/transfer.html',
      'dashboard/ship/send.html',
      'dashboard/ship/receive.html',
      'dashboard/ship/done.html',
      'dashboard/inventory.html',
      'dashboard/inventory-forecast.js',
      'dashboard/inventory/order.html',
      'dashboard/qa-guide.html',
      'dashboard/shipping-rates.html'
    ],
    HR: [
      'dashboard/employee-directory.js',
      'dashboard/organization-map.html',
      'dashboard/attendance-leaves.html',
      'dashboard/events/events.js',
      'dashboard/hiring/hiring.js',
      'dashboard/hr-onboarding/hr-onboarding.js',
      'dashboard/payout-tracker/payout/index.html'
    ],
    Finance: [
      'dashboard/general-journal.js',
      'dashboard/statements/profit-and-loss.html',
      'dashboard/expenses/cogs.html',
      'dashboard/ledgers/cash-ledgers/index.html',
      'dashboard/ledgers/cash-ledgers/cash-position/index.html',
      'dashboard/ledgers/equity/index.html',
      'dashboard/finance-adjustments/index.html',
      'dashboard/ar-ap/owner/index.html',
      'dashboard/ar-ap/staff/index.html',
      'dashboard/ar-ap/supplier/index.html',
      'dashboard/js/receivables-customers.js',
      'dashboard/assign-account/index.html',
      'dashboard/payables/due-to-owner/index.html',
      'dashboard/payables/due-to-staff/index.html',
      'dashboard/payables/due-to-supplier/index.html',
      'dashboard/payables/customers/index.html',
      'dashboard/payout-tracker/payout/index.html'
    ]
  };

  for (const moduleName of MODULES) {
    assert.ok(accessSettings.includes(`'${moduleName}'`), `${moduleName} must remain assignable`);
    assert.ok(modulePages[moduleName]?.length, `${moduleName} must define its complete page surface`);
    for (const sourcePath of modulePages[moduleName]) {
      const source = read(sourcePath);
      const gates = [...source.matchAll(/checkRoleGate\(\s*\[([^\]]*)\]/gsi)].map(match => match[1].toLowerCase());
      assert.ok(
        gates.some(gate => gate.includes(`'${moduleName.toLowerCase()}'`) || gate.includes(`"${moduleName.toLowerCase()}"`)),
        `${sourcePath} must admit the ${moduleName} module`
      );
    }
  }
});

test('Logistics calendar page and its pickup data require the same Logistics module', () => {
  const calendar = read('dashboard/logistics-calendar/calendar.html');
  const migration = read('database/migrations/10_logistics_calendar_booking_read_access.sql');

  assert.match(calendar, /checkRoleGate\(\[[^\]]*['"]logistics['"]/i);
  assert.match(calendar, /from\(['"]installation_bookings['"]\)/);
  assert.match(migration, /ON public\.installation_bookings\s+FOR SELECT\s+TO authenticated/);
  assert.match(migration, /public\.has_module_access\([\s\S]*company_id,[\s\S]*'Logistics'/);
  assert.doesNotMatch(migration, /FOR (?:ALL|INSERT|UPDATE|DELETE)/);
});

test('module admission preserves explicit feature-level permission controls', () => {
  const salesGoals = read('dashboard/sales-goals.html');
  const logisticsOrders = read('dashboard/logistics-calendar/all-orders.html');

  assert.match(salesGoals, /Only the Sales Manager can modify/);
  assert.match(salesGoals, /isGoalSettingsChangeAllowed = isOwnerOrAdmin \|\| isSalesManager/);
  assert.match(logisticsOrders, /from\(['"]warehouse_managers['"]\)/);
  assert.match(logisticsOrders, /select\(['"]can_manage_all_orders['"]\)/);
  assert.match(logisticsOrders, /userPermissions\.canManageAllOrders \? 'block' : 'none'/);
});

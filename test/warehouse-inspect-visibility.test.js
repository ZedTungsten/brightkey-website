import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sharedSource = fs.readFileSync(new URL('../dashboard/warehouse/shared.js', import.meta.url), 'utf8');
const read = relativePath => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Warehouse Requests is removed and its legacy routes safely redirect to Pack', () => {
  const warehouseTabs = ['inspected', 'pack', 'dispatch', 'receive', 'transfer', 'return', 'damaged'];
  warehouseTabs.forEach(page => {
    const source = read(`dashboard/warehouse/${page}.html`);
    assert.doesNotMatch(source, /warehouse\/requests|>Requests</);
    assert.match(source, /href="\/dashboard\/warehouse\/inspected\/in-stock">Inspected/);
  });
  assert.equal(fs.existsSync(new URL('../dashboard/warehouse/requests.html', import.meta.url)), false);
  assert.match(read('dashboard/warehouse/inspect.html'), /window\.location\.replace\('\/dashboard\/warehouse\/pack'/);
  assert.match(read('vercel.json'), /"source": "\/dashboard\/warehouse\/requests", "destination": "\/dashboard\/warehouse\/pack"/);
  assert.doesNotMatch(sharedSource, /badge-count-inspect|inspect-list/);
});

test('Inspected uses clean In Stock and Deployed subtabs with a route-gated month navigator', () => {
  const html = read('dashboard/warehouse/inspected-page.html');
  const script = read('dashboard/warehouse/inspected.js');
  const config = read('vercel.json');
  assert.match(html, /href="\/dashboard\/warehouse\/inspected\/in-stock">In Stock/);
  assert.match(html, /href="\/dashboard\/warehouse\/inspected\/deployed">Deployed/);
  assert.match(html, /href="\/css\/style\.css"/);
  assert.match(html, /href="\/dashboard\/warehouse\/shared\.css\?v=/);
  assert.match(html, /href="\/dashboard\/warehouse\/inspected\.css\?v=/);
  assert.doesNotMatch(html, /(?:href|src)="(?:\.\.\/|shared\.css|inspected\.css)/);
  assert.match(html, /id="deployed-prev-month"[\s\S]*?id="deployed-month-label"[\s\S]*?id="deployed-next-month"/);
  assert.match(html, /class="month-picker" aria-label="Deployed month"/);
  assert.match(read('dashboard/warehouse/inspected.css'), /\.month-picker button \{[^}]*width: 42px;[^}]*height: 42px;[^}]*border: 0;/);
  assert.match(script, /if \(activeView === 'deployed'\) \{[\s\S]*?await Promise\.all\(\[loadDeployedRecords\(\), WarehousePage\.updateBadgeCounts\(\)\]\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?Promise\.all\(\[loadBusinesses\(\), loadWarehouseMembers\(\), loadRecords\(0\)\]\)/);
  assert.doesNotMatch(script, /refreshTabBadges|badge\.style\.display = 'inline-block'/);
  const routes = JSON.parse(config);
  assert.equal(routes.redirects.some(route => route.source === '/dashboard/warehouse/inspected'), false);
  assert.equal(routes.rewrites.find(route => route.source === '/dashboard/warehouse/inspected/in-stock')?.destination, '/dashboard/warehouse/inspected-page');
  assert.match(script, /normalizedPath === '\/dashboard\/warehouse\/inspected'[\s\S]*?window\.location\.replace\(`\/dashboard\/warehouse\/inspected\/in-stock/);
  assert.equal(routes.rewrites.find(route => route.source === '/dashboard/warehouse/inspected/deployed')?.destination, '/dashboard/warehouse/inspected-page');
  assert.doesNotMatch(script, /searchParams\.get\('view'\)|requestedView|history\.replaceState/);
  assert.match(script, /window\.location\.pathname[\s\S]*?endsWith\('\/deployed'\)/);
});

test('New Inspect exposes a company-scoped guideline only for the exact selected SKU', () => {
  const html = read('dashboard/warehouse/inspected-page.html');
  const script = read('dashboard/warehouse/inspected.js');
  const styles = read('dashboard/warehouse/inspected.css');
  assert.match(html, /id="inspection-guide-action" hidden/);
  assert.match(html, />View Inspection Guideline</);
  assert.match(script, /\.from\('qa_guides'\)[\s\S]*?\.eq\('company_id', companyId\)[\s\S]*?\.eq\('product_id', product\.id\)[\s\S]*?\.maybeSingle\(\)/);
  assert.match(script, /String\(item\.sku \|\| ''\)\.trim\(\)\.toUpperCase\(\) === sku/);
  assert.match(styles, /\.inspection-guide-action \{[^}]*justify-content: center/);
});

test('New Inspect generates its read-only code after an exact SKU selection', () => {
  const html = read('dashboard/warehouse/inspected-page.html');
  const script = read('dashboard/warehouse/inspected.js');
  const codePosition = html.indexOf('for="inspect-code"');
  const mediaPosition = html.indexOf('for="inspect-media"');
  assert.ok(codePosition > -1 && codePosition < mediaPosition);
  assert.match(html, /id="inspect-code"[^>]*placeholder="Select an SKU to generate the code"[^>]*readonly/);
  assert.match(html, /<span class="form-label">Code<\/span>\s*<div class="edit-code-value" id="inspect-edit-code"><\/div>/);
  assert.match(script, /String\(sku\)\.toUpperCase\(\)\.replace\(\/\[\^A-Z0-9\]\/g, ''\)/);
  assert.match(script, /getMonth\(\) \+ 1[\s\S]*?getDate\(\)[\s\S]*?getFullYear\(\)[\s\S]*?randomCodeSuffix\(\)/);
  assert.match(script, /const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'/);
  assert.match(script, /productResults\.find\([\s\S]*?generatedCodeSku !== sku[\s\S]*?generateInspectionCode\(product\.sku\)/);
});

test('Inspected modals restore focus before becoming hidden and inert', () => {
  const html = read('dashboard/warehouse/inspected-page.html');
  const script = read('dashboard/warehouse/inspected.js');
  assert.equal((html.match(/class="modal-overlay"[^>]*aria-hidden="true" inert/g) || []).length, 5);
  assert.match(script, /returnFocus\.focus\(\{ preventScroll: true \}\)[\s\S]*?modal\.inert = true;[\s\S]*?setAttribute\('aria-hidden', 'true'\)/);
  assert.match(script, /modal\.inert = false;[\s\S]*?setAttribute\('aria-hidden', 'false'\)[\s\S]*?\.focus\(\{ preventScroll: true \}\)/);
});

test('In Stock provides tenant-scoped edit and protected delete actions', () => {
  const html = read('dashboard/warehouse/inspected-page.html');
  const script = read('dashboard/warehouse/inspected.js');
  const migration = read('supabase/migrations/20260905090000_warehouse_inspections_manage.sql');
  assert.match(html, /<th>Action<\/th>/);
  assert.match(html, /id="inspect-edit-modal"[\s\S]*?id="inspect-delete-modal"/);
  assert.match(html, /id="inspect-edit-existing-media"[\s\S]*?id="inspect-edit-media"[\s\S]*?id="inspect-edit-new-media"/);
  assert.match(html, /Are you sure you want to delete this inspected product\?/);
  assert.match(script, /\.update\([\s\S]*?\.eq\('id', selectedRecord\.id\)[\s\S]*?\.eq\('company_id', companyId\)/);
  assert.match(script, /media_urls: mediaUrls/);
  assert.match(script, /await removeUploads\(uploaded\)/);
  assert.match(script, /\.delete\(\)[\s\S]*?\.eq\('id', record\.id\)[\s\S]*?\.eq\('company_id', companyId\)/);
  assert.doesNotMatch(script, /\b(?:alert|confirm|prompt)\s*\(/);
  assert.match(migration, /FOR UPDATE TO authenticated[\s\S]*?FOR DELETE TO authenticated[\s\S]*?NOT EXISTS/);
});

test('Pack sends reserved booking items directly to a code-gated unit queue', () => {
  const pack = read('dashboard/warehouse/pack.html');
  assert.match(pack, /function parsePackDate\(value\)[\s\S]*?function formatPackDate\(value\)[\s\S]*?function formatInstallSchedule\(dateValue, timeValue\)/);
  assert.match(pack, /\.in\('status', \['reserved', 'inspect'\]\)\.eq\('type', 'customer_order'\)/);
  assert.match(pack, /transaction\.status === 'reserved' && bookingReferences\.has\(transaction\.reference_id\)/);
  assert.match(pack, /<th>Install Date<\/th>\s*<th[^>]*>Code<\/th>/);
  assert.doesNotMatch(pack, /<th>QA Date<\/th>/);
  assert.doesNotMatch(pack, /modal-qa-ref|qa_photo_url|QA Inspected/);
  assert.match(pack, /Array\.from\(\{ length: Math\.max\(0, Number\(transaction\.quantity\)/);
  assert.match(pack, /<strong>1<\/strong>/);
  assert.match(pack, /inspectionStock\.filter\(record =>[\s\S]*?record\.sku[\s\S]*?transaction\.sku/);
  assert.match(pack, /class="btn btn-cyan btn-sm pack-order-button"[\s\S]*?disabled>/);
  assert.match(pack, /packOrderAssignments\.length !== expectedUnits/);
  assert.match(pack, /\.from\('warehouse_inspection_allocations'\)\.insert\(allocationRows\)/);
});

test('In Stock omits inspected codes already allocated to Pack', () => {
  const script = read('dashboard/warehouse/inspected.js');
  assert.match(script, /warehouse_inspection_allocations\(\)/);
  assert.match(script, /\.is\('warehouse_inspection_allocations', null\)/);
});

test('Deployed lists allocated inspections by dispatch month', () => {
  const html = read('dashboard/warehouse/inspected-page.html');
  const script = read('dashboard/warehouse/inspected.js');
  assert.match(html, /id="deployed-list"/);
  assert.match(script, /\.not\('timestamp_dispatched', 'is', null\)/);
  assert.match(script, /\.gte\('timestamp_dispatched', range\.start\)/);
  assert.match(script, /\.lt\('timestamp_dispatched', range\.end\)/);
  assert.match(script, /\.from\('warehouse_inspection_allocations'\)[\s\S]*?\.in\('transaction_id', transactionIds\)/);
  assert.match(script, /await Promise\.all\(\[loadDeployedRecords\(\), WarehousePage\.updateBadgeCounts\(\)\]\)/);
});

test('In Stock uses bounded server pagination instead of Load More', () => {
  const html = read('dashboard/warehouse/inspected-page.html');
  const script = read('dashboard/warehouse/inspected.js');
  assert.doesNotMatch(html, /Load More|load-more-btn/);
  assert.match(html, /id="inspected-prev-page"[\s\S]*?id="inspected-page-numbers"[\s\S]*?id="inspected-next-page"/);
  assert.match(script, /\.range\(start, start \+ PAGE_SIZE - 1\)/);
  assert.match(script, /\{ count: 'exact' \}/);
});

test('Shared Pack badge counts both direct reservations and legacy inspect records', () => {
  assert.match(sharedSource, /const packCount = [\s\S]*?t\.status === 'inspect'[\s\S]*?t\.status === 'reserved'[\s\S]*?this\.bookings\.some/);
  const migration = read('supabase/migrations/20260903052000_route_booking_reservations_to_pack.sql');
  assert.match(migration, /booking\.order_no = tx\.reference_id/);
  assert.match(migration, /WHERE tx\.status = 'inspect'[\s\S]*?tx\.status = 'reserved'/);
});

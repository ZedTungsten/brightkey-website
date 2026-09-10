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

test('Inspected uses clean In Stock, Assigned, and Deployed subtabs with a route-gated month navigator', () => {
  const html = read('dashboard/warehouse/inspected-page.html');
  const script = read('dashboard/warehouse/inspected.js');
  const config = read('vercel.json');
  assert.match(html, /href="\/dashboard\/warehouse\/inspected\/in-stock">In Stock/);
  assert.match(html, /href="\/dashboard\/warehouse\/inspected\/assigned">Assigned/);
  assert.match(html, /href="\/dashboard\/warehouse\/inspected\/deployed">Deployed/);
  assert.match(html, /href="\/css\/style\.css"/);
  assert.match(html, /href="\/dashboard\/warehouse\/shared\.css\?v=/);
  assert.match(html, /href="\/dashboard\/warehouse\/inspected\.css\?v=/);
  assert.doesNotMatch(html, /(?:href|src)="(?:\.\.\/|shared\.css|inspected\.css)/);
  assert.match(html, /id="deployed-prev-month"[\s\S]*?id="deployed-month-label"[\s\S]*?id="deployed-next-month"/);
  assert.doesNotMatch(html, /<div class="panel-header">Inspected<\/div>/);
  assert.match(html, /class="month-picker" aria-label="Deployed month"/);
  const styles = read('dashboard/warehouse/inspected.css');
  assert.match(styles, /\.month-picker button \{[^}]*width: 42px;[^}]*height: 42px;[^}]*border: 0;/);
  assert.match(styles, /\.pending-inspection-card \{[^}]*grid-template-columns: 56px minmax\(0,1fr\);[^}]*padding: \.5rem \.65rem;/);
  assert.match(styles, /\.pending-inspection-first-line \{[^}]*display: flex;[^}]*align-items: center;/);
  assert.match(styles, /\.pending-inspection-code \{[^}]*font-size: \.78rem;/);
  assert.match(styles, /\.ledger-table tbody td:first-child \{ font-family: var\(--font-sans\);/);
  assert.doesNotMatch(styles, /font-family: var\(--font-mono\)/);
  assert.match(read('dashboard/warehouse/inspected-pending.js'), /firstLine\.append\(sku, code\);[\s\S]*?copy\.append\(firstLine, date\);/);
  assert.match(script, /await WarehousePage\.loadWarehouseTabs\(authInfo\.tenantId\);[\s\S]*?if \(activeView === 'deployed'\) \{[\s\S]*?await Promise\.all\(\[loadDeployedRecords\(\), WarehousePage\.updateBadgeCounts\(\)\]\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?Promise\.all\(\[loadBusinesses\(\), loadWarehouseMembers\(\), loadRecords\(0\)\]\)/);
  assert.doesNotMatch(script, /refreshTabBadges|badge\.style\.display = 'inline-block'/);
  const routes = JSON.parse(config);
  assert.equal(routes.redirects.some(route => route.source === '/dashboard/warehouse/inspected'), false);
  assert.equal(routes.rewrites.find(route => route.source === '/dashboard/warehouse/inspected/in-stock')?.destination, '/dashboard/warehouse/inspected-page');
  assert.equal(routes.rewrites.find(route => route.source === '/dashboard/warehouse/inspected/assigned')?.destination, '/dashboard/warehouse/inspected-page');
  assert.match(script, /normalizedPath === '\/dashboard\/warehouse\/inspected'[\s\S]*?window\.location\.replace\(`\/dashboard\/warehouse\/inspected\/in-stock/);
  assert.equal(routes.rewrites.find(route => route.source === '/dashboard/warehouse/inspected/deployed')?.destination, '/dashboard/warehouse/inspected-page');
  assert.doesNotMatch(script, /searchParams\.get\('view'\)|requestedView|history\.replaceState/);
  assert.match(script, /window\.location\.pathname[\s\S]*?endsWith\('\/deployed'\)/);
});

test('Assigned lists allocated customer inspections until dispatch using a bounded active-route query', () => {
  const html = read('dashboard/warehouse/inspected-page.html');
  const page = read('dashboard/warehouse/inspected.js');
  const assigned = read('dashboard/warehouse/inspected-assigned.js');
  assert.match(html, /id="assigned-panel"[\s\S]*?<th>Code<\/th><th>SKU<\/th><th>Ref Order<\/th><th>Customer Name<\/th><th>Media<\/th><th>Inspected by<\/th><th>Date Inspected<\/th><th>Date Assigned<\/th>/);
  assert.match(page, /activeView === 'assigned'[\s\S]*?WarehouseInspectedAssigned\.init/);
  assert.match(assigned, /\.from\('warehouse_inspection_allocations'\)/);
  assert.match(assigned, /transaction:inventory_transactions!inner/);
  assert.match(assigned, /inspection:warehouse_inspections!inner/);
  assert.match(assigned, /\.eq\('company_id', companyId\)/);
  assert.match(assigned, /\.eq\('transaction\.type', 'customer_order'\)/);
  assert.match(assigned, /\.is\('transaction\.timestamp_dispatched', null\)/);
  assert.match(assigned, /\.is\('transaction\.timestamp_received', null\)/);
  assert.match(assigned, /\.is\('transaction\.timestamp_cancelled', null\)/);
  assert.match(assigned, /\.range\(start, start \+ PAGE_SIZE - 1\)/);
  assert.match(assigned, /allocated_at: allocation\.allocated_at/);
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
  const createModalEnd = html.indexOf('</form>', html.indexOf('id="inspect-create-form"'));
  assert.ok(codePosition > -1 && codePosition < createModalEnd);
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
  assert.equal((html.match(/class="modal-overlay"[^>]*aria-hidden="true" inert/g) || []).length, 7);
  assert.match(script, /returnFocus\.focus\(\{ preventScroll: true \}\)[\s\S]*?modal\.inert = true;[\s\S]*?setAttribute\('aria-hidden', 'true'\)/);
  assert.match(script, /modal\.inert = false;[\s\S]*?setAttribute\('aria-hidden', 'false'\)[\s\S]*?\.focus\(\{ preventScroll: true \}\)/);
});

test('New Inspect creates up to six pending cards before media and inspector completion', () => {
  const html = read('dashboard/warehouse/inspected-page.html');
  const script = read('dashboard/warehouse/inspected.js');
  const pending = read('dashboard/warehouse/inspected-pending.js');
  const migration = read('supabase/migrations/20260909165248_add_pending_warehouse_inspections.sql');
  assert.match(html, /id="pending-inspection-grid"/);
  assert.match(html, /id="inspect-create-form"[\s\S]*?for="inspect-business"[\s\S]*?for="inspect-sku"[\s\S]*?for="inspect-code"/);
  assert.doesNotMatch(html.slice(html.indexOf('id="inspect-create-form"'), html.indexOf('</form>', html.indexOf('id="inspect-create-form"'))), /Upload Media|Inspected by/);
  assert.match(html, /id="inspect-complete-form"[\s\S]*?Upload Media[\s\S]*?Inspected by/);
  assert.match(script, /inspection_status: 'pending'/);
  assert.match(script, /window\.WarehouseInspectedPending\.atCapacity\(\)/);
  assert.match(pending, /const MAX_PENDING = 6/);
  assert.match(pending, /\.eq\('company_id', companyId\)[\s\S]*?\.eq\('inspection_status', 'pending'\)[\s\S]*?\.limit\(MAX_PENDING\)/);
  assert.match(pending, /inspection_status: 'completed'/);
  assert.match(migration, /inspection_status TEXT NOT NULL DEFAULT 'completed'/);
  assert.match(migration, /warehouse_inspections_company_date_idx|warehouse_inspections_pending_company_created_idx/);
});

test('Complete Inspection uses the saved checklist with independent required uploads', () => {
  const html = read('dashboard/warehouse/inspected-page.html');
  const pending = read('dashboard/warehouse/inspected-pending.js');
  const styles = read('dashboard/warehouse/inspected.css');
  assert.match(html, /id="inspect-complete-requirements"/);
  assert.doesNotMatch(html, /id="inspect-complete-media"/);
  assert.match(pending, /\.from\('global_settings'\)[\s\S]*?\.eq\('company_id', companyId\)[\s\S]*?\.eq\('key', 'inspection_checklist'\)/);
  assert.match(pending, /const requiredUploads = requirementUploads\.filter\(item => item\.requirement\.required\)/);
  assert.match(pending, /const missingRequiredUploads = requiredUploads\.filter\(item => item\.status !== 'done' \|\| !item\.url\)/);
  assert.match(pending, /const requiredUploadInProgress = missingRequiredUploads\.some\(item => item\.status === 'uploading'\)/);
  assert.match(pending, /requirementUploads[\s\S]*?\.filter\(item => item\.status === 'done' && item\.url\)[\s\S]*?\.map\(item => item\.url\)/);
  assert.doesNotMatch(pending, /Wait for each media upload to finish/);
  assert.match(pending, /item\.requirement\.required \? 'Required' : 'Optional'/);
  assert.match(pending, /item\.status = 'uploading'[\s\S]*?item\.url = await uploadMedia\(file\)[\s\S]*?item\.status = 'done'/);
  assert.match(pending, /Upload failed\. Retry this item\./);
  assert.match(styles, /\.inspection-requirement-progress[\s\S]*?transition: width \.18s ease/);
});

test('Complete Inspection fits five desktop cards and reuses the selected SKU QA guide', () => {
  const html = read('dashboard/warehouse/inspected-page.html');
  const script = read('dashboard/warehouse/inspected.js');
  const pending = read('dashboard/warehouse/inspected-pending.js');
  const styles = read('dashboard/warehouse/inspected.css');
  assert.match(html, /class="modal-card complete-inspection-card" id="inspect-complete-form"/);
  assert.match(html, /id="inspect-complete-code"[\s\S]*?id="inspect-complete-guide-action" hidden[\s\S]*?>View QA Guide</);
  assert.match(styles, /\.modal-card\.complete-inspection-card \{ width: min\(1440px,100%\); \}/);
  assert.match(styles, /#inspect-complete-requirements \{ grid-template-columns: repeat\(5,minmax\(0,1fr\)\); \}/);
  assert.match(pending, /\.from\('qa_guides'\)[\s\S]*?\.eq\('company_id', companyId\)[\s\S]*?\.in\('product_id', productIds\)[\s\S]*?\.limit\(MAX_PENDING\)/);
  assert.match(pending, /inspect-complete-guide-action'\)\.hidden = !record\.qa_guide/);
  assert.match(pending, /WarehouseInspectionGuide\?\.show\(selectedRecord\.qa_guide, selectedRecord\.sku\)/);
  assert.match(script, /window\.WarehouseInspectionGuide = Object\.freeze\([\s\S]*?selectedGuideline = \{ \.\.\.guideline, sku \}[\s\S]*?renderGuideline\(\)/);
});

test('Complete Inspection enforces the documented image and video limits', () => {
  const html = read('dashboard/warehouse/inspected-page.html');
  const pending = read('dashboard/warehouse/inspected-pending.js');
  const styles = read('dashboard/warehouse/inspected.css');
  assert.match(html, /Images: PNG, JPG, or HEIC — up to 15 MB\. Videos: MOV or MP4 — up to 15 seconds\./);
  assert.match(pending, /const MAX_IMAGE_BYTES = 15 \* 1024 \* 1024/);
  assert.match(pending, /const MAX_VIDEO_SECONDS = 15/);
  assert.match(pending, /videoDuration\(file\)/);
  assert.match(pending, /byId\('inspect-complete-code'\)\.textContent = record\.code/);
  assert.match(styles, /#inspect-complete-modal \.modal-title \{ font-size: 1\.15rem; \}/);
  assert.match(styles, /\.inspection-requirement-status\.required \{ color: var\(--danger\); \}/);
});

test('A pending inspection can be deleted through a scoped confirmation', () => {
  const html = read('dashboard/warehouse/inspected-page.html');
  const pending = read('dashboard/warehouse/inspected-pending.js');
  const styles = read('dashboard/warehouse/inspected.css');
  assert.match(html, /id="inspect-complete-delete"[^>]*>Delete</);
  assert.match(html, /id="inspect-pending-delete-modal"[\s\S]*?id="inspect-pending-delete-confirm"/);
  assert.match(pending, /\.from\('warehouse_inspections'\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\('id', selectedRecord\.id\)[\s\S]*?\.eq\('company_id', companyId\)[\s\S]*?\.eq\('inspection_status', 'pending'\)/);
  assert.match(pending, /await removeUploads\(uploaded\)/);
  assert.match(styles, /\.pending-modal-code \{[^}]*font-size: 1\.5rem/);
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

test('Shared Pack badge uses the authoritative warehouse count RPC', () => {
  assert.match(sharedSource, /rpc\('get_warehouse_tab_counts'/);
  assert.match(sharedSource, /Number\(row\.pack_count \|\| 0\)/);
  assert.doesNotMatch(sharedSource, /const packCount =|getPackCount/);
  const migration = read('supabase/migrations/20260903052000_route_booking_reservations_to_pack.sql');
  assert.match(migration, /booking\.order_no = tx\.reference_id/);
  assert.match(migration, /WHERE tx\.status = 'inspect'[\s\S]*?tx\.status = 'reserved'/);
});

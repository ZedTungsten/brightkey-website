import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('database migration enforces tenant storage and the 0.5 GB warning buffer', () => {
  const sql = read('database/migrations/07_optimizations.sql');
  assert.match(sql, /BEFORE INSERT OR UPDATE[\s\S]*storage\.objects/);
  assert.match(sql, /enforce_company_storage_quota_trigger/);
  assert.match(sql, /track_company_storage_usage_trigger/);
  assert.match(sql, /remaining_bytes <= 536870912 THEN 'almost_full'/);
  assert.match(sql, /RAISE EXCEPTION 'Account storage is full/);
  assert.match(sql, /pricing_tiers[\s\S]*storage_limit_gb/);
});

test('all supported upload paths retain authentication, tenant scoping, and quota checks', () => {
  const checks = [
    ['api/upload.js', /getUser\(accessToken\)/, /has_module_access/, /check_company_storage_quota/, /companies\/\$\{safeCompanyId\}/],
    ['api/video-upload.js', /requireCompanyAccess/, /check_company_storage_quota/, /companies\/\$\{safeCompanyId\}/],
    ['api/hiring-directory-registration.js', /loadRegistration/, /check_company_storage_quota/, /companies\/\$\{registration\.company_id\}/],
    ['api/job-applications.js', /loadJobAndForm/, /check_company_storage_quota/, /companies\/\$\{companyId\}/],
    ['js/auth.js', /checkStorageQuota/, /check_company_storage_quota/]
  ];

  for (const [file, ...patterns] of checks) {
    const source = read(file);
    for (const pattern of patterns) assert.match(source, pattern, `${file} is missing ${pattern}`);
  }
});

test('dashboard storage notice is globally loaded with the required messages and styling', () => {
  const sidebar = read('js/sidebar.js');
  const notice = read('js/storage-notice.js');
  assert.match(sidebar, /storage-notice\.js/);
  assert.match(sidebar, /bk:company-ready/);
  assert.match(notice, /Account storage is almost full\. Please contact admin\./);
  assert.match(notice, /Account storage is full\. Users won't be able to upload files\. Please contact admin\./);
  assert.match(notice, /background: #DC2626/);
  assert.match(notice, /data-status="full"[^}]*color: #FDE047/);
  assert.match(notice, /font-weight: 500/);
  assert.match(notice, /position: fixed/);
});

test('every rendered dashboard page keeps the shared sidebar loader', () => {
  const redirects = new Set([
    'dashboard/ar-ap/index.html',
    'dashboard/ledgers.html',
    'dashboard/payables/index.html',
    'dashboard/payout-tracker.html',
    'dashboard/pricing-strategy/index.html',
    'dashboard/sales-crm/index.html',
    'dashboard/settings.html',
    'dashboard/ship.html',
    'dashboard/warehouse.html'
  ]);
  const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
  const pages = walk(path.join(root, 'dashboard'))
    .filter(file => file.endsWith('.html'))
    .map(file => path.relative(root, file).replaceAll(path.sep, '/'))
    .filter(file => !redirects.has(file) && file !== 'dashboard/product-preview.html');

  const missing = pages.filter(file => !/(?:\/|\.\.\/)js\/sidebar\.js/.test(read(file)));
  assert.deepEqual(missing, []);
});

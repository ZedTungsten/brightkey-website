import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  getBearerToken,
  isCustomerPortalUser,
  isAllowedRedirectUrl,
  setApiCors
} from '../lib/api/security.js';
import { signCheckoutPayload, verifyCheckoutPayload } from '../lib/api/checkout-pricing.js';

test('product generation authenticates build-time tenant reads and preserves generated pages without local credentials', () => {
  const source = fs.readFileSync(new URL('../scripts/build-products.js', import.meta.url), 'utf8');
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY\s*=\s*process\.env\.SUPABASE_SERVICE_ROLE_KEY\s*\|\|\s*process\.env\.SUPABASE_SERVICE_KEY/);
  assert.match(source, /createClient\(SUPABASE_URL,\s*SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /createClient\(SUPABASE_URL,\s*SUPABASE_ANON_KEY\)/);
  assert.match(source, /\['production', 'preview'\]\.includes\(String\(process\.env\.VERCEL_ENV/);
  assert.match(source, /Existing generated pages were preserved/);
  assert.match(source, /throw new Error\(`Failed to load tenant branding\./);
});

test('bearer tokens are parsed strictly', () => {
  assert.equal(getBearerToken({ headers: { authorization: 'Bearer token-value' } }), 'token-value');
  assert.equal(getBearerToken({ headers: { authorization: 'Basic token-value' } }), null);
  assert.equal(getBearerToken({ headers: {} }), null);
});

test('customer portal identity is determined only from server-controlled app metadata', () => {
  assert.equal(isCustomerPortalUser({ app_metadata: { portal_role: 'customer' } }), true);
  assert.equal(isCustomerPortalUser({ app_metadata: { customer_account_id: 'account-id' } }), true);
  assert.equal(isCustomerPortalUser({ user_metadata: { portal_role: 'customer' } }), false);
  assert.equal(isCustomerPortalUser({ app_metadata: { portal_role: 'employee' } }), false);

  const browserAuth = fs.readFileSync(new URL('../js/auth.js', import.meta.url), 'utf8');
  const membershipsApi = fs.readFileSync(new URL('../api/account-memberships.js', import.meta.url), 'utf8');
  assert.match(browserAuth, /redirectCustomerToPortal\(user\)/);
  assert.match(browserAuth, /window\.location\.replace\('\/customer'\)/);
  assert.match(membershipsApi, /isCustomerPortalUser\(user\)/);
});

test('local API clients load gitignored database credentials in development only', () => {
  const source = fs.readFileSync(new URL('../lib/api/security.js', import.meta.url), 'utf8');
  assert.match(source, /process\.env\.VERCEL_ENV === 'development'/);
  assert.match(source, /dotenv\.config\(\{ path: '\.env\.local' \}\)/);
  assert.match(source, /process\.env\.VERCEL_ENV === 'production'/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_(?:ROLE_)?KEY\s*=\s*['"][^'"]+['"]/);
});

test('checkout redirects are restricted to approved application origins', () => {
  assert.equal(isAllowedRedirectUrl('https://www.brightkeysolutions.com/checkout?payment=success'), true);
  assert.equal(isAllowedRedirectUrl('http://localhost:3000/checkout'), true);
  assert.equal(isAllowedRedirectUrl('https://attacker.example/checkout'), false);
  assert.equal(isAllowedRedirectUrl('not-a-url'), false);
});

test('CORS reflects only approved origins', () => {
  const headers = {};
  const res = { setHeader: (key, value) => { headers[key] = value; } };
  setApiCors({ headers: { origin: 'https://www.brightkeysolutions.com' } }, res);
  assert.equal(headers['Access-Control-Allow-Origin'], 'https://www.brightkeysolutions.com');

  const deniedHeaders = {};
  const deniedRes = { setHeader: (key, value) => { deniedHeaders[key] = value; } };
  setApiCors({ headers: { origin: 'https://attacker.example' } }, deniedRes);
  assert.equal(deniedHeaders['Access-Control-Allow-Origin'], undefined);
});

test('checkout payload signatures reject altered totals and cart data', () => {
  const secret = 'test-checkout-signing-secret';
  const payload = {
    company_id: '00000000-0000-4000-8000-000000000001',
    total_cents: 125000,
    shipping_cents: 15000,
    discount_cents: 0,
    coupon_code: '',
    cart_items: [{ id: '00000000-0000-4000-8000-000000000002', quantity: 1, price: 110000 }]
  };
  const signature = signCheckoutPayload(payload, secret);
  assert.equal(verifyCheckoutPayload(payload, signature, secret), true);
  assert.equal(verifyCheckoutPayload({ ...payload, total_cents: 100 }, signature, secret), false);
});

test('sensitive settings and journal rows are not anonymously readable', () => {
  const migration = fs.readFileSync(new URL('../database/migrations/07_optimizations.sql', import.meta.url), 'utf8');
  assert.match(migration, /Allow public storefront settings read/);
  assert.match(migration, /FOR SELECT\s+TO anon\s+USING \(key IN/);
  assert.match(migration, /ALTER TABLE public\.general_journal ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /Allow tenant members journal access/);
  assert.doesNotMatch(migration, /FOR SELECT USING \(true\)/);
});

test('checkout APIs rebuild prices from server-side catalog data', () => {
  const paymongo = fs.readFileSync(new URL('../api/create-checkout-session.js', import.meta.url), 'utf8');
  const stripe = fs.readFileSync(new URL('../api/create-stripe-checkout-session.js', import.meta.url), 'utf8');
  const webhook = fs.readFileSync(new URL('../api/paymongo-webhook.js', import.meta.url), 'utf8');
  assert.match(paymongo, /buildServerCheckout/);
  assert.match(stripe, /buildServerCheckout/);
  assert.match(webhook, /verifyCheckoutPayload/);
  assert.doesNotMatch(paymongo, /const \{ company_id, billing, line_items/);
  assert.doesNotMatch(stripe, /const \{ company_id, line_items/);
});

test('employee registration contains no development bypass credential', () => {
  const registration = fs.readFileSync(new URL('../api/register-employee.js', import.meta.url), 'utf8');
  const verification = fs.readFileSync(new URL('../api/verify-invitation.js', import.meta.url), 'utf8');
  assert.equal(registration.includes('dev-bypass-key'), false);
  assert.equal(verification.includes('dev-bypass-key'), false);
  assert.equal(registration.includes('brightkey_invite_salt'), false);
  assert.equal(verification.includes('brightkey_invite_salt'), false);
  assert.doesNotMatch(registration, /from\('employees'\)[\s\S]{0,160}\.update\(\{ id: userId \}\)/);
  assert.match(registration, /Preserve that employee primary key/);
});

test('employee registration uploads require a valid invitation and keep government IDs private', () => {
  const upload = fs.readFileSync(new URL('../api/upload.js', import.meta.url), 'utf8');
  const registration = fs.readFileSync(new URL('../employee-registration.html', import.meta.url), 'utf8');
  assert.match(upload, /employee-registration-upload/);
  assert.match(upload, /from\('company_invitations'\)/);
  assert.match(upload, /createHash\('sha256'\)/);
  assert.match(upload, /invite\.role !== 'employee'/);
  assert.match(upload, /\['profile', 'gov-id', 'cv', 'payout'\]\.includes\(type\)/);
  assert.match(upload, /\['govid', 'gov-id', 'cv', 'id', 'payout', 'qr'\]/);
  assert.match(registration, /invitation:\s*\{/);
  assert.match(registration, /signature:\s*inviteSig/);
});

test('employee registration normalizes images and translates upload failures', () => {
  const page = fs.readFileSync(new URL('../employee-registration.html', import.meta.url), 'utf8');
  const uploadApi = fs.readFileSync(new URL('../api/upload.js', import.meta.url), 'utf8');

  assert.match(page, /normalizeRegistrationImage/);
  assert.match(page, /canvas\.toBlob\([\s\S]*'image\/jpeg'/);
  assert.doesNotMatch(page, /compressImageToWebP/);
  assert.match(page, /friendlyRegistrationError/);
  assert.match(page, /Profile picture/);
  assert.match(page, /Government-issued ID/);
  assert.match(page, /Payout QR code/);
  assert.match(uploadApi, /UNSUPPORTED_FILE_TYPE/);
  assert.doesNotMatch(uploadApi, /error\.message \|\| 'Internal server error during upload\.'/);
});

test('account-only invitations do not create or update employee records', () => {
  const accountRegistration = fs.readFileSync(new URL('../api/register-account.js', import.meta.url), 'utf8');
  const accountPage = fs.readFileSync(new URL('../employee-directory-registration.html', import.meta.url), 'utf8');
  const verification = fs.readFileSync(new URL('../api/verify-invitation.js', import.meta.url), 'utf8');
  assert.equal(accountRegistration.includes("from('employees')"), false);
  assert.equal(accountRegistration.includes('employee_number'), false);
  assert.equal(accountRegistration.includes("from('tenant_members').insert"), true);
  assert.match(accountRegistration, /EXISTING_ACCOUNT_SIGN_IN_REQUIRED/);
  assert.match(accountRegistration, /signedInUser\.id !== authUser\.id/);
  assert.doesNotMatch(accountRegistration, /updateUserById/);
  assert.match(accountPage, /Add Workspace Access/);
  assert.match(accountPage, /Authorization.*Bearer/);
  assert.match(verification, /existing_account: existingAccount/);
});

test('zero-module users can be invited with Home and Resources access only', () => {
  const accessPage = fs.readFileSync(new URL('../dashboard/settings/access.html', import.meta.url), 'utf8');
  const directoryPage = fs.readFileSync(new URL('../dashboard/employee-directory.html', import.meta.url), 'utf8');
  const directoryCode = fs.readFileSync(new URL('../dashboard/employee-directory.js', import.meta.url), 'utf8');
  const accountRegistration = fs.readFileSync(new URL('../api/register-account.js', import.meta.url), 'utf8');
  const resources = fs.readFileSync(new URL('../dashboard/resources.js', import.meta.url), 'utf8');
  assert.match(accessPage, /role = 'access:' \+ checkedModules\.join\(','\)/);
  assert.doesNotMatch(accessPage, /checkedModules\.length === 0/);
  assert.doesNotMatch(accessPage, /newModules\.length === 0/);
  assert.match(accessPage, /Home &amp; Resources only/);
  assert.match(directoryCode, /role = 'access:' \+ checkedModules\.join\(','\)/);
  assert.doesNotMatch(directoryCode, /Please check at least one access module/);
  assert.match(directoryPage, /Home &amp; Resources only/);
  assert.match(accountRegistration, /\.filter\(Boolean\)/);
  assert.match(resources, /BKAuth\.requireAuth/);
});

test('job-post employee registration creates default workspace access', () => {
  const registrationApi = fs.readFileSync(new URL('../api/hiring-directory-registration.js', import.meta.url), 'utf8');
  const registrationPage = fs.readFileSync(new URL('../employee-hire-registration.html', import.meta.url), 'utf8');

  assert.match(registrationApi, /from\('tenant_members'\)\.insert/);
  assert.match(registrationApi, /accessible_modules: \[\]/);
  assert.match(registrationApi, /tenant_id: context\.company\.tenant_id/);
  assert.match(registrationApi, /findAuthUserByEmail/);
  assert.match(registrationPage, /Home and Resources/);
  assert.match(registrationPage, /id="password"/);
  assert.match(registrationPage, /signInWithPassword/);
});

test('all employee creation paths use the company-scoped employee number generator', () => {
  const serverPaths = [
    '../api/register-employee.js',
    '../api/create-employee-account.js',
    '../api/hiring-directory-registration.js',
    '../api/next-employee-number.js'
  ];
  serverPaths.forEach(file => {
    const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /next_company_employee_number/);
    assert.doesNotMatch(source, /rpc\('generate_employee_number'\)/);
  });
  const directory = fs.readFileSync(new URL('../dashboard/employee-directory-access.js', import.meta.url), 'utf8');
  const access = fs.readFileSync(new URL('../dashboard/settings/access.html', import.meta.url), 'utf8');
  assert.match(directory, /\/api\/next-employee-number/);
  assert.match(directory, /button\.dataset\.action = linkCreated \? 'close' : 'produce'/);
  assert.match(directory, /button\.textContent = linkCreated \? 'Close' : originalText/);
  assert.match(access, /\/api\/next-employee-number/);
  assert.doesNotMatch(directory, /employeePrefix/);
  assert.doesNotMatch(access, /employeePrefix \+ '-'/);
});

test('catalog feature database fields are readonly normalized display names', () => {
  const page = fs.readFileSync(new URL('../dashboard/settings/catalog.html', import.meta.url), 'utf8');
  const code = fs.readFileSync(new URL('../dashboard/settings/catalog.js', import.meta.url), 'utf8');
  const ownerPolicy = fs.readFileSync(new URL('../database/migrations/20260821060000_allow_tenant_owners_manage_business_features.sql', import.meta.url), 'utf8');
  assert.match(page, /id="feature-name"[^>]*readonly/);
  assert.match(page, /id="feature-name"[^>]*background:var\(--bg-elevated\)[^>]*cursor:not-allowed/);
  assert.match(code, /getElementById\('feature-display-name'\)\.addEventListener\('input'/);
  assert.match(code, /getElementById\('feature-name'\)\.value = normalizeFeatureKey\(event\.target\.value\)/);
  assert.match(code, /Error adding catalog feature:[\s\S]*SettingsPage\.showToast\(error, true\)/);
  assert.doesNotMatch(code, /This feature already exists or could not be saved/);
  assert.match(ownerPolicy, /CREATE POLICY "Tenant owners manage business features"/);
  assert.match(ownerPolicy, /business\.id = business_features\.business_id[\s\S]*is_company_owner\(business\.company_id\)/);
});

test('catalog products accept only businesses configured for their company', () => {
  const catalog = fs.readFileSync(new URL('../dashboard/catalog.js', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../database/migrations/20260821070000_validate_products_against_tenant_businesses.sql', import.meta.url), 'utf8');
  assert.match(catalog, /b\.name\.toLowerCase\(\)\.replace\(\/\[\\s_.-\]\+\/g, '_'\)/);
  assert.match(catalog, /The product could not be \$\{editingId \? 'updated' : 'created'\}\. Review the fields and try again\./);
  assert.match(catalog, /toast\(friendlyMessage, 'error'\)/);
  assert.doesNotMatch(catalog, /toast\(`Error: \$\{err\.message\}`/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS products_business_check/);
  assert.match(migration, /business\.company_id = NEW\.company_id/);
  assert.ok(migration.includes("lower(regexp_replace(business.name, '[[:space:]_.-]+', '_', 'g')) = NEW.business"));
  assert.match(migration, /SECURITY INVOKER/);
});

test('marketing logs preserve fixed table columns with two-axis mobile scrolling', () => {
  const page = fs.readFileSync(new URL('../dashboard/marketing-logs/index.html', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../dashboard/marketing-logs/marketing-logs.css', import.meta.url), 'utf8');
  assert.match(page, /name="viewport" content="width=device-width, initial-scale=1\.0"/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(styles, /height: calc\(100dvh - 132px\)/);
  assert.match(styles, /\.table-scroll \{[\s\S]*overflow: auto;[\s\S]*-webkit-overflow-scrolling: touch/);
  assert.match(styles, /\.logs-table \{\s*width: 100%;\s*min-width: 1440px;/);
  assert.match(page, /<th style="width: 260px;">Change<\/th>/);
  assert.match(page, /<th style="width: 260px;">Reason<\/th>/);
});

test('payout sticky headers stay below the expanding sidebar', () => {
  const payout = fs.readFileSync(new URL('../dashboard/payout-tracker/payout/index.html', import.meta.url), 'utf8');
  assert.match(payout, /#summary-table-container \{\s*position: relative;\s*z-index: 0;\s*isolation: isolate;/);
  assert.match(payout, /#summary-table thead th \{[\s\S]*position: sticky/);
});

test('opening Logistics settings does not create a default warehouse', () => {
  const logistics = fs.readFileSync(new URL('../dashboard/settings/logistics.html', import.meta.url), 'utf8');
  assert.doesNotMatch(logistics, /name: 'Warehouse 1'/);
  assert.doesNotMatch(logistics, /Default warehouse created/);
  assert.match(logistics, /No warehouses yet\./);
});

test('all Directory employee forms require account details or a private payout QR', () => {
  const registration = fs.readFileSync(new URL('../employee-registration.html', import.meta.url), 'utf8');
  const directoryForm = fs.readFileSync(new URL('../dashboard/employee-directory.html', import.meta.url), 'utf8');
  const directoryCode = fs.readFileSync(new URL('../dashboard/employee-directory.js', import.meta.url), 'utf8');
  const directoryAccess = fs.readFileSync(new URL('../dashboard/employee-directory-access.js', import.meta.url), 'utf8');
  const upload = fs.readFileSync(new URL('../api/upload.js', import.meta.url), 'utf8');
  [registration, directoryForm].forEach(source => {
    assert.match(source, /value="account"/);
    assert.match(source, /value="qr"/);
  });
  assert.match(registration, /payout_details_image/);
  assert.match(directoryCode, /payoutMode === 'qr'/);
  assert.match(directoryAccess, /accountWrap\.style\.display = mode === 'qr' \? 'none' : ''/);
  assert.match(directoryAccess, /qrWrap\.style\.display = mode === 'qr' \? '' : 'none'/);
  assert.match(directoryForm, /<span data-upload-label>Upload QR<\/span>/);
  assert.match(directoryForm, /id="new-emp-payout-file" accept="image\/jpeg,image\/png"/);
  assert.match(directoryCode, /querySelector\('\[data-upload-label\]'\)/);
  assert.match(upload, /'payout', 'qr'/);
});

test('employee profile payout QR replacement is self-scoped and privately stored', () => {
  const api = fs.readFileSync(new URL('../api/profile-payout-upload.js', import.meta.url), 'utf8');
  const profile = fs.readFileSync(new URL('../dashboard/profile.html', import.meta.url), 'utf8');
  assert.match(api, /\.eq\('company_id', companyId\)\.ilike\('email', user\.email\)/);
  assert.match(api, /from\('brightkey-internal'\)/);
  assert.match(api, /check_company_storage_quota/);
  assert.match(profile, /\/api\/profile-payout-upload/);
  assert.match(profile, /payout_details_image/);
  assert.match(profile, /Upload New QR/);
});

test('contract snippets are company scoped, sanitized, and bounded', () => {
  const source = fs.readFileSync(new URL('../dashboard/hiring/contracts/contracts.js', import.meta.url), 'utf8');
  assert.match(source, /\.from\('job_posts'\)[\s\S]*?\.eq\('company_id', state\.app\.companyId\)[\s\S]*?\.limit\(100\)/);
  assert.match(source, /\.from\('global_settings'\)[\s\S]*?\.eq\('company_id', state\.app\.companyId\)[\s\S]*?\.in\('key', \[SETTINGS_KEY, JOB_CONTRACTS_KEY, TEMPLATES_KEY\]\)\.limit\(3\)/);
  assert.match(source, /upsert\(\{ company_id: state\.app\.companyId, key: SETTINGS_KEY/);
  assert.match(source, /items\.slice\(0, 100\)/);
  assert.match(source, /\.slice\(0, 40\)\.map\(normalizeBlock\)/);
  assert.match(source, /sanitizeHtml/);
  assert.match(source, /onpaste="BKHiringContracts\.pastePlainText/);
  assert.match(source, /getData\('text\/plain'\)/);
  assert.match(source, /document\.createElement\('li'\)/);
  assert.doesNotMatch(source, /event\.currentTarget\.replaceChildren/);
  assert.match(source, /Page \$\{state\.currentPage \+ 1\} of \$\{state\.pages\.length\}/);
  assert.match(source, /state\.pages\.push\(\[\]\)/);
  assert.match(source, /while \(state\.pages\.length > 1 && pageIsBlank\(state\.pages\.at\(-1\)\)\)/);
  assert.match(source, /function paginateOverflow/);
  assert.match(source, /compactPages\(originPage\)/);
  assert.match(source, /state\.currentPage = originPage/);
  assert.match(source, /snippet-insert-line/);
  assert.match(source, /state\.dropIndex = index/);
  assert.match(source, /function paragraphKeydown/);
  assert.match(source, /data-placeholder=/);
  assert.match(source, /function compactPages/);
  assert.match(source, /sourceId/);
  assert.match(source, /function joinBlockHtml/);
  assert.match(source, /block\.sourceId !== sourceId/);
  assert.match(source, /function splitHtmlAtOffset/);
  assert.match(source, /function undo\(\)/);
  assert.match(source, /function redo\(\)/);
  assert.match(source, /function builderShortcut/);
  assert.match(source, /function indentList/);
  assert.match(source, /'UL', 'OL'/);
  assert.match(source, /header1: 'Header 1', header2: 'Header 2'/);
  assert.match(source, /title: 'Title'/);
  assert.match(source, /signatures: 'Signatures'/);
  assert.match(source, /function selectEditorContents/);
  assert.match(source, /templateReady/);
  assert.match(source, /\['email', 'Email'\]/);
  assert.match(source, /`\{\{\$\{token\}\}\}`/);
  assert.match(source, /personalization-pill/);
  assert.match(source, /const commands = \{ b: 'bold', i: 'italic', u: 'underline' \}/);
  assert.match(source, /range\.intersectsNode\(pill\)/);
  assert.match(source, /function updateFormatToolbar/);
  assert.match(source, /openBuilder\('\$\{esc\(item\.id\)\}'\)/);
  assert.match(source, /confirmDelete/);
  assert.match(source, /openJobContract/);
  assert.match(source, /renderCoverPage/);
  assert.match(source, /state\.pages = \[\[\], \.\.\.bodyPages\]/);
  assert.match(source, /state\.pages\.slice\(1\)/);
  assert.match(source, /key: JOB_CONTRACTS_KEY/);
  assert.match(source, /function loadClause/);
  assert.match(source, /function dragClause/);
  assert.match(source, /function openTemplateEditor/);
  assert.match(source, /function saveAsTemplate/);
  assert.match(source, /function loadTemplateIntoJob/);
  assert.match(source, /function insertPage/);
  assert.match(source, /state\.pages\.splice\(state\.currentPage \+ 1, 0, \[\]\)/);
  assert.doesNotMatch(source, /up to 20 pages|pages\.length >= 20|pages\.length < 20|slice\(0, 19\)|slice\(0, 20\)/);
  const templates = fs.readFileSync(new URL('../dashboard/hiring/contract-templates.js', import.meta.url), 'utf8');
  assert.match(templates, /Loading a template will discard all current unsaved contract pages and blocks/);
  assert.match(templates, /Load Template/);
  assert.match(source, /<th>Job Title<\/th><th>Job Code<\/th><th>Last Changed<\/th><th>Pages<\/th><th>Actions<\/th>/);
  assert.match(source, /<td><span class="\$\{pages\.length \? 'contract-data-number' : 'contract-data-empty'\}">\$\{pages\.length \|\| '-'\}<\/span><\/td>/);
  assert.match(source, /payload\.startsWith\('clause:'\)/);
  assert.match(source, /if \(readOnly\) bodyPages = bodyPages\.filter\(page => !pageIsBlank\(page\)\)/);
  assert.match(source, /if \(state\.readOnly\) return window\.BKHiringContractTemplate\?\.personalizeHtml/);
  const template = fs.readFileSync(new URL('../dashboard/hiring/contract-template.js', import.meta.url), 'utf8');
  assert.match(template, /function fullDate/);
  assert.match(template, /date_hired: fullDate\(employee\.date_hired\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});

test('contract PDF export permits HR or the assigned employee only', () => {
  const source = fs.readFileSync(new URL('../api/hr-contract-pdf.js', import.meta.url), 'utf8');
  assert.match(source, /requireCompanyAccess\(req, supabase, companyId\)/);
  assert.match(source, /select\('id,job_post_id,email'\)/);
  assert.match(source, /canManageContracts/);
  assert.match(source, /employee\.email[\s\S]*?access\.user\?\.email/);
  assert.match(source, /sendAccessError\(res, \{ error: 'forbidden' \}\)/);
});

test('free subscription owner invitations retain owner dashboard access', () => {
  const source = fs.readFileSync(new URL('../api/register-account.js', import.meta.url), 'utf8');
  assert.match(source, /\['owner', 'admin'\]\.includes\(invitedRole\)/);
});

test('platform tenant listing stays behind an exact owner check and server-side tenant reads', () => {
  const source = fs.readFileSync(new URL('../api/platform-tenants.js', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../database/migrations/01_core_tenancy.sql', import.meta.url), 'utf8');
  assert.match(source, /johnzeustaller@gmail\.com/);
  assert.match(source, /rpc\('get_platform_tenants'\)/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /johnzeustaller@gmail\.com/);
  assert.match(migration, /FROM public\.tenants/);
  assert.match(migration, /LIMIT 100/);
  assert.match(migration, /GRANT EXECUTE .* TO authenticated/);
});

test('platform tenant deletion is ID-scoped, owner-gated, and protects the active owner workspace', () => {
  const api = fs.readFileSync(new URL('../api/platform-tenants.js', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../database/migrations/01_core_tenancy.sql', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../dashboard/master-settings.html', import.meta.url), 'utf8');
  assert.match(api, /\['GET', 'DELETE'\]/);
  assert.match(api, /UUID_PATTERN\.test\(tenantId\)/);
  assert.match(api, /delete_platform_tenant/);
  assert.match(migration, /auth\.jwt\(\) ->> 'email'/);
  assert.match(migration, /tenant_id = p_tenant_id\s+AND user_id = auth\.uid\(\)/);
  assert.match(migration, /LOWER\(TRIM\(v_owner_email\)\) = 'johnzeustaller@gmail\.com'/);
  assert.match(migration, /DELETE FROM public\.tenants WHERE id = p_tenant_id/);
  assert.match(page, /Permanently delete \$\{label\}/);
  assert.match(page, /method: 'DELETE'/);
});

test('platform tenant deletion removes company-scoped Storage objects first', () => {
  const apiSource = fs.readFileSync(new URL('../api/platform-tenants.js', import.meta.url), 'utf8');
  const migrationSource = fs.readFileSync(new URL('../database/migrations/01_core_tenancy.sql', import.meta.url), 'utf8');

  assert.match(apiSource, /TENANT_STORAGE_BUCKETS = \['brightkey-assets', 'brightkey-internal'\]/);
  assert.match(apiSource, /const prefix = `companies\/\$\{companyId\}`/);
  assert.ok(apiSource.indexOf('if (activeOwnerMembership ||') < apiSource.indexOf('await deleteTenantStorage(authClient.storage, companyIds)'));
  assert.match(apiSource, /await deleteTenantStorage\(authClient\.storage, companyIds\)/);
  assert.match(apiSource, /await authClient\.rpc\('delete_platform_tenant'/);
  assert.ok(apiSource.indexOf('await deleteTenantStorage(authClient.storage, companyIds)') < apiSource.indexOf("await authClient.rpc('delete_platform_tenant'"));
  assert.match(migrationSource, /Platform owner can list tenant storage/);
  assert.match(migrationSource, /Platform owner can delete tenant storage/);
});

test('platform signup email credentials stay owner-gated and feed subscription invitations', () => {
  const api = fs.readFileSync(new URL('../api/platform-email-integration.js', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../database/migrations/01_core_tenancy.sql', import.meta.url), 'utf8');
  const subscription = fs.readFileSync(new URL('../api/subscription-requests.js', import.meta.url), 'utf8');
  assert.match(api, /johnzeustaller@gmail\.com/);
  assert.match(api, /platform_email_integrations/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /johnzeustaller@gmail\.com/);
  assert.match(subscription, /platform_email_integrations/);
  assert.match(subscription, /sender_name,api_key,integration_email/);
  assert.match(subscription, /const resendApiKey = platformEmail\.api_key/);
  assert.match(subscription, /const senderName = platformEmail\.sender_name/);
  assert.match(subscription, /const integrationEmail = platformEmail\.integration_email/);
  assert.doesNotMatch(subscription, /platformEmail\?\.api_key \|\| process\.env\.RESEND_API_KEY/);
});

test('platform owner gate permits the designated dual-role account without affecting tenant gates', () => {
  const auth = fs.readFileSync(new URL('../js/auth.js', import.meta.url), 'utf8');
  const masterSettings = fs.readFileSync(new URL('../dashboard/master-settings.html', import.meta.url), 'utf8');
  assert.match(auth, /PLATFORM_OWNER_EMAIL = 'johnzeustaller@gmail\.com'/);
  assert.match(auth, /async function checkPlatformOwnerGate/);
  assert.match(auth, /role: 'platform_owner', tenantId: null/);
  assert.match(masterSettings, /BKAuth\.checkPlatformOwnerGate\('\/admin'\)/);
  assert.doesNotMatch(masterSettings, /BKAuth\.checkRoleGate\(\[\], '\/admin'\)/);
  assert.doesNotMatch(auth, /PLATFORM_SETTINGS_PATH/);
  assert.doesNotMatch(auth, /platformRouteAllowed/);
});

test('login choices include authoritative tenant ownership without requiring tenant_members', () => {
  const apiSource = fs.readFileSync(new URL('../api/account-memberships.js', import.meta.url), 'utf8');
  const authSource = fs.readFileSync(new URL('../js/auth.js', import.meta.url), 'utf8');
  const migrationSource = fs.readFileSync(new URL('../database/migrations/01_core_tenancy.sql', import.meta.url), 'utf8');

  assert.match(apiSource, /from\('tenant_members'\)/);
  assert.match(apiSource, /from\('tenants'\)/);
  assert.match(apiSource, /String\(row\.owner_email \|\| ''\)\.trim\(\)\.toLowerCase\(\) !== email/);
  assert.match(apiSource, /role: 'owner'/);
  assert.match(apiSource, /createAuthenticatedClient\(accessToken\)/);
  assert.doesNotMatch(apiSource, /createServiceClient/);
  assert.match(authSource, /fetch\('\/api\/account-memberships'/);
  assert.match(migrationSource, /CREATE OR REPLACE FUNCTION public\.is_tenant_owner/);
  assert.match(migrationSource, /CREATE POLICY %I[\s\S]*FOR ALL TO authenticated/);
});

test('company API authorization accepts authoritative tenant owners without a membership row', () => {
  const securitySource = fs.readFileSync(new URL('../lib/api/security.js', import.meta.url), 'utf8');
  const createEmployeeSource = fs.readFileSync(new URL('../api/create-employee-account.js', import.meta.url), 'utf8');

  assert.match(securitySource, /from\('tenants'\)[\s\S]*select\('id, owner_email'\)/);
  assert.match(securitySource, /String\(ownerTenant\.owner_email \|\| ''\)[\s\S]*String\(user\.email \|\| ''\)/);
  assert.match(securitySource, /ownsTenant[\s\S]*role: 'owner'/);
  assert.match(createEmployeeSource, /const hasOwnerAccess = Boolean\([\s\S]*ownerTenant\.owner_email/);
  assert.match(createEmployeeSource, /!hasOwnerAccess && !hasAdministrativeMembership/);
});

test('tenant owner authority is consistent across APIs, settings, and database helpers', () => {
  const financeSource = fs.readFileSync(new URL('../api/finance-cash-ledger.js', import.meta.url), 'utf8');
  const settingsSource = fs.readFileSync(new URL('../dashboard/settings/access.html', import.meta.url), 'utf8');
  const migrationSource = fs.readFileSync(new URL('../database/migrations/01_core_tenancy.sql', import.meta.url), 'utf8');

  assert.match(financeSource, /requireCompanyAccess\(req, admin, companyId/);
  assert.match(settingsSource, /currentActorRole = String\(currentRole \|\| ''\)/);
  assert.match(settingsSource, /from\('tenants'\)[\s\S]*select\('owner_email, owner_first_name, owner_last_name, created_at'\)/);
  assert.match(settingsSource, /activeData\.push\([\s\S]*role: 'owner'/);
  assert.match(settingsSource, /activeEmails[\s\S]*inviteData = inviteData\.filter/);
  assert.match(migrationSource, /CREATE OR REPLACE FUNCTION public\.get_user_tenants/);
  assert.match(migrationSource, /CREATE OR REPLACE FUNCTION public\.is_tenant_admin/);
  assert.match(migrationSource, /CREATE OR REPLACE FUNCTION public\.has_module_access/);
  assert.match(migrationSource, /IF public\.is_tenant_admin\(p_user_id, v_tenant_id\) THEN RETURN true/);
});

test('installer jobs cannot be completed before required media is saved', () => {
  const mediaSource = fs.readFileSync(new URL('../js/smartlock-calendar/media.js', import.meta.url), 'utf8');
  const adminMediaSource = fs.readFileSync(new URL('../dashboard/booking-schedules/booking-media.js', import.meta.url), 'utf8');
  const detailsSource = fs.readFileSync(new URL('../js/smartlock-calendar/booking-details.js', import.meta.url), 'utf8');
  const checklistSource = fs.readFileSync(new URL('../js/smartlock-calendar/checklist.js', import.meta.url), 'utf8');

  assert.match(mediaSource, /function doorHasRequiredMedia\(door\)/);
  assert.match(mediaSource, /activeReqs\.every\(req/);
  assert.match(mediaSource, /window\.openChecklistWhenMediaReady/);
  assert.match(mediaSource, /\{ \.\.\.door\.required_media \}/);
  assert.match(detailsSource, /openChecklistModal\(\$\{i\}\)/);
  assert.match(mediaSource, /door\.completed = checklistSaved && doorHasRequiredMedia\(door\)/);
  for (const source of [mediaSource, adminMediaSource]) {
    assert.match(source, /function getFinishedInstallationFolderName\(\)/);
    assert.match(source, /return `\$\{lastName\}-\$\{code\}`/);
    assert.match(source, /mediaSaveQueue = mediaSaveQueue\.catch/);
    assert.match(source, /progress = 99/);
    assert.match(source, /Saving\.\.\./);
    assert.match(source, /savedOtherMedia\.filter/);
  }
  assert.match(mediaSource, /if \(!updated\) throw new Error/);
  assert.match(adminMediaSource, /\.select\('id'\)[\s\S]*?\.single\(\)/);
  assert.ok(mediaSource.indexOf('door.completed = checklistSaved && doorHasRequiredMedia(door)')
    < mediaSource.indexOf("updatePayload.status = 'completed'"));
});

test('installer Done opens the completion checklist before required media', () => {
  const details = fs.readFileSync(new URL('../js/smartlock-calendar/booking-details.js', import.meta.url), 'utf8');
  const checklist = fs.readFileSync(new URL('../js/smartlock-calendar/checklist.js', import.meta.url), 'utf8');
  assert.match(details, /checklistSaved \? `openUploadModal\(\$\{i\}\)` : `openChecklistModal\(\$\{i\}\)`/);
  assert.match(details, /const buttonLabel = checklistSaved \? 'Upload Media' : 'Done'/);
  assert.match(checklist, /door\.checklist_submitted_at = new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(checklist, /closeChecklistModal\(\);\s*openUploadModal\(signatureIndex\)/);
});

test('installer upload modal only accepts configured required media', () => {
  const page = fs.readFileSync(new URL('../smartlock-calendar.html', import.meta.url), 'utf8');
  const media = fs.readFileSync(new URL('../js/smartlock-calendar/media.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../css/smartlock-calendar.css', import.meta.url), 'utf8');
  assert.match(page, /id="required-media-list"/);
  assert.doesNotMatch(page, /id="other-media-input"|Browse Other Media|>Other Media</);
  const openUpload = media.slice(media.indexOf('window.openUploadModal'), media.indexOf('window.closeUploadModal'));
  assert.doesNotMatch(openUpload, /getElementById\('other-media-input'\)/);
  assert.match(openUpload, /getElementById\('upload-modal'\)\.style\.display = 'flex'/);
  assert.match(styles, /#required-media-list > :last-child:nth-child\(odd\)[\s\S]+grid-column: 1 \/ -1[\s\S]+aspect-ratio: 2 \/ 1/);
});

test('authenticated app pages require refresh after one hour, including installer calendar', () => {
  const authSource = fs.readFileSync(new URL('../js/auth.js', import.meta.url), 'utf8');
  const freshnessSource = fs.readFileSync(new URL('../js/page-freshness.js', import.meta.url), 'utf8');

  assert.match(authSource, /usesPageFreshnessGuard/);
  assert.match(authSource, /smartlock-calendar/);
  assert.match(freshnessSource, /const STALE_AFTER_MS = 60 \* 60 \* 1000/);
  assert.match(freshnessSource, /isManagedAppRoute/);
  assert.match(freshnessSource, /smartlock-calendar/);
});

test('customer affiliate codes are company-scoped, generated, and explicitly editable', () => {
  const api = fs.readFileSync(new URL('../api/customer-affiliate-codes.js', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../dashboard/cs-customers.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../dashboard/cs-customers.js', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../database/migrations/20260822010000_generate_customer_affiliate_codes.sql', import.meta.url), 'utf8');

  assert.match(api, /requireCompanyAccess\(req, supabase, companyId/);
  assert.match(api, /modules: \['Customer Service'\]/);
  assert.match(api, /\.eq\('company_id', companyId\)/);
  assert.match(api, /error\?\.code === '23505'/);
  assert.match(page, /<th>Affiliate Code<\/th>/);
  assert.match(client, /data-edit-affiliate/);
  assert.match(client, /\/api\/customer-affiliate-codes/);
  assert.match(migration, /base_code := 'LOOCK'/);
  assert.match(migration, /suffix_number INTEGER := 0/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.set_generated_customer_affiliate_code\(\) FROM PUBLIC/);
});

test('employee profile shows the saved CV link directly below the ID link', () => {
  const profile = fs.readFileSync(new URL('../dashboard/profile.html', import.meta.url), 'utf8');
  assert.ok(profile.indexOf('id="emp-id-link-group"') < profile.indexOf('id="emp-cv-link-group"'));
  assert.match(profile, /id="emp-cv-link-container"/);
  assert.match(profile, /if \(emp\.cv_link\)/);
  assert.match(profile, /cvLinkContainer\.replaceChildren\(cvLink\)/);
  assert.match(profile, /cvLink\.rel = 'noopener noreferrer'/);
});

test('employee directory result count and pagination render below the table', () => {
  const directory = fs.readFileSync(new URL('../dashboard/employee-directory.html', import.meta.url), 'utf8');
  assert.ok(directory.indexOf('<!-- Close table-card -->') < directory.indexOf('id="footer-info"'));
  assert.ok(directory.indexOf('id="footer-info"') < directory.indexOf('id="pagination"'));
  assert.match(directory, /class="table-footer directory-table-footer"/);
});

test('employee hierarchy supports levels one through seven across dependent modules', () => {
  const directory = fs.readFileSync(new URL('../dashboard/employee-directory.html', import.meta.url), 'utf8');
  const directoryClient = fs.readFileSync(new URL('../dashboard/employee-directory.js', import.meta.url), 'utf8');
  const hiring = fs.readFileSync(new URL('../dashboard/hiring/hiring.js', import.meta.url), 'utf8');
  const events = fs.readFileSync(new URL('../dashboard/events/index.html', import.meta.url), 'utf8');
  const attendance = fs.readFileSync(new URL('../dashboard/attendance-leaves.html', import.meta.url), 'utf8');
  const commissions = fs.readFileSync(new URL('../dashboard/sales-commissions.html', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../database/migrations/20260822020000_expand_employee_levels_to_seven.sql', import.meta.url), 'utf8');

  assert.match(directory, /id="new-emp-title"[^>]+required/);
  assert.match(directory, /<option value="7">7 - Owner \/ President<\/option>/);
  assert.match(directoryClient, /Owner \/ President/);
  assert.match(hiring, /<option value="7">7 - Owner \/ President<\/option>/);
  assert.match(events, /<option value="7">Level 7 — Owner \/ President<\/option>/);
  assert.match(attendance, /id="vl-limit-level-7"/);
  assert.match(attendance, /id="sl-limit-level-7"/);
  assert.match(commissions, /parseInt\(emp\.level, 10\) >= 5/);
  assert.match(migration, /visibility_level BETWEEN 1 AND 7/);
});

test('pending employee update requests show a tab count and Directory sidebar dot', () => {
  const sidebar = fs.readFileSync(new URL('../js/sidebar.js', import.meta.url), 'utf8');
  const directory = fs.readFileSync(new URL('../dashboard/employee-directory.js', import.meta.url), 'utf8');

  assert.match(sidebar, /id="directory-request-badge-dot"/);
  assert.match(sidebar, /tenantId: roleInfo\.tenantId/);
  assert.match(sidebar, /select\('id', \{ count: 'exact', head: true \}\)/);
  assert.match(sidebar, /\.eq\('tenant_id', tenantId\)/);
  assert.match(sidebar, /\.eq\('status', 'pending'\)/);
  assert.match(directory, /BKSetEmployeeUpdateRequestCount\?\.\(this\.pendingRequests\.length\)/);
});

test('message flow media cards keep only compact upload specs beside the title', () => {
  const page = fs.readFileSync(new URL('../dashboard/cs-message-flow.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../dashboard/cs-message-flow.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../dashboard/cs-message-flow.css', import.meta.url), 'utf8');

  assert.doesNotMatch(client, /Instructions for the customer|Always compressed|Any image dimensions/);
  assert.match(client, /\['15 MB maximum', 'Video: up to 10 seconds', 'Images: PNG, JPG or HEIC'\]/);
  assert.match(client, /header\.insertBefore\(rules, header\.lastElementChild\)/);
  assert.match(client, /instructions\.rows = 1/);
  assert.match(client, /autoGrowMediaMessage\(event\.target\)/);
  assert.match(styles, /\.flow-media-message[^}]+min-height: 30px/);
  assert.match(styles, /justify-content: flex-end/);
  assert.match(styles, /\.flow-choice-descendants \{ margin-top: \.15rem; padding-top: \.35rem; \}/);
  assert.match(client, /questionLabel\.textContent = `Q\$\{questionIndex \+ 1\}`/);
  assert.match(styles, /grid-template-columns: auto minmax\(0, 1fr\) 140px auto/);
  assert.match(styles, /\.flow-answer-choices \{[^}]+grid-column: 2 \/ 4/);
  assert.ok(page.indexOf('class="flow-product-step"') < page.indexOf('id="flow-tree"'));
  assert.match(page, /Select the ordered product they need support with\./);
});

test('message flow customer preview is interactive but never submits or uploads', () => {
  const page = fs.readFileSync(new URL('../dashboard/cs-message-flow.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../dashboard/cs-message-flow.js', import.meta.url), 'utf8');

  assert.ok(page.indexOf('id="preview-flow"') < page.indexOf('id="save-flow"'));
  assert.match(page, /Customer Preview/);
  assert.match(page, /Preview only — nothing is submitted or uploaded\./);
  assert.match(client, /renderPreviewProductStep/);
  assert.match(client, /renderPreviewCustomerPicker/);
  assert.match(client, /\.from\('installation_bookings'\)[\s\S]+\.eq\('company_id', state\.companyId\)[\s\S]+\.limit\(250\)/);
  assert.match(client, /\.from\('products'\)[\s\S]+\.eq\('company_id', state\.companyId\)[\s\S]+\.in\('sku', purchasedSkus\)/);
  assert.doesNotMatch(client, /Sample order BK-/);
  assert.match(page, /flow-preview-portal-header/);
  assert.match(page, /flow-preview-mobile-nav/);
  assert.match(client, /Type your answer\.\.\./);
  assert.match(client, /input\.type = 'file'; input\.accept = 'image\/\*,video\/\*'/);
  assert.match(client, /URL\.createObjectURL\(file\)/);
  assert.match(client, /URL\.revokeObjectURL\(url\)/);
  const uploadHandler = client.slice(
    client.indexOf('function handlePreviewUpload'),
    client.indexOf('async function save')
  );
  assert.doesNotMatch(uploadHandler, /authenticatedFetch|\bsb\s*\.\s*from\(|\.upsert\(|\.storage\b/);
});

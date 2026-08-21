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
  assert.match(page, /id="feature-name"[^>]*readonly/);
  assert.match(code, /getElementById\('feature-display-name'\)\.addEventListener\('input'/);
  assert.match(code, /getElementById\('feature-name'\)\.value = normalizeFeatureKey\(event\.target\.value\)/);
});

test('all Directory employee forms require account details or a private payout QR', () => {
  const registration = fs.readFileSync(new URL('../employee-registration.html', import.meta.url), 'utf8');
  const directoryForm = fs.readFileSync(new URL('../dashboard/employee-directory.html', import.meta.url), 'utf8');
  const directoryCode = fs.readFileSync(new URL('../dashboard/employee-directory.js', import.meta.url), 'utf8');
  const upload = fs.readFileSync(new URL('../api/upload.js', import.meta.url), 'utf8');
  [registration, directoryForm].forEach(source => {
    assert.match(source, /value="account"/);
    assert.match(source, /value="qr"/);
  });
  assert.match(registration, /payout_details_image/);
  assert.match(directoryCode, /payoutMode === 'qr'/);
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

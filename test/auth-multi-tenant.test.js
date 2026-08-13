import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const authSource = fs.readFileSync(new URL('../js/auth.js', import.meta.url), 'utf8');

function loadAuth(activeTenantId = null) {
  let user = {
    id: 'user-1',
    email: 'shared@example.com',
    user_metadata: { active_tenant_id: activeTenantId }
  };
  const memberships = [
    { tenant_id: 'tenant-owner', role: 'owner', accessible_modules: [], created_at: '2026-01-01' },
    { tenant_id: 'tenant-employee', role: null, accessible_modules: ['Sales'], created_at: '2026-02-01' }
  ];
  const companies = [
    { id: 'company-owner', tenant_id: 'tenant-owner', name: 'Owner Company' },
    { id: 'company-employee', tenant_id: 'tenant-employee', name: 'Employee Company' }
  ];
  const updateCalls = [];

  function query(rows) {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => Promise.resolve({ data: rows, error: null })
    };
    return builder;
  }

  const sb = {
    auth: {
      getSession: async () => ({ data: { session: { user } } }),
      updateUser: async payload => {
        updateCalls.push(payload);
        user = { ...user, user_metadata: { ...user.user_metadata, ...payload.data } };
        return { data: { user }, error: null };
      }
    },
    from: table => query(table === 'tenant_members' ? memberships : companies)
  };
  const location = { pathname: '/dashboard', href: '' };
  const window = {
    location,
    supabase: { createClient: () => sb }
  };
  const context = vm.createContext({
    console,
    document: { readyState: 'loading', addEventListener() {} },
    Element: class Element {},
    Headers,
    Map,
    MutationObserver: class MutationObserver {},
    Promise,
    Set,
    String,
    URLSearchParams,
    window
  });
  vm.runInContext(authSource, context);
  return { auth: window.BKAuth, location, updateCalls };
}

test('multi-tenant role lookup uses the explicitly selected tenant membership', async () => {
  const { auth } = loadAuth('tenant-employee');
  assert.equal(await auth.getPostLoginDestination('/dashboard'), '/admin?select_business=1');
  const role = await auth.getUserRole();

  assert.equal(role.tenantId, 'tenant-employee');
  assert.equal(role.companyId, 'company-employee');
  assert.equal(role.role, null);
  assert.deepEqual([...role.modules], ['Sales']);
});

test('multi-tenant role lookup requires selection when no active tenant exists', async () => {
  const { auth, location } = loadAuth();
  const role = await auth.getUserRole();

  assert.equal(role, null);
  assert.equal(location.href, '/admin?select_business=1');
});

test('tenant selection validates membership before updating authenticated metadata', async () => {
  const { auth, updateCalls } = loadAuth();

  await assert.rejects(() => auth.selectTenant('tenant-other'), /connected to your account/);
  assert.equal(updateCalls.length, 0);

  const selected = await auth.selectTenant('tenant-owner');
  assert.equal(selected.companyName, 'Owner Company');
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].data.active_tenant_id, 'tenant-owner');
});

test('member gate allows an employee without owner, admin, or module-specific access', async () => {
  const { auth, location } = loadAuth('tenant-employee');
  const access = await auth.checkMemberGate('/admin.html');

  assert.equal(access.tenantId, 'tenant-employee');
  assert.equal(access.companyId, 'company-employee');
  assert.equal(access.role, null);
  assert.equal(location.href, '');
});

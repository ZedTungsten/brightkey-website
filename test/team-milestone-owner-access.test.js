import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('team leader authorization includes authoritative tenant owners', () => {
  const migration = fs.readFileSync(
    new URL('../database/migrations/20260821013000_recognize_authoritative_owner_as_team_leader.sql', import.meta.url),
    'utf8'
  );

  assert.match(migration, /is_tenant_admin\(p_user_id, v_tenant_id\)/);
  assert.match(migration, /SET search_path = public, auth/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.is_team_leader\(UUID, UUID\) FROM PUBLIC/);
});

test('Team page resolves employee identity by company and account email', () => {
  const source = fs.readFileSync(new URL('../dashboard/team.js', import.meta.url), 'utf8');
  const resolver = fs.readFileSync(new URL('../dashboard/team-owner-profile.js', import.meta.url), 'utf8');

  assert.match(resolver, /from\('employees'\)[\s\S]*\.eq\('company_id', companyId\)[\s\S]*\.eq\('email', email\)/);
  assert.match(source, /const selfEmployeeId = this\.loggedInEmployee\?\.id/);
  assert.match(source, /select\.value = hasSelf \? selfEmployeeId : this\.subordinates\[0\]\.id/);
  assert.match(source, /BKTeamOwnerProfile\.resolve/);
  assert.match(source, /if \(!this\.selectedEmployeeId\)/);
});

test('owner employee provisioning is restricted to the authoritative tenant owner', () => {
  const source = fs.readFileSync(new URL('../api/ensure-owner-employee.js', import.meta.url), 'utf8');

  assert.match(source, /supabase\.auth\.getUser\(token\)/);
  assert.match(source, /tenant\.owner_email/);
  assert.match(source, /\.eq\('tenant_id', tenantId\)/);
  assert.match(source, /next_company_employee_number/);
  assert.match(source, /id: user\.id/);
  assert.match(source, /assignment: 'Owner', title: 'Tenant Owner'/);
  assert.match(source, /if \(!String\(existing\.title \|\| ''\)\.trim\(\)\)/);
  assert.match(source, /update\(\{ title: 'Tenant Owner' \}\)/);
});

test('owner account registration provisions its employee assignment identity', () => {
  const source = fs.readFileSync(new URL('../api/register-account.js', import.meta.url), 'utf8');

  assert.match(source, /if \(memberRole === 'owner'\)/);
  assert.match(source, /ensureOwnerEmployeeProfile/);
});

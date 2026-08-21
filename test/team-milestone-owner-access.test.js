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

  assert.match(source, /from\('employees'\)[\s\S]*\.eq\('company_id', this\.companyId\)[\s\S]*\.eq\('email', this\.currentUser\.email\)/);
  assert.match(source, /const selfEmployeeId = this\.loggedInEmployee\?\.id/);
  assert.match(source, /select\.value = hasSelf \? selfEmployeeId : this\.subordinates\[0\]\.id/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('dashboard notes verify a company-scoped employee update', () => {
  const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');

  assert.match(dashboard, /\.update\(\{ notes: notesTextarea\.innerHTML \}\)/);
  assert.match(dashboard, /\.eq\('id', this\.employeeId\)\s*\.eq\('company_id', this\.companyId\)\s*\.select\('id'\)\s*\.maybeSingle\(\)/);
  assert.match(dashboard, /if \(error \|\| !savedEmployee\) throw/);
  assert.match(dashboard, /Your note could not be saved/);
});

test('employee self-update policy links auth and employees by email within an accessible tenant', () => {
  const migration = fs.readFileSync(
    new URL('../database/migrations/20260821010000_fix_employee_self_update_identity.sql', import.meta.url),
    'utf8'
  );

  assert.match(migration, /employees\.email[\s\S]*auth\.jwt\(\) ->> 'email'/);
  assert.match(migration, /company\.tenant_id IN \([\s\S]*get_user_tenants\(auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /auth\.uid\(\)\s*=\s*id/);
});

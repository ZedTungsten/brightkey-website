import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../dashboard/qa-guide.html', import.meta.url), 'utf8');
const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260905072206_qa_guide_component_groups.sql', import.meta.url),
  'utf8'
);

test('QA Guide can save and insert reusable component groups', () => {
  assert.match(page, /Save Group/);
  assert.match(page, /Insert Saved Group/);
  assert.match(page, /saveComponentGroup\('\$\{groupId\}', this\)/);
  assert.match(page, /file_name: fileName/);
  assert.match(page, /onConflict: 'company_id,file_name'/);
  assert.match(page, /\.from\('qa_component_groups'\)[\s\S]*?\.select\('id, file_name, parts'\)[\s\S]*?\.eq\('company_id', currentCompanyId\)[\s\S]*?\.limit\(100\)/);
  assert.match(page, /<button[^>]*onclick="closeInsertGroupModal\(\)"[^>]*>[\s\S]*?Cancel<\/button>/);
  assert.match(page, /<button[^>]*onclick="confirmInsertGroup\(\)"[^>]*>[\s\S]*?Load<\/button>/);
});

test('saved QA component groups are company-owned and Logistics-gated', () => {
  assert.match(migration, /company_id uuid NOT NULL REFERENCES public\.companies\(id\) ON DELETE CASCADE/);
  assert.match(migration, /UNIQUE \(company_id, file_name\)/);
  assert.match(migration, /ALTER TABLE public\.qa_component_groups ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FOR SELECT TO authenticated[\s\S]*?has_module_access\(\(SELECT auth\.uid\(\)\), company_id, 'Logistics'\)/);
  assert.match(migration, /FOR INSERT TO authenticated[\s\S]*?WITH CHECK[\s\S]*?has_module_access/);
  assert.match(migration, /FOR UPDATE TO authenticated[\s\S]*?USING[\s\S]*?WITH CHECK/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/smartlock-calendar/booking-details.js', import.meta.url), 'utf8');
const identitySource = source.slice(0, source.indexOf('function formatSmartlockProductLine'));
const context = {};
vm.runInNewContext(`${identitySource};globalThis.identity = getSmartlockCustomerIdentity;`, context);

test('residential installation details use the customer name and omit company identity values', () => {
  const identity = context.identity({
    customer_is_company: false,
    customer_first_name: 'John',
    customer_last_name: 'Garcia',
    customer_contact_person: 'Legacy Contact',
    customer_company_type: 'corporation'
  });
  assert.equal(identity.primaryName, 'John Garcia');
  assert.equal(identity.contactPerson, '');
  assert.equal(identity.companyType, '');
});

test('installation details explicitly hide company fields for residential customers', () => {
  assert.match(source, /companyDetails\.style\.display = customerIdentity\.isCompany \? 'grid' : 'none'/);
  assert.match(source, /customerNameGroup\.style\.display = customerIdentity\.isCompany \? 'none' : ''/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const template = fs.readFileSync(new URL('../dashboard/hiring/contract-template.js', import.meta.url), 'utf8');
const templateCss = fs.readFileSync(new URL('../dashboard/hiring/contract-template.css', import.meta.url), 'utf8');
const onboarding = fs.readFileSync(new URL('../dashboard/onboarding.js', import.meta.url), 'utf8');

test('employee signature block includes the date placeholder below the position', () => {
  const position = template.indexOf('<span>${employeeTitle}</span>');
  const signedDate = template.indexOf('<span class="contract-signature-date">Date signed: MM/DD/YYYY</span>');

  assert.notEqual(position, -1);
  assert.ok(signedDate > position);
  assert.match(templateCss, /\.contract-signatures span\{color:#8a9099;font-size:14px\}/);
});

test('employee onboarding backfills signed dates in viewer and PDF pages', () => {
  assert.match(onboarding, /formatSignatureDate = value =>/);
  assert.match(onboarding, /month: '2-digit', day: '2-digit', year: 'numeric'/);
  assert.match(onboarding, /signedDate\.textContent = `Date signed: \$\{formatSignatureDate\(state\.signature\.signed_at\)\}`/);
  assert.match(onboarding, /function pdfPages\(\)[\s\S]*map\(renderBlock\)/);
});

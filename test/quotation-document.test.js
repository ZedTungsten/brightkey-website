import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../dashboard/quotations/document.js', import.meta.url), 'utf8');
const context = vm.createContext({ window:{} });
vm.runInContext(source, context);
const document = context.window.BKQuotationDocument;
const fields = () => ({ ...document.DEFAULTS, 'prepared-company':'Company <script>test</script>', 'prepared-address':'First line\nSecond line', 'project-scope':'Full scope\nwith details', 'quotation-subheader':'Original contact details' });
const branding = { companyName:'Original company', logoDark:'data:image/png;base64,aGVsbG8=' };

test('quotation snapshot round-trips every field, setting, date, and logo', () => {
  const input = fields();
  const saved = document.capture(input, branding, '2026-09-03');
  const loaded = document.validate(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.pages[0].fields)), input);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.branding)), branding);
  assert.equal(loaded.date, '2026-09-03');
  assert.equal(loaded.pages.length, 1);
  input['prepared-company'] = 'Later edits';
  assert.notEqual(saved.pages[0].fields['prepared-company'], input['prepared-company']);
});

test('snapshot field contract covers every editable builder control', () => {
  const html = readFileSync(new URL('../dashboard/quotations/builder.html', import.meta.url), 'utf8');
  const settingsHtml = html.split('<aside class="quotation-settings"')[1].split('</aside>')[0];
  const ids = [...settingsHtml.matchAll(/<(?:input|select|textarea) id="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual([...document.FIELD_IDS].sort(), ids.sort());
});

test('incomplete or future multi-page formats are rejected without silently losing pages', () => {
  const saved = document.capture(fields(), branding, '2026-09-03');
  assert.throws(() => document.validate({ ...saved, version:2 }));
  assert.throws(() => document.validate({ ...saved, pages:[...saved.pages, saved.pages[0]] }));
  assert.throws(() => document.validate({ ...saved, date:'invalid' }));
  assert.throws(() => document.validate({ ...saved, branding:{} }));
  delete saved.pages[0].fields['project-scope'];
  assert.throws(() => document.validate(saved));
});

test('unsupported settings fail validation before any restoration', () => {
  const invalid = { ...fields(), 'quotation-font-family':'untrusted' };
  assert.throws(() => document.capture(invalid, branding, '2026-09-03'));
});

test('new quotations default to small left branding and support the requested title sizes', () => {
  assert.equal(document.DEFAULTS['quotation-logo-size'], 'small');
  assert.equal(document.DEFAULTS['quotation-brand-alignment'], 'left');
  for (const size of ['24','32','40']) {
    assert.doesNotThrow(() => document.capture({ ...fields(), 'quotation-title-font-size':size }, branding, '2026-09-03'));
  }
  for (const size of ['14','18']) {
    assert.throws(() => document.capture({ ...fields(), 'quotation-title-font-size':size }, branding, '2026-09-03'));
  }
});

test('older saved quotations restore the default title size', () => {
  const saved = document.capture(fields(), branding, '2026-09-03');
  delete saved.pages[0].fields['quotation-title-font-size'];
  assert.equal(document.validate(saved).pages[0].fields['quotation-title-font-size'], '32');
});

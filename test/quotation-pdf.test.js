import assert from 'node:assert/strict';
import test from 'node:test';
import { renderQuotationPages } from '../api/quotation-pdf.js';

function cover(items) {
  return { type:'cover', fields:{ 'quotation-branding-option':'logo', 'quotation-logo-size':'small', 'quotation-brand-alignment':'left', 'quotation-header-image':'', 'quotation-title':'Test Quotation', 'quotation-font-family':'commissioner', 'quotation-font-weight':'700', 'quotation-title-font-size':'32', 'prepared-company':'Customer', 'prepared-address':'Address', 'prepared-contact':'Contact', 'quotation-include-project':'true', 'project-client-name':'Client', 'project-client-address':'Client address', 'project-scope':'Scope', 'quotation-items-title':'Supply and Installation' }, items, pricing:{ subtotal:'1000', less:[{ label:'Less:', amount:'100' }] } };
}

test('quotation PDF renderer includes every overflow and content page', () => {
  const items = Array.from({ length:24 }, (_, index) => ({ description:`Item ${index + 1}`, model:`Model ${index + 1}`, qty:'1 pc' }));
  const document = { version:1, date:'2026-09-09', branding:{ companyName:'BrightKey', logoDark:'' }, pages:[cover(items), { type:'content', sections:[{ kind:'warranty', html:'<p>One year</p>' }] }] };
  const pages = renderQuotationPages(document, '090926-0001');
  assert.equal(pages.length, 4);
  assert.match(pages[0], /Item 1/);
  assert.doesNotMatch(pages[0], /Grand Total/);
  assert.match(pages[2], /Item 24/);
  assert.match(pages[2], /Grand Total/);
  assert.match(pages[3], /Warranty/);
});

test('quotation PDF renderer sanitizes content element markup', () => {
  const document = { version:1, date:'2026-09-09', branding:{ companyName:'BrightKey', logoDark:'' }, pages:[{ type:'content', sections:[{ kind:'exclusions', html:'<p onclick="bad()">Safe<script>bad()</script></p>' }] }] };
  const [page] = renderQuotationPages(document);
  assert.match(page, /<p>Safe/);
  assert.doesNotMatch(page, /onclick|script|bad\(\)/i);
});

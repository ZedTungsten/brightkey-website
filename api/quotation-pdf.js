import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import { createAuthenticatedClient, getBearerToken, requireCompanyAccess, sendAccessError, setApiCors } from '../lib/api/security.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;
const MAX_PAGES = 100;
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_ASSETS = 50;
const CONTENT_TITLES = { 'scope-of-work':'Scope of work', exclusions:'Exclusions', 'project-schedule':'Project Schedule', warranty:'Warranty', 'payment-terms':'Payment Terms', 'quotation-validity':'Quotation Validity', acceptance:'Acceptance' };
const FONT_FAMILIES = { commissioner:'"Commissioner",sans-serif', merriweather:'"Merriweather",serif', montserrat:'"Montserrat",sans-serif', 'open-sans':'"Open Sans",sans-serif', roboto:'"Roboto",sans-serif', times:'"Times New Roman",Times,serif' };
const CHROME_PATHS = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'];

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
const shown = value => esc(String(value || '').trim() || '—');

function safeFilename(value) {
  const base = String(value || 'Quotation.pdf').replace(/[^a-z0-9_.-]+/gi, '_').replace(/^_+|_+$/g, '');
  return (base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`).slice(0, 160);
}

function sanitizeRichText(html) {
  const $ = cheerio.load(`<div>${String(html || '')}</div>`, null, false);
  const root = $('div').first();
  root.find('script,style,iframe,object,embed,link,meta,base,form,input,button,video,audio,source').remove();
  root.find('*').each((_, element) => {
    if (!['p','div','br','strong','b','em','i','u','mark','ul','ol','li'].includes(element.tagName)) {
      $(element).replaceWith($(element).contents());
      return;
    }
    for (const attribute of Object.keys(element.attribs || {})) $(element).removeAttr(attribute);
  });
  return root.html() || '';
}

function restoreAssets(value, assets) {
  if (typeof value === 'string') return value.replace(/__BK_PDF_ASSET_(\d+)__/g, (token, index) => assets[Number(index)] || token);
  if (Array.isArray(value)) return value.map(item => restoreAssets(item, assets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restoreAssets(item, assets)]));
  return value;
}

function validateDocument(document) {
  if (document?.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(document.date || '') || !Array.isArray(document.pages) || !document.pages.length || document.pages.length > 50) throw new Error('Invalid quotation document.');
  if (typeof document.branding?.companyName !== 'string' || typeof document.branding?.logoDark !== 'string') throw new Error('Invalid quotation branding.');
  for (const page of document.pages) {
    if (page?.type === 'cover') {
      if (!page.fields || !Array.isArray(page.items) || !page.items.length || page.items.length > 200 || !Array.isArray(page.pricing?.less)) throw new Error('Invalid quotation cover page.');
      if (page.items.some(item => ['description','model','qty'].some(key => typeof item?.[key] !== 'string'))) throw new Error('Invalid quotation items.');
    } else if (page?.type === 'content') {
      if (!Array.isArray(page.sections) || page.sections.length > 30 || page.sections.some(section => !CONTENT_TITLES[section?.kind] || typeof section.html !== 'string')) throw new Error('Invalid quotation content page.');
    } else throw new Error('Invalid quotation page.');
  }
  return document;
}

function itemPageUnits(item) { return Math.max(1, Math.ceil(item.description.length / 44), Math.ceil(item.model.length / 30), Math.ceil(item.qty.length / 12)); }
function paginateItems(items) {
  const chunks = [[]];
  let capacity = 7;
  let used = 0;
  for (const item of items) {
    const units = Math.min(itemPageUnits(item), capacity);
    if (chunks.at(-1).length && used + units > capacity) { chunks.push([]); capacity = 16; used = 0; }
    chunks.at(-1).push(item);
    used += units;
  }
  return chunks;
}

function amount(value) { const parsed = Number(String(value || '').replace(/,/g, '').trim()); return Number.isFinite(parsed) ? parsed : 0; }
function money(value) { return amount(value).toLocaleString('en-PH', { minimumFractionDigits:2, maximumFractionDigits:2 }); }

function brandingHtml(document, fields) {
  const alignment = ['left','center'].includes(fields['quotation-brand-alignment']) ? fields['quotation-brand-alignment'] : 'left';
  const size = ['smallest','small','medium'].includes(fields['quotation-logo-size']) ? fields['quotation-logo-size'] : 'small';
  const headerImage = fields['quotation-header-image'];
  if (fields['quotation-branding-option'] === 'header-image' && IMAGE.test(headerImage || '')) return `<div class="quotation-branding" data-alignment="${alignment}"><img class="quotation-header-image" src="${headerImage}" alt="Quotation header"></div>`;
  if (IMAGE.test(document.branding.logoDark || '') || /^https:\/\//i.test(document.branding.logoDark || '')) return `<div class="quotation-branding" data-alignment="${alignment}"><img class="quotation-logo" data-size="${size}" src="${esc(document.branding.logoDark)}" alt="Company logo"></div>`;
  return `<div class="quotation-branding" data-alignment="${alignment}"><div class="quotation-logo-fallback">${shown(document.branding.companyName || 'Company')}</div></div>`;
}

function coverPageHtml(document, page, items, itemOffset, continuation, lastItemPage, quotationNumber) {
  const fields = page.fields;
  const family = FONT_FAMILIES[fields['quotation-font-family']] || FONT_FAMILIES.commissioner;
  const titleSize = ['24','32','40'].includes(fields['quotation-title-font-size']) ? fields['quotation-title-font-size'] : '32';
  const weight = ['400','500','600','700'].includes(fields['quotation-font-weight']) ? fields['quotation-font-weight'] : '700';
  const rows = items.map((item, index) => `<tr><td>${itemOffset + index + 1}</td><td>${shown(item.description)}</td><td>${shown(item.model)}</td><td>${shown(item.qty)}</td></tr>`).join('');
  const lessTotal = page.pricing.less.reduce((sum, item) => sum + amount(item.amount), 0);
  const totals = lastItemPage ? `<div class="quotation-totals-preview"><div><span>Subtotal</span><span>${money(page.pricing.subtotal)}</span></div><div id="preview-less-rows">${page.pricing.less.map(item => `<div><span>${esc(item.label ?? 'Less:')}</span><span>${money(item.amount)}</span></div>`).join('')}</div><div class="quotation-grand-total"><strong>Grand Total</strong><strong id="preview-grand-total">${money(amount(page.pricing.subtotal) - lessTotal)}</strong></div></div>` : '';
  const header = continuation ? '' : `<header class="quotation-document-header">${brandingHtml(document, fields)}<h1 style="font-family:${family};font-weight:${weight};font-size:${titleSize}px">${shown(fields['quotation-title'])}</h1><div class="quotation-meta"><div><span>Quotation Number:</span><strong>${shown(quotationNumber)}</strong></div><div class="quotation-date"><span>Date:</span><strong>${esc(new Intl.DateTimeFormat('en-PH', { year:'numeric', month:'long', day:'numeric', timeZone:'Asia/Manila' }).format(new Date(`${document.date}T12:00:00Z`)))}</strong></div></div></header><div class="quotation-details-grid${fields['quotation-include-project'] === 'false' ? ' project-hidden' : ''}"><section class="quotation-detail-card"><h2>Prepared For</h2><dl><div><dt>Name</dt><dd>${shown(fields['prepared-company'])}</dd></div><div><dt>Address</dt><dd>${shown(fields['prepared-address'])}</dd></div><div><dt>Contact</dt><dd>${shown(fields['prepared-contact'])}</dd></div></dl></section>${fields['quotation-include-project'] === 'false' ? '' : `<section class="quotation-detail-card"><h2>Project</h2><dl><div><dt>Company Name</dt><dd>${shown(fields['project-client-name'])}</dd></div><div><dt>Company Address</dt><dd>${shown(fields['project-client-address'])}</dd></div><div><dt>Project Scope</dt><dd>${shown(fields['project-scope'])}</dd></div></dl></section>`}</div>`;
  return `<section class="quotation-sheet server-pdf-page">${header}<div class="quotation-items-preview-scroll"><h2 class="quotation-items-title">${shown(fields['quotation-items-title'])}</h2><table class="quotation-items-preview"><thead><tr><th>Item</th><th>Description</th><th>Model</th><th>Qty</th></tr></thead><tbody>${rows}</tbody></table>${totals}</div></section>`;
}

function acceptanceHtml(section) {
  const data = section.acceptance || {};
  return `<div class="quotation-acceptance-preview">${[['Prepared by','prepared'],['Accepted by','accepted']].map(([label, prefix]) => `<div class="quotation-acceptance-party"><span class="quotation-acceptance-label">${label}:</span>${IMAGE.test(data[`${prefix}Signature`] || '') ? `<img class="quotation-acceptance-signature" src="${data[`${prefix}Signature`]}" alt="${label} signature">` : ''}<span class="quotation-acceptance-name">${shown(data[`${prefix}Name`] || 'Name')}</span><span class="quotation-acceptance-position">${shown(data[`${prefix}Position`] || 'Position')}</span></div>`).join('')}</div>`;
}

function contentPageHtml(page) {
  return `<section class="quotation-sheet server-pdf-page"><div class="quotation-content-editor-shell"><div>${page.sections.map(section => `<section class="quotation-content-element" data-kind="${section.kind}"><h2 class="quotation-content-title">${CONTENT_TITLES[section.kind]}</h2>${section.kind === 'acceptance' ? acceptanceHtml(section) : `<div class="quotation-content-editor">${sanitizeRichText(section.html)}</div>`}</section>`).join('')}</div></div></section>`;
}

export function renderQuotationPages(document, quotationNumber = '') {
  const pages = [];
  for (const page of document.pages) {
    if (page.type === 'content') { pages.push(contentPageHtml(page)); continue; }
    let offset = 0;
    paginateItems(page.items).forEach((items, index, chunks) => {
      pages.push(coverPageHtml(document, page, items, offset, index > 0, index === chunks.length - 1, quotationNumber));
      offset += items.length;
      if (index < chunks.length - 1) return;
    });
  }
  if (!pages.length || pages.length > MAX_PAGES) throw new Error('Invalid quotation page count.');
  return pages;
}

function requestOrigin(req) {
  const origin = String(req.headers.origin || '');
  if (/^https:\/\/([a-z0-9-]+\.)*brightkeysolutions\.com$/i.test(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${String(req.headers['x-forwarded-proto'] || 'https').split(',')[0]}://${host}` : 'https://www.brightkeysolutions.com';
}

export async function buildQuotationPrintHtml(req, document, quotationNumber = '') {
  const css = await readFile(resolve('dashboard/quotations/builder.css'), 'utf8');
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${requestOrigin(req)}/"><link href="https://fonts.bunny.net/css?family=commissioner:400,500,600,700,800|merriweather:400,500,600,700|montserrat:400,500,600,700|open-sans:400,500,600,700|roboto:400,500,600,700&display=swap" rel="stylesheet"><style>:root{--border:#e5e7eb;--radius-sm:6px}${css}@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.server-pdf-page{width:210mm!important;height:297mm!important;min-height:297mm!important;max-height:297mm!important;overflow:hidden;box-shadow:none!important;border-radius:0!important;break-after:page;page-break-after:always}.server-pdf-page:last-child{break-after:auto;page-break-after:auto}.server-pdf-page .quotation-content-element{border:0!important}.server-pdf-page .quotation-content-editor{min-height:0!important}</style></head><body>${renderQuotationPages(document, quotationNumber).join('')}</body></html>`;
}

async function executablePath(req) {
  if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH;
  if (process.platform !== 'linux' || !process.env.VERCEL) return CHROME_PATHS.find(existsSync);
  return chromium.executablePath(process.env.CHROMIUM_PACK_URL || `${requestOrigin(req)}/chromium-pack.tar`);
}

export async function renderQuotationPdf(req, html) {
  const local = process.platform !== 'linux' || !process.env.VERCEL;
  const chromePath = await executablePath(req);
  if (!chromePath) throw new Error('A compatible Chromium executable is unavailable.');
  const browser = await puppeteer.launch({ args:local ? ['--disable-gpu'] : await puppeteer.defaultArgs({ args:chromium.args, headless:'shell' }), defaultViewport:{ width:1280, height:900, deviceScaleFactor:1 }, executablePath:chromePath, headless:local ? true : 'shell' });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil:'domcontentloaded', timeout:30000 });
    if (!local) await page.evaluate(() => document.fonts?.ready);
    return await page.pdf({ format:'A4', printBackground:true, preferCSSPageSize:true, waitForFonts:!local, margin:{ top:0, right:0, bottom:0, left:0 } });
  } finally { await browser.close(); }
}

export default async function handler(req, res) {
  setApiCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error:'Method Not Allowed' });
  const companyId = String(req.body?.company_id || '').trim();
  const assets = Array.isArray(req.body?.assets) ? req.body.assets : [];
  if (!UUID.test(companyId) || assets.length > MAX_ASSETS || assets.some(asset => typeof asset !== 'string' || !IMAGE.test(asset))) return res.status(400).json({ error:'The quotation PDF request is incomplete.' });
  if (Buffer.byteLength(JSON.stringify({ document:req.body?.document, assets }), 'utf8') > MAX_BYTES) return res.status(413).json({ error:'This quotation is too large to export. Reduce its embedded images and try again.' });
  try {
    const token = getBearerToken(req);
    if (!token) return sendAccessError(res, { error:'unauthorized' });
    const supabase = createAuthenticatedClient(token);
    const access = await requireCompanyAccess(req, supabase, companyId, { modules:['Sales'] });
    if (access.error) return sendAccessError(res, access);
    const document = validateDocument(restoreAssets(req.body?.document, assets));
    const pdf = await renderQuotationPdf(req, await buildQuotationPrintHtml(req, document, String(req.body?.quotation_number || '').slice(0, 40)));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(req.body?.filename)}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(pdf));
  } catch (error) {
    console.error('Quotation PDF generation failed:', error);
    return res.status(503).json({ error:'The quotation PDF could not be generated. Please try again.' });
  }
}

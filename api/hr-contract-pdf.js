import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import { createAuthenticatedClient, getBearerToken, requireCompanyAccess, sendAccessError, setApiCors } from '../lib/api/security.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAGES = 100;
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_ASSETS = 50;
const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
];

function safeFilename(value) {
  const base = String(value || 'Employment_Contract.pdf').replace(/[^a-z0-9_.-]+/gi, '_').replace(/^_+|_+$/g, '');
  return (base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`).slice(0, 160);
}

function safeInlineStyle(element, style) {
  const className = String(element.attribs?.class || '');
  if (className.includes('contract-template-preview')) {
    return [...String(style).matchAll(/--contract-(primary|secondary|highlight)\s*:\s*(#[0-9a-f]{3,8})/gi)]
      .map(match => `--contract-${match[1].toLowerCase()}:${match[2]}`).join(';');
  }
  if (/contract-(cover|body)-footer/.test(className)) {
    const columns = String(style).match(/grid-template-columns\s*:\s*repeat\((\d+),\s*minmax\(0,\s*1fr\)\)/i)?.[1];
    return columns ? `grid-template-columns:repeat(${Math.min(Number(columns), 12)},minmax(0,1fr))` : '';
  }
  return '';
}

function sanitizePage(html) {
  const $ = cheerio.load(String(html || ''), null, false);
  $('script,iframe,object,embed,link,meta,base,form,input,button,video,audio,source').remove();
  $('*').each((_, element) => {
    for (const attribute of [...(element.attribs ? Object.keys(element.attribs) : [])]) {
      if (/^on/i.test(attribute) || attribute === 'srcdoc') $(element).removeAttr(attribute);
    }
    const style = $(element).attr('style');
    if (style) {
      const safeStyle = safeInlineStyle(element, style);
      if (safeStyle) $(element).attr('style', safeStyle);
      else $(element).removeAttr('style');
    }
    const source = $(element).attr('src');
    if (source && !/^(data:image\/|https:\/\/|\/)/i.test(source)) $(element).removeAttr('src');
    const href = $(element).attr('href');
    if (href && !/^https:\/\//i.test(href)) $(element).removeAttr('href');
  });
  return $.html();
}

function restoreAssets(page, assets) {
  return String(page || '').replace(/__BK_PDF_ASSET_(\d+)__/g, (token, value) => assets[Number(value)] || token);
}

function requestOrigin(req) {
  const origin = String(req.headers.origin || '');
  if (/^https:\/\/([a-z0-9-]+\.)*brightkeysolutions\.com$/i.test(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${String(req.headers['x-forwarded-proto'] || 'https').split(',')[0]}://${host}` : 'https://www.brightkeysolutions.com';
}

export async function buildContractPrintHtml(req, pages, assets = []) {
  const [templateCss, onboardingCss] = await Promise.all([
    readFile(resolve('dashboard/hiring/contract-template.css'), 'utf8'),
    readFile(resolve('dashboard/hr-onboarding/hr-onboarding.css'), 'utf8')
  ]);
  const content = pages.map(page => `<section class="hr-contract-pdf-page server-pdf-page">${sanitizePage(restoreAssets(page, assets))}</section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${requestOrigin(req)}/"><link href="https://fonts.googleapis.com/css2?family=Commissioner:wght@400;500;600;700;800&display=swap" rel="stylesheet"><style>${templateCss}\n${onboardingCss}\n@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.server-pdf-page{width:210mm!important;height:297mm!important;overflow:hidden;break-after:page;page-break-after:always}.server-pdf-page:last-child{break-after:auto;page-break-after:auto}.server-pdf-page>.contract-template-preview{width:210mm!important;height:297mm!important}.server-pdf-page .contract-sheet{width:210mm!important;min-height:297mm!important;height:297mm!important;box-shadow:none!important}</style></head><body>${content}</body></html>`;
}

async function executablePath(req) {
  if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH;
  if (process.platform !== 'linux' || !process.env.VERCEL) return CHROME_PATHS.find(existsSync);
  const packUrl = process.env.CHROMIUM_PACK_URL || `${requestOrigin(req)}/chromium-pack.tar`;
  return chromium.executablePath(packUrl);
}

export async function renderContractPdf(req, html) {
  const local = process.platform !== 'linux' || !process.env.VERCEL;
  const chromePath = await executablePath(req);
  if (!chromePath) throw new Error('A compatible Chromium executable is unavailable.');
  const browser = await puppeteer.launch({
    args: local ? [] : await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
    executablePath: chromePath,
    headless: local ? true : 'shell'
  });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => document.fonts?.ready);
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, waitForFonts: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  } finally {
    await browser.close();
  }
}

export default async function handler(req, res) {
  setApiCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const companyId = String(req.body?.company_id || '').trim();
  const employeeId = String(req.body?.employee_id || '').trim();
  const jobPostId = String(req.body?.job_post_id || '').trim();
  const pages = req.body?.pages;
  const assets = Array.isArray(req.body?.assets) ? req.body.assets : [];
  if (![companyId, employeeId, jobPostId].every(value => UUID.test(value)) || !Array.isArray(pages) || !pages.length || pages.length > MAX_PAGES) {
    return res.status(400).json({ error: 'The contract PDF request is incomplete. Refresh the page and try again.' });
  }
  if (assets.length > MAX_ASSETS || assets.some(asset => typeof asset !== 'string' || !/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(asset))) {
    return res.status(400).json({ error: 'The contract contains unsupported embedded media. Refresh the page and try again.' });
  }
  if (Buffer.byteLength(JSON.stringify({ pages, assets }), 'utf8') > MAX_HTML_BYTES) {
    return res.status(413).json({ error: 'This contract is too large to export. Reduce its embedded media and try again.' });
  }

  try {
    const token = getBearerToken(req);
    if (!token) return sendAccessError(res, { error: 'unauthorized' });
    const supabase = createAuthenticatedClient(token);
    const access = await requireCompanyAccess(req, supabase, companyId);
    if (access.error) return sendAccessError(res, access);
    const [{ data: employee, error: employeeError }, { data: settings, error: settingsError }] = await Promise.all([
      supabase.from('employees').select('id,job_post_id,email').eq('id', employeeId).eq('company_id', companyId).maybeSingle(),
      supabase.from('global_settings').select('value').eq('company_id', companyId).eq('key', 'job_contract_documents').maybeSingle()
    ]);
    if (employeeError || settingsError) throw employeeError || settingsError;
    if (!employee || employee.job_post_id !== jobPostId || !settings?.value?.[jobPostId]) {
      return res.status(404).json({ error: 'The assigned contract could not be found. Refresh the page and try again.' });
    }
    const role = String(access.member?.role || '').trim().toLowerCase();
    const modules = (access.member?.accessible_modules || []).map(value => String(value).trim().toLowerCase());
    const canManageContracts = ['owner', 'admin', 'hr'].includes(role) || modules.includes('hr');
    if (!canManageContracts && String(employee.email || '').trim().toLowerCase() !== String(access.user?.email || '').trim().toLowerCase()) {
      return sendAccessError(res, { error: 'forbidden' });
    }

    const pdf = await renderContractPdf(req, await buildContractPrintHtml(req, pages, assets));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(req.body?.filename)}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(pdf));
  } catch (error) {
    console.error('HR contract PDF generation failed:', error);
    return res.status(503).json({ error: 'The contract PDF could not be generated. Please try again.' });
  }
}

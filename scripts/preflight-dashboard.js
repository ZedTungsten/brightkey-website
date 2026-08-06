import 'dotenv/config';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const requireLive = process.argv.includes('--require-live');
const baseUrl = String(process.env.PREFLIGHT_BASE_URL || '').replace(/\/$/, '');
const companyId = process.env.PREFLIGHT_COMPANY_ID;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

async function checkDeployedAssets() {
  if (!baseUrl) {
    if (requireLive) throw new Error('PREFLIGHT_BASE_URL is required for the live preflight.');
    console.log('SKIP deployed assets: PREFLIGHT_BASE_URL is not set.');
    return;
  }

  const checks = [
    ['/js/sidebar.js', 'javascript', 'loadStorageNotice'],
    ['/js/storage-notice.js', 'javascript', 'get_company_storage_notice'],
    ['/dashboard/master-settings/tenants', 'text/html', 'sidebar.js']
  ];
  for (const [pathname, contentType, marker] of checks) {
    const response = await fetch(`${baseUrl}${pathname}`, { redirect: 'follow' });
    const body = await response.text();
    assert.equal(response.ok, true, `${pathname} returned HTTP ${response.status}`);
    assert.match(response.headers.get('content-type') || '', new RegExp(contentType, 'i'), `${pathname} has the wrong content type`);
    assert.equal(body.includes(marker), true, `${pathname} is missing its release marker`);
    console.log(`PASS deployed asset: ${pathname}`);
  }
}

async function checkLiveQuota() {
  if (!supabaseUrl || !serviceKey || !companyId) {
    if (requireLive) throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and PREFLIGHT_COMPANY_ID are required for the live preflight.');
    console.log('SKIP live quota RPC: live credentials or PREFLIGHT_COMPANY_ID are not set.');
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: noticeRows, error: noticeError } = await supabase.rpc('get_company_storage_notice', {
    p_company_id: companyId
  });
  assert.ifError(noticeError);
  const notice = Array.isArray(noticeRows) ? noticeRows[0] : noticeRows;
  assert.ok(['ok', 'almost_full', 'full'].includes(notice?.status), 'Storage notice returned an invalid status.');
  assert.ok(Number(notice?.limit_bytes) > 0, 'Storage notice returned no plan limit.');

  const { data: quotaRows, error: quotaError } = await supabase.rpc('check_company_storage_quota', {
    p_company_id: companyId,
    p_incoming_bytes: Number(notice.limit_bytes) + 1
  });
  assert.ifError(quotaError);
  const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows;
  assert.equal(quota?.allowed, false, 'The quota RPC allowed a file larger than the tenant limit.');
  console.log(`PASS live quota RPC: ${notice.status}, ${notice.used_bytes}/${notice.limit_bytes} bytes`);
}

await checkDeployedAssets();
await checkLiveQuota();
console.log('Dashboard preflight completed.');

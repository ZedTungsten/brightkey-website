import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../dashboard/marketing-media.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../dashboard/marketing-media/marketing-media.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../dashboard/marketing-media/marketing-media.css', import.meta.url), 'utf8');
const sidebar = fs.readFileSync(new URL('../js/sidebar.js', import.meta.url), 'utf8');

test('Marketing Media has Customers tab, search controls, and canonical month navigator', () => {
  assert.match(html, /class="tab-btn active">Customers/);
  assert.match(html, /id="media-search" type="search"/);
  assert.match(html, /id="media-device-filter"/);
  assert.match(html, /All customers and devices/);
  assert.match(script, /option\.textContent = `\$\{row\.customer\} — \$\{row\.orderNo\} — \$\{row\.device\}`/);
  assert.match(html, /id="marketing-media-month-navigator"/);
  assert.match(styles, /\.month-picker button\s*\{[\s\S]*?width:\s*42px;[\s\S]*?height:\s*42px;/);
});

test('Marketing Media queries a bounded company month and separates each device', () => {
  assert.match(script, /\.eq\('company_id', state\.companyId\)/);
  assert.match(script, /\.gte\('scheduled_date', range\.start\)/);
  assert.match(script, /\.lt\('scheduled_date', range\.end\)/);
  assert.match(script, /\.limit\(100\)/);
  assert.match(script, /doors\.map\(\(door, index\) =>/);
  assert.match(script, /Before Installation/);
  assert.match(script, /After Installation/);
});

test('Marketing Media preserves booking and installer media contracts and supports ZIP download', () => {
  assert.match(script, /door\?\.photos/);
  assert.match(script, /door\?\.required_media/);
  assert.match(script, /door\?\.other_media/);
  assert.match(script, /door\?\.media_urls/);
  assert.match(script, /new window\.JSZip\(\)/);
  assert.match(html, /jszip@3\.10\.1/);
  assert.match(sidebar, /href="\/dashboard\/marketing-media"[^>]*>Media<\/a>/);
});

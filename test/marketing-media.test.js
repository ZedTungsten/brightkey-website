import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../dashboard/media/customers/index.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../dashboard/media/media.js', import.meta.url), 'utf8');
const productsScript = fs.readFileSync(new URL('../dashboard/media/products/products.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../dashboard/media/media.css', import.meta.url), 'utf8');
const sidebar = fs.readFileSync(new URL('../js/sidebar.js', import.meta.url), 'utf8');

test('Shared Media has Customers tab, search controls, and canonical month navigator', () => {
  assert.match(html, /class="tab-btn active"[^>]*>Customers/);
  assert.match(html, /id="media-search" type="search"/);
  assert.match(html, /id="media-device-filter"/);
  assert.match(html, /All Customers/);
  assert.match(script, /option\.textContent = `\$\{row\.customer\} — \$\{row\.orderNo\} — \$\{row\.device\}`/);
  assert.match(html, /id="marketing-media-month-navigator"/);
  assert.match(styles, /\.month-picker button\s*\{[\s\S]*?width:\s*42px;[\s\S]*?height:\s*42px;/);
});

test('Shared Media queries a bounded company month and separates each device', () => {
  assert.match(script, /\.rpc\('get_shared_media_bookings'/);
  assert.match(script, /p_company_id: state\.companyId/);
  assert.match(script, /p_start_date: range\.start/);
  assert.match(script, /p_end_date: range\.end/);
  assert.match(script, /p_offset: offset/);
  assert.match(script, /p_limit: BOOKING_BATCH_SIZE/);
  assert.match(script, /doors\.map\(\(door, index\) =>/);
  assert.match(script, /Before Installation/);
  assert.match(script, /After Installation/);
});

test('Shared Media preserves booking and installer media contracts and is linked by Marketing and Sales', () => {
  assert.match(script, /door\?\.photos/);
  assert.match(script, /door\?\.required_media/);
  assert.match(script, /door\?\.other_media/);
  assert.match(script, /door\?\.media_urls/);
  assert.match(script, /new window\.JSZip\(\)/);
  assert.match(script, /jszip@3\.10\.1/);
  assert.equal((sidebar.match(/href="\/dashboard\/media\/customers"/g) || []).length, 2);
  assert.match(sidebar, /title="Shared with other roles"/);
});

test('Shared Media thumbnails show complete centered images without cropping', () => {
  assert.match(styles, /\.media-tile img\s*\{[\s\S]*?object-fit:\s*contain;/);
  assert.match(styles, /object-position:\s*center center;/);
  assert.match(styles, /\.media-tile video\s*\{[\s\S]*?object-fit:\s*cover;/);
});

test('Shared Media permits Marketing or Sales modules without granting Operations access', () => {
  assert.match(script, /checkRoleGate\(\['Marketing', 'Sales'\]/);
  assert.match(productsScript, /checkRoleGate\(\['Marketing', 'Sales'\]/);
  assert.doesNotMatch(script, /checkRoleGate\([^\n]*'Operations'/);
  assert.doesNotMatch(productsScript, /checkRoleGate\([^\n]*'Operations'/);
});

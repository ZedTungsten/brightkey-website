import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const source = resolve('node_modules/@sparticuz/chromium/bin');
const output = resolve('chromium-pack.tar');

if (!existsSync(source)) {
  console.log('Chromium pack source is unavailable; skipping server PDF pack preparation.');
  process.exit(0);
}

const files = readdirSync(source).filter(file => file.endsWith('.br'));
const result = spawnSync('tar', ['-cf', output, '-C', source, ...files], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
console.log(`Prepared Chromium PDF runtime: ${output}`);

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'scripts/module-size-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const maxNewModuleLines = 1000;
const sourceRoots = ['dashboard', 'js'];

function collectJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(absolutePath);
    return entry.isFile() && entry.name.endsWith('.js') ? [absolutePath] : [];
  });
}

function countLines(filePath) {
  const contents = fs.readFileSync(filePath, 'utf8');
  if (!contents) return 0;
  return contents.split(/\r?\n/).length - (contents.endsWith('\n') ? 1 : 0);
}

const failures = [];
const improvements = [];

for (const sourceRoot of sourceRoots) {
  const directory = path.join(root, sourceRoot);
  for (const filePath of collectJavaScriptFiles(directory)) {
    const relativePath = path.relative(root, filePath).split(path.sep).join('/');
    const lines = countLines(filePath);
    const allowedLines = baseline[relativePath] ?? maxNewModuleLines;

    if (lines > allowedLines) {
      failures.push(`${relativePath}: ${lines} lines (maximum ${allowedLines})`);
    } else if (baseline[relativePath] && lines <= maxNewModuleLines) {
      improvements.push(`${relativePath} is now ${lines} lines; remove it from the baseline.`);
    }
  }
}

if (failures.length) {
  console.error('JavaScript module size check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  console.error('\nExtract route-specific features into separate modules and load them only on the routes that use them.');
  process.exit(1);
}

console.log(`JavaScript module size check passed (new-module limit: ${maxNewModuleLines} lines).`);
improvements.forEach((improvement) => console.log(`- ${improvement}`));

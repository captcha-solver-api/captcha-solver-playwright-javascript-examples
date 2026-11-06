import { readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ignoredDirectories = new Set([
  '.git',
  'artifacts',
  'node_modules',
  'playwright-report',
  'test-results'
]);

const files = collectJavaScriptFiles(process.cwd());
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`${files.length} JavaScript files passed syntax validation.`);

function collectJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return ignoredDirectories.has(entry.name) ? [] : collectJavaScriptFiles(path);
      }
      return entry.isFile() && extname(entry.name) === '.js' ? [path] : [];
    })
    .sort();
}

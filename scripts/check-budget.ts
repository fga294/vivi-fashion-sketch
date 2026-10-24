// Checks a build against PLAN.md's budget: the first load (everything in dist/
// except recorded sounds, which load after the first tap) stays under 2 MB.
// Also checks that every file the offline worker keeps is really in dist/.
// Run after `npm run build`: `npm run check:budget`.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

const BUDGET = 2 * 1024 * 1024;
const dist = new URL('../dist/', import.meta.url);

if (!existsSync(new URL('index.html', dist))) {
  console.error('No build found: run `npm run build` first.');
  process.exitCode = 1;
} else {
  const files = readdirSync(dist, { recursive: true })
    .map((f) => f.replaceAll('\\', '/'))
    .filter((f) => statSync(new URL(f, dist)).isFile());
  const sized = files.map((f) => ({ f, size: statSync(new URL(f, dist)).size }));
  const counted = sized.filter(({ f }) => !/^sounds\/(giggles|tada)\//.test(f));
  const total = counted.reduce((n, { size }) => n + size, 0);
  const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`;
  for (const { f, size } of [...counted].sort((a, b) => b.size - a.size).slice(0, 6)) console.log(`  ${kb(size).padStart(9)}  ${f}`);
  console.log(`First load: ${kb(total)} in ${counted.length} files (budget ${kb(BUDGET)}).`);
  if (total > BUDGET) {
    console.error('Over budget.');
    process.exitCode = 1;
  }

  // The offline worker's list: the JSON array it is called with.
  const sw = readFileSync(new URL('sw.js', dist), 'utf8');
  const list = JSON.parse(sw.slice(sw.lastIndexOf(', [') + 2, sw.lastIndexOf(']') + 1)) as string[];
  const missing = list.filter((f) => f !== './' && !files.includes(f));
  if (missing.length > 0) {
    console.error(`The offline worker lists files missing from dist/: ${missing.join(', ')}`);
    process.exitCode = 1;
  } else console.log(`Offline: all ${list.length} files the worker keeps are in dist/.`);
}

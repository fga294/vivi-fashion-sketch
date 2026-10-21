// Validates every plate in public/plates/plates.json against the SVG authoring
// rules and the anatomy grid, then checks every pair that can meet at a seam.
// Run with `npm run check:plates`; the same checks run in tests/unit/plates.test.ts.

import { readFileSync } from 'node:fs';
import { parseManifest } from '../src/art/plates.ts';
import { checkJoins, validatePlate, type PlateReport } from '../src/art/validate.ts';

const platesDir = new URL('../public/plates/', import.meta.url);
const entries = parseManifest(JSON.parse(readFileSync(new URL('plates.json', platesDir), 'utf8')));

const reports: PlateReport[] = entries.map((entry) => {
  let text: string;
  try {
    text = readFileSync(new URL(entry.file, platesDir), 'utf8');
  } catch {
    return { id: entry.id, band: entry.band, errors: [`file not found: public/plates/${entry.file}`], crossings: new Map() };
  }
  return validatePlate(entry, text);
});

let failures = 0;
for (const r of reports) {
  if (r.errors.length === 0) {
    console.log(`  ok    ${r.band.padEnd(7)} ${r.id}`);
  } else {
    failures++;
    console.log(`  FAIL  ${r.band.padEnd(7)} ${r.id}`);
    for (const e of r.errors) console.log(`          - ${e}`);
  }
}

const joins = checkJoins(reports.filter((r) => r.errors.length === 0));
for (const j of joins) console.log(`  JOIN  ${j}`);

const count = (band: string): number => reports.filter((r) => r.band === band).length;
const pairs = count('head') * count('torso') + (count('torso') + count('top')) * count('legs');
console.log(
  `\n${reports.length} plates, ${failures} failing; ${pairs} seam pairings checked, ${joins.length} not joining.`,
);
process.exitCode = failures > 0 || joins.length > 0 ? 1 : 0;

// The `npm run check:plates` checks, as a test: every plate in plates.json follows
// the authoring rules and the anatomy grid, and every pair that can meet joins.

import { describe, expect, it } from 'vitest';
import manifest from '../../public/plates/plates.json';
import { parseManifest } from '../../src/art/plates.ts';
import { checkJoins, validatePlate } from '../../src/art/validate.ts';

const files = import.meta.glob<string>('../../public/plates/**/*.svg', { query: '?raw', import: 'default', eager: true });
const fileFor = (path: string): string | undefined => files[`../../public/plates/${path}`];

const entries = parseManifest(manifest);
const reports = entries.map((e) => {
  const text = fileFor(e.file);
  return text === undefined
    ? { id: e.id, band: e.band, errors: [`missing file ${e.file}`], crossings: new Map<number, number[]>() }
    : validatePlate(e, text);
});

describe('starter plate set', () => {
  it('has the plan’s counts: 6 heads, 6 torsos, 6 legs, 3 tops, 6 patterns', () => {
    const count = (band: string): number => entries.filter((e) => e.band === band).length;
    expect([count('head'), count('torso'), count('legs'), count('top'), count('pattern')]).toEqual([6, 6, 6, 3, 6]);
  });

  it('lists every SVG in public/plates in plates.json', () => {
    const listed = new Set(entries.map((e) => `../../public/plates/${e.file}`));
    expect(Object.keys(files).filter((f) => !listed.has(f))).toEqual([]);
  });

  it.each(reports.map((r) => [r.id, r] as const))('%s passes check:plates', (_id, report) => {
    expect(report.errors).toEqual([]);
  });

  it('joins at the neck and waist in every combination', () => {
    expect(checkJoins(reports)).toEqual([]);
  });
});

// The `npm run check:plates` checks, as a test: every plate in plates.json follows
// the authoring rules and the anatomy grid, and every pair that can meet joins.

import { describe, expect, it } from 'vitest';
import manifest from '../../public/plates/plates.json';
import { polylines } from '../../src/art/geometry.ts';
import { parseManifest, readPlateSvg, type PlateArt } from '../../src/art/plates.ts';
import { checkJoins, validatePlate } from '../../src/art/validate.ts';
import { Regions, wallsFrom } from '../../src/engine/fill.ts';

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

describe('Stay inside: outlines and closed areas', () => {
  const plates = entries.flatMap((e) => {
    const text = fileFor(e.file);
    return text === undefined || e.band === 'pattern' ? [] : [readPlateSvg(e, text)];
  });
  const by = (band: string): PlateArt[] => plates.filter((p) => p.band === band);

  it('reads shapes marked data-detail as details, not outlines', () => {
    const entry = { id: 't', band: 'legs', name: 'T', file: 't.svg' } as const;
    const art = readPlateSvg(
      entry,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 570 600 930"><path d="M1 1 L2 2"/><path d="M3 3 L4 4" data-detail=""/><circle cx="5" cy="5" r="1" data-detail=""/></svg>',
    );
    expect(art.paths).toHaveLength(3);
    expect(art.outlines).toEqual(['M1 1 L2 2']);
  });

  it('marks details on every figure plate (pleats, stripes, features)', () => {
    for (const p of plates) expect(p.outlines.length, p.id).toBeLessThan(p.paths.length);
  });

  // In every combination, the face, the top garment and the bottom garment are each one
  // closed area: nothing leaks to the open sheet, and detail lines don't cut a garment
  // into strips. Minimum areas (square units) sit under the smallest real garment and
  // above a single pleat panel or stripe.
  const SEEDS = [
    { name: 'face', x: 300, y: 160, min: 3000 },
    { name: 'top garment', x: 300, y: 430, min: 8000 },
    { name: 'bottom garment', x: 300, y: 700, min: 20000 },
  ] as const;

  it('keeps every garment one closed area in every combination', () => {
    const grids = new Map(plates.map((p) => [p.id, wallsFrom(p.outlines.flatMap((d) => polylines(d, 1)), 600, 1500)]));
    const combos = [
      ...by('head').flatMap((h) => by('torso').flatMap((t) => by('legs').map((l) => [h, t, l]))),
      ...by('top').flatMap((t) => by('legs').map((l) => [t, l])),
    ];
    expect(combos).toHaveLength(6 * 6 * 6 + 3 * 6);
    const regions = new Regions(600, 1500);
    const walls = new Uint8Array(600 * 1500);
    const problems: string[] = [];
    for (const combo of combos) {
      walls.fill(0);
      for (const p of combo) {
        const g = grids.get(p.id)!;
        for (let i = 0; i < g.length; i++) walls[i] = walls[i]! | g[i]!;
      }
      regions.setWalls(walls);
      for (const seed of SEEDS) {
        const r = regions.regionAt(seed.x, seed.y);
        const where = `${combo.map((p) => p.id).join(' + ')}: ${seed.name}`;
        if (!r || r.open) problems.push(`${where} leaks to the open sheet`);
        else if (r.area < seed.min) problems.push(`${where} is only ${r.area} square units`);
      }
    }
    expect(problems).toEqual([]);
  });
});

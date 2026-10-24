import { describe, expect, it } from 'vitest';
import { COMPLETE_AT, Coverage, REVEALED, SAMPLE_SPACING, samplePath } from '../../src/engine/coverage.ts';
import { grainField, waxAlpha } from '../../src/engine/grain.ts';
import { mulberry32 } from '../../src/engine/random.ts';
import { STAMP_H, STAMP_SPACING, STAMP_W, stampAlpha, strengthFor } from '../../src/engine/rub.ts';
import { StampSpacer } from '../../src/engine/stroke.ts';

const gaps = (pts: { x: number; y: number }[]): number[] =>
  pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y));

describe('samplePath', () => {
  it('samples a line every 6 units, ends included', () => {
    const pts = samplePath('M0 0 L60 0');
    expect(pts.length).toBe(11);
    for (const g of gaps(pts)) expect(g).toBeCloseTo(SAMPLE_SPACING, 5);
  });

  it('follows curves by arc length', () => {
    const pts = samplePath('M100 100 A50 50 0 1 0 200 100 A50 50 0 1 0 100 100 Z');
    expect(pts.length).toBeGreaterThan(50); // circumference ≈ 314
    for (const g of gaps(pts)) expect(g).toBeLessThanOrEqual(SAMPLE_SPACING + 0.01);
  });

  it('gives tiny dots at least one sample', () => {
    expect(samplePath('M300 140 A1.5 1.5 0 1 0 303 140 A1.5 1.5 0 1 0 300 140 Z').length).toBeGreaterThanOrEqual(1);
  });
});

describe('Coverage', () => {
  const line = (x: number): string => `M${x} 100 L${x} 400`;

  it('only reveals samples under the stamp, and only past the threshold', () => {
    const c = new Coverage([{ band: 'torso', paths: [line(300)] }]);
    c.stamp(300, 200, 0, 20, 9, 0.3); // a light touch: below REVEALED
    expect(c.progress(0)).toBe(0);
    c.stamp(300, 200, 0, 20, 9, 0.3); // 1 − 0.7² = 0.51 ≥ 0.45
    expect(REVEALED).toBeLessThan(0.51);
    const hit = c.progress(0);
    expect(hit).toBeGreaterThan(0);
    expect(hit).toBeLessThan(0.1); // a 18-unit stamp covers ~4 of ~51 samples
    c.stamp(500, 200, 0, 20, 9, 1); // nowhere near the line
    expect(c.progress(0)).toBe(hit);
  });

  it('gives the revealed stretches of line as polylines, split at gaps and between subpaths', () => {
    // Two vertical lines in one path (two subpaths), and a third path.
    const c = new Coverage([{ band: 'torso', paths: ['M300 100 L300 400 M320 100 L320 400', line(340)] }]);
    expect(c.revealedLines()).toEqual([]);
    // Rub across all three lines at y 200–260 (long side across them), and once more lower down on the first.
    for (let y = 200; y <= 260; y += 6) c.stamp(320, y, 0, 30, 4, 1);
    c.stamp(300, 340, 0, 5, 5, 1);
    const lines = c.revealedLines();
    expect(lines.map((l) => Math.round(l[0]!.x))).toEqual([300, 300, 320, 340]);
    for (const l of lines.slice(0, 1).concat(lines.slice(2))) {
      expect(l.length).toBeGreaterThanOrEqual(10); // ~60 units at 6-unit spacing
      for (let i = 1; i < l.length; i++) expect(l[i]!.y - l[i - 1]!.y).toBeCloseTo(SAMPLE_SPACING, 3);
    }
    expect(lines[1]!.length).toBeLessThanOrEqual(2); // the lone rub further down
    c.revealAll(0);
    expect(c.revealedLines()).toHaveLength(3); // whole lines once the band finishes
  });

  it('respects stamp rotation', () => {
    const c = new Coverage([{ band: 'legs', paths: [line(300)] }]);
    // Long side along the line (rotation 90°) covers 40 units of it.
    c.stamp(300, 250, Math.PI / 2, 20, 9, 1);
    const along = c.progress(0);
    const d = new Coverage([{ band: 'legs', paths: [line(300)] }]);
    d.stamp(300, 250, 0, 20, 9, 1);
    expect(along).toBeGreaterThan(d.progress(0) * 1.8);
  });

  it('matches a brute-force count for random stamps (the spatial hash misses nothing)', () => {
    const rnd = mulberry32(3);
    const paths = Array.from({ length: 12 }, () => `M${rnd() * 600} ${rnd() * 1500} L${rnd() * 600} ${rnd() * 1500}`);
    const c = new Coverage([{ band: 'top', paths }]);
    const pts = paths.flatMap((d) => samplePath(d));
    const strength = new Float64Array(pts.length);
    for (let k = 0; k < 400; k++) {
      const [x, y, r] = [rnd() * 600, rnd() * 1500, rnd() * Math.PI];
      c.stamp(x, y, r, 20, 9, 0.5);
      pts.forEach((p, i) => {
        const dx = p.x - x;
        const dy = p.y - y;
        if (Math.abs(dx * Math.cos(r) + dy * Math.sin(r)) <= 20 && Math.abs(dy * Math.cos(r) - dx * Math.sin(r)) <= 9) {
          strength[i] = 1 - (1 - strength[i]!) * 0.5;
        }
      });
    }
    const revealed = strength.filter((s) => s >= REVEALED).length;
    expect(c.progress(0)).toBeCloseTo(revealed / pts.length, 10);
  });

  it('tracks bands separately and reports which changed', () => {
    const c = new Coverage([
      { band: 'head', paths: [line(100)] },
      { band: 'legs', paths: [line(500)] },
    ]);
    c.stamp(500, 300, 0, 20, 9, 1);
    const changed: number[] = [];
    c.takeChanged((b) => changed.push(b));
    expect(changed).toEqual([1]);
    c.takeChanged((b) => changed.push(b));
    expect(changed).toEqual([1]);
    c.revealAll(0);
    expect(c.progress(0)).toBe(1);
    expect(COMPLETE_AT).toBe(0.9);
  });
});

describe('StampSpacer', () => {
  const run = (moves: [number, number][]): { x: number; y: number; a: number }[] => {
    const out: { x: number; y: number; a: number }[] = [];
    const sp = new StampSpacer(STAMP_SPACING);
    const push = (x: number, y: number, a: number): number => out.push({ x, y, a });
    sp.begin(...moves[0]!);
    for (const m of moves.slice(1)) sp.moveTo(...m, push);
    sp.end(push);
    return out;
  };

  it('fills one giant jump with evenly spaced stamps (fast scrubs leave no gaps)', () => {
    const s = run([
      [0, 0],
      [400, 0],
    ]);
    expect(s.length).toBe(41);
    for (const g of gaps(s)) expect(g).toBeCloseTo(STAMP_SPACING, 6);
  });

  it('keeps even spacing across many small moves', () => {
    const moves: [number, number][] = Array.from({ length: 200 }, (_, i) => [i * 1.7, Math.sin(i / 9) * 30]);
    const s = run(moves);
    for (const g of gaps(s)) expect(g).toBeLessThanOrEqual(STAMP_SPACING + 1e-6);
    // Stamps cover the whole path: none of it is further than half a spacing from a stamp.
    for (const [x, y] of moves) expect(Math.min(...s.map((p) => Math.hypot(p.x - x, p.y - y)))).toBeLessThanOrEqual(STAMP_SPACING);
  });

  it('turns stamps to the direction of travel', () => {
    expect(run([[0, 0], [0, 50]])[1]!.a).toBeCloseTo(Math.PI / 2);
  });

  it('leaves one stamp for a press without movement', () => {
    expect(run([[10, 10]]).length).toBe(1);
  });
});

describe('crayon strength', () => {
  it('reveals a line in one pass at mouse/touch pressure: one stamp reaches the threshold', () => {
    const a = stampAlpha(strengthFor('touch', 0));
    expect(a).toBeGreaterThanOrEqual(REVEALED);
    // A pass puts one or two stamps on each point (18-unit stamps every 10 units).
    expect(STAMP_H / STAMP_SPACING).toBeCloseTo(1.8);
    expect(1 - (1 - a) ** 2).toBeCloseTo(0.71, 2);
    expect(STAMP_W).toBe(40);
  });

  it('needs more rubbing with a light Apple Pencil touch', () => {
    expect(stampAlpha(strengthFor('pen', 0))).toBeLessThan(REVEALED);
    expect(1 - (1 - stampAlpha(strengthFor('pen', 0))) ** 2).toBeGreaterThan(REVEALED);
  });

  it('maps Apple Pencil pressure to 60–100% and treats mouse and touch as 85%', () => {
    expect(strengthFor('pen', 0)).toBeCloseTo(0.6);
    expect(strengthFor('pen', 1)).toBeCloseTo(1);
    expect(strengthFor('mouse', 0.5)).toBe(0.85);
    expect(stampAlpha(1)).toBeGreaterThan(stampAlpha(0.6));
  });

  it('gets darker with each pass but never past 100%', () => {
    const a = stampAlpha(1);
    let s = 0;
    for (let i = 0; i < 50; i++) s = 1 - (1 - s) * (1 - a);
    expect(s).toBeLessThanOrEqual(1);
    expect(s).toBeGreaterThan(0.99);
  });
});

describe('grain', () => {
  const size = 256;
  const field = grainField(size, 7);

  it('tiles: the right edge flows into the left and the bottom into the top', () => {
    let seam = 0;
    let inside = 0;
    for (let y = 0; y < size; y++) {
      seam += Math.abs(field[y * size]! - field[y * size + size - 1]!);
      inside += Math.abs(field[y * size + 128]! - field[y * size + 127]!);
    }
    expect(seam / size).toBeLessThan((inside / size) * 2.5);
    let seamY = 0;
    for (let x = 0; x < size; x++) seamY += Math.abs(field[x]! - field[(size - 1) * size + x]!);
    expect(seamY / size).toBeLessThan((inside / size) * 2.5);
  });

  it('breaks about an eighth of a wax line and leaves most of it solid', () => {
    const alpha = waxAlpha(field);
    const zero = alpha.filter((a) => a === 0).length / alpha.length;
    const solid = alpha.filter((a) => a === 255).length / alpha.length;
    expect(zero).toBeGreaterThan(0.08);
    expect(zero).toBeLessThan(0.16);
    expect(solid).toBeGreaterThan(0.5);
  });
});

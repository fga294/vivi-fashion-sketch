import { describe, expect, it } from 'vitest';
import type { Point } from '../../src/art/geometry.ts';
import { Regions, wallsFrom } from '../../src/engine/fill.ts';

const W = 60;
const H = 40;

/** A closed rectangle outline, as a polyline with points 1 unit apart. */
function rect(x0: number, y0: number, x1: number, y1: number): Point[] {
  const pts: Point[] = [];
  for (let x = x0; x <= x1; x++) pts.push({ x, y: y0 });
  for (let y = y0; y <= y1; y++) pts.push({ x: x1, y });
  for (let x = x1; x >= x0; x--) pts.push({ x, y: y1 });
  for (let y = y1; y >= y0; y--) pts.push({ x: x0, y });
  return pts;
}

const line = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y1 },
];

function regions(lines: Point[][]): Regions {
  const r = new Regions(W, H);
  r.setWalls(wallsFrom(lines, W, H));
  return r;
}

describe('wallsFrom', () => {
  it('widens lines to 2.5 units either side and marks a dot', () => {
    const walls = wallsFrom([line(10, 20, 50, 20), [{ x: 5, y: 5 }]], W, H);
    const at = (x: number, y: number): number => walls[y * W + x]!;
    expect([at(30, 17), at(30, 18), at(30, 20), at(30, 21)]).toEqual([1, 1, 1, 1]); // centres within 2.5
    expect([at(30, 16), at(30, 23)]).toEqual([0, 0]);
    expect(at(5, 5)).toBe(1);
    expect(at(9, 5)).toBe(0);
  });
});

describe('Regions', () => {
  it('finds a closed area and the open space around it', () => {
    const r = regions([rect(10, 10, 40, 30)]);
    const inside = r.regionAt(25, 20)!;
    expect(inside.open).toBe(false);
    expect([inside.x0, inside.y0, inside.x1, inside.y1]).toEqual([13, 13, 37, 27]);
    expect(r.regionAt(2, 2)!.open).toBe(true);
    expect(r.regionAt(30, 25)).toBe(inside); // filled once, then looked up
  });

  it('closes gaps under 2 units but not wider ones', () => {
    // The box's right side stops short of the bottom: a gap of `gap` units between the strokes' edges.
    const box = (gap: number): Regions =>
      regions([line(10, 10, 40, 10), line(10, 10, 10, 30), line(10, 30, 40, 30), line(40, 10, 40, 30 - 3 - gap)]);
    expect(box(1.5).regionAt(25, 20)!.open).toBe(false);
    expect(box(3).regionAt(25, 20)!.open).toBe(true);
  });

  it('starts from the nearest open cell when a stroke begins on a line', () => {
    const r = regions([rect(10, 10, 40, 30)]);
    expect(r.isWall(10, 20)).toBe(true);
    const nearInside = r.regionAt(12, 20)!;
    expect(nearInside.open).toBe(false);
    const nearOutside = r.regionAt(8, 20)!;
    expect(nearOutside.open).toBe(true);
    // Nothing open within reach: no region.
    const solid = new Regions(W, H);
    solid.setWalls(new Uint8Array(W * H).fill(1));
    expect(solid.regionAt(30, 20)).toBeNull();
  });

  it('paints a mask grown into the walls, never into the neighbouring area', () => {
    // Two boxes sharing the wall at x = 30 (cells 27–32 are wall).
    const r = regions([rect(10, 10, 50, 30), line(30, 10, 30, 30)]);
    const left = r.regionAt(20, 20)!;
    const right = r.regionAt(40, 20)!;
    expect(right.id).not.toBe(left.id);
    const mask = (grow: number): ((x: number, y: number) => number) => {
      const bw = left.x1 - left.x0 + grow * 2;
      const data = new Uint8ClampedArray(bw * (left.y1 - left.y0 + grow * 2) * 4);
      r.paintMask(left, data, grow);
      return (x, y) => data[((y - (left.y0 - grow)) * bw + (x - (left.x0 - grow))) * 4 + 3]!;
    };
    const one = mask(1);
    expect(one(20, 20)).toBe(255);
    expect(left.x1).toBe(27);
    expect(one(27, 20)).toBe(255); // one cell into the shared wall
    expect(one(26, left.y0 - 1)).toBe(255); // and into the top wall
    // Grown further than the wall is thick, it still stops at the next area.
    const far = mask(8);
    expect(far(32, 20)).toBe(255);
    expect(far(34, 20)).toBe(0);
  });

  it('forgets every area when the walls change', () => {
    const r = regions([rect(10, 10, 40, 30)]);
    const before = r.regionAt(25, 20)!;
    r.setWalls(wallsFrom([], W, H));
    const after = r.regionAt(25, 20)!;
    expect(after.open).toBe(true);
    expect(after).not.toBe(before);
  });
});

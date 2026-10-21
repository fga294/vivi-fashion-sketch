import { describe, expect, it } from 'vitest';
import { parsePath, polylines, shapeToPathData, type Point } from '../../src/art/geometry.ts';
import { parseXml } from '../../src/art/svg.ts';

const ends = (d: string): Point[] => parsePath(d).flatMap((s) => s.segments.map((g) => g.to));

describe('parsePath', () => {
  it('reads absolute and relative lines, H, V and Z', () => {
    const [sub] = parsePath('M10 10 L20 10 h5 v5 l-5 5 Z');
    expect(sub!.closed).toBe(true);
    expect(sub!.segments.map((s) => s.to)).toEqual([
      { x: 20, y: 10 },
      { x: 25, y: 10 },
      { x: 25, y: 15 },
      { x: 20, y: 20 },
      { x: 10, y: 10 },
    ]);
  });

  it('treats extra pairs after M as line-tos', () => {
    expect(ends('M0 0 10 0 10 10')).toEqual([
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it('reflects the previous control point for S', () => {
    const segs = parsePath('M0 0 C0 10 10 10 10 0 S20 -10 20 0')[0]!.segments;
    expect(segs[1]!.c1).toEqual({ x: 10, y: -10 });
  });

  it('converts quadratics to cubics with the same ends', () => {
    const s = parsePath('M0 0 Q10 20 20 0')[0]!.segments[0]!;
    expect(s.to).toEqual({ x: 20, y: 0 });
    expect(s.c1!.y).toBeCloseTo(40 / 3);
  });

  it('turns arcs into cubics that stay on the circle', () => {
    const pts = polylines('M0 0 A10 10 0 0 1 20 0', 0.25)[0]!;
    for (const p of pts) expect(Math.hypot(p.x - 10, p.y)).toBeCloseTo(10, 1);
    expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(-10, 1); // sweep 1 goes over the top
  });

  it('reads compact arc flags', () => {
    expect(ends('M0 0a5 5 0 0110 0').at(-1)).toEqual({ x: 10, y: 0 });
  });

  it('rejects unknown commands', () => {
    expect(() => parsePath('M0 0 X10 10')).toThrow(/Unknown path command/);
  });
});

describe('shapeToPathData', () => {
  it('turns a circle into a closed loop at its radius', () => {
    const d = shapeToPathData('circle', { cx: '50', cy: '40', r: '12' })!;
    const pts = polylines(d, 0.5)[0]!;
    for (const p of pts) expect(Math.hypot(p.x - 50, p.y - 40)).toBeCloseTo(12, 1);
  });

  it('handles line, polyline, polygon and rect', () => {
    expect(ends(shapeToPathData('line', { x1: '1', y1: '2', x2: '3', y2: '4' })!)).toEqual([{ x: 3, y: 4 }]);
    expect(ends(shapeToPathData('polyline', { points: '0,0 5,0 5,5' })!).length).toBe(2);
    expect(parsePath(shapeToPathData('polygon', { points: '0 0 5 0 5 5' })!)[0]!.closed).toBe(true);
    expect(ends(shapeToPathData('rect', { x: '0', y: '0', width: '4', height: '2' })!).length).toBe(4);
  });

  it('ignores non-shapes', () => {
    expect(shapeToPathData('title', {})).toBeNull();
  });
});

describe('polylines', () => {
  it('keeps points at most one step apart on lines', () => {
    const pts = polylines('M0 0 L10 0', 0.5)[0]!;
    expect(pts.length).toBe(21);
  });
});

describe('parseXml', () => {
  it('reads nested elements, attributes, text and entities', () => {
    const root = parseXml(
      '<?xml version="1.0"?><!-- c --><svg a="1" b=\'x &amp; y\'><title>Hi &lt;3</title><g><path d="M0 0"/></g></svg>',
    );
    expect(root.name).toBe('svg');
    expect(root.attrs).toEqual({ a: '1', b: 'x & y' });
    expect(root.children[0]!.text).toBe('Hi <3');
    expect(root.children[1]!.children[0]!.attrs['d']).toBe('M0 0');
  });

  it('rejects malformed markup', () => {
    expect(() => parseXml('<svg><g></svg>')).toThrow();
    expect(() => parseXml('<svg a="1" a="2"/>')).toThrow(/duplicate/);
    expect(() => parseXml('<svg>')).toThrow(/Unclosed/);
  });
});

import { describe, expect, it } from 'vitest';
import { tipPath } from '../../src/fx/cursor.ts';
import { Bounds, Crumbs, Glints } from '../../src/fx/particles.ts';
import { MAX_TILT, reversed, springStep, tiltFor, type Spring } from '../../src/fx/spring.ts';

describe('Crumbs', () => {
  it('never holds more than 120', () => {
    const c = new Crumbs();
    let spawned = 0;
    for (let i = 0; i < 500; i++) if (c.spawn(0, 0, 0, 0, 3)) spawned++;
    expect(spawned).toBe(Crumbs.CAP);
    expect(c.count).toBe(120);
  });

  it('pops up, falls under gravity and is gone after 600 ms', () => {
    const c = new Crumbs();
    c.spawn(100, 100, 0, -0.1, 3);
    c.update(16);
    expect(c.y[0]).toBeLessThan(100); // up first
    for (let t = 16; t < 560; t += 16) c.update(16);
    expect(c.y[0]).toBeGreaterThan(100); // then down past where it started
    c.update(100);
    expect(c.count).toBe(0);
  });

  it('keeps the live ones packed when one dies', () => {
    const c = new Crumbs();
    c.spawn(1, 0, 0, 0, 2);
    c.update(300);
    c.spawn(2, 0, 0, 0, 2);
    c.update(350); // the first dies, the second lives
    expect(c.count).toBe(1);
    expect(c.x[0]).toBe(2);
  });
});

describe('Glints', () => {
  it('caps at 60 and each lasts 350 ms', () => {
    const g = new Glints();
    for (let i = 0; i < 100; i++) g.spawn(i, i, i % 2 === 0);
    expect(g.count).toBe(Glints.CAP);
    g.update(349);
    expect(g.count).toBe(60);
    g.update(2);
    expect(g.count).toBe(0);
  });
});

describe('Bounds', () => {
  it('grows to cover what was drawn and resets', () => {
    const b = new Bounds();
    expect(b.empty).toBe(true);
    b.add(10, 20, 2);
    b.add(50, 5, 1);
    expect([b.x0, b.y0, b.x1, b.y1]).toEqual([8, 4, 51, 22]);
    const c = new Bounds();
    c.copy(b);
    b.reset();
    expect(b.empty).toBe(true);
    expect(c.empty).toBe(false);
  });
});

describe('cursor spring', () => {
  it('follows the pointer quickly with a little overshoot, then settles', () => {
    const s: Spring = { x: 0, y: 0, vx: 0, vy: 0 };
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      springStep(s, 100, 0);
      peak = Math.max(peak, s.x);
    }
    expect(s.x).toBeCloseTo(100, 1);
    // PLAN.md's 0.35 / 0.7 overshoots a sudden 100 px jump by about a third: the lively wiggle.
    expect(peak).toBeGreaterThan(120);
    expect(peak).toBeLessThan(140);
  });

  it('leans up to 25° into horizontal motion', () => {
    expect(tiltFor(0)).toBe(0);
    expect(tiltFor(5)).toBeGreaterThan(0);
    expect(tiltFor(-5)).toBeLessThan(0);
    expect(tiltFor(500)).toBe(MAX_TILT);
    expect(tiltFor(-500)).toBe(-MAX_TILT);
  });

  it('notices a change of scrub direction, but not jitter', () => {
    expect(reversed(6, -4)).toBe(true);
    expect(reversed(6, 4)).toBe(false);
    expect(reversed(0.5, -0.5)).toBe(false);
  });

  it('wears the crayon tip from pointed to blunt', () => {
    const apex = (d: string): number => Number(/L([\d.]+) /.exec(d)![1]);
    expect(apex(tipPath(0))).toBe(4);
    expect(apex(tipPath(1))).toBe(12);
    expect(apex(tipPath(5))).toBe(12);
  });
});

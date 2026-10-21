import { describe, expect, it, vi } from 'vitest';
import type { PlateBand } from '../../src/art/bands.ts';
import type { PlateArt, PlateKind } from '../../src/art/plates.ts';
import { Bus, Game, placeInFrame, removeFromFrame, stepIndex, type FigurePlate } from '../../src/state.ts';

const plate = (band: PlateKind, n = 1): PlateArt => ({
  id: `${band}-${n}`,
  band,
  name: `${band} ${n}`,
  file: `${band}/${n}.svg`,
  title: `${band} ${n}`,
  viewBox: '',
  paths: [],
});
const fig = (band: PlateBand, n = 1): FigurePlate => plate(band, n) as FigurePlate;
const ids = (slots: object): string[] => Object.values(slots).map((p: PlateArt) => p.id).sort();

describe('placeInFrame', () => {
  it('fills empty bands', () => {
    const { slots, removed } = placeInFrame({}, fig('legs'));
    expect(ids(slots)).toEqual(['legs-1']);
    expect(removed).toEqual([]);
  });

  it('swaps the plate already in that band', () => {
    const { slots, removed } = placeInFrame({ head: fig('head', 1) }, fig('head', 2));
    expect(ids(slots)).toEqual(['head-2']);
    expect(removed.map((p) => p.id)).toEqual(['head-1']);
  });

  it('lets a top plate replace both head and torso, keeping the legs', () => {
    const { slots, removed } = placeInFrame({ head: fig('head'), torso: fig('torso'), legs: fig('legs') }, fig('top'));
    expect(ids(slots)).toEqual(['legs-1', 'top-1']);
    expect(removed.map((p) => p.id).sort()).toEqual(['head-1', 'torso-1']);
  });

  it('takes the top plate out when a head or torso goes in', () => {
    const { slots, removed } = placeInFrame({ top: fig('top'), legs: fig('legs') }, fig('torso'));
    expect(ids(slots)).toEqual(['legs-1', 'torso-1']);
    expect(removed.map((p) => p.id)).toEqual(['top-1']);
  });

  it('treats placing the same plate again as no change', () => {
    const head = fig('head');
    expect(placeInFrame({ head }, head).removed).toEqual([]);
  });
});

describe('removeFromFrame', () => {
  it('empties a band and leaves the others', () => {
    const { slots, removed } = removeFromFrame({ head: fig('head'), legs: fig('legs') }, 'head');
    expect(ids(slots)).toEqual(['legs-1']);
    expect(removed.map((p) => p.id)).toEqual(['head-1']);
  });
});

describe('stepIndex', () => {
  it('wraps both ways, like cycling a pile of plates', () => {
    expect(stepIndex(0, 1, 6)).toBe(1);
    expect(stepIndex(5, 1, 6)).toBe(0);
    expect(stepIndex(0, -1, 6)).toBe(5);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});

describe('Bus', () => {
  it('delivers events to subscribers until they unsubscribe', () => {
    const bus = new Bus<{ ping: number }>();
    const fn = vi.fn();
    const off = bus.on('ping', fn);
    bus.emit('ping', 1);
    off();
    bus.emit('ping', 2);
    expect(fn).toHaveBeenCalledExactlyOnceWith(1);
  });
});

describe('Game', () => {
  const game = (): Game =>
    new Game([plate('head', 1), plate('head', 2), plate('torso'), plate('legs'), plate('top'), plate('pattern')]);

  it('groups plates into stacks and flips through them', () => {
    const g = game();
    const flips = vi.fn();
    g.bus.on('plate:flip', flips);
    expect(g.topOf('head')!.id).toBe('head-1');
    expect(g.flip('head', 1)!.id).toBe('head-2');
    expect(g.flip('head', 1)!.id).toBe('head-1');
    expect(flips).toHaveBeenCalledTimes(2);
  });

  it('places figure plates but not pattern plates', () => {
    const g = game();
    expect(g.place(g.topOf('pattern')!)).toBeNull();
    g.place(g.topOf('head')!);
    g.place(g.topOf('top')!);
    expect(ids(g.slots)).toEqual(['top-1']);
  });

  it('locks the plates while the paper is down', () => {
    const g = game();
    g.place(g.topOf('legs')!);
    g.phase = 'paperDown';
    expect(g.place(g.topOf('head')!)).toBeNull();
    expect(g.remove('legs')).toBeUndefined();
    g.phase = 'paperLifted';
    expect(g.remove('legs')!.id).toBe('legs-1');
  });
});

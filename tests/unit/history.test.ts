import { describe, expect, it } from 'vitest';
import { History, TILE, type TileStore } from '../../src/engine/history.ts';

const W = 300; // 3 tiles across (the last one 44 px wide)
const H = 260;

/** Layers as plain pixel arrays, so actions can be checked exactly. */
function fakeSheet() {
  const layers = new Map<string, Int32Array>([
    ['colour', new Int32Array(W * H)],
    ['pattern', new Int32Array(W * H)],
  ]);
  let captures = 0;
  const store: TileStore<Int32Array> = {
    capture(layer, x, y, w, h) {
      captures++;
      const px = layers.get(layer)!;
      const out = new Int32Array(w * h);
      for (let r = 0; r < h; r++) out.set(px.subarray((y + r) * W + x, (y + r) * W + x + w), r * w);
      return out;
    },
    restore(layer, x, y, w, h, tile) {
      const px = layers.get(layer)!;
      for (let r = 0; r < h; r++) px.set(tile.subarray(r * w, r * w + w), (y + r) * W + x);
    },
  };
  /** Paint a rectangle, telling the history first, as the engines do. */
  const paint = (history: History<Int32Array>, layer: string, x0: number, y0: number, x1: number, y1: number, value: number): void => {
    history.touch(layer, x0, y0, x1, y1);
    const px = layers.get(layer)!;
    for (let y = y0; y < y1; y++) px.fill(value, y * W + x0, y * W + x1);
  };
  const snapshot = (): string => [...layers.values()].map((px) => px.join(',')).join('|');
  return { layers, store, paint, snapshot, captures: () => captures };
}

describe('History', () => {
  it('undoes and redoes exactly what an action drew', () => {
    const sheet = fakeSheet();
    const h = new History(sheet.store, W, H);
    const blank = sheet.snapshot();
    h.begin();
    sheet.paint(h, 'colour', 10, 10, 200, 40, 7);
    sheet.paint(h, 'colour', 150, 20, 290, 250, 8); // overlaps the first rectangle and new tiles
    expect(h.commit()).toBe(true);
    const drawn = sheet.snapshot();
    expect(h.undo()).toBe(true);
    expect(sheet.snapshot()).toBe(blank);
    expect(h.canRedo).toBe(true);
    expect(h.redo()).toBe(true);
    expect(sheet.snapshot()).toBe(drawn);
  });

  it('saves each tile once per action, however often it is drawn on', () => {
    const sheet = fakeSheet();
    const h = new History(sheet.store, W, H);
    h.begin();
    for (let i = 0; i < 20; i++) sheet.paint(h, 'colour', 5 + i, 5, 30 + i, 30, i);
    h.commit();
    expect(sheet.captures()).toBe(1);
    expect(TILE).toBe(128);
  });

  it('keeps 30 steps: the 31st action pushes the first out', () => {
    const sheet = fakeSheet();
    const h = new History(sheet.store, W, H);
    for (let i = 1; i <= 31; i++) {
      h.begin();
      sheet.paint(h, 'colour', i, i, i + 3, i + 3, i);
      h.commit();
    }
    expect(h.steps).toBe(30);
    let undone = 0;
    while (h.undo()) undone++;
    expect(undone).toBe(30);
    // The first stroke stays; everything after it is gone.
    const px = sheet.layers.get('colour')!;
    expect(px[1 * W + 1]).toBe(1);
    expect(px[2 * W + 4]).toBe(0);
    expect(px[31 * W + 31]).toBe(0);
  });

  it('a new action clears redo, an empty one is dropped, and abort puts pixels back', () => {
    const sheet = fakeSheet();
    const h = new History(sheet.store, W, H);
    h.begin();
    sheet.paint(h, 'colour', 0, 0, 50, 50, 1);
    h.commit();
    h.undo();
    h.begin();
    expect(h.commit()).toBe(false); // nothing drawn: Redo survives
    expect(h.canRedo).toBe(true);
    const before = sheet.snapshot();
    h.begin();
    sheet.paint(h, 'pattern', 100, 100, 260, 200, 5);
    h.abort();
    expect(sheet.snapshot()).toBe(before);
    expect(h.canUndo).toBe(false);
    h.begin();
    sheet.paint(h, 'colour', 60, 60, 70, 70, 2);
    h.commit();
    expect(h.canRedo).toBe(false);
  });

  it('touches nothing while not recording, and tells listeners about changes', () => {
    const sheet = fakeSheet();
    const h = new History(sheet.store, W, H);
    const changes: string[] = [];
    h.onChange = () => changes.push(`${h.canUndo}/${h.canRedo}`);
    sheet.paint(h, 'colour', 0, 0, 10, 10, 1);
    expect(sheet.captures()).toBe(0);
    h.begin();
    sheet.paint(h, 'colour', 0, 0, 10, 10, 2);
    h.commit();
    h.undo();
    h.redo();
    h.clear();
    expect(changes).toEqual(['true/false', 'false/true', 'true/false', 'false/false']);
  });

  it('forgets the oldest steps when saved tiles grow past the budget', () => {
    const sheet = fakeSheet();
    const h = new History(sheet.store, W, H, { tiles: 7 });
    for (let i = 0; i < 3; i++) {
      h.begin();
      sheet.paint(h, 'colour', 0, 0, W, H, i + 1); // 3 × 3 = 9 tiles a time, so only the latest fits
      h.commit();
    }
    expect(h.steps).toBe(1);
    h.undo();
    expect(sheet.layers.get('colour')![0]).toBe(2);
  });
});

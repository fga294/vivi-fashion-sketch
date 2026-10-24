// Undo and redo for colouring (PLAN.md: 30 steps, dirty-rectangle snapshots per
// action). Each layer is cut into 128 px tiles; the first time an action is about
// to draw on a tile, the tile's current pixels are saved. Undo swaps the saved
// tiles with what is there now (so the same tiles serve redo), which restores
// exactly what the action changed, however long and wiggly the stroke.
//
// Rubbing the figure's lines is not an action: wax lines stay, as on the toy, and
// a band that has giggled can't un-giggle. Pencil strokes, Magic fills, eraser
// strokes and pattern strokes are.

import type { LayerName, Sheet } from './sheet.ts';

/** Saves and restores rectangles of a layer; the game's store copies canvases. */
export interface TileStore<T> {
  capture(layer: string, x: number, y: number, w: number, h: number): T;
  restore(layer: string, x: number, y: number, w: number, h: number, tile: T): void;
}

export const TILE = 128;
export const MAX_STEPS = 30;
/** Saved tiles across all steps; beyond this the oldest steps are forgotten (a full sheet is ~250 tiles). */
export const MAX_TILES = 1500;

interface Saved<T> {
  readonly layer: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  data: T;
}

type Action<T> = Saved<T>[];

export class History<T> {
  /** Called whenever what Undo and Redo can do changes. */
  onChange: (() => void) | null = null;
  private readonly store: TileStore<T>;
  private readonly width: number;
  private readonly height: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly maxSteps: number;
  private readonly maxTiles: number;
  private readonly done: Action<T>[] = [];
  private readonly undone: Action<T>[] = [];
  private current: Action<T> | null = null;
  /** Tiles already saved by the current action, as layer:index. */
  private readonly seen = new Set<string>();

  /** `width` and `height` are the layers' size in pixels. */
  constructor(store: TileStore<T>, width: number, height: number, { steps = MAX_STEPS, tiles = MAX_TILES } = {}) {
    this.store = store;
    this.width = width;
    this.height = height;
    this.cols = Math.ceil(width / TILE);
    this.rows = Math.ceil(height / TILE);
    this.maxSteps = steps;
    this.maxTiles = tiles;
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  get steps(): number {
    return this.done.length;
  }

  /** Whether an action is being recorded. */
  get recording(): boolean {
    return this.current !== null;
  }

  /** Start recording an action (a stroke or a fill). */
  begin(): void {
    if (this.current) this.commit();
    this.current = [];
    this.seen.clear();
  }

  /**
   * About to draw on `layer` within pixels x0 ≤ x < x1, y0 ≤ y < y1: save the tiles
   * there that this action hasn't touched yet. Does nothing when not recording.
   */
  touch(layer: string, x0: number, y0: number, x1: number, y1: number): void {
    const action = this.current;
    if (!action) return;
    const c0 = Math.max(0, Math.floor(x0 / TILE));
    const c1 = Math.min(this.cols - 1, Math.floor((x1 - 1) / TILE));
    const r0 = Math.max(0, Math.floor(y0 / TILE));
    const r1 = Math.min(this.rows - 1, Math.floor((y1 - 1) / TILE));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const key = `${layer}:${r * this.cols + c}`;
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        const x = c * TILE;
        const y = r * TILE;
        const w = Math.min(TILE, this.width - x);
        const h = Math.min(TILE, this.height - y);
        action.push({ layer, x, y, w, h, data: this.store.capture(layer, x, y, w, h) });
      }
    }
  }

  /** Finish the action. An action that drew nothing is dropped. Starting anew clears Redo. */
  commit(): boolean {
    const action = this.current;
    this.current = null;
    this.seen.clear();
    if (!action || action.length === 0) return false;
    this.done.push(action);
    this.undone.length = 0;
    // Keep at most 30 steps, and forget the oldest if the saved tiles grow too many.
    let tiles = this.done.reduce((n, a) => n + a.length, 0);
    while (this.done.length > this.maxSteps || (tiles > this.maxTiles && this.done.length > 1)) tiles -= this.done.shift()!.length;
    this.onChange?.();
    return true;
  }

  /** Throw the current action away, putting back everything it drew. */
  abort(): void {
    const action = this.current;
    this.current = null;
    this.seen.clear();
    if (!action) return;
    for (let i = action.length - 1; i >= 0; i--) {
      const t = action[i]!;
      this.store.restore(t.layer, t.x, t.y, t.w, t.h, t.data);
    }
  }

  undo(): boolean {
    if (this.current) this.commit();
    const action = this.done.pop();
    if (!action) return false;
    this.swap(action);
    this.undone.push(action);
    this.onChange?.();
    return true;
  }

  redo(): boolean {
    if (this.current) this.commit();
    const action = this.undone.pop();
    if (!action) return false;
    this.swap(action);
    this.done.push(action);
    this.onChange?.();
    return true;
  }

  /** Forget everything, e.g. for a new sheet. */
  clear(): void {
    this.current = null;
    this.seen.clear();
    const had = this.done.length + this.undone.length > 0;
    this.done.length = 0;
    this.undone.length = 0;
    if (had) this.onChange?.();
  }

  /** Put an action's saved tiles back, keeping what was there for the way back. */
  private swap(action: Action<T>): void {
    for (const t of action) {
      const now = this.store.capture(t.layer, t.x, t.y, t.w, t.h);
      this.store.restore(t.layer, t.x, t.y, t.w, t.h, t.data);
      t.data = now;
    }
  }
}

type Tile = OffscreenCanvas | HTMLCanvasElement;

/** Tiles kept as small canvases, copied on the GPU: no pixels are read back. */
export function sheetTileStore(sheet: Sheet): TileStore<Tile> {
  return {
    capture(layer, x, y, w, h) {
      const tile = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
      const ctx = tile.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
      ctx.drawImage(sheet.canvas(layer as LayerName), x, y, w, h, 0, 0, w, h);
      return tile;
    },
    restore(layer, x, y, w, h, tile) {
      const ctx = sheet.layer(layer as LayerName);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(x, y, w, h);
      ctx.drawImage(tile, x, y);
    },
  };
}

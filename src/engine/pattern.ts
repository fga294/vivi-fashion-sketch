// Pattern plates: the texture tile the crayon reveals, and "Stay inside", which
// clips a pattern stroke to the closed area of the outfit where it started.

import { PATTERN_TILE, SHEET } from '../art/bands.ts';
import { polylines, type Point } from '../art/geometry.ts';
import type { PlateArt } from '../art/plates.ts';
import { Regions, wallsFrom } from './fill.ts';

const LINE_WIDTH = 3;
/** Wall polylines are sampled this often (units); the cells are one unit. */
const WALL_STEP = 1;

function canvas2d(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c.getContext('2d')!;
}

function strokePaths(ctx: CanvasRenderingContext2D, paths: readonly string[]): void {
  for (const d of paths) ctx.stroke(new Path2D(d));
}

/**
 * One pattern tile in backing pixels, ready for createPattern(). The tile is
 * drawn with its eight neighbours' copies too, so strokes crossing an edge carry
 * over to the next tile. Its size is rounded to whole pixels so tiles abut exactly.
 */
export function patternTile(plate: PlateArt, scale: number): HTMLCanvasElement {
  const n = Math.max(1, Math.round(PATTERN_TILE * scale));
  const ctx = canvas2d(n, n);
  const k = n / PATTERN_TILE;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000';
  for (let ty = -1; ty <= 1; ty++) {
    for (let tx = -1; tx <= 1; tx++) {
      ctx.setTransform(k, 0, 0, k, tx * n, ty * n);
      strokePaths(ctx, plate.paths);
    }
  }
  return ctx.canvas;
}

/** A closed area's mask, at one pixel per sheet unit, placed in sheet units. */
export interface RegionClip {
  readonly image: CanvasImageSource;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The area in square units, for tests and tuning. */
  readonly area: number;
}

/**
 * The walls are every line on this sheet: the plates in the frame now, plus the
 * plates rubbed under earlier placements of the same sheet. The grid is one cell
 * per sheet unit (600 × 1500), rasterised once per change and only when needed.
 */
export class StayInside {
  private readonly regions = new Regions(SHEET.width, SHEET.height);
  private readonly clips = new Map<number, RegionClip>();
  /** Each plate's outlines as polylines, kept across paper placements. */
  private readonly parsed = new WeakMap<readonly string[], Point[][]>();
  private lines: readonly (readonly string[])[] = [];
  private stale = true;
  /** The "Stay inside" setting: off, pattern strokes go wherever the crayon goes. */
  enabled = true;

  /** The path lists whose lines make the walls. */
  setLines(lines: readonly (readonly string[])[]): void {
    this.lines = lines;
    this.stale = true;
    for (const clip of this.clips.values()) if (clip.image instanceof ImageBitmap) clip.image.close();
    this.clips.clear();
  }

  /** Rasterise the walls now, e.g. while the paper slides in, so the first stroke doesn't wait. */
  prepare(): void {
    if (!this.stale) return;
    this.stale = false;
    const lines = this.lines.flatMap((paths) => {
      let pl = this.parsed.get(paths);
      if (!pl) this.parsed.set(paths, (pl = paths.flatMap((d) => polylines(d, WALL_STEP))));
      return pl;
    });
    this.regions.setWalls(wallsFrom(lines, SHEET.width, SHEET.height));
  }

  /** The clip for a stroke starting at (x, y) in sheet units, or null outside every closed area. */
  clipAt(x: number, y: number): RegionClip | null {
    if (!this.enabled) return null;
    this.prepare();
    const region = this.regions.regionAt(x, y);
    if (!region || region.open) return null;
    let clip = this.clips.get(region.id);
    if (!clip) {
      const grow = 1;
      const w = region.x1 - region.x0 + grow * 2;
      const h = region.y1 - region.y0 + grow * 2;
      const img = new ImageData(w, h);
      this.regions.paintMask(region, img.data, grow);
      // An immutable ImageBitmap where possible: drawing from a canvas snapshots it on every draw.
      const offscreen = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : null;
      const canvas = offscreen ?? canvas2d(w, h).canvas;
      (canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).putImageData(img, 0, 0);
      const image = offscreen ? offscreen.transferToImageBitmap() : canvas;
      clip = { image, x: region.x0 - grow, y: region.y0 - grow, w, h, area: region.area };
      this.clips.set(region.id, clip);
    }
    return clip;
  }
}

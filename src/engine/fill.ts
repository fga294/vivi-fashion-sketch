// Closed areas of the drawing, for "Stay inside" (and Magic fill in phase 7).
// The plates' lines are rasterised into a coarse wall grid; a region is the set
// of open cells reachable from a point without crossing a wall (4-connected).
// Regions are flood-filled on first use and cached until the walls change, so a
// stroke that starts in an area already found costs one array lookup.

import type { Point } from '../art/geometry.ts';

/**
 * Walls are the 3-unit lines widened by a unit each side: a cell whose centre
 * lies within this distance of a line blocks the fill, so gaps under 2 units close.
 */
export const WALL_RADIUS = 2.5;

/**
 * Rasterise polylines (sheet units) into a wall grid of one cell per unit. Plain
 * arithmetic rather than a canvas, so the game and the Node tests see exactly
 * the same walls and nothing is read back from the GPU.
 */
export function wallsFrom(lines: readonly (readonly Point[])[], width: number, height: number, radius = WALL_RADIUS): Uint8Array {
  const walls = new Uint8Array(width * height);
  const r2 = radius * radius;
  for (const line of lines) {
    for (let k = 0, n = Math.max(1, line.length - 1); k < n && line[k]; k++) {
      const a = line[k]!;
      const b = line[k + 1] ?? a; // a lone point (a dot) still makes a wall
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - radius - 0.5));
      const x1 = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x) + radius - 0.5));
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - radius - 0.5));
      const y1 = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y) + radius - 0.5));
      for (let y = y0; y <= y1; y++) {
        const cy = y + 0.5;
        for (let x = x0; x <= x1; x++) {
          const i = y * width + x;
          if (walls[i]) continue;
          const cx = x + 0.5;
          const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((cx - a.x) * dx + (cy - a.y) * dy) / len2));
          const ex = a.x + dx * t - cx;
          const ey = a.y + dy * t - cy;
          if (ex * ex + ey * ey <= r2) walls[i] = 1;
        }
      }
    }
  }
  return walls;
}

export interface Region {
  readonly id: number;
  /** Bounding box in grid cells: x0 ≤ x < x1, y0 ≤ y < y1. */
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly area: number;
  /**
   * Reaches the edge of the grid: open space around the figure, not a closed area.
   * An open region's fill stops as soon as it knows, so its box and area are partial.
   */
  readonly open: boolean;
}

export class Regions {
  readonly width: number;
  readonly height: number;
  private walls: Uint8Array;
  /** Region id per cell (index + 1 into `found`); 0 until filled. Walls are never labelled. */
  private readonly labels: Int32Array;
  private readonly found: Region[] = [];
  private readonly stack: number[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.walls = new Uint8Array(width * height);
    this.labels = new Int32Array(width * height);
  }

  /** Replace the walls (non-zero = wall, row-major) and forget every region. */
  setWalls(walls: Uint8Array): void {
    if (walls.length !== this.width * this.height) throw new Error('Regions: wall grid is the wrong size');
    this.walls = walls;
    this.labels.fill(0);
    this.found.length = 0;
  }

  isWall(x: number, y: number): boolean {
    return this.walls[y * this.width + x] !== 0;
  }

  /**
   * The region containing cell (x, y), filled on first use. A point on a wall
   * takes the nearest open cell within `reach` cells; null if there is none.
   */
  regionAt(x: number, y: number, reach = 4): Region | null {
    const cell = this.nearestOpen(Math.round(x), Math.round(y), reach);
    if (cell < 0) return null;
    const label = this.labels[cell]!;
    return label > 0 ? this.found[label - 1]! : this.fill(cell);
  }

  /**
   * Write a region's mask into `out`, an RGBA buffer of its bounding box grown by
   * `grow` cells on every side: alpha 255 on the region's cells, and on wall
   * cells within `grow` (4-connected steps) of them, so a clip tucks under the
   * lines instead of stopping short of them. Everything else is left untouched.
   */
  paintMask(region: Region, out: Uint8ClampedArray, grow = 1): void {
    const { width: W, height: H, labels, walls } = this;
    const bw = region.x1 - region.x0 + grow * 2;
    const bh = region.y1 - region.y0 + grow * 2;
    const ox = region.x0 - grow;
    const oy = region.y0 - grow;
    // 1 = in the mask, 0 = not (yet); grown a ring at a time, into walls only.
    let mask = new Uint8Array(bw * bh);
    for (let y = region.y0; y < region.y1; y++) {
      for (let x = region.x0, k = (y - oy) * bw + (x - ox), i = y * W + x; x < region.x1; x++, k++, i++) {
        if (labels[i] === region.id) mask[k] = 1;
      }
    }
    for (let g = 0; g < grow; g++) {
      const next = mask.slice();
      for (let by = 0; by < bh; by++) {
        const gy = by + oy;
        if (gy < 0 || gy >= H) continue;
        for (let bx = 0, k = by * bw; bx < bw; bx++, k++) {
          const gx = bx + ox;
          if (mask[k] || gx < 0 || gx >= W || walls[gy * W + gx] === 0) continue;
          if ((bx > 0 && mask[k - 1]) || (bx < bw - 1 && mask[k + 1]) || (by > 0 && mask[k - bw]) || (by < bh - 1 && mask[k + bw])) next[k] = 1;
        }
      }
      mask = next;
    }
    for (let k = 0; k < mask.length; k++) if (mask[k]) out[k * 4 + 3] = 255;
  }

  /** The open cell nearest (x, y) within `reach`, as an index, or −1. */
  private nearestOpen(x: number, y: number, reach: number): number {
    const { width: W, height: H } = this;
    let best = -1;
    let bestD = Infinity;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const gx = x + dx;
        const gy = y + dy;
        const d = dx * dx + dy * dy;
        if (d >= bestD || d > reach * reach || gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
        if (this.walls[gy * W + gx] === 0) {
          best = gy * W + gx;
          bestD = d;
        }
      }
    }
    return best;
  }

  /**
   * Scanline flood fill from an unlabelled open cell. It stops as soon as it
   * reaches the grid's edge or a cell of a region already known to be open: that
   * area is open space, and no clip needs its full extent. Cells it labelled are
   * open; ones it didn't reach find that out next time, from their labelled neighbours.
   */
  private fill(start: number): Region {
    const { width: W, height: H, walls, labels, stack, found } = this;
    const id = found.length + 1;
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    let area = 0;
    let open = false;
    const free = (i: number): boolean => walls[i] === 0 && labels[i] === 0;
    const isOpen = (i: number): boolean => {
      const label = labels[i]!;
      return label > 0 && label !== id && found[label - 1]!.open;
    };
    /** Push one seed per run of free cells in row `y` between columns l and r. */
    const seedRow = (y: number, l: number, r: number): void => {
      let inRun = false;
      for (let x = l, i = y * W + l; x <= r; x++, i++) {
        const f = free(i);
        if (f && !inRun) stack.push(i);
        else if (!f && isOpen(i)) open = true;
        inRun = f;
      }
    };

    stack.length = 0;
    stack.push(start);
    while (stack.length > 0 && !open) {
      const i = stack.pop()!;
      if (!free(i)) continue;
      const y = (i / W) | 0;
      const row = y * W;
      let l = i - row;
      let r = l;
      while (l > 0 && free(row + l - 1)) l--;
      while (r < W - 1 && free(row + r + 1)) r++;
      labels.fill(id, row + l, row + r + 1);
      area += r - l + 1;
      if (l < x0) x0 = l;
      if (r + 1 > x1) x1 = r + 1;
      if (y < y0) y0 = y;
      if (y + 1 > y1) y1 = y + 1;
      if (l === 0 || r === W - 1 || y === 0 || y === H - 1 || (l > 0 && isOpen(row + l - 1)) || (r < W - 1 && isOpen(row + r + 1))) open = true;
      if (y > 0) seedRow(y - 1, l, r);
      if (y < H - 1) seedRow(y + 1, l, r);
    }
    stack.length = 0;

    const region: Region = { id, x0, y0, x1, y1, area, open };
    this.found.push(region);
    return region;
  }
}

// Coverage tracking: how much of each placed plate's line work has been rubbed.
// Every path is sampled every 6 units; samples live in a 32-unit spatial hash;
// each crayon stamp adds strength to the samples under it. No canvas readbacks.

import type { PlateBand } from '../art/bands.ts';
import { flatten, parsePath, type Point } from '../art/geometry.ts';

export const SAMPLE_SPACING = 6;
export const CELL = 32;
/** A sample counts as revealed at this strength. */
export const REVEALED = 0.45;
/** A band finishes itself once this share of its samples is revealed. */
export const COMPLETE_AT = 0.9;

/** Points every `spacing` units along a path (by arc length), with each subpath's ends. */
export function samplePath(d: string, spacing = SAMPLE_SPACING): Point[] {
  return sampleSubpaths(d, spacing).flat();
}

/** samplePath, one list per subpath. */
export function sampleSubpaths(d: string, spacing = SAMPLE_SPACING): Point[][] {
  const all: Point[][] = [];
  for (const sub of parsePath(d)) {
    const pts = flatten(sub, 0.5);
    const first = pts[0];
    if (!first) continue;
    const out: Point[] = [first];
    all.push(out);
    let since = 0;
    for (let i = 1; i < pts.length; i++) {
      let ax = pts[i - 1]!.x;
      let ay = pts[i - 1]!.y;
      const b = pts[i]!;
      let len = Math.hypot(b.x - ax, b.y - ay);
      while (since + len >= spacing) {
        const t = (spacing - since) / len;
        ax += (b.x - ax) * t;
        ay += (b.y - ay) * t;
        out.push({ x: ax, y: ay });
        len = Math.hypot(b.x - ax, b.y - ay);
        since = 0;
      }
      since += len;
    }
    const last = pts[pts.length - 1]!;
    if (since > spacing * 0.3) out.push(last);
  }
  return all;
}

export interface CoverageBand {
  readonly band: PlateBand;
  readonly paths: readonly string[];
}

export class Coverage {
  readonly bands: readonly PlateBand[];
  private readonly xs: Float32Array;
  private readonly ys: Float32Array;
  private readonly strength: Float32Array;
  private readonly bandOf: Uint8Array;
  /** 1 where a sample starts a new line (a new subpath). */
  private readonly starts: Uint8Array;
  private readonly totals: Int32Array;
  private readonly revealed: Int32Array;
  /** Bands whose revealed count changed since the last takeChanged(). */
  private readonly changed: Uint8Array;
  /** Samples that crossed the reveal threshold since the last takeRevealed() (for twinkles). */
  private readonly newlyRevealed = new Int32Array(256);
  private newlyRevealedCount = 0;
  private readonly cols: number;
  private readonly rows: number;
  /** Compressed cells: samples of cell c are cellItems[cellStart[c] .. cellStart[c + 1]). */
  private readonly cellStart: Int32Array;
  private readonly cellItems: Int32Array;

  constructor(bands: readonly CoverageBand[], width = 600, height = 1500) {
    this.bands = bands.map((b) => b.band);
    const pts: Point[] = [];
    const owner: number[] = [];
    const starts: number[] = [];
    bands.forEach((b, i) => {
      for (const d of b.paths) {
        for (const line of sampleSubpaths(d)) {
          line.forEach((p, k) => {
            pts.push(p);
            owner.push(i);
            starts.push(k === 0 ? 1 : 0);
          });
        }
      }
    });
    const n = pts.length;
    this.xs = Float32Array.from(pts, (p) => p.x);
    this.ys = Float32Array.from(pts, (p) => p.y);
    this.strength = new Float32Array(n);
    this.bandOf = Uint8Array.from(owner);
    this.starts = Uint8Array.from(starts);
    this.totals = new Int32Array(bands.length);
    for (const o of owner) this.totals[o]!++;
    this.revealed = new Int32Array(bands.length);
    this.changed = new Uint8Array(bands.length);

    this.cols = Math.ceil(width / CELL);
    this.rows = Math.ceil(height / CELL);
    const cellOf = (i: number): number => {
      const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(this.xs[i]! / CELL)));
      const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(this.ys[i]! / CELL)));
      return cy * this.cols + cx;
    };
    this.cellStart = new Int32Array(this.cols * this.rows + 1);
    for (let i = 0; i < n; i++) this.cellStart[cellOf(i) + 1]!++;
    for (let c = 0; c < this.cols * this.rows; c++) this.cellStart[c + 1]! += this.cellStart[c]!;
    this.cellItems = new Int32Array(n);
    const fill = this.cellStart.slice(0, -1);
    for (let i = 0; i < n; i++) this.cellItems[fill[cellOf(i)]!++] = i;
  }

  get sampleCount(): number {
    return this.xs.length;
  }

  /**
   * One crayon stamp: a rectangle centred on (x, y) with half-sizes hu (along
   * `rotation`) and hv (across it), adding `alpha` the way wax builds up:
   * s ← 1 − (1 − s)(1 − alpha).
   */
  stamp(x: number, y: number, rotation: number, hu: number, hv: number, alpha: number): void {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const ex = Math.abs(cos) * hu + Math.abs(sin) * hv;
    const ey = Math.abs(sin) * hu + Math.abs(cos) * hv;
    const c0 = Math.max(0, Math.floor((x - ex) / CELL));
    const c1 = Math.min(this.cols - 1, Math.floor((x + ex) / CELL));
    const r0 = Math.max(0, Math.floor((y - ey) / CELL));
    const r1 = Math.min(this.rows - 1, Math.floor((y + ey) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = r * this.cols + c;
        for (let k = this.cellStart[cell]!; k < this.cellStart[cell + 1]!; k++) {
          const i = this.cellItems[k]!;
          const dx = this.xs[i]! - x;
          const dy = this.ys[i]! - y;
          if (Math.abs(dx * cos + dy * sin) > hu || Math.abs(dy * cos - dx * sin) > hv) continue;
          const before = this.strength[i]!;
          const after = 1 - (1 - before) * (1 - alpha);
          this.strength[i] = after;
          if (before < REVEALED && after >= REVEALED) {
            const b = this.bandOf[i]!;
            this.revealed[b]!++;
            this.changed[b] = 1;
            if (this.newlyRevealedCount < this.newlyRevealed.length) this.newlyRevealed[this.newlyRevealedCount++] = i;
          }
        }
      }
    }
  }

  /** Share of a band's samples revealed, 0–1 (1 for a band with no line work). */
  progress(band: number): number {
    const total = this.totals[band]!;
    return total === 0 ? 1 : this.revealed[band]! / total;
  }

  /** Mark every sample of a band revealed, as the completion sweep fills the remaining lines. */
  revealAll(band: number): void {
    for (let i = 0; i < this.strength.length; i++) {
      if (this.bandOf[i] === band && this.strength[i]! < REVEALED) this.strength[i] = 1;
    }
    this.revealed[band] = this.totals[band]!;
    this.changed[band] = 1;
  }

  /**
   * The revealed stretches of line work, as polylines through consecutive revealed
   * samples (6 units apart). A lone revealed sample is a one-point line.
   */
  revealedLines(): Point[][] {
    const out: Point[][] = [];
    let run: Point[] | null = null;
    for (let i = 0; i < this.strength.length; i++) {
      if (this.starts[i]) run = null;
      if (this.strength[i]! < REVEALED) {
        run = null;
        continue;
      }
      if (!run) out.push((run = []));
      run.push({ x: this.xs[i]!, y: this.ys[i]! });
    }
    return out;
  }

  /** Call `fn` with the position of each sample revealed since last time, then forget them. */
  takeRevealed(fn: (x: number, y: number) => void): void {
    for (let k = 0; k < this.newlyRevealedCount; k++) {
      const i = this.newlyRevealed[k]!;
      fn(this.xs[i]!, this.ys[i]!);
    }
    this.newlyRevealedCount = 0;
  }

  /** Call `fn` for each band whose progress changed since last time, then reset the flags. */
  takeChanged(fn: (band: number) => void): void {
    for (let b = 0; b < this.changed.length; b++) {
      if (this.changed[b]) {
        this.changed[b] = 0;
        fn(b);
      }
    }
  }
}

// Magic fill: tap a closed area to colour it in with a pencil hatch. The walls are
// the lines revealed on the sheet (PLAN.md: all revealed lines, dilated by a pixel
// to close tiny gaps). They come from the rubbing engine's revealed line samples,
// not the lines layer, whose waxy grain is full of tiny holes a fill would leak
// through. The fill tucks a unit under the lines, and the colour layer sits
// beneath them, so a fill never covers a line.

import { SHEET } from '../art/bands.ts';
import type { Point } from '../art/geometry.ts';
import { Regions, wallsFrom } from './fill.ts';
import type { History } from './history.ts';
import { mulberry32 } from './random.ts';
import type { Sheet } from './sheet.ts';

/** A hatch tile is this many units square; its strokes repeat exactly across tiles. */
const HATCH_TILE = 48;
const HATCH_LINES = 11; // 48 / 11 along the diagonal: strokes ≈ 3.1 units apart
const HATCH_WIDTH = 2.6;

/** A fill ready to land: the hatched area in sheet pixels, and its share of the sheet. */
export interface FillPlan {
  readonly image: HTMLCanvasElement;
  /** Placement in sheet backing pixels. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The area's share of the whole sheet, 0–1. */
  readonly share: number;
  /** Whether the area reaches the sheet's edge (the open paper around the figure). */
  readonly open: boolean;
}

function canvas2d(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c.getContext('2d')!;
}

/**
 * A tileable hand-hatched swatch: diagonal pencil strokes, each a little uneven in
 * pressure and position, so a fill looks coloured in by hand rather than flat.
 */
export function hatchTile(colour: string, scale: number): HTMLCanvasElement {
  const n = Math.max(1, Math.round(HATCH_TILE * scale));
  const ctx = canvas2d(n, n);
  const k = n / HATCH_TILE;
  const step = HATCH_TILE / HATCH_LINES;
  ctx.strokeStyle = colour;
  ctx.lineCap = 'round';
  ctx.lineWidth = HATCH_WIDTH;
  for (let i = 0; i < HATCH_LINES; i++) {
    const rnd = mulberry32(101 + i); // the same stroke in every copy, so tiles join
    const wobble = (rnd() - 0.5) * 0.9;
    const segments = 3 + Math.floor(rnd() * 3);
    const alphas = Array.from({ length: segments }, () => 0.55 + rnd() * 0.35);
    // Strokes run x + y = c, drawn for the neighbouring tiles' copies too.
    for (const shift of [-HATCH_TILE, 0, HATCH_TILE]) {
      const c = i * step + wobble + shift;
      for (let sgm = 0; sgm < segments; sgm++) {
        const t0 = sgm / segments;
        const t1 = (sgm + 1) / segments;
        ctx.globalAlpha = alphas[sgm]!;
        ctx.setTransform(k, 0, 0, k, 0, 0);
        ctx.beginPath();
        // From (c - HATCH_TILE·t, HATCH_TILE·t) along the diagonal, overshooting the tile.
        const from = -HATCH_TILE * 0.1 + t0 * HATCH_TILE * 2.2;
        const to = -HATCH_TILE * 0.1 + t1 * HATCH_TILE * 2.2;
        ctx.moveTo(c + HATCH_TILE - from, from - HATCH_TILE);
        ctx.lineTo(c + HATCH_TILE - to, to - HATCH_TILE);
        ctx.stroke();
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  return ctx.canvas;
}

export class MagicFill {
  /** Where a fill reports the pixels it is about to change (for undo). */
  history: History<unknown> | null = null;
  private readonly sheet: Sheet;
  private readonly tooth: HTMLCanvasElement;
  private readonly regions = new Regions(SHEET.width, SHEET.height, { stopAtOpen: false });
  private readonly hatches = new Map<string, HTMLCanvasElement>();
  private readonly revealed: () => readonly (readonly Point[])[];
  private wallsFor = -1;

  /**
   * `tooth` is the pencils' paper grain, so fills match freehand colouring;
   * `revealed` gives the lines revealed so far, as polylines in sheet units.
   */
  constructor(sheet: Sheet, tooth: HTMLCanvasElement, revealed: () => readonly (readonly Point[])[]) {
    this.sheet = sheet;
    this.tooth = tooth;
    this.revealed = revealed;
  }

  /**
   * Plan a fill of the area under (x, y), sheet units, against the lines revealed
   * by `linesVersion` (re-read only when that changes). Null on a line with no
   * open space within reach.
   */
  plan(x: number, y: number, colour: string, linesVersion: number): FillPlan | null {
    if (linesVersion !== this.wallsFor) this.readWalls(linesVersion);
    const region = this.regions.regionAt(x, y);
    if (!region) return null;
    const s = this.sheet.scale;
    const grow = 1; // tuck a unit under the lines
    const gx = region.x0 - grow;
    const gy = region.y0 - grow;
    const gw = region.x1 - region.x0 + grow * 2;
    const gh = region.y1 - region.y0 + grow * 2;
    const mask = canvas2d(gw, gh);
    const img = mask.createImageData(gw, gh);
    this.regions.paintMask(region, img.data, grow);
    mask.putImageData(img, 0, 0);

    // The hatch over the area's box, cut to the area, with the paper's tooth.
    const px = Math.max(0, Math.floor(gx * s));
    const py = Math.max(0, Math.floor(gy * s));
    const pw = Math.min(this.sheet.pxWidth, Math.ceil((gx + gw) * s)) - px;
    const ph = Math.min(this.sheet.pxHeight, Math.ceil((gy + gh) * s)) - py;
    const out = canvas2d(pw, ph);
    out.setTransform(1, 0, 0, 1, -px, -py); // patterns anchored to the sheet
    out.fillStyle = out.createPattern(this.hatch(colour), 'repeat')!;
    out.fillRect(px, py, pw, ph);
    out.globalCompositeOperation = 'destination-in';
    out.fillStyle = out.createPattern(this.tooth, 'repeat')!;
    out.fillRect(px, py, pw, ph);
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.imageSmoothingEnabled = true;
    out.drawImage(mask.canvas, gx * s - px, gy * s - py, gw * s, gh * s);
    out.globalCompositeOperation = 'source-over';
    return { image: out.canvas, x: px, y: py, w: pw, h: ph, share: region.area / (SHEET.width * SHEET.height), open: region.open };
  }

  /** Lay a planned fill on the colour layer. */
  apply(plan: FillPlan): void {
    this.history?.touch('colour', plan.x, plan.y, plan.x + plan.w, plan.y + plan.h);
    this.sheet.layer('colour').drawImage(plan.image, plan.x, plan.y);
  }

  private hatch(colour: string): HTMLCanvasElement {
    let tile = this.hatches.get(colour);
    if (!tile) this.hatches.set(colour, (tile = hatchTile(colour, this.sheet.scale)));
    return tile;
  }

  /** The revealed lines as walls: 3 units wide plus a unit either side (gaps under 2 units close). */
  private readWalls(version: number): void {
    this.regions.setWalls(wallsFrom(this.revealed(), SHEET.width, SHEET.height));
    this.wallsFor = version;
  }
}

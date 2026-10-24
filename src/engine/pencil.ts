// Coloured pencils and the eraser. Like the crayon, a stroke lays round dabs at
// even spacing along the pointer path, batched into a scratch area and drawn
// once per frame:
//   pencil: colour += dabs × paper tooth   (the colour layer multiplies over the paper)
//   eraser: colour −= dabs, pattern −= dabs (never the lines or the wax haze)
// Pencil dabs are faint, so a stroke shows the paper's tooth and passes build up
// colour. Every batch tells the undo history which pixels it is about to change.

import { grainCanvas, toothAlpha } from './grain.ts';
import type { History } from './history.ts';
import type { Loop } from './loop.ts';
import type { LayerName, Sheet } from './sheet.ts';
import { StampSpacer } from './stroke.ts';

export type MarkKind = 'pencil' | 'eraser';

/** PLAN.md: an 8-unit pencil stroke. The eraser is a chunky 24 units. */
export const PENCIL_W = 8;
export const ERASER_W = 24;
const SPACING: Record<MarkKind, number> = { pencil: 1.5, eraser: 4 };
/**
 * Alpha per dab at mouse/touch strength (0.85). About five pencil dabs overlap at
 * any point of a stroke, so one pass lays ≈ 55% colour (before the paper's
 * tooth) and a second ≈ 80%. Eraser dabs overlap about six times: one pass clears.
 */
const DAB_ALPHA: Record<MarkKind, number> = { pencil: 0.15, eraser: 0.6 };
const SCRATCH = 512;
const ERASES: readonly LayerName[] = ['colour', 'pattern'];

/** Per-dab alpha for a pointer strength (Apple Pencil pressure maps to 60–100%). */
export function dabAlpha(kind: MarkKind, strength: number): number {
  return Math.min(0.95, DAB_ALPHA[kind] * (strength / 0.85));
}

function canvas2d(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c.getContext('2d')!;
}

/** A round dab `diameter` units across with a soft edge, in `colour`, at `scale` pixels per unit. */
function dab(diameter: number, soft: number, colour: string, scale: number): HTMLCanvasElement {
  const size = Math.ceil((diameter + 2) * scale);
  const ctx = canvas2d(size, size);
  const img = ctx.createImageData(size, size);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16)) as [number, number, number];
  const c = size / 2;
  const radius = (diameter / 2) * scale;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const a = Math.min(1, Math.max(0, (radius - d) / (soft * scale)));
      const k = (y * size + x) * 4;
      img.data[k] = r;
      img.data[k + 1] = g;
      img.data[k + 2] = b;
      img.data[k + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return ctx.canvas;
}

export class ColourEngine {
  /** Where batches report the pixels they are about to change (for undo). */
  history: History<unknown> | null = null;
  readonly tooth: HTMLCanvasElement;
  private readonly sheet: Sheet;
  private readonly loop: Loop;
  private readonly a: CanvasRenderingContext2D;
  private readonly toothA: CanvasPattern;
  private readonly dabs = new Map<string, HTMLCanvasElement>();
  private readonly spacers: Record<MarkKind, StampSpacer> = {
    pencil: new StampSpacer(SPACING.pencil),
    eraser: new StampSpacer(SPACING.eraser),
  };
  private kind: MarkKind = 'pencil';
  private colour = '#D2283C';
  private alpha = dabAlpha('pencil', 0.85);
  /** Dabs waiting for the next frame: x, y, alpha. */
  private readonly queue = new Float32Array(3 * 4096);
  private queued = 0;
  // The scratch batch: origin and used bounds, in sheet backing pixels.
  private ox = 0;
  private oy = 0;
  private ux0 = Infinity;
  private uy0 = Infinity;
  private ux1 = -Infinity;
  private uy1 = -Infinity;

  /** `field` is the paper's grain: the same paper whose tooth catches the crayon's wax. */
  constructor(sheet: Sheet, loop: Loop, field: Float32Array) {
    this.sheet = sheet;
    this.loop = loop;
    this.tooth = grainCanvas(toothAlpha(field));
    this.a = canvas2d(SCRATCH, SCRATCH);
    this.toothA = this.a.createPattern(this.tooth, 'repeat')!;
    loop.add(this.frame);
  }

  /** The pencil colour (hex) for the strokes that follow. */
  setColour(hex: string): void {
    if (hex === this.colour) return;
    this.drain();
    this.colour = hex;
  }

  begin(kind: MarkKind, x: number, y: number, strength: number): void {
    if (this.queued > 0) this.drain();
    this.kind = kind;
    this.alpha = dabAlpha(kind, strength);
    this.spacers[kind].begin(x, y);
  }

  move(x: number, y: number, strength: number): void {
    this.alpha = dabAlpha(this.kind, strength);
    this.spacers[this.kind].moveTo(x, y, this.enqueue);
    if (this.queued > 0) this.loop.wake();
  }

  /** Finish the stroke and draw what is left now, so the history sees all of it before it commits. */
  end(): void {
    this.spacers[this.kind].end(this.enqueue);
    this.drain();
  }

  private readonly enqueue = (x: number, y: number): void => {
    if (this.queued * 3 >= this.queue.length) this.drain();
    const q = this.queued++ * 3;
    this.queue[q] = x;
    this.queue[q + 1] = y;
    this.queue[q + 2] = this.alpha;
  };

  private readonly frame = (): boolean => {
    this.drain();
    return false;
  };

  private dabFor(kind: MarkKind): HTMLCanvasElement {
    const key = kind === 'eraser' ? 'eraser' : this.colour;
    let c = this.dabs.get(key);
    if (!c) {
      c = kind === 'eraser' ? dab(ERASER_W, 1.2, '#FFFFFF', this.sheet.scale) : dab(PENCIL_W, 1.4, this.colour, this.sheet.scale);
      this.dabs.set(key, c);
    }
    return c;
  }

  private drain(): void {
    if (this.queued === 0) return;
    const s = this.sheet.scale;
    const img = this.dabFor(this.kind);
    const half = img.width / 2;
    for (let k = 0; k < this.queued; k++) {
      const px = this.queue[k * 3]! * s;
      const py = this.queue[k * 3 + 1]! * s;
      const alpha = this.queue[k * 3 + 2]!;
      if (this.ux1 >= this.ux0 && (px - half < this.ox || py - half < this.oy || px + half > this.ox + SCRATCH || py + half > this.oy + SCRATCH)) {
        this.flush();
      }
      if (this.ux1 < this.ux0) {
        this.ox = Math.floor(px - SCRATCH / 2);
        this.oy = Math.floor(py - SCRATCH / 2);
      }
      this.ux0 = Math.min(this.ux0, px - half);
      this.uy0 = Math.min(this.uy0, py - half);
      this.ux1 = Math.max(this.ux1, px + half);
      this.uy1 = Math.max(this.uy1, py + half);
      this.a.globalAlpha = alpha;
      this.a.drawImage(img, px - half - this.ox, py - half - this.oy);
    }
    this.queued = 0;
    this.flush();
  }

  /** Draw the batched dabs onto their layers, then clear the batch. */
  private flush(): void {
    if (this.ux1 < this.ux0) return;
    const x0 = Math.max(0, Math.floor(this.ux0));
    const y0 = Math.max(0, Math.floor(this.uy0));
    const x1 = Math.min(this.sheet.pxWidth, Math.ceil(this.ux1));
    const y1 = Math.min(this.sheet.pxHeight, Math.ceil(this.uy1));
    const w = x1 - x0;
    const h = y1 - y0;
    const a = this.a;
    a.globalAlpha = 1;
    if (w > 0 && h > 0) {
      const sx = x0 - this.ox;
      const sy = y0 - this.oy;
      if (this.kind === 'pencil') {
        // The paper's tooth, anchored to the sheet so it never swims between batches.
        a.globalCompositeOperation = 'destination-in';
        a.setTransform(1, 0, 0, 1, sx - x0, sy - y0);
        a.fillStyle = this.toothA;
        a.fillRect(x0, y0, w, h);
        a.setTransform(1, 0, 0, 1, 0, 0);
        a.globalCompositeOperation = 'source-over';
        this.history?.touch('colour', x0, y0, x1, y1);
        this.sheet.layer('colour').drawImage(a.canvas, sx, sy, w, h, x0, y0, w, h);
      } else {
        for (const name of ERASES) {
          if (!this.sheet.has(name)) continue;
          this.history?.touch(name, x0, y0, x1, y1);
          const layer = this.sheet.layer(name);
          layer.globalCompositeOperation = 'destination-out';
          layer.drawImage(a.canvas, sx, sy, w, h, x0, y0, w, h);
          layer.globalCompositeOperation = 'source-over';
        }
      }
    }
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.clearRect(0, 0, SCRATCH, SCRATCH);
    this.ux0 = this.uy0 = Infinity;
    this.ux1 = this.uy1 = -Infinity;
  }
}

// The rubbing engine. The crayon lays ragged, grainy stamps along the pointer
// path. Each frame, the new stamps are composited once:
//   tone  += stamps × grain              (shown at 13%: the faint wax haze)
//   lines += stamps ∩ plateArt × grain   (the raised lines, in crayon colour)
// Wax only ever adds, so drawing straight onto these layers gives the same result
// as PLAN.md's bakedLines + live mask, with two fewer full-size buffers.

import { BANDS, type PlateBand } from '../art/bands.ts';
import type { GameEvents, Slots, Bus } from '../state.ts';
import { COMPLETE_AT, Coverage } from './coverage.ts';
import { grainCanvas, grainField, waxAlpha, GRAIN_SIZE } from './grain.ts';
import type { Loop } from './loop.ts';
import { mulberry32 } from './random.ts';
import type { Sheet } from './sheet.ts';
import { StampSpacer } from './stroke.ts';

/** The crayon stamp: a 40 × 18 unit block, long side across the direction of travel. */
export const STAMP_W = 40;
export const STAMP_H = 18;
/** Stamps every 25% of the stamp width. */
export const STAMP_SPACING = STAMP_W * 0.25;
/**
 * Strength one stamp adds at mouse/touch pressure: just past the 0.45 reveal
 * threshold, so a single pass reveals every line it crosses. Points under two
 * overlapping stamps reach 71%, so a pass averages ≈ 66% and rubbing again builds
 * darker wax towards 100%.
 */
const STAMP_STRENGTH = 0.46;
const JITTER = (8 * Math.PI) / 180;
/** Stamps are batched into a scratch area this many pixels square before compositing. */
const SCRATCH = 512;
const SWEEP_MS = 400;
const STAMP_VARIANTS = 6;
export const CRAYON_WAX = '#2F2A2E';

/** Pointer → crayon strength: Apple Pencil pressure maps to 60–100%; mouse and touch use 85%. */
export function strengthFor(pointerType: string, pressure: number): number {
  return pointerType === 'pen' ? 0.6 + 0.4 * Math.min(1, Math.max(0, pressure)) : 0.85;
}

/** Per-stamp alpha for a crayon strength; wax builds as 1 − (1 − s)(1 − alpha), so it never passes 100%. */
export function stampAlpha(strength: number): number {
  return Math.min(0.95, STAMP_STRENGTH * (strength / 0.85));
}

function scratch(size: number): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c.getContext('2d')!;
}

/** One stamp shape: a rounded block with ragged, grain-bitten edges, in crayon colour. */
function stampShape(scale: number, field: Float32Array, offset: number, colour: string): HTMLCanvasElement {
  const pad = 2;
  const w = Math.ceil((STAMP_W + pad * 2) * scale);
  const h = Math.ceil((STAMP_H + pad * 2) * scale);
  const ctx = scratch(Math.max(w, h));
  ctx.canvas.width = w;
  ctx.canvas.height = h;
  const img = ctx.createImageData(w, h);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16)) as [number, number, number];
  const hw = STAMP_W / 2;
  const hh = STAMP_H / 2;
  const radius = 7;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const ux = px / scale - pad - hw;
      const uy = py / scale - pad - hh;
      const qx = Math.abs(ux) - (hw - radius);
      const qy = Math.abs(uy) - (hh - radius);
      const dist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
      const n = field[((py * 3 + offset) % GRAIN_SIZE) * GRAIN_SIZE + ((px * 3 + offset * 7) % GRAIN_SIZE)]!;
      const edge = Math.min(1, Math.max(0, (-dist + (n - 0.5) * 3) / 1.4));
      const k = (py * w + px) * 4;
      img.data[k] = r;
      img.data[k + 1] = g;
      img.data[k + 2] = b;
      img.data[k + 3] = Math.round(edge * (0.82 + 0.18 * n) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return ctx.canvas;
}

interface Sweep {
  readonly band: number;
  readonly y0: number;
  readonly y1: number;
  readonly start: number;
  /** Sheet x (units) revealed so far. */
  x: number;
}

export class RubEngine {
  readonly grain: HTMLCanvasElement;
  private readonly sheet: Sheet;
  private readonly bus: Bus<GameEvents>;
  private readonly loop: Loop;
  private readonly stamps: HTMLCanvasElement[];
  private readonly a: CanvasRenderingContext2D;
  private readonly b: CanvasRenderingContext2D;
  private readonly grainA: CanvasPattern;
  /**
   * The placed plates' lines, rasterised once per paper placement. An immutable
   * ImageBitmap: drawing from a canvas would snapshot all 1200 × 3000 px each frame.
   */
  private plateArt: ImageBitmap | HTMLCanvasElement | null = null;
  private coverage: Coverage | null = null;
  private bands: readonly PlateBand[] = [];
  private done = new Uint8Array(0);
  private readonly sweeps: Sweep[] = [];
  private readonly spacer = new StampSpacer(STAMP_SPACING);
  private readonly rnd = mulberry32(11);
  /** Stamps waiting for the next frame: x, y, rotation, alpha. */
  private readonly queue = new Float32Array(4 * 2048);
  private queued = 0;
  private alpha = stampAlpha(0.85);
  // The scratch batch: origin (px) and used bounds (px) in sheet backing pixels.
  private ox = 0;
  private oy = 0;
  private ux0 = Infinity;
  private uy0 = Infinity;
  private ux1 = -Infinity;
  private uy1 = -Infinity;

  constructor(sheet: Sheet, bus: Bus<GameEvents>, loop: Loop) {
    this.sheet = sheet;
    this.bus = bus;
    this.loop = loop;
    const field = grainField();
    this.grain = grainCanvas(waxAlpha(field));
    this.stamps = Array.from({ length: STAMP_VARIANTS }, (_, i) => stampShape(sheet.scale, field, i * 37, CRAYON_WAX));
    this.a = scratch(SCRATCH);
    this.b = scratch(SCRATCH);
    this.grainA = this.b.createPattern(this.grain, 'repeat')!;
    loop.add(this.frame);
  }

  /** The bands being tracked for this paper placement, in coverage order. */
  get armed(): readonly PlateBand[] {
    return this.bands;
  }

  progress(band: PlateBand): number {
    const i = this.bands.indexOf(band);
    return i < 0 || !this.coverage ? 0 : this.coverage.progress(i);
  }

  /** Rasterise the placed plates and start fresh coverage: each paper placement re-arms every band. */
  arm(slots: Slots): void {
    const placed = (['top', 'head', 'torso', 'legs'] as const).filter((b) => slots[b]);
    this.bands = placed;
    this.coverage = new Coverage(placed.map((band) => ({ band, paths: slots[band]!.paths })));
    this.done = new Uint8Array(placed.length);
    this.sweeps.length = 0;

    if (this.plateArt instanceof ImageBitmap) this.plateArt.close();
    const { pxWidth: w, pxHeight: h, scale: s } = this.sheet;
    const offscreen = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : null;
    const canvas = offscreen ?? Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = CRAYON_WAX;
    for (const band of placed) for (const d of slots[band]!.paths) ctx.stroke(new Path2D(d));
    this.plateArt = offscreen ? offscreen.transferToImageBitmap() : (canvas as HTMLCanvasElement);

    for (const band of placed) this.bus.emit('band:progress', { band, progress: 0 });
  }

  begin(x: number, y: number, strength: number): void {
    this.alpha = stampAlpha(strength);
    this.spacer.begin(x, y);
  }

  move(x: number, y: number, strength: number): void {
    this.alpha = stampAlpha(strength);
    this.spacer.moveTo(x, y, this.enqueue);
    if (this.queued > 0) this.loop.wake();
  }

  end(): void {
    this.spacer.end(this.enqueue);
    this.loop.wake();
  }

  private readonly enqueue = (x: number, y: number, angle: number): void => {
    if (this.queued * 4 >= this.queue.length) this.drain();
    const q = this.queued++ * 4;
    this.queue[q] = x;
    this.queue[q + 1] = y;
    this.queue[q + 2] = angle + Math.PI / 2 + (this.rnd() * 2 - 1) * JITTER; // long side across the stroke
    this.queue[q + 3] = this.alpha;
  };

  private readonly frame = (now: number): boolean => {
    this.drain();
    this.runSweeps(now);
    this.coverage?.takeChanged(this.report);
    return this.queued > 0 || this.sweeps.length > 0;
  };

  private readonly report = (i: number): void => {
    const band = this.bands[i]!;
    const progress = this.coverage!.progress(i);
    this.bus.emit('band:progress', { band, progress });
    if (progress >= COMPLETE_AT && !this.done[i]) {
      this.done[i] = 1;
      this.bus.emit('band:complete', { band });
      const { y0, y1 } = BANDS[band];
      this.sweeps.push({ band: i, y0: y0 - 2, y1: y1 + 2, start: performance.now(), x: 0 });
    }
  };

  /** Draw and track every queued stamp. */
  private drain(): void {
    const s = this.sheet.scale;
    for (let k = 0; k < this.queued; k++) {
      const q = k * 4;
      const x = this.queue[q]!;
      const y = this.queue[q + 1]!;
      const rot = this.queue[q + 2]!;
      const alpha = this.queue[q + 3]!;
      this.coverage?.stamp(x, y, rot, STAMP_W / 2, STAMP_H / 2, alpha);

      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const ex = (Math.abs(cos) * (STAMP_W / 2 + 2) + Math.abs(sin) * (STAMP_H / 2 + 2)) * s;
      const ey = (Math.abs(sin) * (STAMP_W / 2 + 2) + Math.abs(cos) * (STAMP_H / 2 + 2)) * s;
      const px = x * s;
      const py = y * s;
      if (this.ux1 >= this.ux0 && (px - ex < this.ox || py - ey < this.oy || px + ex > this.ox + SCRATCH || py + ey > this.oy + SCRATCH)) {
        this.flush();
      }
      if (this.ux1 < this.ux0) {
        this.ox = Math.floor(px - SCRATCH / 2);
        this.oy = Math.floor(py - SCRATCH / 2);
      }
      this.ux0 = Math.min(this.ux0, px - ex);
      this.uy0 = Math.min(this.uy0, py - ey);
      this.ux1 = Math.max(this.ux1, px + ex);
      this.uy1 = Math.max(this.uy1, py + ey);
      this.a.setTransform(cos * s, sin * s, -sin * s, cos * s, px - this.ox, py - this.oy);
      this.a.globalAlpha = alpha;
      this.a.drawImage(this.stamps[(this.rnd() * STAMP_VARIANTS) | 0]!, -(STAMP_W / 2 + 2), -(STAMP_H / 2 + 2), STAMP_W + 4, STAMP_H + 4);
    }
    this.queued = 0;
    this.flush();
  }

  /** Composite the batched stamps onto the tone and line layers, then clear the batch. */
  private flush(): void {
    if (this.ux1 < this.ux0) return;
    const x0 = Math.max(0, Math.floor(this.ux0));
    const y0 = Math.max(0, Math.floor(this.uy0));
    const x1 = Math.min(this.sheet.pxWidth, Math.ceil(this.ux1));
    const y1 = Math.min(this.sheet.pxHeight, Math.ceil(this.uy1));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w > 0 && h > 0) {
      const sx = x0 - this.ox;
      const sy = y0 - this.oy;
      this.composite(this.sheet.layer('tone'), x0, y0, w, h, sx, sy, false);
      if (this.plateArt) this.composite(this.sheet.layer('lines'), x0, y0, w, h, sx, sy, true);
    }
    this.a.setTransform(1, 0, 0, 1, 0, 0);
    this.a.globalAlpha = 1;
    this.a.clearRect(0, 0, SCRATCH, SCRATCH);
    this.ux0 = this.uy0 = Infinity;
    this.ux1 = this.uy1 = -Infinity;
  }

  /** target += (batch [∩ plateArt]) × grain over the rectangle (x0, y0, w, h). */
  private composite(target: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, sx: number, sy: number, lines: boolean): void {
    const b = this.b;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'source-over';
    b.clearRect(0, 0, w, h);
    b.drawImage(this.a.canvas, sx, sy, w, h, 0, 0, w, h);
    if (lines) {
      b.globalCompositeOperation = 'source-in';
      b.drawImage(this.plateArt!, x0, y0, w, h, 0, 0, w, h);
    }
    this.applyGrain(x0, y0, w, h, lines ? 0 : 97);
    target.drawImage(b.canvas, 0, 0, w, h, x0, y0, w, h);
  }

  /** Multiply scratch B's alpha by the grain, anchored to the sheet so the texture never swims. */
  private applyGrain(x0: number, y0: number, w: number, h: number, shift: number): void {
    const b = this.b;
    b.globalCompositeOperation = 'destination-in';
    b.setTransform(1, 0, 0, 1, -x0 + shift, -y0 + shift);
    b.fillStyle = this.grainA;
    b.fillRect(x0 - shift, y0 - shift, w, h);
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'source-over';
  }

  /** Finishing sweeps: reveal a completed band's remaining lines left to right over 400 ms. */
  private runSweeps(now: number): void {
    if (!this.plateArt) return;
    const s = this.sheet.scale;
    for (let i = this.sweeps.length - 1; i >= 0; i--) {
      const sw = this.sweeps[i]!;
      const t = Math.min(1, (now - sw.start) / SWEEP_MS);
      const to = t * 600;
      const x0 = Math.floor(sw.x * s);
      const x1 = Math.ceil(to * s);
      const w = Math.min(SCRATCH, x1 - x0);
      for (let y = Math.max(0, Math.floor(sw.y0 * s)); w > 0 && y < Math.min(this.sheet.pxHeight, sw.y1 * s); y += SCRATCH) {
        const h = Math.min(SCRATCH, Math.ceil(sw.y1 * s) - y, this.sheet.pxHeight - y);
        const b = this.b;
        b.setTransform(1, 0, 0, 1, 0, 0);
        b.globalCompositeOperation = 'source-over';
        b.clearRect(0, 0, w, h);
        b.drawImage(this.plateArt, x0, y, w, h, 0, 0, w, h);
        this.applyGrain(x0, y, w, h, 0);
        this.sheet.layer('lines').drawImage(b.canvas, 0, 0, w, h, x0, y, w, h);
      }
      sw.x = x0 + w < x1 ? (x0 + w) / s : to;
      if (t >= 1 && sw.x >= 600) {
        this.coverage?.revealAll(sw.band);
        this.sweeps.splice(i, 1);
      }
    }
  }
}

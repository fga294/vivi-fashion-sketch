// Completion effects on the paper. When a band finishes, a soft highlight sweeps
// its lines left to right (in step with the rubbing engine's 400 ms finishing
// sweep) and hearts and stars burst from its centre. When the whole outfit is
// done, the figure's lines glow and confetti falls from the top of the frame.

import { BANDS, SHEET, type PlateBand } from '../art/bands.ts';
import { mulberry32 } from '../engine/random.ts';
import { SWEEP_MS } from '../engine/rub.ts';
import type { Sheet } from '../engine/sheet.ts';
import type { Slots } from '../state.ts';
import { prefersReducedMotion } from '../ui/motion.ts';
import type { Effect, FxLayer } from './layer.ts';
import { Confetti, Sparks, type Bounds } from './particles.ts';

/** In step with the rubbing engine's finishing sweep, which fills in any gaps as the highlight passes. */
const SHIMMER_MS = SWEEP_MS;
/** Width of the travelling highlight, in sheet units, drawn as soft vertical slices. */
const SHIMMER_W = 90;
const SHIMMER_SLICES = 9;
const MAX_SHIMMERS = 4;
/** 12–18 hearts and stars per band. */
const BURST_MIN = 12;
const BURST_MAX = 18;
const CONFETTI = 72;
const GLOW_MS = 1400;
/** The glow is drawn small and stretched over the sheet, which softens it for free. */
const GLOW_SCALE = 0.5;

// Blush, rose, cream and gold, each with a darker outline so the pale ones show on paper.
const SPARK_FILLS = ['#F4C9D3', '#D9778F', '#F1E6C8', '#E8C25A'] as const;
const SPARK_STROKES = ['#D98FA3', '#B95870', '#C2AE7E', '#B08428'] as const;
const CONFETTI_FILLS = ['#F4C9D3', '#D9778F', '#E8C25A', '#9ED4BE', '#9EC5E8', '#C7A9E2'] as const;

export interface CelebrateStats {
  bursts: number;
  sparksSpawned: number;
  /** Fewest and most sparks in one burst. */
  minBurst: number;
  maxBurst: number;
  maxSparksAlive: number;
  shimmerFrames: number;
  outfits: number;
  confettiSpawned: number;
  maxConfettiAlive: number;
}

let shapes: Path2D[] | null = null;

/** A unit heart and a unit five-point star, centred on the origin. */
function sparkShapes(): Path2D[] {
  if (shapes) return shapes;
  const heart = new Path2D(
    'M0 0.38 C-0.08 0.3 -0.5 0.06 -0.5 -0.18 C-0.5 -0.38 -0.34 -0.48 -0.2 -0.47 C-0.1 -0.46 -0.03 -0.4 0 -0.32 ' +
      'C0.03 -0.4 0.1 -0.46 0.2 -0.47 C0.34 -0.48 0.5 -0.38 0.5 -0.18 C0.5 0.06 0.08 0.3 0 0.38 Z',
  );
  const star = new Path2D();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 === 0 ? 0.55 : 0.24;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    if (k === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  star.closePath();
  return (shapes = [heart, star]);
}

export class Celebrate implements Effect {
  readonly sparks = new Sparks();
  readonly confetti = new Confetti();
  readonly stats: CelebrateStats = {
    bursts: 0,
    sparksSpawned: 0,
    minBurst: Infinity,
    maxBurst: 0,
    maxSparksAlive: 0,
    shimmerFrames: 0,
    outfits: 0,
    confettiSpawned: 0,
    maxConfettiAlive: 0,
  };
  /** The placed plates' lines as a soft gold halo, under the line layer. */
  readonly glow: HTMLCanvasElement;
  private readonly sheet: Sheet;
  private readonly fx: FxLayer;
  private readonly rnd = mulberry32(23);
  // Active shimmers: band top and bottom (units) and start time.
  private readonly shimmerY0 = new Float32Array(MAX_SHIMMERS);
  private readonly shimmerY1 = new Float32Array(MAX_SHIMMERS);
  private readonly shimmerStart = new Float64Array(MAX_SHIMMERS);
  private shimmers = 0;
  private glowAnimation: Animation | null = null;
  private t = 0;
  private now = 0;

  constructor(sheet: Sheet, fx: FxLayer) {
    this.sheet = sheet;
    this.fx = fx;
    this.glow = document.createElement('canvas');
    this.glow.className = 'layer layer--glow';
    this.glow.width = Math.round(SHEET.width * GLOW_SCALE);
    this.glow.height = Math.round(SHEET.height * GLOW_SCALE);
    sheet.insertUnder(this.glow, 'lines');
    fx.add(this);
  }

  /** Draw the halo for the plates under this paper placement. */
  arm(slots: Slots): void {
    const ctx = this.glow.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.glow.width, this.glow.height);
    ctx.setTransform(GLOW_SCALE, 0, 0, GLOW_SCALE, 0, 0);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#FFF1C2';
    ctx.shadowColor = 'rgba(240, 190, 80, 0.95)';
    ctx.shadowBlur = 8;
    for (const band of ['top', 'head', 'torso', 'legs'] as const) {
      for (const d of slots[band]?.paths ?? []) ctx.stroke(new Path2D(d));
    }
  }

  /** A band finished: shimmer across its lines and burst hearts and stars from its centre. */
  band(band: PlateBand): void {
    const { y0, y1 } = BANDS[band];
    if (this.shimmers < MAX_SHIMMERS) {
      this.shimmerY0[this.shimmers] = y0;
      this.shimmerY1[this.shimmers] = y1;
      this.shimmerStart[this.shimmers] = performance.now();
      this.shimmers++;
    }

    const still = prefersReducedMotion();
    const cx = SHEET.width / 2;
    const cy = (y0 + y1) / 2;
    const n = BURST_MIN + Math.floor(this.rnd() * (BURST_MAX - BURST_MIN + 1));
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (this.rnd() - 0.5) * 0.5;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const size = 22 + this.rnd() * 10;
      const colour = Math.floor(this.rnd() * SPARK_FILLS.length);
      const shape = i % 2;
      const rot = (this.rnd() - 0.5) * 0.8;
      // With reduced motion they appear in a ring and fade where they are.
      const r = still ? 60 + this.rnd() * 90 : 14;
      const speed = 0.16 + this.rnd() * 0.16;
      const ok = this.sparks.spawn(cx + cos * r, cy + sin * r * 0.8, cos * speed, sin * speed - 0.14, size, rot, (this.rnd() - 0.5) * 0.008, colour, shape, still);
      if (ok) spawned++;
    }
    this.stats.bursts++;
    this.stats.sparksSpawned += spawned;
    this.stats.minBurst = Math.min(this.stats.minBurst, spawned);
    this.stats.maxBurst = Math.max(this.stats.maxBurst, spawned);
    this.fx.wake();
  }

  /** Every placed band is done: the lines glow and confetti falls from the top of the frame. */
  outfit(): void {
    this.stats.outfits++;
    this.glowAnimation?.cancel();
    this.glowAnimation = this.glow.animate([{ opacity: 0 }, { opacity: 0.95, offset: 0.25 }, { opacity: 0.95, offset: 0.55 }, { opacity: 0 }], {
      duration: GLOW_MS,
      easing: 'ease-in-out',
    });
    if (prefersReducedMotion()) return;
    let spawned = 0;
    for (let i = 0; i < CONFETTI; i++) {
      const ok = this.confetti.spawn(
        this.rnd() * SHEET.width,
        -10 - this.rnd() * 40,
        0.5 + this.rnd() * 0.3,
        8 + this.rnd() * 6,
        5 + this.rnd() * 3,
        (this.rnd() - 0.5) * 0.012,
        0.008 + this.rnd() * 0.008,
        6 + this.rnd() * 12,
        0.003 + this.rnd() * 0.003,
        this.rnd() * 500,
        Math.floor(this.rnd() * CONFETTI_FILLS.length),
      );
      if (ok) spawned++;
    }
    this.stats.confettiSpawned += spawned;
    this.fx.wake();
  }

  /** Stop everything at once (the paper is lifted or taken out). */
  clear(): void {
    this.sparks.clear();
    this.confetti.clear();
    this.shimmers = 0;
    this.glowAnimation?.cancel();
    this.glowAnimation = null;
  }

  step(now: number): boolean {
    const dt = this.t ? Math.min(50, now - this.t) : 16.7;
    this.t = now;
    this.now = now;
    for (let i = this.shimmers - 1; i >= 0; i--) {
      if (now - this.shimmerStart[i]! < SHIMMER_MS) continue;
      const last = --this.shimmers;
      this.shimmerY0[i] = this.shimmerY0[last]!;
      this.shimmerY1[i] = this.shimmerY1[last]!;
      this.shimmerStart[i] = this.shimmerStart[last]!;
    }
    if (this.shimmers > 0) this.stats.shimmerFrames++;
    this.sparks.update(dt);
    this.confetti.update(dt, SHEET.height + 20);
    this.stats.maxSparksAlive = Math.max(this.stats.maxSparksAlive, this.sparks.count);
    this.stats.maxConfettiAlive = Math.max(this.stats.maxConfettiAlive, this.confetti.count);
    return this.shimmers > 0 || this.sparks.count > 0 || this.confetti.count > 0;
  }

  paint(ctx: CanvasRenderingContext2D, bounds: Bounds): void {
    // The shimmer: soft slices of the halo, brightest at the sweep's front.
    const sliceW = SHIMMER_W / SHIMMER_SLICES;
    for (let k = 0; k < this.shimmers; k++) {
      const y0 = this.shimmerY0[k]!;
      const y1 = this.shimmerY1[k]!;
      const front = (Math.max(0, this.now - this.shimmerStart[k]!) / SHIMMER_MS) * SHEET.width;
      for (let i = 0; i < SHIMMER_SLICES; i++) {
        const x = front - SHIMMER_W / 2 + i * sliceW;
        if (x + sliceW <= 0 || x >= SHEET.width) continue;
        ctx.globalAlpha = 0.9 * Math.sin((Math.PI * (i + 0.5)) / SHIMMER_SLICES);
        ctx.drawImage(this.glow, x * GLOW_SCALE, y0 * GLOW_SCALE, sliceW * GLOW_SCALE, (y1 - y0) * GLOW_SCALE, x, y0, sliceW, y1 - y0);
      }
      bounds.add(front - SHIMMER_W / 2, y0, 0);
      bounds.add(front + SHIMMER_W / 2, y1, 0);
    }
    ctx.globalAlpha = 1;
    const s = this.sheet.scale;
    this.confetti.draw(ctx, s, CONFETTI_FILLS, bounds);
    this.sparks.draw(ctx, s, sparkShapes(), SPARK_FILLS, SPARK_STROKES, bounds);
  }
}

// Scrubbing effects: wax crumbs and line twinkles on the fx canvas, the paper
// nudging against the stroke, and the frame window rattling on very fast scrubs.
// Everything runs in the shared frame loop and allocates nothing per frame.

import { mulberry32 } from '../engine/random.ts';
import { CRAYON_WAX } from '../engine/rub.ts';
import type { Sheet } from '../engine/sheet.ts';
import { prefersReducedMotion } from '../ui/motion.ts';
import type { Effect, FxLayer } from './layer.ts';
import { Crumbs, Glints, type Bounds } from './particles.ts';

/** At most this many crumbs a frame, at this stroke speed (units/ms) or faster. */
const CRUMBS_PER_FRAME = 4;
const CRUMB_FULL_SPEED = 1.2;
const GLINTS_PER_FRAME = 6;
/** Paper nudge: up to 1.5 units against the stroke and ±0.3°, springing back. */
const NUDGE_MAX = 1.5;
const NUDGE_TILT = 0.3;
/** Stroke speed (units/ms) at which the frame window starts to rattle. */
const RATTLE_SPEED = 2.4;
const RATTLE_PX = 0.8;

/** Counters for tests and tuning; published on window.__viviFx with ?fxstats. */
export interface FxStats {
  crumbsSpawned: number;
  glintsSpawned: number;
  maxCrumbsAlive: number;
  maxGlintsAlive: number;
  maxCrumbsPerFrame: number;
  maxGlintsPerFrame: number;
  nudgeFrames: number;
  rattleFrames: number;
}

export class ScrubFx implements Effect {
  readonly crumbs = new Crumbs();
  readonly glints = new Glints();
  readonly stats: FxStats = {
    crumbsSpawned: 0,
    glintsSpawned: 0,
    maxCrumbsAlive: 0,
    maxGlintsAlive: 0,
    maxCrumbsPerFrame: 0,
    maxGlintsPerFrame: 0,
    nudgeFrames: 0,
    rattleFrames: 0,
  };
  private readonly sheet: Sheet;
  private readonly fx: FxLayer;
  private readonly frameWindow: HTMLElement;
  private readonly rnd = mulberry32(5);
  private stroking = false;
  private reduced = false;
  // Pointer now and at the last frame, in sheet units.
  private px = 0;
  private py = 0;
  private fx0 = 0;
  private fy0 = 0;
  private t = 0;
  private emitCarry = 0;
  // Twinkle candidates for this frame (reservoir of up to GLINTS_PER_FRAME positions).
  private readonly candidates = new Float32Array(GLINTS_PER_FRAME * 2);
  private candidateCount = 0;
  private candidatesSeen = 0;
  // Paper nudge spring: offset (units), tilt (deg) and their velocities.
  private nx = 0;
  private ny = 0;
  private nr = 0;
  private nvx = 0;
  private nvy = 0;
  private nvr = 0;
  private pxPerUnit = 1;
  private rattling = false;
  /** Crumbs take the colour of the crayon in hand. */
  crumbColour = CRAYON_WAX;

  constructor(sheet: Sheet, fx: FxLayer, frameWindow: HTMLElement) {
    this.sheet = sheet;
    this.fx = fx;
    this.frameWindow = frameWindow;
    fx.add(this);
  }

  strokeStart(x: number, y: number): void {
    this.stroking = true;
    this.px = this.fx0 = x;
    this.py = this.fy0 = y;
    this.pxPerUnit = this.sheet.element.getBoundingClientRect().width / 600 || 1;
    this.fx.wake();
  }

  strokeMove(x: number, y: number): void {
    this.px = x;
    this.py = y;
  }

  strokeEnd(): void {
    this.stroking = false;
    this.fx.wake();
  }

  /** A line sample just got revealed: maybe twinkle there (reservoir sampling keeps them spread out). */
  readonly revealed = (x: number, y: number): void => {
    const seen = this.candidatesSeen++;
    const slot = seen < GLINTS_PER_FRAME ? seen : Math.floor(this.rnd() * (seen + 1));
    if (slot >= GLINTS_PER_FRAME) return;
    this.candidates[slot * 2] = x;
    this.candidates[slot * 2 + 1] = y;
    if (slot >= this.candidateCount) this.candidateCount = slot + 1;
  };

  /** Drop every effect at once (new sheet). */
  reset(): void {
    this.crumbs.clear();
    this.glints.clear();
    this.candidateCount = this.candidatesSeen = 0;
    this.settle();
  }

  /** Snap the paper and window back to rest (e.g. when the paper is lifted). */
  settle(): void {
    this.nx = this.ny = this.nr = this.nvx = this.nvy = this.nvr = 0;
    this.sheet.element.style.transform = '';
    this.frameWindow.style.transform = '';
    this.rattling = false;
  }

  step(now: number): boolean {
    const dt = this.t ? Math.min(50, now - this.t) : 16.7;
    this.t = now;
    const reduced = (this.reduced = prefersReducedMotion());

    // Stroke velocity over this frame.
    let speed = 0;
    let dirx = 0;
    let diry = 0;
    if (this.stroking) {
      const dx = this.px - this.fx0;
      const dy = this.py - this.fy0;
      const d = Math.hypot(dx, dy);
      speed = dt > 0 ? d / dt : 0;
      if (d > 0) {
        dirx = dx / d;
        diry = dy / d;
      }
      this.fx0 = this.px;
      this.fy0 = this.py;
    }

    // Wax crumbs, in proportion to speed.
    if (this.stroking && !reduced && speed > 0) {
      this.emitCarry = Math.min(CRUMBS_PER_FRAME, this.emitCarry + (speed / CRUMB_FULL_SPEED) * CRUMBS_PER_FRAME);
      const n = Math.floor(this.emitCarry);
      this.emitCarry -= n;
      let spawned = 0;
      for (let k = 0; k < n; k++) {
        const off = (this.rnd() - 0.5) * 34; // anywhere along the crayon's edge, across the stroke
        const ok = this.crumbs.spawn(
          this.px - diry * off,
          this.py + dirx * off,
          (this.rnd() - 0.5) * 0.12 - dirx * 0.05,
          -(0.06 + this.rnd() * 0.1) - diry * 0.03,
          2 + this.rnd() * 2,
        );
        if (ok) spawned++;
      }
      this.stats.crumbsSpawned += spawned;
      this.stats.maxCrumbsPerFrame = Math.max(this.stats.maxCrumbsPerFrame, spawned);
    }

    // Twinkles where lines were just revealed.
    let glinted = 0;
    for (let k = 0; k < this.candidateCount; k++) {
      if (this.glints.spawn(this.candidates[k * 2]!, this.candidates[k * 2 + 1]!, this.rnd() < 0.5)) glinted++;
    }
    this.candidateCount = this.candidatesSeen = 0;
    this.stats.glintsSpawned += glinted;
    this.stats.maxGlintsPerFrame = Math.max(this.stats.maxGlintsPerFrame, glinted);

    this.crumbs.update(dt);
    this.glints.update(dt);
    this.stats.maxCrumbsAlive = Math.max(this.stats.maxCrumbsAlive, this.crumbs.count);
    this.stats.maxGlintsAlive = Math.max(this.stats.maxGlintsAlive, this.glints.count);
    const springing = this.paperResponse(speed, dirx, diry, reduced);

    return this.stroking || this.crumbs.count > 0 || this.glints.count > 0 || springing;
  }

  paint(ctx: CanvasRenderingContext2D, bounds: Bounds): void {
    this.crumbs.draw(ctx, this.crumbColour, bounds);
    this.glints.draw(ctx, this.reduced, bounds);
  }

  /** The paper nudges against the stroke and springs back; very fast scrubs rattle the window. */
  private paperResponse(speed: number, dirx: number, diry: number, reduced: boolean): boolean {
    if (reduced) {
      if (this.nx || this.ny || this.nr || this.rattling) this.settle();
      return false;
    }
    const push = this.stroking ? Math.min(NUDGE_MAX, speed * 1.5) : 0;
    const tx = -dirx * push;
    const ty = -diry * push;
    const tr = this.stroking ? Math.max(-NUDGE_TILT, Math.min(NUDGE_TILT, -dirx * speed * 0.3)) : 0;
    this.nvx = (this.nvx + (tx - this.nx) * 0.25) * 0.72;
    this.nvy = (this.nvy + (ty - this.ny) * 0.25) * 0.72;
    this.nvr = (this.nvr + (tr - this.nr) * 0.25) * 0.72;
    this.nx += this.nvx;
    this.ny += this.nvy;
    this.nr += this.nvr;
    const active = Math.abs(this.nx) + Math.abs(this.ny) > 0.01 || Math.abs(this.nr) > 0.002 || Math.abs(this.nvx) + Math.abs(this.nvy) > 0.005;
    if (active) {
      this.sheet.element.style.transform = `translate(${this.nx * this.pxPerUnit}px, ${this.ny * this.pxPerUnit}px) rotate(${this.nr}deg)`;
      this.stats.nudgeFrames++;
    } else if (this.sheet.element.style.transform) {
      this.sheet.element.style.transform = '';
    }

    const rattle = this.stroking && speed > RATTLE_SPEED;
    if (rattle) {
      this.frameWindow.style.transform = `translate(${(this.rnd() - 0.5) * 2 * RATTLE_PX}px, ${(this.rnd() - 0.5) * 2 * RATTLE_PX}px)`;
      this.stats.rattleFrames++;
    } else if (this.rattling) {
      this.frameWindow.style.transform = '';
    }
    this.rattling = rattle;
    return active || rattle;
  }
}

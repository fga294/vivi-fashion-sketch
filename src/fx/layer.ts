// The fx canvas and the effects that draw on it. Each frame every effect steps,
// then the layer clears only what was drawn last frame and lets each effect paint
// again. One owner for the dirty rectangle means one effect's clear never erases
// another's particles.

import type { Loop } from '../engine/loop.ts';
import type { Sheet } from '../engine/sheet.ts';
import { Bounds } from './particles.ts';

export interface Effect {
  /** Advance to `now`; return true while there is more to animate next frame. */
  step(now: number): boolean;
  /** Draw in sheet units (the transform is set), growing `bounds` to cover what was drawn. */
  paint(ctx: CanvasRenderingContext2D, bounds: Bounds): void;
}

export class FxLayer {
  private readonly sheet: Sheet;
  private readonly loop: Loop;
  private readonly effects: Effect[] = [];
  private readonly drawn = new Bounds();
  private readonly drawnLast = new Bounds();

  constructor(sheet: Sheet, loop: Loop) {
    this.sheet = sheet;
    this.loop = loop;
    loop.add(this.frame);
  }

  add(effect: Effect): void {
    this.effects.push(effect);
  }

  wake(): void {
    this.loop.wake();
  }

  /** Forget what was drawn (the sheet's layers were just cleared). */
  reset(): void {
    this.drawnLast.reset();
  }

  private readonly frame = (now: number): boolean => {
    let more = false;
    for (const e of this.effects) if (e.step(now)) more = true;
    if (!more && this.drawnLast.empty) return false;

    const ctx = this.sheet.layer('fx');
    const s = this.sheet.scale;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (!this.drawnLast.empty) {
      const b = this.drawnLast;
      ctx.clearRect(b.x0 - 1, b.y0 - 1, b.x1 - b.x0 + 2, b.y1 - b.y0 + 2);
    }
    this.drawn.reset();
    if (more) {
      for (const e of this.effects) {
        e.paint(ctx, this.drawn);
        ctx.setTransform(s, 0, 0, s, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawnLast.copy(this.drawn);
    // One more frame to clear whatever was just drawn.
    return more || !this.drawnLast.empty;
  };
}

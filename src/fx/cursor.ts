// The crayon cursor: an SVG crayon that follows the pointer on a spring, leans
// into the direction of travel, squashes when the scrub reverses, and wears its
// tip flat over the session. It lives in the fixed flight layer, above everything.

import type { FrameTask } from '../engine/loop.ts';
import { s } from '../ui/dom.ts';
import { prefersReducedMotion } from '../ui/motion.ts';
import { reversed, springStep, tiltFor, type Spring } from './spring.ts';

/** The crayon is drawn lying along x with its tip at the left (viewBox 150 × 40). */
const VIEW_W = 150;
const VIEW_H = 40;
const TIP_X = 4;
const TIP_Y = 20;
/** Held like a pencil: tip down-left, body up-right. */
const BASE_ANGLE = -35;
/** Rubbing distance (sheet units) that wears the tip completely flat: about four full outfits. */
const WEAR_DISTANCE = 60_000;
/** On touch, the crayon sits just above and right of the finger so it stays visible. */
const TOUCH_OFFSET_X = 18;
const TOUCH_OFFSET_Y = -26;

/** The cone of the tip: pointed when new, blunt when worn (0–1). */
export function tipPath(wear: number): string {
  const w = Math.min(1, Math.max(0, wear));
  const x = TIP_X + 8 * w;
  const h = 1 + 5 * w;
  return `M24 9 L${x} ${TIP_Y - h} Q${x - 2} ${TIP_Y} ${x} ${TIP_Y + h} L24 31 Z`;
}

export class CrayonCursor {
  readonly element: HTMLElement;
  private readonly tip: SVGPathElement;
  private readonly spring: Spring = { x: 0, y: 0, vx: 0, vy: 0 };
  private tx = 0;
  private ty = 0;
  private visible = false;
  private hideAt = 0;
  private squash = 0;
  private lastVx = 0;
  private lastVy = 0;
  private width = 72;
  private wear = 0;
  private shownWear = 0;
  private wake: () => void = () => {};

  constructor() {
    this.tip = s('path', { d: tipPath(0), fill: 'var(--crayon-wax)' });
    const svg = s(
      'svg',
      { viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, 'aria-hidden': 'true', focusable: 'false' },
      this.tip,
      s('path', { d: 'M24 9 H140 C145 9 146 12 146 15 V25 C146 28 145 31 140 31 H24 Z', fill: 'var(--crayon-wax)' }),
      s('path', { d: 'M27 12.5 H138', stroke: 'rgba(255,255,255,0.16)', 'stroke-width': 2, 'stroke-linecap': 'round' }),
      s('rect', { x: 50, y: 8, width: 82, height: 24, rx: 2, fill: 'var(--frame-taupe)' }),
      s('path', { d: 'M56 8 V32 M126 8 V32 M64 20 H118', stroke: 'var(--frame-taupe-dark)', 'stroke-width': 1.4, 'stroke-linecap': 'round', opacity: 0.8 }),
    );
    this.element = document.createElement('div');
    this.element.className = 'tool-cursor';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.hidden = true;
    this.element.append(svg);
  }

  /** Let the cursor wake the shared frame loop when the pointer moves. */
  connect(wake: () => void): void {
    this.wake = wake;
  }

  /** Size the crayon to the sheet: about a third of its width. */
  sizeTo(sheetWidthPx: number): void {
    this.width = Math.max(44, Math.min(110, sheetWidthPx * 0.33));
    this.element.style.width = `${this.width}px`;
    this.element.style.height = `${(this.width * VIEW_H) / VIEW_W}px`;
    this.element.style.transformOrigin = `${(TIP_X / VIEW_W) * this.width}px ${(TIP_Y / VIEW_H) * this.width * (VIEW_H / VIEW_W)}px`;
  }

  /** Point the crayon's tip at a pointer position (client px). */
  point(x: number, y: number, pointerType: string): void {
    const touch = pointerType === 'touch';
    this.tx = x + (touch ? TOUCH_OFFSET_X : 0);
    this.ty = y + (touch ? TOUCH_OFFSET_Y : 0);
    if (!this.visible) {
      this.spring.x = this.tx;
      this.spring.y = this.ty;
      this.spring.vx = this.spring.vy = 0;
      this.visible = true;
      this.element.hidden = false;
      this.element.classList.remove('is-leaving');
    }
    this.hideAt = 0;
    this.wake();
  }

  /** Put the cursor away, after `delay` ms (touch strokes linger briefly). */
  hide(delay = 0): void {
    if (!this.visible) return;
    if (delay === 0) {
      this.visible = false;
      this.element.hidden = true;
      return;
    }
    this.hideAt = performance.now() + delay;
    this.element.classList.add('is-leaving');
    this.wake();
  }

  /** Wear the tip down by a rubbing distance in sheet units. */
  addWear(distance: number): void {
    this.wear = Math.min(1, this.wear + distance / WEAR_DISTANCE);
  }

  get tipWear(): number {
    return this.wear;
  }

  readonly frame: FrameTask = (now) => {
    if (!this.visible) return false;
    if (this.hideAt && now >= this.hideAt) {
      this.hide(0);
      return false;
    }
    const sp = this.spring;
    springStep(sp, this.tx, this.ty);
    // Squash on each change of scrub direction, horizontal or vertical.
    if (reversed(this.lastVx, sp.vx) || reversed(this.lastVy, sp.vy)) this.squash = 1;
    this.lastVx = sp.vx;
    this.lastVy = sp.vy;
    this.squash *= 0.78;
    // With reduced motion the crayon still follows the pointer, but doesn't lean or squash.
    const still = prefersReducedMotion();
    const q = still || this.squash < 0.01 ? 0 : this.squash;
    const ox = (TIP_X / VIEW_W) * this.width;
    const oy = (TIP_Y / VIEW_W) * this.width;
    this.element.style.transform =
      `translate3d(${sp.x - ox}px, ${sp.y - oy}px, 0) rotate(${BASE_ANGLE + (still ? 0 : tiltFor(sp.vx))}deg) ` +
      `scale(${1 + 0.06 * q}, ${1 - 0.06 * q})`;
    if (this.wear - this.shownWear >= 0.02) {
      this.shownWear = this.wear;
      this.tip.setAttribute('d', tipPath(this.wear));
    }
    const moving = Math.abs(sp.vx) + Math.abs(sp.vy) > 0.05 || Math.abs(sp.x - this.tx) + Math.abs(sp.y - this.ty) > 0.2;
    return moving || q > 0 || this.hideAt > 0;
  };
}

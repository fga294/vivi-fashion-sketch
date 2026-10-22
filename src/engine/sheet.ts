// The drawing sheet: six stacked canvases in sheet units (600 × 1500), backed at
// min(devicePixelRatio, 2). Layers allocate on first use, so ones a phase doesn't
// need yet (colour, pattern, fx) cost no memory.

import { SHEET } from '../art/bands.ts';
import { h } from '../ui/dom.ts';
import { mulberry32 } from './random.ts';

export const LAYER_NAMES = ['paper', 'colour', 'tone', 'pattern', 'lines', 'fx'] as const;
export type LayerName = (typeof LAYER_NAMES)[number];

/** The haze layer stores full-strength wax and is shown at this opacity (PLAN.md: 10–14%). */
export const TONE_OPACITY = 0.13;

export class Sheet {
  readonly element: HTMLElement;
  /** Backing pixels per sheet unit. */
  readonly scale: number;
  readonly pxWidth: number;
  readonly pxHeight: number;
  private readonly canvases: Record<LayerName, HTMLCanvasElement>;
  private readonly contexts = new Map<LayerName, CanvasRenderingContext2D>();
  private rect: DOMRect | null = null;

  constructor(scale: number = Math.min(window.devicePixelRatio || 1, 2)) {
    this.scale = scale;
    this.pxWidth = Math.round(SHEET.width * scale);
    this.pxHeight = Math.round(SHEET.height * scale);
    this.canvases = Object.fromEntries(
      LAYER_NAMES.map((name) => [name, h('canvas', { class: `layer layer--${name}`, hidden: true })]),
    ) as Record<LayerName, HTMLCanvasElement>;
    this.element = h(
      'div',
      { class: 'sheet is-peek', role: 'img', 'aria-label': 'Drawing paper. Rub it with the crayon to reveal the outfit.', hidden: true },
      ...LAYER_NAMES.map((n) => this.canvases[n]),
    );
  }

  /** A layer's context (backing pixels, identity transform), allocating it on first use. */
  layer(name: LayerName): CanvasRenderingContext2D {
    let ctx = this.contexts.get(name);
    if (!ctx) {
      const canvas = this.canvases[name];
      canvas.width = this.pxWidth;
      canvas.height = this.pxHeight;
      canvas.hidden = false;
      ctx = canvas.getContext('2d')!;
      this.contexts.set(name, ctx);
    }
    return ctx;
  }

  /** Put an extra element (the celebration glow) in the stack, just under a layer, without allocating it. */
  insertUnder(el: HTMLElement, name: LayerName): void {
    this.element.insertBefore(el, this.canvases[name]);
  }

  canvas(name: LayerName): HTMLCanvasElement {
    this.layer(name);
    return this.canvases[name];
  }

  /** Off-white paper with a little tooth from the grain and scattered fibres. */
  paintPaper(seed: number, grain: HTMLCanvasElement): void {
    const ctx = this.layer('paper');
    const s = this.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#FBF8F1';
    ctx.fillRect(0, 0, this.pxWidth, this.pxHeight);
    ctx.globalAlpha = 0.018;
    ctx.fillStyle = ctx.createPattern(grain, 'repeat')!;
    ctx.fillRect(0, 0, this.pxWidth, this.pxHeight);

    const rnd = mulberry32(seed);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.lineCap = 'round';
    for (let i = 0; i < 900; i++) {
      const x = rnd() * SHEET.width;
      const y = rnd() * SHEET.height;
      const len = 4 + rnd() * 18;
      const a = rnd() * Math.PI * 2;
      const bend = (rnd() - 0.5) * 6;
      const dark = rnd() < 0.55;
      ctx.globalAlpha = dark ? 0.06 : 0.5;
      ctx.strokeStyle = dark ? '#96805F' : '#FFFFFF';
      ctx.lineWidth = 0.3 + rnd() * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + (Math.cos(a) * len) / 2 - Math.sin(a) * bend,
        y + (Math.sin(a) * len) / 2 + Math.cos(a) * bend,
        x + Math.cos(a) * len,
        y + Math.sin(a) * len,
      );
      ctx.stroke();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  /** Clear every drawing layer (not the paper). */
  clear(): void {
    for (const [name, ctx] of this.contexts) {
      if (name === 'paper') continue;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.pxWidth, this.pxHeight);
    }
  }

  /**
   * Measure where the paper sits on screen; call at the start of each stroke.
   * Uses the window the sheet is registered to, not the sheet itself, so a stroke
   * started while the paper is still sliding in lands where the paper will be.
   */
  measure(): void {
    this.rect = (this.element.parentElement ?? this.element).getBoundingClientRect();
  }

  /** Convert a pointer position to sheet units, writing into `out` (no allocation). */
  toSheet(clientX: number, clientY: number, out: { x: number; y: number }): void {
    const r = this.rect ?? (this.rect = this.element.getBoundingClientRect());
    out.x = ((clientX - r.left) / r.width) * SHEET.width;
    out.y = ((clientY - r.top) / r.height) * SHEET.height;
  }
}

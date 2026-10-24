// Exporting a sheet (PLAN.md: paper, colour, rub tone, pattern and lines, never
// the effects, into a 1200 × 3000 PNG), and the blank colouring page: the current
// plates' lines, fully revealed and uncoloured, for colouring on real paper.

import { SHEET } from '../art/bands.ts';
import type { Slots } from '../state.ts';
import { CRAYON_WAX } from './rub.ts';
import { TONE_OPACITY, type Sheet } from './sheet.ts';

export const EXPORT_W = 1200;
export const EXPORT_H = 3000;

function canvas2d(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

/**
 * The sheet as it looks in the frame, at 1200 × 3000: the paper at full strength
 * (Peek only thins it on screen), colour multiplied over it, the wax haze at its
 * on-screen 13%, then the pattern and the lines. Never the effects layer.
 */
export function exportSheet(sheet: Sheet): HTMLCanvasElement {
  const ctx = canvas2d(EXPORT_W, EXPORT_H);
  const draw = (name: 'paper' | 'colour' | 'tone' | 'pattern' | 'lines', alpha = 1, op: GlobalCompositeOperation = 'source-over'): void => {
    if (!sheet.has(name)) return;
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = op;
    ctx.drawImage(sheet.canvas(name), 0, 0, EXPORT_W, EXPORT_H);
  };
  ctx.fillStyle = '#FBF8F1';
  ctx.fillRect(0, 0, EXPORT_W, EXPORT_H);
  draw('paper');
  draw('colour', 1, 'multiply');
  draw('tone', TONE_OPACITY);
  draw('pattern');
  draw('lines');
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return ctx.canvas;
}

/** The plates in the frame, every line revealed, on plain white: a page to colour at home. */
export function blankPage(slots: Slots): HTMLCanvasElement {
  const ctx = canvas2d(EXPORT_W, EXPORT_H);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, EXPORT_W, EXPORT_H);
  const k = EXPORT_W / SHEET.width;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CRAYON_WAX;
  for (const plate of Object.values(slots)) for (const d of plate.paths) ctx.stroke(new Path2D(d));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx.canvas;
}

/** A small copy for the sketchbook's grid. */
export function thumbnail(source: CanvasImageSource, width = 160): HTMLCanvasElement {
  const ctx = canvas2d(width, Math.round((width * EXPORT_H) / EXPORT_W));
  ctx.drawImage(source, 0, 0, ctx.canvas.width, ctx.canvas.height);
  return ctx.canvas;
}

/** A canvas as a PNG blob. */
export function pngOf(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
}

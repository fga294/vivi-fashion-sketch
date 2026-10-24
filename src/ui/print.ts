// Printing one sheet (PLAN.md: a print stylesheet shows only the sheet, centred on
// A4 or Letter, with a small "Vivi Fashion Dresses" footer). The page carries a
// print-only container with a canvas, drawn just before printing; a canvas
// prints straight away, where a fresh image might still be decoding. The
// browser's own Print command prints the sheet in the frame the same way.

import { EXPORT_H, EXPORT_W } from '../engine/export.ts';
import { h } from './dom.ts';

export interface Printer {
  /** Print this image (a sheet or a blank colouring page) on its own page. */
  print(image: CanvasImageSource): void;
}

/** `current` gives what the browser's Print command should print: the sheet in the frame, if any. */
export function connectPrint(current: () => CanvasImageSource | null): Printer {
  let canvas: HTMLCanvasElement | null = null;
  const holder = h('div', { class: 'print-sheet', 'aria-hidden': 'true' }, h('p', { class: 'print-sheet__footer' }, 'Vivi Fashion Dresses'));
  document.body.append(holder);
  let chosen = false;

  const show = (image: CanvasImageSource | null): void => {
    if (!image) {
      holder.classList.remove('is-ready');
      return;
    }
    if (!canvas) {
      canvas = h('canvas', { class: 'print-sheet__art', width: EXPORT_W, height: EXPORT_H });
      holder.prepend(canvas);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, EXPORT_W, EXPORT_H);
    ctx.drawImage(image, 0, 0, EXPORT_W, EXPORT_H);
    holder.classList.add('is-ready');
  };

  // The browser's own Print command (or ⌘P) prints the sheet in the frame.
  window.addEventListener('beforeprint', () => {
    if (!chosen) show(current());
  });
  window.addEventListener('afterprint', () => {
    chosen = false;
  });

  return {
    print(image) {
      show(image);
      chosen = true;
      window.print();
    },
  };
}

// Auto-rub (PLAN.md, Accessibility): for players who can't scrub, a button that
// sends the crayon across the next unfinished band, back and forth, through the
// same rubbing engine, scratch and crumbs as a hand. The band completes, shimmers
// and giggles as usual. It always reveals the figure's lines, even with a pattern
// plate tucked in.

import { BANDS, type PlateBand } from '../art/bands.ts';
import { polylines, type Point } from '../art/geometry.ts';
import type { Game } from '../state.ts';
import { announce } from './announce.ts';
import { h } from './dom.ts';
import { icon } from './icons.ts';
import { wiggle } from './motion.ts';
import type { PaperView, StrokeSound } from './paper.ts';
import type { TrayView } from './tray.ts';
import { KIND_NAMES } from './wells.ts';

/** Crayon speed (sheet units per ms) and row spacing: rows closer than the 40-unit stamp leave no gaps. */
export const AUTO_SPEED = 3;
export const AUTO_ROW = 28;
const MARGIN = 16;

/** Back-and-forth rows covering a rectangle, starting top left. */
export function zigzag(x0: number, y0: number, x1: number, y1: number, row = AUTO_ROW): Point[] {
  const pts: Point[] = [];
  const rows = Math.max(1, Math.ceil((y1 - y0) / row));
  for (let i = 0; i <= rows; i++) {
    const y = y0 + ((y1 - y0) * i) / rows;
    pts.push(i % 2 ? { x: x1, y } : { x: x0, y }, i % 2 ? { x: x0, y } : { x: x1, y });
  }
  return pts;
}

/** The box around a plate's lines within its band, with a margin. */
export function extent(paths: readonly string[], band: PlateBand): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const d of paths) {
    for (const line of polylines(d, 4)) {
      for (const p of line) {
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
    }
  }
  const { y0: b0, y1: b1 } = BANDS[band];
  return [Math.max(0, x0 - MARGIN), Math.max(b0, y0 - MARGIN), Math.min(600, x1 + MARGIN), Math.min(b1, y1 + MARGIN)];
}

export function connectAutoRub(game: Game, tray: TrayView, paper: PaperView, sound: StrokeSound): void {
  const { rub, fx, cursor } = paper;
  const button = h(
    'button',
    { type: 'button', class: 'bump bump--frame autorub-btn', 'aria-label': 'Auto-rub: the crayon rubs the next part for you', hidden: true },
    h('span', { class: 'bump__dome' }, icon('autoRub')),
    h('span', { class: 'bump__label', 'aria-hidden': 'true' }, 'Auto'),
  );
  tray.frame.mountOverlay(button);

  const next = (): PlateBand | undefined =>
    [...rub.armed].sort((a, b) => BANDS[a].y0 - BANDS[b].y0).find((band) => !rub.isDone(band) && game.slots[band]);
  const show = (): void => {
    button.hidden = game.phase !== 'paperDown' || !next();
    button.setAttribute('aria-disabled', String(paper.autoRubbing));
  };
  for (const e of ['paper:lay', 'paper:lift', 'paper:new', 'band:complete'] as const) game.bus.on(e, show);

  let raf = 0;
  let finish: (() => void) | null = null;
  const stop = (): void => {
    window.cancelAnimationFrame(raf);
    finish?.();
  };
  game.bus.on('paper:lift', stop);
  game.bus.on('paper:new', stop);

  button.addEventListener('click', () => {
    const band = next();
    if (!band || paper.autoRubbing || game.phase !== 'paperDown') {
      if (paper.autoRubbing) wiggle(button);
      return;
    }
    paper.endStroke();
    if (game.tool !== 'crayon') game.setTool('crayon');
    const [x0, y0, x1, y1] = extent(game.slots[band]!.paths, band);
    const path = zigzag(x0, y0, x1, y1);
    const resume = rub.suspendPattern();
    paper.autoRubbing = true;
    show();
    announce(`Rubbing the ${KIND_NAMES[band].toLowerCase()} for you.`);

    const win = tray.frame.windowElement.getBoundingClientRect();
    cursor.sizeTo(win.width);
    const toScreen = (p: Point): [number, number] => [win.left + (p.x / 600) * win.width, win.top + (p.y / 1500) * win.height];
    const first = path[0]!;
    rub.begin(first.x, first.y, 0.85);
    fx.strokeStart(first.x, first.y);
    sound.scratchStart('crayon');
    cursor.point(...toScreen(first), 'mouse');

    let leg = 0; // the segment path[leg] → path[leg + 1]
    let along = 0; // units into that segment
    let last = performance.now();
    finish = () => {
      finish = null;
      rub.end();
      fx.strokeEnd();
      sound.scratchEnd();
      resume();
      cursor.hide(260);
      paper.autoRubbing = false;
      game.bus.emit('sheet:changed', {});
      show();
    };
    const step = (now: number): void => {
      const dt = Math.min(50, now - last);
      last = now;
      let travel = AUTO_SPEED * dt;
      let at = path[leg]!;
      while (travel > 0 && leg < path.length - 1) {
        const a = path[leg]!;
        const b = path[leg + 1]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (along + travel < len) {
          along += travel;
          travel = 0;
          at = { x: a.x + ((b.x - a.x) * along) / len, y: a.y + ((b.y - a.y) * along) / len };
        } else {
          travel -= len - along;
          along = 0;
          leg++;
          at = b;
        }
        rub.move(at.x, at.y, 0.85);
      }
      fx.strokeMove(at.x, at.y);
      sound.scratchMove(AUTO_SPEED);
      cursor.point(...toScreen(at), 'mouse');
      if (leg < path.length - 1) raf = window.requestAnimationFrame(step);
      else finish?.();
    };
    raf = window.requestAnimationFrame(step);
  });

  show();
}

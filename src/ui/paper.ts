// Paper and rubbing: laying, lifting and re-laying the sheet, the crayon, and
// pointer input on the paper feeding the rubbing engine.

import { Loop } from '../engine/loop.ts';
import { RubEngine, strengthFor } from '../engine/rub.ts';
import { Sheet } from '../engine/sheet.ts';
import type { Game } from '../state.ts';
import { announce } from './announce.ts';
import { prefersReducedMotion } from './motion.ts';
import type { TrayView } from './tray.ts';

const wiggle = (el: Element): void => {
  if (prefersReducedMotion()) return;
  el.animate(
    [{ transform: 'none' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(-3deg)' }, { transform: 'none' }],
    { duration: 420, easing: 'ease-in-out' },
  );
};

export interface PaperView {
  readonly sheet: Sheet;
  readonly rub: RubEngine;
  readonly loop: Loop;
}

export function connectPaper(game: Game, tray: TrayView): PaperView {
  const { frame } = tray;
  const loop = new Loop();
  const sheet = new Sheet();
  const rub = new RubEngine(sheet, game.bus, loop);
  frame.mountSheet(sheet.element);
  let paperSeed = 1;

  // ---------- Paper ----------

  frame.paperButton.addEventListener('click', () => {
    if (game.phase === 'paperDown') game.liftPaper();
    else game.layPaper();
  });

  game.bus.on('paper:lay', ({ fresh }) => {
    if (fresh) {
      sheet.clear();
      sheet.paintPaper(paperSeed++, rub.grain);
    }
    frame.resetProgress();
    rub.arm(game.slots);
    sheet.element.hidden = false;
    frame.setPaper('down');
    if (fresh && !prefersReducedMotion()) {
      // The sheet slides in from the paper stack, then the window closes over it.
      sheet.element
        .animate([{ transform: 'translateX(-112%) rotate(-4deg)', opacity: 0.6 }, { transform: 'none', opacity: 1 }], {
          duration: 420,
          easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
        })
        .finished.then(() => frame.clack(), () => undefined);
    } else {
      window.setTimeout(() => frame.clack(), prefersReducedMotion() ? 0 : 380);
    }
    if (game.tool === 'none') game.setTool('crayon');
    announce(fresh ? 'Paper in. Rub with the crayon.' : 'Paper back down.');
  });

  game.bus.on('paper:lift', () => {
    frame.setPaper('lifted');
    announce('Paper lifted. Swap plates, then lay it back.');
  });

  game.bus.on('paper:new', () => {
    frame.setPaper('none');
    frame.resetProgress();
    const done = (): void => {
      sheet.element.hidden = true;
      sheet.clear();
    };
    if (prefersReducedMotion()) done();
    else
      sheet.element
        .animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(112%) rotate(5deg)', opacity: 0 }], {
          duration: 380,
          easing: 'cubic-bezier(0.5, 0, 0.75, 0.4)',
        })
        .finished.then(done, done);
    announce('New sheet.');
  });

  game.bus.on('plate:locked', () => wiggle(frame.paperButton));
  tray.bump('new').addEventListener('click', () => {
    if (!game.newSheet()) wiggle(frame.paperButton);
  });

  // ---------- Crayon ----------

  tray.crayon.addEventListener('click', () => game.setTool(game.tool === 'crayon' ? 'none' : 'crayon'));
  game.bus.on('tool:change', ({ tool }) => {
    tray.crayon.setAttribute('aria-pressed', String(tool === 'crayon'));
    sheet.element.dataset['tool'] = tool;
  });

  // ---------- Progress ----------

  game.bus.on('band:progress', ({ band, progress }) => frame.setProgress(band, progress));

  // ---------- Rubbing input ----------

  const pos = { x: 0, y: 0 };
  let active = -1;
  const el = sheet.element;

  el.addEventListener('pointerdown', (e) => {
    if (game.phase !== 'paperDown' || active !== -1 || !e.isPrimary) return; // one stroke at a time: palms and second fingers are ignored
    e.preventDefault();
    if (game.tool !== 'crayon') {
      wiggle(tray.crayon);
      return;
    }
    active = e.pointerId;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointers can't be captured; the stroke still works.
    }
    sheet.measure();
    sheet.toSheet(e.clientX, e.clientY, pos);
    rub.begin(pos.x, pos.y, strengthFor(e.pointerType, e.pressure));
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== active) return;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (events.length === 0) {
      sheet.toSheet(e.clientX, e.clientY, pos);
      rub.move(pos.x, pos.y, strengthFor(e.pointerType, e.pressure));
      return;
    }
    for (const ev of events) {
      sheet.toSheet(ev.clientX, ev.clientY, pos);
      rub.move(pos.x, pos.y, strengthFor(ev.pointerType, ev.pressure));
    }
  });

  const end = (e: PointerEvent): void => {
    if (e.pointerId !== active) return;
    active = -1;
    rub.end();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  return { sheet, rub, loop };
}

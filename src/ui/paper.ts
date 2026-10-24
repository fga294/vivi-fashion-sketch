// Paper and rubbing: laying, lifting and re-laying the sheet, the crayon, and
// pointer input on the paper feeding the rubbing engine.

import { crayonById, CRAYONS } from '../art/colours.ts';
import { Loop } from '../engine/loop.ts';
import { StayInside } from '../engine/pattern.ts';
import { RubEngine, strengthFor } from '../engine/rub.ts';
import { Sheet } from '../engine/sheet.ts';
import { CrayonCursor } from '../fx/cursor.ts';
import { FxLayer } from '../fx/layer.ts';
import { ScrubFx } from '../fx/scrub.ts';
import type { Game } from '../state.ts';
import { announce } from './announce.ts';
import { prefersReducedMotion, wiggle } from './motion.ts';
import type { TrayView } from './tray.ts';

/** The crayon's scratching sound, following each stroke (the sound engine provides it). */
export interface StrokeSound {
  scratchStart(): void;
  /** Stroke speed in sheet units per ms. */
  scratchMove(speed: number): void;
  scratchEnd(): void;
}

export interface PaperView {
  readonly sheet: Sheet;
  readonly rub: RubEngine;
  readonly loop: Loop;
  /** The fx canvas every effect draws on. */
  readonly fxLayer: FxLayer;
  readonly fx: ScrubFx;
  readonly cursor: CrayonCursor;
  /** Keeps pattern strokes inside the closed area they start in. */
  readonly stayInside: StayInside;
}

export function connectPaper(game: Game, tray: TrayView, sound: StrokeSound): PaperView {
  const { frame } = tray;
  const loop = new Loop();
  const sheet = new Sheet();
  const rub = new RubEngine(sheet, game.bus, loop);
  frame.mountSheet(sheet.element);
  let paperSeed = 1;

  const fxLayer = new FxLayer(sheet, loop);
  const fx = new ScrubFx(sheet, fxLayer, frame.windowElement);
  rub.onReveal = fx.revealed;
  const stayInside = new StayInside();
  const cursor = new CrayonCursor();
  cursor.connect(() => loop.wake());
  loop.add(cursor.frame);
  document.body.append(cursor.element);

  // ---------- Paper ----------

  const clack = (): void => {
    frame.clack();
    game.bus.emit('paper:clack', {});
  };

  frame.paperButton.addEventListener('click', () => {
    if (game.phase === 'paperDown') game.liftPaper();
    else game.layPaper();
  });

  game.bus.on('paper:lay', ({ fresh }) => {
    if (fresh) {
      sheet.clear();
      sheet.paintPaper(paperSeed++, rub.grain);
      // Allocate the layers rubbing draws on now, during the slide-in, so the first scrub doesn't stutter.
      sheet.layer('tone');
      sheet.layer('lines');
      sheet.layer('fx');
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
        .finished.then(clack, () => undefined);
    } else {
      window.setTimeout(clack, prefersReducedMotion() ? 0 : 380);
    }
    if (game.tool === 'none') game.setTool('crayon');
    announce(fresh ? 'Paper in. Rub with the crayon.' : 'Paper back down.');
  });

  game.bus.on('paper:lift', () => {
    endStroke(); // a second finger can lift the paper mid-stroke
    rub.finishSweeps(); // the outfit is always complete before the paper swings away
    cursor.hide();
    fx.settle();
    frame.setPaper('lifted');
    announce('Paper lifted. Swap plates, then lay it back.');
  });

  game.bus.on('paper:new', () => {
    endStroke();
    cursor.hide();
    fx.reset();
    fxLayer.reset();
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

  // ---------- Crayons ----------

  // Tapping a crayon picks it up (putting down the one in hand); tapping the one in hand puts it back.
  for (const c of CRAYONS) {
    tray.crayons[c.id].addEventListener('click', () => {
      if (game.tool === 'crayon' && game.crayon === c.id) {
        game.setTool('none');
        return;
      }
      game.setCrayon(c.id);
      game.setTool('crayon');
    });
  }
  const showCrayons = (): void => {
    for (const c of CRAYONS) tray.crayons[c.id].setAttribute('aria-pressed', String(game.tool === 'crayon' && game.crayon === c.id));
  };
  game.bus.on('tool:change', ({ tool }) => {
    showCrayons();
    sheet.element.dataset['tool'] = tool;
    if (tool !== 'crayon') cursor.hide();
  });
  game.bus.on('crayon:change', ({ crayon }) => {
    const { hex } = crayonById(crayon);
    rub.setColour(hex);
    fx.crumbColour = hex;
    cursor.setColour(hex);
    showCrayons();
  });

  // ---------- Progress ----------

  game.bus.on('band:progress', ({ band, progress }) => frame.setProgress(band, progress));
  frame.onBeadFill((band, count) => game.bus.emit('bead:fill', { band, count }));

  // ---------- Rubbing input ----------

  const pos = { x: 0, y: 0 };
  let active = -1;
  let lastMove = 0;
  const el = sheet.element;
  const crayonReady = (): boolean => game.phase === 'paperDown' && game.tool === 'crayon';
  const showCursor = (e: PointerEvent): void => {
    cursor.sizeTo(el.getBoundingClientRect().width);
    cursor.point(e.clientX, e.clientY, e.pointerType);
  };

  // Mouse and Apple Pencil hover: the crayon follows the pointer over the paper.
  el.addEventListener('pointerenter', (e) => {
    if (crayonReady() && e.pointerType !== 'touch') showCursor(e);
  });
  el.addEventListener('pointerleave', () => {
    if (active === -1) cursor.hide();
  });

  el.addEventListener('pointerdown', (e) => {
    if (game.phase !== 'paperDown' || active !== -1 || !e.isPrimary) return; // one stroke at a time: palms and second fingers are ignored
    e.preventDefault();
    if (game.tool !== 'crayon') {
      wiggle(tray.crayons[game.crayon]);
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
    // A pattern stroke stays in the closed area it starts in (null when Stay inside is off, or outside every area).
    rub.begin(pos.x, pos.y, strengthFor(e.pointerType, e.pressure), rub.revealsPattern ? stayInside.clipAt(pos.x, pos.y) : null);
    fx.strokeStart(pos.x, pos.y);
    sound.scratchStart();
    lastMove = e.timeStamp;
    showCursor(e);
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== active) {
      if (active === -1 && crayonReady() && e.pointerType !== 'touch') showCursor(e);
      return;
    }
    const lastX = pos.x;
    const lastY = pos.y;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (events.length === 0) {
      sheet.toSheet(e.clientX, e.clientY, pos);
      rub.move(pos.x, pos.y, strengthFor(e.pointerType, e.pressure));
    } else {
      for (const ev of events) {
        sheet.toSheet(ev.clientX, ev.clientY, pos);
        rub.move(pos.x, pos.y, strengthFor(ev.pointerType, ev.pressure));
      }
    }
    fx.strokeMove(pos.x, pos.y);
    const moved = Math.hypot(pos.x - lastX, pos.y - lastY);
    cursor.addWear(moved);
    sound.scratchMove(moved / Math.max(1, e.timeStamp - lastMove));
    lastMove = e.timeStamp;
    cursor.point(e.clientX, e.clientY, e.pointerType);
  });

  function endStroke(): void {
    if (active === -1) return;
    active = -1;
    rub.end();
    fx.strokeEnd();
    sound.scratchEnd();
  }

  const end = (e: PointerEvent): void => {
    if (e.pointerId !== active) return;
    endStroke();
    // A finger leaves the paper, so its crayon goes too; a mouse or pen keeps hovering.
    if (e.pointerType === 'touch' || e.type === 'pointercancel') cursor.hide(260);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  return { sheet, rub, loop, fxLayer, fx, cursor, stayInside };
}

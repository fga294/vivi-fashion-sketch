// Paper, rubbing and colouring input: laying, lifting and re-laying the sheet,
// the crayons, and pointer input on the paper feeding the tool in hand: the
// crayon (rubbing lines or a pattern), a pencil (colouring, or Magic fill on a
// tap) or the eraser. Strokes that can be undone are recorded as one action each.

import { crayonById, CRAYONS, pencilById } from '../art/colours.ts';
import type { ScratchKind } from '../audio/synth.ts';
import { History, sheetTileStore } from '../engine/history.ts';
import { Loop } from '../engine/loop.ts';
import { MagicFill } from '../engine/magic.ts';
import { StayInside } from '../engine/pattern.ts';
import { ColourEngine } from '../engine/pencil.ts';
import { RubEngine, strengthFor } from '../engine/rub.ts';
import { Sheet } from '../engine/sheet.ts';
import { ToolCursor, type CursorKind } from '../fx/cursor.ts';
import { FxLayer } from '../fx/layer.ts';
import { ScrubFx } from '../fx/scrub.ts';
import type { Game, Tool } from '../state.ts';
import { announce } from './announce.ts';
import { prefersReducedMotion, wiggle } from './motion.ts';
import type { TrayView } from './tray.ts';

/** The scratching sound following each stroke (the sound engine provides it). */
export interface StrokeSound {
  scratchStart(kind: ScratchKind): void;
  /** Stroke speed in sheet units per ms. */
  scratchMove(speed: number): void;
  scratchEnd(): void;
}

export interface PaperView {
  readonly sheet: Sheet;
  readonly rub: RubEngine;
  readonly colour: ColourEngine;
  readonly magic: MagicFill;
  /** Undo and redo for pencil, fill, eraser and pattern strokes. */
  readonly history: History<unknown>;
  readonly loop: Loop;
  /** The fx canvas every effect draws on. */
  readonly fxLayer: FxLayer;
  readonly fx: ScrubFx;
  readonly cursor: ToolCursor;
  /** Keeps pattern strokes inside the closed area they start in. */
  readonly stayInside: StayInside;
  /** Finish the stroke in progress, if any, e.g. before an undo. */
  endStroke(): void;
  /** A tap with Magic fill on, at (x, y) in sheet units. */
  onMagicTap: ((x: number, y: number) => void) | null;
  /** Two fingers tapped the paper together (undo on iPad). */
  onTwoFingerTap: (() => void) | null;
  /** Set while a finished sheet flies into the sketchbook, so it doesn't also slide away. */
  leavingToBook: boolean;
  /** Set while Auto-rub drives the crayon; strokes on the paper wait for it. */
  autoRubbing: boolean;
}

/** With Magic fill on, a press that travels less than this (units) is a tap. */
const TAP_TRAVEL = 14;
/** Two-finger tap: the second finger lands within this of the first (ms), both lift within TWO_FINGER_UP. */
const TWO_FINGER_GAP = 250;
const TWO_FINGER_UP = 450;
const TWO_FINGER_SLOP = 14;

const SPRITE: Record<Tool, CursorKind> = { none: 'crayon', crayon: 'crayon', pencil: 'pencil', eraser: 'eraser' };

export function connectPaper(game: Game, tray: TrayView, sound: StrokeSound): PaperView {
  const { frame } = tray;
  const loop = new Loop();
  const sheet = new Sheet();
  const rub = new RubEngine(sheet, game.bus, loop);
  const colour = new ColourEngine(sheet, loop, rub.field);
  const magic = new MagicFill(sheet, colour.tooth, () => rub.revealedLines());
  const history = new History<unknown>(sheetTileStore(sheet), sheet.pxWidth, sheet.pxHeight);
  rub.history = colour.history = magic.history = history;
  history.onChange = () => game.bus.emit('history:change', { canUndo: history.canUndo, canRedo: history.canRedo });
  frame.mountSheet(sheet.element);
  let paperSeed = 1;

  const fxLayer = new FxLayer(sheet, loop);
  const fx = new ScrubFx(sheet, fxLayer, frame.windowElement);
  rub.onReveal = fx.revealed;
  const stayInside = new StayInside();
  const cursor = new ToolCursor();
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
    rub.arm(game.slots, fresh);
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
    history.clear();
    cursor.hide();
    fx.reset();
    fxLayer.reset();
    frame.setPaper('none');
    frame.resetProgress();
    const done = (): void => {
      sheet.element.hidden = true;
      sheet.clear();
      rub.linesVersion++; // the lines Magic fill reads are gone too
    };
    if (view.leavingToBook) {
      view.leavingToBook = false; // its copy is fluttering into the sketchbook
      done();
    } else if (prefersReducedMotion()) done();
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

  // ---------- Tools in hand ----------

  // Tapping a crayon picks it up (putting down the tool in hand); tapping the one in hand puts it back.
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
    endStroke(); // a second finger can change tools mid-stroke
    showCrayons();
    sheet.element.dataset['tool'] = tool;
    // The colour layer arrives with the first pencil: one more full-size blended layer
    // to composite costs a frame now and then while scrubbing, so not before it's needed.
    if (tool === 'pencil' && game.phase !== 'noPaper') sheet.layer('colour');
    cursor.show(SPRITE[tool]);
    if (tool === 'none') cursor.hide();
  });
  game.bus.on('crayon:change', ({ crayon }) => {
    const { hex } = crayonById(crayon);
    rub.setColour(hex);
    fx.crumbColour = hex;
    cursor.setColour(hex);
    showCrayons();
  });
  const showPencil = (): void => {
    const { hex } = pencilById(game.pencil);
    colour.setColour(hex);
    cursor.setPencil(hex, game.magic);
  };
  game.bus.on('pencil:change', showPencil);
  game.bus.on('magic:change', showPencil);
  showPencil();

  // ---------- Progress ----------

  game.bus.on('band:progress', ({ band, progress }) => frame.setProgress(band, progress));
  frame.onBeadFill((band, count) => game.bus.emit('bead:fill', { band, count }));

  // ---------- Pointer input on the paper ----------

  type Stroke = 'rub' | 'pencil' | 'eraser' | 'tap';
  const pos = { x: 0, y: 0 };
  const start = { x: 0, y: 0 };
  let active = -1;
  let stroke: Stroke = 'rub';
  let travelled = 0;
  let lastMove = 0;
  const el = sheet.element;
  const toolReady = (): boolean => game.phase === 'paperDown' && game.tool !== 'none';
  const showCursor = (e: PointerEvent): void => {
    cursor.sizeTo(el.getBoundingClientRect().width);
    cursor.point(e.clientX, e.clientY, e.pointerType);
  };

  // Mouse and Apple Pencil hover: the tool follows the pointer over the paper.
  el.addEventListener('pointerenter', (e) => {
    if (toolReady() && e.pointerType !== 'touch') showCursor(e);
  });
  el.addEventListener('pointerleave', () => {
    if (active === -1) cursor.hide();
  });

  // Two fingers landing together and lifting together, without sliding, undo (on iPad).
  const touches = new Map<number, { x: number; y: number; t: number }>();
  let twoFinger: { at: number; moved: boolean } | null = null;
  const view: PaperView = {
    sheet,
    rub,
    colour,
    magic,
    history,
    loop,
    fxLayer,
    fx,
    cursor,
    stayInside,
    endStroke,
    onMagicTap: null,
    onTwoFingerTap: null,
    leavingToBook: false,
    autoRubbing: false,
  };

  el.addEventListener('pointerdown', (e) => {
    if (game.phase !== 'paperDown') return;
    if (e.pointerType === 'touch') {
      if (e.isPrimary) touches.clear(); // a primary touch starts a fresh gesture
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
      try {
        el.setPointerCapture(e.pointerId); // so a finger that slides off the paper still reports lifting
      } catch {
        // Synthetic pointers can't be captured.
      }
      if (touches.size === 2) {
        const first = Math.min(...[...touches.values()].map((t) => t.t));
        if (e.timeStamp - first <= TWO_FINGER_GAP) {
          twoFinger = { at: first, moved: false };
          abortStroke(); // the first finger's mark was the start of a tap, not a stroke
        }
      } else if (touches.size > 2) twoFinger = null;
    }
    if (active !== -1 || !e.isPrimary || view.autoRubbing) return; // one stroke at a time: palms and second fingers are ignored
    e.preventDefault();
    if (game.tool === 'none') {
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
    start.x = pos.x;
    start.y = pos.y;
    travelled = 0;
    const strength = strengthFor(e.pointerType, e.pressure);
    if (game.tool === 'crayon') {
      stroke = 'rub';
      // Pattern strokes can be undone; rubbed lines stay. A pattern stroke stays in the
      // closed area it starts in (null when Stay inside is off, or outside every area).
      if (rub.revealsPattern) history.begin();
      rub.begin(pos.x, pos.y, strength, rub.revealsPattern ? stayInside.clipAt(pos.x, pos.y) : null);
      fx.strokeStart(pos.x, pos.y);
      sound.scratchStart('crayon');
    } else if (game.tool === 'pencil' && game.magic) {
      stroke = 'tap';
    } else {
      stroke = game.tool === 'eraser' ? 'eraser' : 'pencil';
      history.begin();
      colour.begin(stroke, pos.x, pos.y, strength);
      sound.scratchStart(stroke);
    }
    lastMove = e.timeStamp;
    showCursor(e);
  });

  el.addEventListener('pointermove', (e) => {
    const t = touches.get(e.pointerId);
    if (t && twoFinger && Math.hypot(e.clientX - t.x, e.clientY - t.y) > TWO_FINGER_SLOP) twoFinger.moved = true;
    if (e.pointerId !== active) {
      if (active === -1 && toolReady() && e.pointerType !== 'touch') showCursor(e);
      return;
    }
    const lastX = pos.x;
    const lastY = pos.y;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const list = events.length > 0 ? events : [e];
    for (const ev of list) {
      sheet.toSheet(ev.clientX, ev.clientY, pos);
      const strength = strengthFor(ev.pointerType, ev.pressure);
      if (stroke === 'rub') rub.move(pos.x, pos.y, strength);
      else if (stroke !== 'tap') colour.move(pos.x, pos.y, strength);
    }
    const moved = Math.hypot(pos.x - lastX, pos.y - lastY);
    travelled += moved;
    if (stroke === 'rub') {
      fx.strokeMove(pos.x, pos.y);
      cursor.addWear(moved);
    }
    if (stroke !== 'tap') sound.scratchMove(moved / Math.max(1, e.timeStamp - lastMove));
    lastMove = e.timeStamp;
    cursor.point(e.clientX, e.clientY, e.pointerType);
  });

  /** Finish the stroke in progress; an undoable one becomes a step in the history. */
  function endStroke(): void {
    if (active === -1) return;
    active = -1;
    if (stroke === 'tap') return;
    if (stroke === 'rub') {
      rub.end();
      fx.strokeEnd();
    } else {
      colour.end();
    }
    sound.scratchEnd();
    history.commit();
    game.bus.emit('sheet:changed', {});
  }

  /** Throw the stroke in progress away, putting back anything undoable it drew. */
  function abortStroke(): void {
    if (active === -1) return;
    active = -1;
    if (stroke === 'tap') return;
    if (stroke === 'rub') {
      rub.end();
      fx.strokeEnd();
    } else {
      colour.end();
    }
    sound.scratchEnd();
    history.abort();
  }

  const lifted = (e: PointerEvent): void => {
    if (!touches.delete(e.pointerId) || touches.size > 0 || !twoFinger) return;
    const tap = !twoFinger.moved && e.type === 'pointerup' && e.timeStamp - twoFinger.at <= TWO_FINGER_UP;
    twoFinger = null;
    if (tap) view.onTwoFingerTap?.();
  };

  const end = (e: PointerEvent): void => {
    if (e.pointerId === active) {
      const tap = stroke === 'tap' && e.type === 'pointerup' && travelled < TAP_TRAVEL;
      endStroke();
      if (tap) view.onMagicTap?.(start.x, start.y);
      // A finger leaves the paper, so its tool goes too; a mouse or pen keeps hovering.
      if (e.pointerType === 'touch' || e.type === 'pointercancel') cursor.hide(260);
    }
    lifted(e);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  return view;
}

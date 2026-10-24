// Connects the game state to the tray: flipping stacks, placing plates in the
// frame (double-tap, drag or Enter), taking them out, and the slides between.

import { plateFace } from '../art/emboss.ts';
import { isFigure, PLATE_KINDS, type PlateArt, type PlateKind } from '../art/plates.ts';
import type { PlateBand } from '../art/bands.ts';
import type { FigurePlate, Game } from '../state.ts';
import { announce } from './announce.ts';
import { dragPlate, fly, ghostOf } from './flight.ts';
import { attachGestures, type GestureHandlers } from './gestures.ts';
import { prefersReducedMotion } from './motion.ts';
import type { TrayView } from './tray.ts';

export function connectPlates(game: Game, tray: TrayView): void {
  const { frame, wells } = tray;

  const showTop = (kind: PlateKind, direction: number): void => {
    wells[kind].show(game.topOf(kind), game.indexOf(kind), game.stacks[kind].length, direction);
  };

  const flip = (kind: PlateKind, delta: 1 | -1): void => {
    const plate = game.flip(kind, delta);
    if (!plate) return;
    showTop(kind, delta);
    announce(plate.name);
  };

  /** A plate slides back from the frame into its well and fades into the stack. */
  const sendHome = (plate: FigurePlate, from: DOMRect): void => {
    const ghost = ghostOf(plateFace(plate, 0), from);
    const well = wells[plate.band];
    const to = well.face()?.getBoundingClientRect() ?? well.button.getBoundingClientRect();
    game.bus.emit('plate:slide', { to: 'tray' });
    void fly(ghost, to, { duration: 360, fade: true }).then(() => ghost.remove());
  };

  const settle = (band: PlateBand): void => {
    frame.placedFace(band)?.animate([{ transform: 'translateY(-3px)' }, { transform: 'none' }], {
      duration: 160,
      easing: 'ease-out',
    });
  };

  /** Slide the top plate of `kind` into its band. `ghost` is the dragged copy, if any. */
  const place = async (kind: PlateKind, ghost: HTMLElement | null): Promise<void> => {
    const plate: PlateArt | undefined = game.topOf(kind);
    const face = wells[kind].face();
    if (!game.canSwapPlates) game.bus.emit('plate:locked', {});
    if (!plate || !isFigure(plate) || !game.canSwapPlates || !face) {
      ghost?.remove();
      return;
    }
    const g = ghost ?? ghostOf(face);
    g.style.boxShadow = '0 2px 6px rgba(80, 45, 35, 0.2)'; // the stack's edges stay in the tray
    // Note where plates this pushes out sit now, before the frame re-renders.
    const pushed = game.preview(plate).map((p) => [p, frame.slotRect(p.band)] as const);

    game.bus.emit('plate:slide', { to: 'frame' });
    await fly(g, frame.slotRect(plate.band), { duration: 340 });
    game.place(plate);
    frame.render(game.slots);
    g.remove();
    settle(plate.band);
    for (const [p, rect] of pushed) sendHome(p, rect);
    announce(`${plate.name} is in the frame`);
  };

  // ---------- Pattern plates: tucked under the frame's edge ----------

  /**
   * Slide the pattern well's top plate under the frame's edge, sending any other
   * pattern plate home. Doing it again with the same plate puts it away.
   */
  const usePattern = async (ghost: HTMLElement | null): Promise<void> => {
    const plate = game.topOf('pattern');
    const face = wells.pattern.face();
    if (!plate || !face || game.pattern?.id === plate.id) {
      ghost?.remove();
      if (plate && game.pattern?.id === plate.id) game.usePattern(null);
      return;
    }
    const g = ghost ?? ghostOf(face);
    g.style.boxShadow = '0 2px 6px rgba(80, 45, 35, 0.2)';
    // The ghost lands beside the window, then the plate slides in under its edge.
    const { rect, under } = frame.tuckSpot();
    game.bus.emit('plate:slide', { to: 'frame' });
    await fly(g, new DOMRect(rect.left - under, rect.top, rect.width, rect.height), { duration: 340 });
    if (game.usePattern(plate)) announce(`${plate.name} pattern. Rub to add it.`);
    g.remove();
  };

  game.bus.on('pattern:change', ({ plate, previous }) => {
    const { rect, under } = frame.tuckSpot();
    if (previous) {
      // The plate that was tucked goes back to its well and fades into the stack.
      const ghost = ghostOf(plateFace(previous, 0), rect);
      const well = wells.pattern;
      game.bus.emit('plate:slide', { to: 'tray' });
      void fly(ghost, well.face()?.getBoundingClientRect() ?? well.button.getBoundingClientRect(), { duration: 360, fade: true }).then(() =>
        ghost.remove(),
      );
    }
    frame.tuck(plate);
    if (plate && !prefersReducedMotion()) {
      frame.tucked.animate([{ transform: `translateX(${-under}px)` }, { transform: 'none' }], {
        duration: 260,
        easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)',
      });
    }
    if (!plate) announce('Pattern put away.');
  });

  frame.tucked.addEventListener('click', () => game.usePattern(null));

  const takeOut = (band: PlateBand): void => {
    const rect = frame.slotRect(band);
    const plate = game.remove(band);
    if (!plate) return;
    frame.render(game.slots);
    sendHome(plate, rect);
    announce(`${plate.name} is back in the tray`);
  };

  /** Double-tap and drag, for stacks whose plates go in the frame. */
  const placeGestures = (kind: PlateKind): Omit<GestureHandlers, 'tap'> => ({
    doubleTap: () => void place(kind, null),
    // In the portrait drawer, sideways swipes scroll; only upward drags lift a plate.
    canDrag: (dx, dy) => !tray.drawerScrolls() || Math.abs(dy) > Math.abs(dx),
    dragStart: (event, origin) => {
      const plate = game.topOf(kind);
      const face = wells[kind].face();
      if (!game.canSwapPlates) game.bus.emit('plate:locked', {});
      if (!plate || !isFigure(plate) || !face || !game.canSwapPlates) return;
      dragPlate({
        event,
        origin,
        face,
        capture: wells[kind].button,
        over: (x, y) => frame.accepts(x, y),
        hover: (on) => frame.highlight(on ? plate.band : null),
        drop: (ghost) => void place(kind, ghost),
        cancel: (ghost) => void fly(ghost, face.getBoundingClientRect(), { duration: 260 }).then(() => ghost.remove()),
      });
    },
  });

  /** Double-tap and drag for the pattern stack: its plates tuck under the frame's edge, paper down or not. */
  const patternGestures: Omit<GestureHandlers, 'tap'> = {
    doubleTap: () => void usePattern(null),
    canDrag: (dx, dy) => !tray.drawerScrolls() || Math.abs(dy) > Math.abs(dx),
    dragStart: (event, origin) => {
      const face = wells.pattern.face();
      if (!face || !game.topOf('pattern')) return;
      dragPlate({
        event,
        origin,
        face,
        capture: wells.pattern.button,
        over: (x, y) => frame.accepts(x, y),
        hover: (on) => frame.highlight(on ? 'all' : null),
        drop: (ghost) => void usePattern(ghost),
        cancel: (ghost) => void fly(ghost, face.getBoundingClientRect(), { duration: 260 }).then(() => ghost.remove()),
      });
    },
  };

  for (const kind of PLATE_KINDS) {
    const well = wells[kind];
    const figure = kind !== 'pattern';
    showTop(kind, 0);

    attachGestures(well.button, { tap: () => flip(kind, 1), ...(figure ? placeGestures(kind) : patternGestures) });

    well.button.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') flip(kind, 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') flip(kind, -1);
      else if (e.key === 'Enter') void (figure ? place(kind, null) : usePattern(null));
      else return;
      e.preventDefault();
    });
  }

  frame.onTakeOut(takeOut);
  frame.render(game.slots);
}

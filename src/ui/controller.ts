// Connects the game state to the tray: flipping stacks, placing plates in the
// frame (double-tap, drag or Enter), taking them out, and the slides between.

import { plateFace } from '../art/emboss.ts';
import { isFigure, PLATE_KINDS, type PlateArt, type PlateKind } from '../art/plates.ts';
import type { PlateBand } from '../art/bands.ts';
import type { FigurePlate, Game } from '../state.ts';
import { announce } from './announce.ts';
import { dragPlate, fly, ghostOf } from './flight.ts';
import { attachGestures, type GestureHandlers } from './gestures.ts';
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
    if (!plate || !isFigure(plate) || !game.canSwapPlates || !face) {
      ghost?.remove();
      return;
    }
    const g = ghost ?? ghostOf(face);
    g.style.boxShadow = '0 2px 6px rgba(80, 45, 35, 0.2)'; // the stack's edges stay in the tray
    // Note where plates this pushes out sit now, before the frame re-renders.
    const pushed = game.preview(plate).map((p) => [p, frame.slotRect(p.band)] as const);

    await fly(g, frame.slotRect(plate.band), { duration: 340 });
    game.place(plate);
    frame.render(game.slots);
    g.remove();
    settle(plate.band);
    for (const [p, rect] of pushed) sendHome(p, rect);
    announce(`${plate.name} is in the frame`);
  };

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

  for (const kind of PLATE_KINDS) {
    const well = wells[kind];
    const figure = kind !== 'pattern';
    showTop(kind, 0);

    attachGestures(well.button, { tap: () => flip(kind, 1), ...(figure ? placeGestures(kind) : {}) });

    well.button.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') flip(kind, 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') flip(kind, -1);
      else if (e.key === 'Enter' && figure) void place(kind, null);
      else return;
      e.preventDefault();
    });
  }

  frame.onTakeOut(takeOut);
  frame.render(game.slots);
}

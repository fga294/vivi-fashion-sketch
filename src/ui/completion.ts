// What happens when rubbing finishes a band, and then the whole outfit. A band
// shimmers, giggles and bursts hearts and stars, and its plate hops in the tray
// and gains a heart badge. The outfit then glows, confetti falls, "Ta-da!" pops
// above the frame, and the pencil box wiggles to invite colouring.

import type { SoundEngine } from '../audio/sound.ts';
import { Celebrate } from '../fx/celebrate.ts';
import type { Game } from '../state.ts';
import { announce } from './announce.ts';
import { prefersReducedMotion, wiggle } from './motion.ts';
import type { PaperView } from './paper.ts';
import { buildTada, TADA_MS } from './tada.ts';
import type { TrayView } from './tray.ts';
import { KIND_NAMES } from './wells.ts';

/** The outfit's Ta-da waits for the last band's shimmer and most of its giggle. */
export const OUTFIT_DELAY = 600;
/** PLAN.md: a 15 ms buzz on each band completion, where supported. */
const BUZZ_MS = 15;

function buzz(): void {
  // Chrome blocks (and logs) vibrate calls made before any gesture.
  if (typeof navigator.vibrate !== 'function' || navigator.userActivation?.hasBeenActive === false) return;
  navigator.vibrate(BUZZ_MS);
}

/** Draw the eye to a control: a wiggle, or a soft glow with reduced motion. */
function invite(el: HTMLElement): void {
  if (!prefersReducedMotion()) {
    wiggle(el);
    return;
  }
  el.animate([{ filter: 'none' }, { filter: 'brightness(1.08) drop-shadow(0 0 6px rgba(232, 194, 90, 0.9))' }, { filter: 'none' }], {
    duration: 900,
    easing: 'ease-in-out',
  });
}

export function connectCompletion(game: Game, tray: TrayView, paper: PaperView, sound: SoundEngine): Celebrate {
  const celebrate = new Celebrate(paper.sheet, paper.fxLayer);
  const tada = buildTada();
  tray.frame.mountOverlay(tada.element);
  const timers = new Set<number>();
  const later = (ms: number, fn: () => void): void => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };

  game.bus.on('paper:lay', () => celebrate.arm(game.slots));
  game.bus.on('paper:lift', () => celebrate.clear());
  game.bus.on('paper:new', () => {
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    celebrate.clear();
  });

  game.bus.on('band:complete', ({ band }) => {
    celebrate.band(band);
    sound.giggle(band);
    buzz();
    const plate = game.slots[band];
    if (plate) tray.wells[band].markDone(plate.id);
    tray.wells[band].hop();
    announce(`${KIND_NAMES[band]} done!`);
  });

  game.bus.on('outfit:complete', () => {
    later(OUTFIT_DELAY, () => {
      // If the paper was lifted meanwhile, the cheer still plays but the paper stays still.
      if (game.phase === 'paperDown') celebrate.outfit();
      sound.tada();
      void tada.play();
      announce('Ta-da! The outfit is done. Colour it in with the pencils.');
      later(TADA_MS, () => invite(tray.pencils));
    });
  });

  return celebrate;
}

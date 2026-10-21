import { plateFace } from '../art/emboss.ts';
import type { PlateArt, PlateKind } from '../art/plates.ts';
import { h } from './dom.ts';
import { prefersReducedMotion } from './motion.ts';

export const KIND_NAMES: Record<PlateKind, string> = {
  head: 'Head',
  torso: 'Torso',
  legs: 'Legs',
  top: 'Top',
  pattern: 'Pattern',
};

export interface WellView {
  readonly kind: PlateKind;
  readonly element: HTMLElement;
  /** The stack itself: one button per well, so focus survives flips. */
  readonly button: HTMLButtonElement;
  /** Show `plate` on top, sliding the old top plate off towards `direction` (0 = no animation). */
  show(plate: PlateArt | undefined, index: number, count: number, direction: number): void;
  /** The top plate's visual. */
  face(): HTMLElement | null;
}

/** A recessed well in the tray holding a stack of plates. */
export function buildWell(kind: PlateKind): WellView {
  const button = h('button', {
    type: 'button',
    class: 'stack',
    'aria-label': `${KIND_NAMES[kind]} plates`,
    'aria-describedby': kind === 'pattern' ? 'hint-pattern' : 'hint-plate',
  });
  const element = h('div', { class: `well well--${kind}`, 'data-well': kind }, button);
  const face = (): HTMLElement | null => button.querySelector<HTMLElement>('.plate:not(.is-leaving)');

  return {
    kind,
    element,
    button,
    face,
    show(plate, index, count, direction) {
      button.setAttribute(
        'aria-label',
        plate ? `${KIND_NAMES[kind]} plates: ${plate.name}, ${index + 1} of ${count}` : `${KIND_NAMES[kind]} plates: none`,
      );
      button.disabled = !plate;
      const old = face();
      const next = plate ? plateFace(plate, Math.max(2, Math.min(4, count - 1))) : null;
      if (next) button.prepend(next); // under the old plate while it slides away

      if (!old) return;
      if (direction === 0 || prefersReducedMotion()) {
        old.remove();
        return;
      }
      // Card-slide: the top plate slips off sideways and the next one settles into place.
      const dir = Math.sign(direction);
      old.classList.add('is-leaving');
      old
        .animate(
          [
            { transform: 'none', opacity: 1 },
            { transform: `translate(${dir * 46}%, -8%) rotate(${dir * 8}deg)`, opacity: 0 },
          ],
          { duration: 260, easing: 'cubic-bezier(0.45, 0, 0.7, 0.6)', fill: 'forwards' },
        )
        .finished.then(
          () => old.remove(),
          () => old.remove(),
        );
      next?.animate([{ transform: 'translate(3px, 3px)', filter: 'brightness(0.97)' }, { transform: 'none', filter: 'none' }], {
        duration: 260,
        easing: 'ease-out',
      });
    },
  };
}

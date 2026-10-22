import { plateFace } from '../art/emboss.ts';
import type { PlateArt, PlateKind } from '../art/plates.ts';
import { h, s } from './dom.ts';
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
  /** A plate was fully rubbed: it keeps a small heart badge for the rest of the session. */
  markDone(plateId: string): void;
  /** The top plate hops: up 8 px, then a squash as it lands. */
  hop(): void;
}

/** A small rose heart with a cream edge, stuck on a plate that has been rubbed in full. */
function heartBadge(): SVGSVGElement {
  return s(
    'svg',
    { class: 'plate__badge', viewBox: '-12 -12 24 24', 'aria-hidden': 'true', focusable: 'false' },
    s('path', {
      d: 'M0 8.6 C-1.9 6.9 -10.5 2 -10.5 -3.7 C-10.5 -8 -6.9 -10 -4.2 -9.8 C-2.1 -9.6 -0.7 -8.4 0 -6.8 C0.7 -8.4 2.1 -9.6 4.2 -9.8 C6.9 -10 10.5 -8 10.5 -3.7 C10.5 2 1.9 6.9 0 8.6 Z',
    }),
  );
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
  const done = new Set<string>();
  let label = '';
  const showLabel = (plateId: string | undefined): void => {
    button.setAttribute('aria-label', plateId && done.has(plateId) ? `${label}, with a heart` : label);
  };

  return {
    kind,
    element,
    button,
    face,
    show(plate, index, count, direction) {
      label = plate ? `${KIND_NAMES[kind]} plates: ${plate.name}, ${index + 1} of ${count}` : `${KIND_NAMES[kind]} plates: none`;
      showLabel(plate?.id);
      button.disabled = !plate;
      const old = face();
      const next = plate ? plateFace(plate, Math.max(2, Math.min(4, count - 1))) : null;
      if (next && done.has(plate!.id)) next.append(heartBadge());
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

    markDone(plateId) {
      if (done.has(plateId)) return;
      done.add(plateId);
      const top = face();
      if (top?.dataset['plate'] !== plateId) return;
      const badge = heartBadge();
      top.append(badge);
      showLabel(plateId);
      if (!prefersReducedMotion()) {
        badge.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.3)', offset: 0.6 }, { transform: 'scale(1)' }], {
          duration: 360,
          delay: 160,
          easing: 'ease-out',
          fill: 'backwards',
        });
      }
    },

    hop() {
      const top = face();
      if (!top || prefersReducedMotion()) return;
      top.style.transformOrigin = '50% 100%'; // squash onto the well floor
      const hop = top.animate(
        [
          { transform: 'none', easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
          { transform: 'translateY(-8px)', offset: 0.38, easing: 'cubic-bezier(0.6, 0, 0.8, 0.4)' },
          { transform: 'translateY(0) scale(1.06, 0.9)', offset: 0.62 },
          { transform: 'scale(0.98, 1.03)', offset: 0.8 },
          { transform: 'none' },
        ],
        { duration: 480 },
      );
      hop.finished.then(
        () => top.style.removeProperty('transform-origin'),
        () => undefined,
      );
    },
  };
}

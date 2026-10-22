// The hand-lettered "Ta-da!" that pops above the frame when a whole outfit is
// done: chunky marker strokes drawn for this project, in rose with a paper-white
// edge so it reads over the frame, the paper or the tray.

import { h, s } from './dom.ts';
import { prefersReducedMotion } from './motion.ts';

/** Each letter is one or two strokes with round ends, as if drawn with a fat marker. */
const LETTERS = [
  'M14 25 C26 19 44 18 58 22', // T bar
  'M36 22 C35 38 33 54 37 70', // T stem
  'M85 45 C80 39 68 39 63 48 C58 58 63 70 72 70 C79 70 84 62 85 52 L86 42 C85 54 85 64 90 70', // a
  'M98 56 C102 54 108 53 113 55', // -
  'M147 46 C142 40 130 39 125 48 C120 58 125 70 134 70 C141 70 146 62 147 52', // d bowl
  'M149 16 C147 34 147 56 152 70', // d stem
  'M186 45 C181 39 169 39 164 48 C159 58 164 70 173 70 C180 70 185 62 186 52 L187 42 C186 54 186 64 191 70', // a
  'M207 18 C206 31 205 43 205 53', // !
] as const;

/** The dot of the "!" is a little heart. */
const HEART = 'M205 75 C204 74 199 71 199 68 C199 65.6 201 64.6 202.5 64.8 C203.6 64.9 204.5 65.6 205 66.5 C205.5 65.6 206.4 64.9 207.5 64.8 C209 64.6 211 65.6 211 68 C211 71 206 74 205 75 Z';

function sparkle(x: number, y: number, r: number): SVGPathElement {
  return s('path', {
    class: 'tada__sparkle',
    d: `M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z`,
  });
}

function lettering(): SVGSVGElement {
  const strokes = (cls: string, transform = ''): SVGGElement =>
    s('g', { class: cls, transform }, ...LETTERS.map((d) => s('path', { d })), s('path', { d: HEART, class: 'tada__heart' }));
  return s(
    'svg',
    { class: 'tada__art', viewBox: '0 0 224 90', 'aria-hidden': 'true', focusable: 'false' },
    strokes('tada__edge'),
    strokes('tada__shadow', 'translate(1.5 2.5)'),
    strokes('tada__ink'),
    sparkle(8, 10, 6),
    sparkle(219, 36, 5),
    sparkle(118, 20, 4),
  );
}

export interface TadaView {
  readonly element: HTMLElement;
  /** Pop the lettering in, hold it, and fade it away over 1.5 s. */
  play(): Promise<void>;
}

/** PLAN.md: the Ta-da shows for 1.5 s. */
export const TADA_MS = 1500;

export function buildTada(): TadaView {
  const element = h('div', { class: 'tada', 'aria-hidden': 'true', hidden: true }, lettering());
  let current: Animation | null = null;
  return {
    element,
    async play() {
      current?.cancel();
      element.hidden = false;
      const keyframes: Keyframe[] = prefersReducedMotion()
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
        : [
            { opacity: 0, transform: 'translateY(18%) scale(0.3) rotate(-12deg)' },
            { opacity: 1, transform: 'translateY(-4%) scale(1.12) rotate(3deg)', offset: 0.16 },
            { transform: 'translateY(0) scale(0.96) rotate(-2deg)', offset: 0.27 },
            { transform: 'scale(1) rotate(0deg)', offset: 0.38 },
            { opacity: 1, transform: 'scale(1.02) rotate(0deg)', offset: 0.82 },
            { opacity: 0, transform: 'translateY(-10%) scale(1.06) rotate(1deg)' },
          ];
      const animation = (current = element.animate(keyframes, { duration: TADA_MS, easing: 'ease-out' }));
      try {
        await animation.finished;
      } catch {
        return; // cancelled by a newer Ta-da
      }
      if (current === animation) element.hidden = true;
    },
  };
}

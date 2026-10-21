import { PENCILS } from '../art/colours';
import { h, s } from './dom';
import { icon, type IconName } from './icons';

/** The rubbing crayon: a short black wax block with a taupe paper wrapper. */
function crayonArt(): SVGSVGElement {
  return s(
    'svg',
    { class: 'crayon__art', viewBox: '0 0 150 40', 'aria-hidden': 'true', focusable: 'false' },
    s('path', {
      d: 'M9 9 C5 9 4 11 4 14 V26 C4 29 5 31 9 31 H124 L143 23 C146 21.8 146 18.2 143 17 L124 9 Z',
      fill: 'var(--crayon-wax)',
    }),
    s('path', { d: 'M10 12.5 H121', stroke: 'rgba(255,255,255,0.16)', 'stroke-width': 2, 'stroke-linecap': 'round' }),
    s('rect', { x: 26, y: 8, width: 86, height: 24, rx: 2, fill: 'var(--frame-taupe)' }),
    s('path', {
      d: 'M32 8 V32 M106 8 V32 M40 20 H98',
      stroke: 'var(--frame-taupe-dark)',
      'stroke-width': 1.4,
      'stroke-linecap': 'round',
      opacity: 0.8,
    }),
    s('path', { d: 'M27 9.5 H111', stroke: 'rgba(255,255,255,0.3)', 'stroke-width': 1 }),
  );
}

/** Blush card box with a die-cut oval window showing the 16 pencil tips. */
function pencilBoxArt(): SVGSVGElement {
  const clipId = 'pencil-window';
  const pencils = PENCILS.map((p, i) => {
    const x = 46 + i * 14.3;
    const lift = i % 2 === 0 ? 0 : 5; // staggered, as if dropped in by hand
    const cone = 60 + lift;
    const apex = cone - 22;
    const cx = x + 6.5;
    return s(
      'g',
      {},
      s('rect', { x, y: cone, width: 13, height: 80, fill: p.hex }),
      s('rect', { x: x + 8.5, y: cone, width: 2.5, height: 80, fill: 'rgba(255,255,255,0.18)' }),
      s('path', { d: `M${x} ${cone} L${x + 13} ${cone} L${cx} ${apex} Z`, fill: '#EFD4A8' }),
      s('path', { d: `M${cx - 2.6} ${apex + 8} L${cx + 2.6} ${apex + 8} L${cx} ${apex} Z`, fill: p.hex }),
    );
  });

  return s(
    'svg',
    { class: 'pencil-box__art', viewBox: '0 0 320 140', 'aria-hidden': 'true', focusable: 'false' },
    s('defs', {}, s('clipPath', { id: clipId }, s('ellipse', { cx: 160, cy: 82, rx: 122, ry: 38 }))),
    // box body and lid
    s('rect', { x: 3, y: 6, width: 314, height: 130, rx: 12, fill: 'var(--plate-blush)', stroke: 'var(--plate-blush-line)', 'stroke-width': 2 }),
    s('path', { d: 'M5 30 H315', stroke: 'var(--plate-blush-line)', 'stroke-width': 1.5 }),
    s('path', { d: 'M6 31.5 H314', stroke: 'var(--plate-blush-hi)', 'stroke-width': 1 }),
    s('path', { d: 'M14 9 H306', stroke: 'var(--plate-blush-hi)', 'stroke-width': 1.5, 'stroke-linecap': 'round' }),
    // die-cut window: dark inside, pencils showing through, cut edge on top
    s('ellipse', { cx: 160, cy: 82, rx: 122, ry: 38, fill: '#7A6366' }),
    s('g', { 'clip-path': `url(#${clipId})` }, ...pencils, s('ellipse', { cx: 160, cy: 70, rx: 126, ry: 40, fill: 'none', stroke: 'rgba(60,35,40,0.28)', 'stroke-width': 8 })),
    s('ellipse', { cx: 160, cy: 82, rx: 122, ry: 38, fill: 'none', stroke: 'var(--plate-blush-line)', 'stroke-width': 2.5 }),
    s('ellipse', { cx: 160, cy: 83.5, rx: 123, ry: 39, fill: 'none', stroke: 'var(--plate-blush-hi)', 'stroke-width': 1, opacity: 0.9 }),
  );
}

/** Open tray area: peg bumps with the crayon in its well and the pencil box. */
export function buildPegs(): HTMLElement {
  const crayon = h('button', { type: 'button', class: 'crayon', 'aria-label': 'Crayon' }, crayonArt());
  const pencils = h('button', { type: 'button', class: 'pencil-box', 'aria-label': 'Pencils' }, pencilBoxArt());
  return h(
    'div',
    { class: 'pegs' },
    h('div', { class: 'crayon-well' }, crayon),
    h('div', { class: 'pencil-holder' }, pencils),
  );
}

interface Bump {
  readonly id: string;
  readonly icon: IconName;
  /** One visible word; the accessible name starts with it. */
  readonly word: string;
  readonly label: string;
}

const BUMPS: readonly Bump[] = [
  { id: 'undo', icon: 'undo', word: 'Undo', label: 'Undo' },
  { id: 'eraser', icon: 'eraser', word: 'Eraser', label: 'Eraser' },
  { id: 'new', icon: 'newSheet', word: 'New', label: 'New sheet' },
  { id: 'sketchbook', icon: 'sketchbook', word: 'Sketchbook', label: 'Sketchbook' },
  { id: 'sound', icon: 'sound', word: 'Sound', label: 'Sound' },
];

/** The row of round bump buttons along the tray's bottom edge. */
export function buildBumps(): HTMLElement {
  return h(
    'div',
    { class: 'bumps', role: 'group', 'aria-label': 'Tools' },
    ...BUMPS.map((b) =>
      h(
        'button',
        { type: 'button', class: 'bump', 'data-tool': b.id, 'aria-label': b.label },
        h('span', { class: 'bump__dome' }, icon(b.icon)),
        h('span', { class: 'bump__label', 'aria-hidden': 'true' }, b.word),
      ),
    ),
  );
}

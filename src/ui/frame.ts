import { BANDS, SHEET, SLOT_BANDS, type SlotBand } from '../art/bands';
import { PLACEHOLDER_ART } from '../art/placeholders';
import { h, pathsSvg, s } from './dom';

const BAND_NAMES: Record<SlotBand, string> = { head: 'Head', torso: 'Torso', legs: 'Legs' };

/**
 * The wordmark, molded into the frame's top bar: light Quicksand in off-white
 * over a 1-unit darker shadow. Drawn as SVG text so it scales with the bar; as a
 * logotype it is exempt from text-contrast rules and carries its own label.
 */
function wordmark(): SVGSVGElement {
  // A small A-line dress, the brand's mark.
  const dress = 'M-7 -13 L7 -13 L5 -6 L12 13 L-12 13 L-5 -6 Z M-3 -13 L-3 -17 M3 -13 L3 -17';
  const layer = (fill: string, dy: number): SVGGElement =>
    s(
      'g',
      { fill, transform: `translate(0 ${dy})` },
      s('path', { d: dress, transform: 'translate(22 24) scale(0.8)', fill: 'none', stroke: fill, 'stroke-width': 1.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
      s(
        'text',
        { x: 40, y: 32 },
        s('tspan', { class: 'wordmark__vivi' }, 'Vivi'),
        s('tspan', { class: 'wordmark__rest', dx: 8 }, 'Fashion Dresses'),
      ),
    );
  return s(
    'svg',
    // viewBox fitted to the drawn mark (measured: x 12.4–259, y 0.5–40) so it centres in the bar.
    { class: 'wordmark', viewBox: '8 -2 256 44', role: 'img', 'aria-label': 'Vivi Fashion Dresses' },
    layer('var(--frame-taupe-dark)', 1.2),
    layer('var(--paper)', 0),
  );
}

function pct(units: number): string {
  return `${((units / SHEET.height) * 100).toFixed(4)}%`;
}

/** The tracing frame: wordmark bar, the 1 : 2.5 window with its three band slots, and progress bead sockets. */
export function buildFrame(): HTMLElement {
  const window_ = h('div', { class: 'frame__window' });
  const beads = h('div', { class: 'frame__beads', 'aria-hidden': 'true' });

  for (const band of SLOT_BANDS) {
    const { y0, y1 } = BANDS[band];
    const slot = h('div', {
      class: `slot slot--${band}`,
      'data-slot': band,
      'aria-label': `${BAND_NAMES[band]} slot, empty`,
      role: 'group',
    });
    slot.style.top = pct(y0);
    slot.style.height = pct(y1 - y0);
    window_.append(slot);

    const group = h('div', { class: 'bead-group', 'data-band': band });
    group.style.top = pct(y0);
    group.style.height = pct(y1 - y0);
    group.append(h('span', { class: 'bead' }), h('span', { class: 'bead' }), h('span', { class: 'bead' }));
    beads.append(group);
  }

  // Faint debossed guide figure, so kids can see where each plate goes.
  const ghostPaths = SLOT_BANDS.flatMap((band) => PLACEHOLDER_ART[band]);
  window_.prepend(pathsSvg(`0 0 ${SHEET.width} ${SHEET.height}`, ghostPaths, 'frame__ghost'));

  return h(
    'section',
    { class: 'frame', 'aria-label': 'Tracing frame' },
    h('h1', { class: 'frame__bar' }, wordmark()),
    h('div', { class: 'frame__body' }, h('div', { class: 'frame__stage' }, window_, beads)),
  );
}

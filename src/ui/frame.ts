import { BANDS, SHEET, SLOT_BANDS, type PlateBand } from '../art/bands.ts';
import { sheetArt, toneOf } from '../art/emboss.ts';
import { GUIDE_ART } from '../art/guide.ts';
import type { Slots } from '../state.ts';
import { h, pathsSvg, s } from './dom.ts';

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

const pct = (units: number): string => `${((units / SHEET.height) * 100).toFixed(4)}%`;

function placeBand(el: HTMLElement, band: PlateBand): void {
  const { y0, y1 } = BANDS[band];
  el.style.top = pct(y0);
  el.style.height = pct(y1 - y0);
}

export interface FrameView {
  readonly element: HTMLElement;
  /** Show the plates in the frame. */
  render(slots: Slots): void;
  /** Viewport rectangle a plate of this band fills in the window. */
  slotRect(band: PlateBand): DOMRect;
  /** The placed plate's face element, if that band is filled. */
  placedFace(band: PlateBand): HTMLElement | null;
  /** Whether a dragged plate let go at (x, y) lands in the frame. */
  accepts(x: number, y: number): boolean;
  /** Glow the slot a dragged plate would land in, or clear it. */
  highlight(band: PlateBand | null): void;
  /** Called when the player taps a placed plate to take it out. */
  onTakeOut(fn: (band: PlateBand) => void): void;
}

/** The tracing frame: wordmark bar, the 1 : 2.5 window with its three band slots, and progress bead sockets. */
export function buildFrame(): FrameView {
  const window_ = h('div', { class: 'frame__window' });
  const beads = h('div', { class: 'frame__beads', 'aria-hidden': 'true' });
  const plates = h('div', { class: 'frame__plates' });
  const target = h('div', { class: 'frame__target', 'aria-hidden': 'true', hidden: true });
  let takeOut: (band: PlateBand) => void = () => {};

  // Faint debossed guide figure, so kids can see where each plate goes.
  window_.append(pathsSvg(`0 0 ${SHEET.width} ${SHEET.height}`, SLOT_BANDS.flatMap((b) => GUIDE_ART[b]), 'frame__ghost'));
  for (const band of SLOT_BANDS) {
    const slot = h('div', { class: `slot slot--${band}`, 'data-slot': band });
    placeBand(slot, band);
    window_.append(slot);

    const group = h('div', { class: 'bead-group', 'data-band': band });
    placeBand(group, band);
    group.append(h('span', { class: 'bead' }), h('span', { class: 'bead' }), h('span', { class: 'bead' }));
    beads.append(group);
  }
  window_.append(plates, target);

  const element = h(
    'section',
    { class: 'frame', 'aria-label': 'Tracing frame' },
    h('h1', { class: 'frame__bar' }, wordmark()),
    h('div', { class: 'frame__body' }, h('div', { class: 'frame__stage' }, window_, beads)),
  );

  return {
    element,

    render(slots) {
      const faces: HTMLElement[] = [];
      const arts: SVGSVGElement[] = [];
      // Head, torso and top first, legs last, so each band's art sits above every face.
      for (const band of ['top', 'head', 'torso', 'legs'] as const) {
        const plate = slots[band];
        if (!plate) continue;
        const face = h('button', {
          type: 'button',
          class: `placed tone-${toneOf(band)}`,
          'data-band': band,
          'data-plate': plate.id,
          'aria-label': `${plate.name}, in the frame. Take out`,
        });
        placeBand(face, band);
        face.addEventListener('click', () => takeOut(band));
        faces.push(face);
        arts.push(sheetArt(plate));
      }
      plates.replaceChildren(...faces, ...arts);
      window_.classList.toggle('has-plates', faces.length > 0);
    },

    slotRect(band) {
      const r = window_.getBoundingClientRect();
      const { y0, y1 } = BANDS[band];
      return new DOMRect(r.left, r.top + (r.height * y0) / SHEET.height, r.width, (r.height * (y1 - y0)) / SHEET.height);
    },

    placedFace(band) {
      return plates.querySelector<HTMLElement>(`.placed[data-band="${band}"]`);
    },

    accepts(x, y) {
      const r = window_.getBoundingClientRect();
      const m = 28; // a little forgiveness around the window's edge
      return x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m;
    },

    highlight(band) {
      target.hidden = band === null;
      if (band) placeBand(target, band);
    },

    onTakeOut(fn) {
      takeOut = fn;
    },
  };
}

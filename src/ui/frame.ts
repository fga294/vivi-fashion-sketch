import { BANDS, PATTERN_TILE, SHEET, slotsFilledBy, SLOT_BANDS, type PlateBand, type SlotBand } from '../art/bands.ts';
import { reliefArt, sheetArt, toneOf } from '../art/emboss.ts';
import { GUIDE_ART } from '../art/guide.ts';
import type { PlateArt } from '../art/plates.ts';
import type { Slots } from '../state.ts';
import { h, pathsSvg, s } from './dom.ts';
import { icon, type IconName } from './icons.ts';
import { prefersReducedMotion } from './motion.ts';

/** Where the paper is: none in the frame, down for rubbing, or lifted to swap plates. */
export type PaperState = 'none' | 'down' | 'lifted';

const PAPER_BUTTON: Record<PaperState, { icon: IconName; word: string; label: string }> = {
  none: { icon: 'paper', word: 'Paper', label: 'Lay paper' },
  down: { icon: 'lift', word: 'Lift', label: 'Lift paper' },
  lifted: { icon: 'layBack', word: 'Lay', label: 'Lay paper back' },
};

/** Beads fill at 30%, 60% and 90%. */
const BEAD_STEPS = [0.3, 0.6, 0.9] as const;

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
  /** Glow the slot a dragged plate would land in (the whole window for a pattern), or clear it. */
  highlight(band: PlateBand | 'all' | null): void;
  /** Called when the player taps a placed plate to take it out. */
  onTakeOut(fn: (band: PlateBand) => void): void;
  /** Lays, lifts and re-lays the paper; its icon and label follow the paper state. */
  readonly paperButton: HTMLButtonElement;
  /** Put the drawing sheet in the window, above the plates and below the frame's lip. */
  mountSheet(sheet: HTMLElement): void;
  setPaper(state: PaperState): void;
  /** The window closing over the paper: a little thump of the lip. */
  clack(): void;
  /** Show a plate's progress on the beads beside its band(s); newly filled beads bounce. */
  setProgress(band: PlateBand, progress: number): void;
  resetProgress(): void;
  /** Called when a bead fills, with how many beads that band now has. */
  onBeadFill(fn: (band: SlotBand, count: number) => void): void;
  /** The window the paper sits in (it rattles on very fast scrubs). */
  readonly windowElement: HTMLElement;
  /** Add something that floats over the window and frame edges (the Ta-da). */
  mountOverlay(el: HTMLElement): void;
  /** The active pattern plate, tucked under the window's left edge; tapping it puts it away. */
  readonly tucked: HTMLButtonElement;
  /** Show a pattern plate tucked under the window's edge, or none. */
  tuck(plate: PlateArt | null): void;
  /** Where a tucked plate rests (shown or not), and how far (px) it reaches under the window. */
  tuckSpot(): { readonly rect: DOMRect; readonly under: number };
}

/** The tracing frame: wordmark bar, the 1 : 2.5 window with its three band slots, and progress bead sockets. */
export function buildFrame(): FrameView {
  const window_ = h('div', { class: 'frame__window' });
  // Bead elements and their state, kept so progress updates (every frame while rubbing) touch the DOM only on change.
  const beadGroups = {} as Record<SlotBand, { group: HTMLElement; dots: HTMLElement[]; filled: boolean[]; shown: string }>;
  const beads = h('div', { class: 'frame__beads', 'aria-hidden': 'true' });
  const plates = h('div', { class: 'frame__plates' });
  const target = h('div', { class: 'frame__target', 'aria-hidden': 'true', hidden: true });
  let takeOut: (band: PlateBand) => void = () => {};
  let beadFilled: (band: SlotBand, count: number) => void = () => {};

  // Faint debossed guide figure, so kids can see where each plate goes.
  window_.append(pathsSvg(`0 0 ${SHEET.width} ${SHEET.height}`, SLOT_BANDS.flatMap((b) => GUIDE_ART[b]), 'frame__ghost'));
  for (const band of SLOT_BANDS) {
    const slot = h('div', { class: `slot slot--${band}`, 'data-slot': band });
    placeBand(slot, band);
    window_.append(slot);

    const group = h('div', { class: 'bead-group', 'data-band': band });
    placeBand(group, band);
    const dots = [h('span', { class: 'bead' }), h('span', { class: 'bead' }), h('span', { class: 'bead' })];
    group.append(...dots);
    beads.append(group);
    beadGroups[band] = { group, dots, filled: [false, false, false], shown: '' };
  }
  window_.append(plates, target);

  const paperDome = h('span', { class: 'bump__dome' });
  const paperWord = h('span', { class: 'bump__label', 'aria-hidden': 'true' });
  const paperButton = h('button', { type: 'button', class: 'bump bump--frame paper-btn' }, paperDome, paperWord);
  const showPaperButton = (state: PaperState): void => {
    const b = PAPER_BUTTON[state];
    paperDome.replaceChildren(icon(b.icon));
    paperWord.textContent = b.word;
    paperButton.setAttribute('aria-label', b.label);
  };
  showPaperButton('none');

  // Before the window in the stage, so the window's edge covers the part tucked under it.
  const tucked = h('button', { type: 'button', class: 'tucked', hidden: true });
  const stage = h('div', { class: 'frame__stage' }, tucked, window_, beads, paperButton);
  const element = h(
    'section',
    { class: 'frame', 'aria-label': 'Tracing frame' },
    h('h1', { class: 'frame__bar' }, wordmark()),
    h('div', { class: 'frame__body' }, stage),
  );
  element.dataset['paper'] = 'none';

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
      if (band === 'all') {
        target.style.top = '0';
        target.style.height = '100%';
      } else if (band) placeBand(target, band);
    },

    onTakeOut(fn) {
      takeOut = fn;
    },

    paperButton,

    mountSheet(sheet) {
      window_.insertBefore(sheet, target);
    },

    setPaper(state) {
      element.dataset['paper'] = state;
      showPaperButton(state);
    },

    clack() {
      if (prefersReducedMotion()) return;
      window_.animate([{ transform: 'scale(1.012)' }, { transform: 'scale(0.996)' }, { transform: 'none' }], {
        duration: 180,
        easing: 'ease-out',
      });
    },

    setProgress(band, progress) {
      const shown = progress.toFixed(3);
      for (const slot of slotsFilledBy(band)) {
        const g = beadGroups[slot];
        if (g.shown === shown) continue;
        g.shown = shown;
        g.group.dataset['progress'] = shown;
        g.group.toggleAttribute('data-complete', progress >= BEAD_STEPS[2]);
        for (let i = 0; i < g.dots.length; i++) {
          const fill = progress >= BEAD_STEPS[i]!;
          if (fill === g.filled[i]) continue;
          g.filled[i] = fill;
          const bead = g.dots[i]!;
          bead.classList.toggle('is-filled', fill);
          if (!fill) continue;
          // A tiny bounce as the bead fills; bead:fill plays its soft pop.
          if (!prefersReducedMotion()) {
            bead.animate(
              [{ transform: 'scale(1)' }, { transform: 'scale(1.45) translateY(-1px)' }, { transform: 'scale(0.88)' }, { transform: 'scale(1)' }],
              { duration: 340, easing: 'ease-out' },
            );
          }
          beadFilled(slot, i + 1);
        }
      }
    },

    onBeadFill(fn) {
      beadFilled = fn;
    },

    windowElement: window_,

    mountOverlay(el) {
      stage.append(el);
    },

    tucked,

    tuck(plate) {
      if (!plate) {
        tucked.hidden = true;
        tucked.replaceChildren();
        tucked.removeAttribute('aria-label');
        return;
      }
      // Two and a half tiles across: the texture shows bigger than in the well.
      const art = reliefArt(plate);
      art.setAttribute('viewBox', `0 0 ${PATTERN_TILE * 2.5} ${PATTERN_TILE}`);
      tucked.replaceChildren(h('span', { class: 'tucked__plate tone-blush', 'data-plate': plate.id }, art));
      tucked.setAttribute('aria-label', `${plate.name} pattern, under the frame. Put away`);
      tucked.hidden = false;
    },

    tuckSpot() {
      const shown = !tucked.hidden;
      if (!shown) {
        tucked.style.visibility = 'hidden';
        tucked.hidden = false;
      }
      const rect = tucked.getBoundingClientRect();
      if (!shown) {
        tucked.hidden = true;
        tucked.style.removeProperty('visibility');
      }
      return { rect, under: Math.max(0, rect.right - window_.getBoundingClientRect().left) };
    },

    resetProgress() {
      for (const g of Object.values(beadGroups)) {
        delete g.group.dataset['progress'];
        g.group.removeAttribute('data-complete');
        g.dots.forEach((bead) => bead.classList.remove('is-filled'));
        g.filled.fill(false);
        g.shown = '';
      }
    },
  };
}

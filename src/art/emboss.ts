// Raised-relief plate rendering. Each line is drawn in the plate's own colour with
// a shadow at (+1, +1) in the -line token and a highlight at (−1, −1) in a lighter
// tint (PLAN.md, Materials). The two offsets are CSS drop-shadows on the SVG
// (see .relief in tray.css), so they stay exactly 1 px at any plate size.

import { bandAspect, PATTERN_TILE, SHEET } from './bands.ts';
import type { PlateArt, PlateKind } from './plates.ts';
import { h, pathsSvg, s } from '../ui/dom.ts';

export type PlateTone = 'blush' | 'rose';

export const toneOf = (kind: PlateKind): PlateTone => (kind === 'legs' ? 'rose' : 'blush');

/** Pattern plates show their tile five across and two down. */
const PATTERN_COLS = 5;
const PATTERN_ROWS = 2;

export function plateAspect(plate: PlateArt): number {
  return plate.band === 'pattern' ? PATTERN_COLS / PATTERN_ROWS : bandAspect(plate.band);
}

/** The plate's line art in relief, filling the plate. */
export function reliefArt(plate: PlateArt): SVGSVGElement {
  if (plate.band !== 'pattern') return pathsSvg(plate.viewBox, plate.paths, 'relief');
  const tiles: SVGGElement[] = [];
  for (let row = 0; row < PATTERN_ROWS; row++) {
    for (let col = 0; col < PATTERN_COLS; col++) {
      tiles.push(
        s('g', { transform: `translate(${col * PATTERN_TILE} ${row * PATTERN_TILE})` }, ...plate.paths.map((d) => s('path', { d }))),
      );
    }
  }
  return s(
    'svg',
    { class: 'relief', viewBox: `0 0 ${PATTERN_COLS * PATTERN_TILE} ${PATTERN_ROWS * PATTERN_TILE}`, 'aria-hidden': 'true', focusable: 'false' },
    ...tiles,
  );
}

/** The plate's line art in sheet coordinates, for layering in the frame window. */
export function sheetArt(plate: PlateArt): SVGSVGElement {
  const svg = pathsSvg(`0 0 ${SHEET.width} ${SHEET.height}`, plate.paths, `relief frame__art tone-${toneOf(plate.band)}`);
  svg.dataset['band'] = plate.band;
  return svg;
}

/**
 * Box shadows that draw `edges` plates peeking out under the top plate, 2 px
 * apart. Each edge is a fill copy over a 1 px outline copy, so the stack reads
 * as separate plates rather than one thick slab.
 */
export function stackShadow(edges: number): string {
  const layers = ['inset 1px 1px 0 var(--plate-hi)', 'inset -1px -1px 0 var(--plate-line)'];
  for (let i = 1; i <= edges; i++) {
    const o = i * 2;
    layers.push(`${o}px ${o}px 0 0 var(--plate-edge)`, `${o}px ${o}px 0 1px var(--plate-line)`);
  }
  const d = edges * 2 + 1;
  layers.push(`${d}px ${d + 2}px 6px rgba(80, 45, 35, 0.22)`);
  return layers.join(', ');
}

/** A matte pink plate with its art in relief, over `edges` plates of the stack. */
export function plateFace(plate: PlateArt, edges: number): HTMLSpanElement {
  const face = h('span', { class: `plate tone-${toneOf(plate.band)}`, 'data-plate': plate.id });
  face.style.setProperty('--aspect', String(plateAspect(plate)));
  face.style.setProperty('--edges', String(edges));
  face.style.boxShadow = stackShadow(edges);
  face.append(reliefArt(plate));
  return face;
}

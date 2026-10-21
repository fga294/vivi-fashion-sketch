// Phase 1 stand-in art: a plain mannequin drawn on the shared anatomy grid.
// It already respects the seam connectors (neck 282/318, waist 258/342) so the
// pieces line up the way the real starter plates will in phase 2.

import type { PlateBand } from './bands';

/**
 * Mirror a path across the sheet's centre line. Only for paths written with
 * absolute M, L, C and Z commands, where numbers always come in x, y pairs.
 */
export function mirrorX(d: string, width = 600): string {
  let i = 0;
  return d.replace(/-?\d*\.?\d+/g, (n) => (i++ % 2 === 0 ? String(width - Number(n)) : n));
}

const both = (d: string): string[] => [d, mirrorX(d)];

const HEAD: string[] = [
  'M300 54 C330 54 350 82 350 118 C350 156 328 182 300 182 C272 182 250 156 250 118 C250 82 270 54 300 54 Z',
  'M254 106 C268 82 332 82 346 106',
  ...both('M282 178 L282 250'),
];

const TORSO: string[] = [
  ...both('M282 250 L282 270'),
  ...both(
    'M282 270 C262 276 234 278 220 290 C208 302 205 330 203 360 L198 476 ' +
      'C197 498 201 518 210 530 C219 538 230 530 228 512 L232 420 L236 350',
  ),
  ...both('M240 334 C242 410 250 490 258 570'),
  'M282 270 C288 292 312 292 318 270',
  'M257 548 L343 548',
];

const LEGS: string[] = [
  ...both(
    'M258 570 C252 620 240 680 240 740 C242 900 252 1150 262 1380 L265 1430 ' +
      'C254 1442 246 1454 250 1466 L290 1466 C295 1450 293 1424 292 1400 ' +
      'L296 1100 C298 920 300 820 300 770',
  ),
  'M256 592 L344 592',
];

export const PLACEHOLDER_ART: Readonly<Record<PlateBand, readonly string[]>> = {
  head: HEAD,
  torso: TORSO,
  legs: LEGS,
  top: [...HEAD, ...TORSO],
};

/** Pattern plates are 600 × 240 units: five by two of the 120-unit tiles. */
export const PATTERN_PLATE = { width: 600, height: 240 } as const;

const dot = (cx: number, cy: number, r: number): string =>
  `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;

/** Placeholder polka dots: two dots per 120-unit tile. */
export const PATTERN_PLACEHOLDER: readonly string[] = (() => {
  const paths: string[] = [];
  for (let ty = 0; ty < PATTERN_PLATE.height; ty += 120) {
    for (let tx = 0; tx < PATTERN_PLATE.width; tx += 120) {
      paths.push(dot(tx + 30, ty + 30, 13), dot(tx + 90, ty + 90, 13));
    }
  }
  return paths;
})();

/** Plates per well in the starter set (PLAN.md), used for stack depth until phase 2 loads plates.json. */
export const STARTER_COUNTS = { head: 6, torso: 6, legs: 6, top: 3, pattern: 6 } as const;

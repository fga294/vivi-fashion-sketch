// The faint guide figure debossed into the empty frame window, showing kids where
// each plate goes. It follows the same seam rules as real plates (checked in
// tests/unit/validate.test.ts).

import type { SlotBand } from './bands.ts';

/**
 * Mirror a path across the sheet's centre line. Only for paths written with
 * absolute M, L, C and Z commands, where numbers always come in x, y pairs.
 */
export function mirrorX(d: string, width = 600): string {
  let i = 0;
  return d.replace(/-?\d*\.?\d+/g, (n) => (i++ % 2 === 0 ? String(width - Number(n)) : n));
}

const both = (d: string): string[] => [d, mirrorX(d)];

export const GUIDE_ART: Readonly<Record<SlotBand, readonly string[]>> = {
  head: [
    'M300 54 C330 54 350 82 350 118 C350 156 328 182 300 182 C272 182 250 156 250 118 C250 82 270 54 300 54 Z',
    ...both('M282 178 L282 250'),
  ],
  torso: [
    ...both('M282 250 L282 270'),
    ...both(
      'M282 270 C262 276 234 278 220 290 C208 302 205 330 203 360 L198 476 ' +
        'C197 498 201 518 210 530 C219 538 230 530 228 512 L232 420 L236 350',
    ),
    ...both('M240 334 C242 410 250 490 258 570'),
  ],
  legs: [
    ...both(
      'M258 570 C252 620 240 680 240 740 C242 900 252 1150 262 1380 L265 1430 ' +
        'C254 1442 246 1454 250 1466 L290 1466 C295 1450 293 1424 292 1400 ' +
        'L296 1100 C298 920 300 820 300 770',
    ),
  ],
};

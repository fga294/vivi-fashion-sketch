import { pathsSvg } from './dom.ts';

// 24 × 24 stroke icons, drawn for this project.
const ICONS = {
  undo: ['M9 14 L4 9 L9 4', 'M4 9 H14 C17.3 9 20 11.7 20 15 C20 18.3 17.3 21 14 21 H11'],
  eraser: ['M14 4 L20 10 L11 19 H7 L4 16 Z', 'M9.5 8.5 L15.5 14.5', 'M11 19 H20'],
  newSheet: ['M6 3 H14 L19 8 V21 H6 Z', 'M14 3 V8 H19', 'M12.5 11 V18', 'M9 14.5 H16'],
  sketchbook: [
    'M4 5 C7 3.5 10 3.5 12 5.5 C14 3.5 17 3.5 20 5 V19 C17 17.5 14 17.5 12 19.5 C10 17.5 7 17.5 4 19 Z',
    'M12 5.5 V19.5',
  ],
  sound: [
    'M4 9.5 H8 L13 5 V19 L8 14.5 H4 Z',
    'M16.5 9 C18 10.5 18 13.5 16.5 15',
    'M19 6.5 C22 9.5 22 14.5 19 17.5',
  ],
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): SVGSVGElement {
  return pathsSvg('0 0 24 24', ICONS[name], 'icon');
}

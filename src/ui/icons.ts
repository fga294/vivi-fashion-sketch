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
  paper: ['M8 3 H16 L19 6 V19 H8 Z', 'M16 3 V6 H19', 'M5 6 V22 H16'],
  lift: ['M5 21 H19', 'M12 17 V4', 'M7 9 L12 4 L17 9'],
  layBack: ['M5 21 H19', 'M12 4 V16', 'M7 11 L12 16 L17 11'],
  sound: [
    'M4 9.5 H8 L13 5 V19 L8 14.5 H4 Z',
    'M16.5 9 C18 10.5 18 13.5 16.5 15',
    'M19 6.5 C22 9.5 22 14.5 19 17.5',
  ],
  soundOff: ['M4 9.5 H8 L13 5 V19 L8 14.5 H4 Z', 'M16.5 9.5 L21 14.5', 'M21 9.5 L16.5 14.5'],
  redo: ['M15 14 L20 9 L15 4', 'M20 9 H10 C6.7 9 4 11.7 4 15 C4 18.3 6.7 21 10 21 H13'],
  magic: ['M4 20 L14.5 9.5', 'M13 8 L16 11', 'M17 3 V6.5', 'M15.25 4.75 H18.75', 'M20.5 9 V11.5', 'M19.25 10.25 H21.75', 'M9 4 V6', 'M8 5 H10'],
  tick: ['M5 12.5 L10 17.5 L19.5 7'],
  cross: ['M6.5 6.5 L17.5 17.5', 'M17.5 6.5 L6.5 17.5'],
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): SVGSVGElement {
  return pathsSvg('0 0 24 24', ICONS[name], 'icon');
}

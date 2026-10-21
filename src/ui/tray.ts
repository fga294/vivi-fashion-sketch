import { PLATE_KINDS, type PlateKind } from '../art/plates.ts';
import { h } from './dom.ts';
import { buildFrame, type FrameView } from './frame.ts';
import { buildBumps, buildPegs } from './tools.ts';
import { buildWell, type WellView } from './wells.ts';

export interface TrayView {
  readonly element: HTMLElement;
  readonly frame: FrameView;
  readonly wells: Readonly<Record<PlateKind, WellView>>;
  /** True when the wells sit in a horizontally scrolling drawer (portrait). */
  drawerScrolls(): boolean;
}

/**
 * The molded craft tray. Columns A and B are flex columns side by side in
 * landscape; in portrait they dissolve (display: contents) so their bays become
 * the snap items of one horizontally scrolling drawer.
 */
export function buildTray(): TrayView {
  const wells = Object.fromEntries(PLATE_KINDS.map((k) => [k, buildWell(k)])) as Record<PlateKind, WellView>;
  const frame = buildFrame();

  const colA = h(
    'div',
    { class: 'col col--a' },
    h('div', { class: 'bay bay--ht' }, wells.head.element, wells.torso.element),
    wells.legs.element,
  );
  const colB = h(
    'div',
    { class: 'col col--b' },
    wells.top.element,
    h('div', { class: 'bay bay--kit' }, wells.pattern.element, buildPegs()),
  );
  const drawer = h('section', { class: 'drawer', 'aria-label': 'Plates and tools' }, colA, colB);

  // Spoken once per well on focus, so pre-readers' helpers know what the stacks do.
  const hints = h(
    'div',
    { class: 'sr-only' },
    h('p', { id: 'hint-plate' }, 'Tap for the next plate. Double-tap or drag it to the frame. Arrow keys flip, Enter places.'),
    h('p', { id: 'hint-pattern' }, 'Tap for the next pattern.'),
  );

  return {
    element: h('div', { class: 'tray' }, frame.element, drawer, buildBumps(), hints),
    frame,
    wells,
    drawerScrolls: () => drawer.scrollWidth > drawer.clientWidth + 1,
  };
}

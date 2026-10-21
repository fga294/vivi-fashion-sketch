import { h } from './dom';
import { buildFrame } from './frame';
import { buildBumps, buildPegs } from './tools';
import { buildWell } from './wells';

/**
 * The molded craft tray. Columns A and B are flex columns side by side in
 * landscape; in portrait they dissolve (display: contents) so their bays become
 * the snap items of one horizontally scrolling drawer.
 */
export function buildTray(): HTMLElement {
  const colA = h(
    'div',
    { class: 'col col--a' },
    h('div', { class: 'bay bay--ht' }, buildWell('head'), buildWell('torso')),
    buildWell('legs'),
  );
  const colB = h(
    'div',
    { class: 'col col--b' },
    buildWell('top'),
    h('div', { class: 'bay bay--kit' }, buildWell('pattern'), buildPegs()),
  );

  return h(
    'div',
    { class: 'tray' },
    buildFrame(),
    h('section', { class: 'drawer', 'aria-label': 'Plates and tools' }, colA, colB),
    buildBumps(),
  );
}

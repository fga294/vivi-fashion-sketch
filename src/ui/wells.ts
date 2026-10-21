import { bandAspect, bandViewBox, type PlateBand } from '../art/bands';
import { PATTERN_PLACEHOLDER, PATTERN_PLATE, PLACEHOLDER_ART, STARTER_COUNTS } from '../art/placeholders';
import { h } from './dom';
import { plateButton, type PlateTone, type PlateView } from './plate';

export type WellKind = PlateBand | 'pattern';

const WELL_NAMES: Record<WellKind, string> = {
  head: 'Head',
  torso: 'Torso',
  legs: 'Legs',
  top: 'Top',
  pattern: 'Pattern',
};

const TONES: Record<WellKind, PlateTone> = {
  head: 'blush',
  torso: 'blush',
  legs: 'rose',
  top: 'blush',
  pattern: 'blush',
};

/** Two to four edges show under the top plate, one per plate beneath it. */
function edgesFor(count: number): number {
  return Math.max(2, Math.min(4, count - 1));
}

function placeholderView(kind: WellKind): PlateView {
  const count = STARTER_COUNTS[kind];
  const label = `${WELL_NAMES[kind]} plates, ${count} in the stack`;
  const common = { tone: TONES[kind], edges: edgesFor(count), label };
  if (kind === 'pattern') {
    return {
      ...common,
      viewBox: `0 0 ${PATTERN_PLATE.width} ${PATTERN_PLATE.height}`,
      aspect: PATTERN_PLATE.width / PATTERN_PLATE.height,
      paths: PATTERN_PLACEHOLDER,
    };
  }
  return { ...common, viewBox: bandViewBox(kind), aspect: bandAspect(kind), paths: PLACEHOLDER_ART[kind] };
}

/** A recessed well in the tray holding a stack of plates. */
export function buildWell(kind: WellKind): HTMLElement {
  return h('div', { class: `well well--${kind}`, 'data-well': kind }, plateButton(placeholderView(kind)));
}

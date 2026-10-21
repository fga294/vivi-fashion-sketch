import { h, pathsSvg } from './dom';

export type PlateTone = 'blush' | 'rose';

export interface PlateView {
  /** viewBox in absolute sheet units, e.g. "0 250 600 320" for a torso plate. */
  readonly viewBox: string;
  /** Width ÷ height of the plate. */
  readonly aspect: number;
  readonly paths: readonly string[];
  readonly tone: PlateTone;
  /** Plate edges visible under the top plate (2–4), hinting at the stack. */
  readonly edges: number;
  readonly label: string;
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

/** A plate stack as a button: matte pink plate with the art in raised relief. */
export function plateButton(view: PlateView): HTMLButtonElement {
  const btn = h('button', {
    type: 'button',
    class: `plate plate--${view.tone}`,
    'aria-label': view.label,
  });
  btn.style.setProperty('--aspect', String(view.aspect));
  btn.style.setProperty('--edges', String(view.edges));
  btn.style.boxShadow = stackShadow(view.edges);
  btn.append(pathsSvg(view.viewBox, view.paths, 'plate__art'));
  return btn;
}

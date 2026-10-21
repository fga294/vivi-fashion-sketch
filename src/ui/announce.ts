import { h } from './dom.ts';

let region: HTMLElement | null = null;

/** A polite live region; append it once, then call announce(). */
export function announcer(): HTMLElement {
  region = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  return region;
}

/** Tell screen-reader users what just changed (a plate flipped, placed or returned). */
export function announce(text: string): void {
  if (!region) return;
  region.textContent = '';
  const r = region;
  requestAnimationFrame(() => {
    r.textContent = text;
  });
}

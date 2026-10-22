/** True when the player prefers reduced motion (a settings override arrives in phase 8). */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A quick side-to-side wiggle, to draw the eye to a control. Nothing with reduced motion. */
export function wiggle(el: Element): void {
  if (prefersReducedMotion()) return;
  el.animate(
    [{ transform: 'none' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(-3deg)' }, { transform: 'none' }],
    { duration: 420, easing: 'ease-in-out' },
  );
}

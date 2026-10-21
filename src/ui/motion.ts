/** True when the player prefers reduced motion (a settings override arrives in phase 8). */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

import type { MotionPref } from '../storage/prefs.ts';

let motion: MotionPref = 'system';

/** The settings' motion choice. The page's root carries it, so the CSS follows too. */
export function setMotion(pref: MotionPref): void {
  motion = pref;
  if (pref === 'system') delete document.documentElement.dataset['motion'];
  else document.documentElement.dataset['motion'] = pref;
}

/** True when motion should be reduced: the settings say so, or they follow a device that does. */
export function prefersReducedMotion(): boolean {
  if (motion !== 'system') return motion === 'reduce';
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

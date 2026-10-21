/** Position and velocity of something following a target on a spring. */
export interface Spring {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * One 60 Hz step towards (tx, ty). Stiffness pulls towards the target, damping
 * bleeds speed; 0.35 / 0.7 (PLAN.md) gives a quick, slightly bouncy follow.
 */
export function springStep(s: Spring, tx: number, ty: number, stiffness = 0.35, damping = 0.7): void {
  s.vx = (s.vx + (tx - s.x) * stiffness) * damping;
  s.vy = (s.vy + (ty - s.y) * stiffness) * damping;
  s.x += s.vx;
  s.y += s.vy;
}

export const MAX_TILT = 25;

/** Lean (degrees) towards horizontal motion of `vx` px per frame, capped at ±25°. */
export function tiltFor(vx: number): number {
  return Math.max(-MAX_TILT, Math.min(MAX_TILT, vx * 1.6));
}

/** True when motion along an axis flips direction at a noticeable speed. */
export function reversed(previous: number, current: number, threshold = 1.5): boolean {
  return Math.sign(previous) !== Math.sign(current) && Math.abs(previous) > threshold && Math.abs(current) > threshold * 0.25;
}

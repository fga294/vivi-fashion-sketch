/** Two taps closer together than this are a double-tap. */
export const DOUBLE_TAP_MS = 280;
/** Movement (px) before a press becomes a drag. */
const DRAG_START_PX = 8;

export interface GestureHandlers {
  /** A single tap. When double-tap is handled too, it fires once the double-tap window has passed. */
  tap(): void;
  doubleTap?(): void;
  /** The pointer moved far enough to be a drag. `origin` is where the press started. */
  dragStart?(e: PointerEvent, origin: { readonly x: number; readonly y: number }): void;
  /** Whether a movement of (dx, dy) may start a drag, e.g. only vertical ones in a scrolling drawer. */
  canDrag?(dx: number, dy: number): boolean;
}

/**
 * Tap, double-tap and drag on one element, for mouse, touch and pen alike.
 * Keyboard activation (Space) arrives as a click with detail 0 and counts as a tap.
 */
export function attachGestures(el: HTMLElement, handlers: GestureHandlers): void {
  let press: { id: number; x: number; y: number } | null = null;
  let pendingTap = 0;
  let lastTapAt = -Infinity;

  const clearPending = (): void => {
    if (pendingTap) window.clearTimeout(pendingTap);
    pendingTap = 0;
  };

  el.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });

  el.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id || !handlers.dragStart) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (Math.hypot(dx, dy) < DRAG_START_PX) return;
    const origin = { x: press.x, y: press.y };
    press = null;
    if (handlers.canDrag && !handlers.canDrag(dx, dy)) return;
    clearPending();
    handlers.dragStart(e, origin);
  });

  el.addEventListener('pointerup', (e) => {
    if (!press || e.pointerId !== press.id) return;
    press = null;
    if (!handlers.doubleTap) {
      handlers.tap();
      return;
    }
    const now = performance.now();
    if (pendingTap && now - lastTapAt < DOUBLE_TAP_MS) {
      clearPending();
      lastTapAt = -Infinity;
      handlers.doubleTap();
      return;
    }
    lastTapAt = now;
    pendingTap = window.setTimeout(() => {
      pendingTap = 0;
      handlers.tap();
    }, DOUBLE_TAP_MS);
  });

  el.addEventListener('pointercancel', () => {
    press = null;
  });

  el.addEventListener('click', (e) => {
    if (e.detail === 0) handlers.tap();
  });
}

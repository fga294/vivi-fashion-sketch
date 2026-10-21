// Plates moving between the tray and the frame: a "ghost" copy of the plate
// floats in a fixed layer above everything, follows a drag, and slides to where
// it lands (FLIP: jump to the end, then animate from the inverted start).

import { h } from './dom.ts';
import { prefersReducedMotion } from './motion.ts';

let layer: HTMLElement | null = null;

function flightLayer(): HTMLElement {
  if (!layer) {
    layer = h('div', { class: 'flight-layer', 'aria-hidden': 'true' });
    document.body.append(layer);
  }
  return layer;
}

function setRect(el: HTMLElement, r: DOMRect): void {
  el.style.left = `${r.left}px`;
  el.style.top = `${r.top}px`;
  el.style.width = `${r.width}px`;
  el.style.height = `${r.height}px`;
  el.style.transform = '';
}

/** A floating copy of a plate visual over `rect` (by default, where the visual is now). */
export function ghostOf(face: HTMLElement, rect: DOMRect = face.getBoundingClientRect()): HTMLElement {
  const ghost = face.cloneNode(true) as HTMLElement;
  ghost.classList.remove('is-leaving', 'is-source');
  ghost.classList.add('ghost');
  ghost.removeAttribute('data-plate');
  setRect(ghost, rect);
  flightLayer().append(ghost);
  return ghost;
}

export interface FlyOptions {
  readonly duration?: number;
  /** Fade out on the way, e.g. when a plate goes back into its stack. */
  readonly fade?: boolean;
}

/** Slide a ghost from where it is now to `to`, resizing to fit. */
export function fly(ghost: HTMLElement, to: DOMRect, { duration = 340, fade = false }: FlyOptions = {}): Promise<void> {
  const from = ghost.getBoundingClientRect();
  setRect(ghost, to);
  if (prefersReducedMotion() || duration <= 0 || to.width === 0 || to.height === 0) return Promise.resolve();
  const anim = ghost.animate(
    [
      {
        transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
        opacity: 1,
      },
      { transform: 'none', opacity: fade ? 0 : 1 },
    ],
    { duration, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)', fill: 'forwards' },
  );
  return anim.finished.then(
    () => undefined,
    () => undefined,
  );
}

export interface DragOptions {
  readonly event: PointerEvent;
  readonly origin: { readonly x: number; readonly y: number };
  /** The plate visual being dragged; it dims while its ghost is away. */
  readonly face: HTMLElement;
  /** The element that received the press; it captures the pointer. */
  readonly capture: HTMLElement;
  over(x: number, y: number): boolean;
  hover(on: boolean): void;
  drop(ghost: HTMLElement): void;
  cancel(ghost: HTMLElement): void;
}

/** Drag a plate's ghost with the pointer and report where it is let go. */
export function dragPlate(opts: DragOptions): void {
  const { event, origin, face, capture } = opts;
  const ghost = ghostOf(face);
  ghost.classList.add('is-lifted');
  face.classList.add('is-source');
  const id = event.pointerId;
  try {
    capture.setPointerCapture(id);
  } catch {
    // The pointer may already be gone; the pointerup/cancel listeners still end the drag.
  }

  const ctrl = new AbortController();
  let hovering = false;
  const move = (x: number, y: number): void => {
    ghost.style.transform = `translate(${x - origin.x}px, ${y - origin.y}px) rotate(-1.5deg) scale(1.04)`;
    const on = opts.over(x, y);
    if (on !== hovering) {
      hovering = on;
      opts.hover(on);
    }
  };
  const end = (e: PointerEvent, released: boolean): void => {
    if (e.pointerId !== id) return;
    ctrl.abort();
    face.classList.remove('is-source');
    ghost.classList.remove('is-lifted');
    if (hovering) opts.hover(false);
    if (released && opts.over(e.clientX, e.clientY)) opts.drop(ghost);
    else opts.cancel(ghost);
  };

  move(event.clientX, event.clientY);
  const signal = ctrl.signal;
  capture.addEventListener('pointermove', (e) => e.pointerId === id && move(e.clientX, e.clientY), { signal });
  capture.addEventListener('pointerup', (e) => end(e, true), { signal });
  capture.addEventListener('pointercancel', (e) => end(e, false), { signal });
}

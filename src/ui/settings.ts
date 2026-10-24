// Grown-up settings (PLAN.md: sound, volume, Peek, Stay inside, reduced motion,
// and deleting every saved sheet), behind a parent gate: press and hold the gear
// for 3 seconds. A quick tap only shows how to get in.

import type { Game } from '../state.ts';
import type { Sketchbook } from '../storage/db.ts';
import type { MotionPref, Prefs, Settings } from '../storage/prefs.ts';
import { announce } from './announce.ts';
import { h, s } from './dom.ts';
import { icon } from './icons.ts';
import { setMotion } from './motion.ts';
import type { PaperView } from './paper.ts';
import type { TrayView } from './tray.ts';

/** PLAN.md: the parent gate is a 3-second press and hold. */
export const GATE_MS = 3000;
const RING = 2 * Math.PI * 21;

/** What the settings control. */
export interface SettingsTargets {
  readonly sound: { setMuted(muted: boolean): void; setVolume(volume: number): void };
  readonly paper: PaperView;
}

/** Apply a full set of settings to the game. */
function apply(prefs: Prefs, { sound, paper }: SettingsTargets): void {
  sound.setMuted(!prefs.sound);
  sound.setVolume(prefs.volume);
  paper.sheet.element.classList.toggle('is-peek', prefs.peek);
  paper.stayInside.enabled = prefs.stayInside;
  setMotion(prefs.motion);
}

function toggle(id: string, label: string, hint: string): { row: HTMLElement; control: HTMLButtonElement } {
  const control = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': 'false', 'aria-labelledby': `${id}-label`, 'aria-describedby': `${id}-hint` });
  const row = h(
    'div',
    { class: 'settings__row' },
    h('div', { class: 'settings__text' }, h('span', { class: 'settings__label', id: `${id}-label` }, label), h('span', { class: 'settings__hint', id: `${id}-hint` }, hint)),
    control,
  );
  return { row, control };
}

/** `opening` resolves to the sketchbook (for Delete all), or null when there is none. */
export function connectSettings(game: Game, tray: TrayView, settings: Settings, targets: SettingsTargets, opening: Promise<Sketchbook | null>): void {
  let book: Sketchbook | null = null;
  apply(settings.value, targets);
  game.bus.on('prefs:change', ({ prefs }) => apply(prefs, targets));
  const change = (c: Partial<Prefs>): void => game.bus.emit('prefs:change', { prefs: settings.update(c) });

  // ---------- The gear and its gate ----------

  const ring = s('circle', { class: 'gear__ring', cx: 24, cy: 24, r: 21, 'stroke-dasharray': RING, 'stroke-dashoffset': RING });
  const gear = h(
    'button',
    { type: 'button', class: 'gear', 'aria-label': 'Settings for grown-ups. Press and hold for 3 seconds.' },
    s('svg', { class: 'gear__progress', viewBox: '0 0 48 48', 'aria-hidden': 'true', focusable: 'false' }, ring),
    h('span', { class: 'gear__dome' }, icon('gear')),
  );
  const hint = h('div', { class: 'gear__hint', role: 'status', hidden: true }, 'Grown-ups: press and hold');
  tray.frame.element.append(gear, hint);

  let holding: Animation | null = null;
  let heldSince = 0;
  let hintTimer = 0;
  const pass = (): void => {
    holding?.cancel();
    holding = null;
    open();
  };
  const start = (): void => {
    if (holding) return;
    hint.hidden = true;
    heldSince = performance.now();
    const anim = ring.animate([{ strokeDashoffset: RING }, { strokeDashoffset: 0 }], { duration: GATE_MS, easing: 'linear', fill: 'forwards' });
    holding = anim;
    anim.finished.then(
      () => {
        if (holding === anim) pass();
      },
      () => undefined,
    );
  };
  const stop = (early: boolean): void => {
    if (!holding) return;
    // Held long enough, even if a busy frame hasn't let the ring report it yet.
    if (early && performance.now() - heldSince >= GATE_MS) {
      pass();
      return;
    }
    holding.cancel();
    holding = null;
    if (!early) return;
    hint.hidden = false;
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => (hint.hidden = true), 2500);
    announce('Settings are for grown-ups: press and hold the gear for 3 seconds.');
  };
  gear.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    e.preventDefault();
    try {
      gear.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers can't be captured.
    }
    start();
  });
  gear.addEventListener('pointerup', () => stop(true));
  gear.addEventListener('pointercancel', () => stop(false));
  gear.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) start();
    if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
  });
  gear.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' || e.key === ' ') stop(true);
  });
  gear.addEventListener('contextmenu', (e) => e.preventDefault()); // a long press is not a right-click here

  // ---------- The dialog ----------

  const sound = toggle('set-sound', 'Sound', 'Scratches, giggles and the Ta-da.');
  const volume = h('input', { type: 'range', class: 'settings__volume', min: 0, max: 100, step: 5, id: 'set-volume' });
  const volumeRow = h('label', { class: 'settings__row', for: 'set-volume' }, h('span', { class: 'settings__label' }, 'Volume'), volume);
  const peek = toggle('set-peek', 'Peek', 'The plates show faintly through the paper, so children know where to rub.');
  const stay = toggle('set-stay', 'Stay inside', 'Pattern plates keep to the garment where a stroke starts.');
  const motion = h(
    'select',
    { class: 'settings__select', id: 'set-motion' },
    h('option', { value: 'system' }, 'Follow this device'),
    h('option', { value: 'reduce' }, 'Less motion'),
    h('option', { value: 'full' }, 'Full motion'),
  );
  const motionRow = h('label', { class: 'settings__row', for: 'set-motion' }, h('span', { class: 'settings__label' }, 'Motion'), motion);
  const wipe = h('button', { type: 'button', class: 'settings__danger' }, icon('trash'), 'Delete all saved sheets');
  const wipeYes = h('button', { type: 'button', class: 'settings__confirm-yes' }, 'Delete them all');
  const wipeNo = h('button', { type: 'button', class: 'settings__confirm-no' }, 'Keep them');
  const wipeAsk = h('div', { class: 'settings__confirm', role: 'group', 'aria-label': 'Delete every saved sheet?', hidden: true }, wipeYes, wipeNo);
  const wipeRow = h('div', { class: 'settings__wipe', hidden: true }, wipe, wipeAsk);
  const noSaving = h('p', { class: 'settings__hint', hidden: true }, 'Saving sheets is off: this browser isn’t keeping site data.');
  void opening.then((b) => {
    book = b;
    wipeRow.hidden = !b;
    noSaving.hidden = Boolean(b);
  });
  const done = h('button', { type: 'button', class: 'settings__done' }, 'Done');
  const dialog = h(
    'dialog',
    { class: 'settings', 'aria-labelledby': 'settings-title' },
    h('h2', { class: 'settings__title', id: 'settings-title' }, 'Settings'),
    sound.row,
    volumeRow,
    peek.row,
    stay.row,
    motionRow,
    wipeRow,
    noSaving,
    done,
  );
  document.body.append(dialog);

  const show = (prefs: Prefs): void => {
    sound.control.setAttribute('aria-checked', String(prefs.sound));
    volume.value = String(Math.round(prefs.volume * 100));
    peek.control.setAttribute('aria-checked', String(prefs.peek));
    stay.control.setAttribute('aria-checked', String(prefs.stayInside));
    motion.value = prefs.motion;
  };
  function open(): void {
    targets.paper.endStroke();
    show(settings.value);
    wipeAsk.hidden = true;
    wipe.hidden = false;
    dialog.showModal();
  }
  game.bus.on('prefs:change', ({ prefs }) => show(prefs));

  sound.control.addEventListener('click', () => change({ sound: !settings.value.sound }));
  volume.addEventListener('input', () => change({ volume: Number(volume.value) / 100 }));
  peek.control.addEventListener('click', () => change({ peek: !settings.value.peek }));
  stay.control.addEventListener('click', () => change({ stayInside: !settings.value.stayInside }));
  motion.addEventListener('change', () => change({ motion: motion.value as MotionPref }));
  wipe.addEventListener('click', () => {
    wipe.hidden = true;
    wipeAsk.hidden = false;
    wipeNo.focus();
  });
  wipeNo.addEventListener('click', () => {
    wipeAsk.hidden = true;
    wipe.hidden = false;
    wipe.focus();
  });
  wipeYes.addEventListener('click', async () => {
    const ok = (await book?.clear()) ?? false;
    wipeAsk.hidden = true;
    wipe.hidden = false;
    announce(ok ? 'Every saved sheet is deleted.' : "Couldn't delete the saved sheets.");
  });
  done.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => gear.focus({ preventScroll: true }));
}

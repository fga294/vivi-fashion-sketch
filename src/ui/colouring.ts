// Colouring: the pencil box (its lid flips open and the 16 pencils fan out), the
// Magic fill switch, the eraser, Undo and Redo, and the tick-or-cross check
// before a Magic fill that would flood most of the sheet.

import { pencilById, PENCILS, type PencilId } from '../art/colours.ts';
import type { FillPlan } from '../engine/magic.ts';
import type { Game } from '../state.ts';
import { announce } from './announce.ts';
import { h, s } from './dom.ts';
import { icon } from './icons.ts';
import { prefersReducedMotion, wiggle } from './motion.ts';
import type { PaperView } from './paper.ts';
import type { TrayView } from './tray.ts';

/** PLAN.md: a fill covering more than 45% of the sheet asks first. */
export const BIG_FILL = 0.45;

/** An upright pencil, tip up: painted body, sharpened wood, coloured lead. */
function pencilArt(hex: string): SVGSVGElement {
  return s(
    'svg',
    { class: 'pencil__art', viewBox: '0 0 24 100', 'aria-hidden': 'true', focusable: 'false' },
    s('rect', { x: 6, y: 30, width: 12, height: 68, rx: 1.5, fill: hex }),
    s('rect', { x: 13.5, y: 30, width: 2.5, height: 68, fill: 'rgba(255,255,255,0.25)' }),
    s('rect', { x: 6, y: 86, width: 12, height: 4, fill: 'rgba(255,255,255,0.35)' }),
    s('path', { d: 'M6 30 L12 9 L18 30 Z', fill: '#EFD4A8' }),
    s('path', { d: 'M9.7 17 L12 9 L14.3 17 Z', fill: hex }),
  );
}

function bumpButton(cls: string, iconName: 'redo' | 'magic' | 'tick' | 'cross', word: string, label: string): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', class: `bump ${cls}`, 'aria-label': label },
    h('span', { class: 'bump__dome' }, icon(iconName)),
    h('span', { class: 'bump__label', 'aria-hidden': 'true' }, word),
  );
}

export function connectColouring(game: Game, tray: TrayView, paper: PaperView): void {
  const { history, magic, rub, sheet } = paper;

  // ---------- The pencil box and its fan ----------

  const box = tray.pencils;
  const pencilButtons = new Map<PencilId, HTMLButtonElement>();
  for (const p of PENCILS) {
    const b = h('button', { type: 'button', class: 'pencil', 'data-pencil': p.id, 'aria-label': `${p.name} pencil`, 'aria-pressed': 'false' }, pencilArt(p.hex));
    b.addEventListener('click', () => {
      if (game.tool === 'pencil' && game.pencil === p.id) game.setTool('none');
      else {
        game.setPencil(p.id);
        game.setTool('pencil');
        announce(`${p.name} pencil${game.magic ? ', Magic fill' : ''}`);
      }
      close(true);
    });
    pencilButtons.set(p.id, b);
  }
  const magicToggle = bumpButton('magic-toggle', 'magic', 'Magic', 'Magic fill');
  magicToggle.setAttribute('aria-pressed', 'false');
  magicToggle.addEventListener('click', () => {
    game.setMagic(!game.magic);
    if (game.tool !== 'pencil') game.setTool('pencil');
    announce(game.magic ? 'Magic fill on. Tap a shape to colour it in.' : 'Magic fill off.');
  });
  const fan = h(
    'div',
    { class: 'pencil-fan', id: 'pencil-fan', role: 'group', 'aria-label': 'Pencils', hidden: true },
    h('div', { class: 'pencil-fan__pencils' }, ...pencilButtons.values()),
    magicToggle,
  );
  document.body.append(fan);

  const isOpen = (): boolean => !fan.hidden;
  const place = (): void => {
    // Above the box, centred on it, kept inside the screen.
    const r = box.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const fw = fan.offsetWidth;
    const fh = fan.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - fw / 2), vw - fw - 8);
    const top = Math.max(8, r.top - fh - 6);
    fan.style.left = `${left}px`;
    fan.style.top = `${top}px`;
  };
  const open = (): void => {
    paper.endStroke();
    fan.hidden = false;
    box.setAttribute('aria-expanded', 'true');
    place();
    if (!prefersReducedMotion()) {
      [...pencilButtons.values()].forEach((b, i) => {
        b.animate(
          [{ transform: `translateY(40%) rotate(${i % 2 ? 8 : -8}deg) scale(0.85)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
          { duration: 260, delay: i * 14, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1.2)', fill: 'backwards' },
        );
      });
    }
    (pencilButtons.get(game.pencil) ?? magicToggle).focus({ preventScroll: true });
  };
  function close(focusBox = false): void {
    if (!isOpen()) return;
    fan.hidden = true;
    box.setAttribute('aria-expanded', 'false');
    if (focusBox && fan.contains(document.activeElement)) box.focus({ preventScroll: true });
  }
  box.addEventListener('click', () => (isOpen() ? close(true) : open()));
  fan.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close(true);
      e.preventDefault();
    }
  });
  // A press anywhere else puts the fan away.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (isOpen() && !fan.contains(e.target as Node) && !box.contains(e.target as Node)) close();
    },
    { capture: true },
  );
  window.addEventListener('resize', () => isOpen() && place());

  const showPencils = (): void => {
    for (const [id, b] of pencilButtons) b.setAttribute('aria-pressed', String(game.tool === 'pencil' && game.pencil === id));
    magicToggle.setAttribute('aria-pressed', String(game.magic));
    box.classList.toggle('is-holding', game.tool === 'pencil');
    box.style.setProperty('--pencil', pencilById(game.pencil).hex);
  };
  game.bus.on('tool:change', showPencils);
  game.bus.on('pencil:change', showPencils);
  game.bus.on('magic:change', showPencils);
  showPencils();

  // ---------- Eraser ----------

  const eraser = tray.bump('eraser');
  eraser.setAttribute('aria-pressed', 'false');
  eraser.addEventListener('click', () => {
    game.setTool(game.tool === 'eraser' ? 'none' : 'eraser');
    if (game.tool === 'eraser') announce('Eraser. Rub out colour and patterns.');
  });
  game.bus.on('tool:change', ({ tool }) => eraser.setAttribute('aria-pressed', String(tool === 'eraser')));

  // ---------- Undo and redo ----------

  const undoButton = tray.bump('undo');
  const redoButton = bumpButton('redo-btn', 'redo', 'Redo', 'Redo');
  redoButton.hidden = true;
  // Redo floats just above Undo while there is something to redo, so the bump row never crowds.
  const pair = h('span', { class: 'bump-pair' });
  undoButton.replaceWith(pair);
  pair.append(undoButton, redoButton);
  const showHistory = (): void => {
    undoButton.setAttribute('aria-disabled', String(!history.canUndo));
    redoButton.hidden = !history.canRedo;
  };
  const step = (direction: 'undo' | 'redo'): void => {
    cancelFill();
    paper.endStroke();
    const done = direction === 'undo' ? history.undo() : history.redo();
    if (!done) {
      wiggle(direction === 'undo' ? undoButton : redoButton);
      return;
    }
    game.bus.emit('history:step', { direction });
    announce(direction === 'undo' ? 'Undone.' : 'Redone.');
  };
  undoButton.addEventListener('click', () => step('undo'));
  redoButton.addEventListener('click', () => step('redo'));
  paper.onTwoFingerTap = () => step('undo');
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'z') step(e.shiftKey ? 'redo' : 'undo');
    else if (key === 'y' && e.ctrlKey) step('redo');
    else return;
    e.preventDefault();
  });
  game.bus.on('history:change', showHistory);
  showHistory();

  // ---------- Magic fill, and the check before a big one ----------

  const preview = h('canvas', { class: 'layer fill-preview', hidden: true });
  sheet.insertUnder(preview, 'lines');
  const tick = bumpButton('fill-yes', 'tick', 'Yes', 'Fill it');
  const cross = bumpButton('fill-no', 'cross', 'No', "Don't fill");
  const ask = h('div', { class: 'fill-ask', role: 'group', 'aria-label': 'Fill most of the sheet?', hidden: true }, tick, cross);
  document.body.append(ask);
  let pending: FillPlan | null = null;

  const land = (plan: FillPlan): void => {
    history.begin();
    magic.apply(plan);
    history.commit();
    game.bus.emit('fill:done', { share: plan.share });
  };
  function cancelFill(): void {
    if (!pending) return;
    pending = null;
    preview.hidden = true;
    ask.hidden = true;
  }
  tick.addEventListener('click', () => {
    const plan = pending;
    cancelFill();
    if (plan) land(plan);
    announce('Filled.');
  });
  cross.addEventListener('click', () => {
    cancelFill();
    announce('No fill.');
  });
  ask.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cancelFill();
  });
  sheet.element.addEventListener('pointerdown', cancelFill, { capture: true });

  paper.onMagicTap = (x, y) => {
    cancelFill();
    const plan = magic.plan(x, y, pencilById(game.pencil).hex, rub.linesVersion);
    if (!plan) {
      wiggle(box);
      return;
    }
    if (plan.share <= BIG_FILL) {
      land(plan);
      return;
    }
    // Most of the sheet: show the fill faintly and ask, tick or cross.
    pending = plan;
    preview.width = plan.w;
    preview.height = plan.h;
    preview.getContext('2d')!.drawImage(plan.image, 0, 0);
    Object.assign(preview.style, {
      left: `${(plan.x / sheet.pxWidth) * 100}%`,
      top: `${(plan.y / sheet.pxHeight) * 100}%`,
      width: `${(plan.w / sheet.pxWidth) * 100}%`,
      height: `${(plan.h / sheet.pxHeight) * 100}%`,
    });
    preview.hidden = false;
    ask.hidden = false;
    const r = sheet.element.getBoundingClientRect();
    const cx = r.left + (x / 600) * r.width;
    const cy = r.top + (y / 1500) * r.height;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    ask.style.left = `${Math.min(Math.max(8, cx - ask.offsetWidth / 2), vw - ask.offsetWidth - 8)}px`;
    ask.style.top = `${Math.min(Math.max(8, cy - ask.offsetHeight - 24), vh - ask.offsetHeight - 8)}px`;
    tick.focus({ preventScroll: true });
    announce('That would colour most of the sheet. Fill it?');
  };

  game.bus.on('paper:lift', cancelFill);
  game.bus.on('paper:new', () => {
    cancelFill();
    close();
  });
}

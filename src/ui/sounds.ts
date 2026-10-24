// Plays the tray's sounds from game events, and runs the Sound button. The
// mute setting is saved, so it survives a reload.

import type { SoundEngine } from '../audio/sound.ts';
import type { Game } from '../state.ts';
import type { Settings } from '../storage/prefs.ts';
import { announce } from './announce.ts';
import { icon } from './icons.ts';
import type { TrayView } from './tray.ts';

export function connectSound(game: Game, tray: TrayView, sound: SoundEngine, settings: Settings): void {
  const { bus } = game;
  bus.on('plate:flip', () => sound.tick());
  bus.on('plate:slide', ({ to }) => sound.swish(to === 'frame' ? 'plate' : 'home'));
  bus.on('plate:place', () => sound.clack('plate'));
  bus.on('paper:lay', ({ fresh }) => {
    if (fresh) sound.swish('paper');
  });
  bus.on('paper:clack', () => sound.clack('paper'));
  bus.on('paper:lift', () => {
    sound.clack('latch');
    sound.swish('paper');
  });
  bus.on('paper:new', () => sound.swish('paper'));
  bus.on('bead:fill', ({ count }) => sound.pop(count));
  // A pattern plate seats under the frame's edge; going home it swishes (plate:slide).
  bus.on('pattern:change', ({ plate }) => {
    if (plate) sound.clack('plate');
  });
  bus.on('crayon:change', () => sound.tick());
  bus.on('pencil:change', () => sound.tick());
  bus.on('magic:change', () => sound.tick());
  bus.on('fill:done', () => sound.magic());
  bus.on('history:step', () => sound.tick());
  bus.on('sheet:saved', () => sound.swish('paper'));

  const button = tray.bump('sound');
  const dome = button.querySelector('.bump__dome')!;
  const show = (on: boolean): void => {
    button.setAttribute('aria-pressed', String(on));
    dome.replaceChildren(icon(on ? 'sound' : 'soundOff'));
  };
  button.addEventListener('click', () => {
    // The settings apply it (prefs:change), so the bump and the grown-up settings agree.
    const prefs = settings.update({ sound: !settings.value.sound });
    game.bus.emit('prefs:change', { prefs });
    if (prefs.sound) sound.tick();
    announce(prefs.sound ? 'Sound on' : 'Sound off');
  });
  game.bus.on('prefs:change', ({ prefs }) => show(prefs.sound));
  show(settings.value.sound);
}

// Plays the tray's sounds from game events, and runs the Sound button. The
// mute setting is saved, so it survives a reload.

import type { SoundEngine } from '../audio/sound.ts';
import type { Game } from '../state.ts';
import { writePrefs } from '../storage/prefs.ts';
import { announce } from './announce.ts';
import { icon } from './icons.ts';
import type { TrayView } from './tray.ts';

export function connectSound(game: Game, tray: TrayView, sound: SoundEngine): void {
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

  const button = tray.bump('sound');
  const dome = button.querySelector('.bump__dome')!;
  const show = (): void => {
    button.setAttribute('aria-pressed', String(!sound.isMuted));
    dome.replaceChildren(icon(sound.isMuted ? 'soundOff' : 'sound'));
  };
  button.addEventListener('click', () => {
    sound.setMuted(!sound.isMuted);
    writePrefs({ sound: !sound.isMuted });
    show();
    if (!sound.isMuted) sound.tick();
    announce(sound.isMuted ? 'Sound off' : 'Sound on');
  });
  show();
}

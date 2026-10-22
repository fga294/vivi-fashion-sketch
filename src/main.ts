import './styles/tokens.css';
import './styles/tray.css';
import './styles/frame.css';
import { loadPlates } from './art/loader.ts';
import { SoundEngine } from './audio/sound.ts';
import * as synth from './audio/synth.ts';
import { Game } from './state.ts';
import { readPrefs } from './storage/prefs.ts';
import { announcer } from './ui/announce.ts';
import { connectCompletion } from './ui/completion.ts';
import { connectPlates } from './ui/controller.ts';
import { connectPaper } from './ui/paper.ts';
import { connectSound } from './ui/sounds.ts';
import { buildTray } from './ui/tray.ts';

const app = document.getElementById('app');
if (!app) throw new Error('Vivi Fashion Dresses: #app element missing from index.html');

// Sound wakes on the player's first tap, even one made while the plates are still loading.
const sound = new SoundEngine({ muted: !readPrefs().sound, soundsDir: `${import.meta.env.BASE_URL}sounds/` });
sound.listen();

// The tray paints straight away; the plates fill the wells once they load.
const tray = buildTray();
app.replaceChildren(tray.element, announcer());

const game = new Game(await loadPlates().catch((err: unknown) => {
  console.error('Vivi Fashion Dresses: could not load the plates', err);
  return [];
}));
connectPlates(game, tray);
const paper = connectPaper(game, tray, sound);
connectSound(game, tray, sound);
const celebrate = connectCompletion(game, tray, paper, sound);

if (import.meta.env.DEV) Object.assign(window, { vivi: { game, tray, paper, sound, celebrate } });
// Effect and sound counters for tests and tuning: open the game with ?fxstats. The synth
// voices are published too, so tests can render them offline and measure them.
if (new URLSearchParams(location.search).has('fxstats')) {
  Object.assign(window, {
    __viviFx: { stats: paper.fx.stats, crumbs: paper.fx.crumbs, glints: paper.fx.glints, cursor: paper.cursor, sound, celebrate, synth },
  });
}

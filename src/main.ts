import './styles/tokens.css';
import './styles/tray.css';
import './styles/frame.css';
import './styles/panels.css';
import './styles/print.css';
import { loadPlates } from './art/loader.ts';
import { SoundEngine } from './audio/sound.ts';
import * as synth from './audio/synth.ts';
import { exportSheet } from './engine/export.ts';
import { Game } from './state.ts';
import { Sketchbook } from './storage/db.ts';
import { Settings } from './storage/prefs.ts';
import { announcer } from './ui/announce.ts';
import { connectColouring } from './ui/colouring.ts';
import { connectCompletion } from './ui/completion.ts';
import { connectPlates } from './ui/controller.ts';
import { connectPaper } from './ui/paper.ts';
import { connectPatterns } from './ui/patterns.ts';
import { connectPrint } from './ui/print.ts';
import { connectSettings } from './ui/settings.ts';
import { connectSketchbook } from './ui/sketchbook.ts';
import { connectSound } from './ui/sounds.ts';
import { buildTray } from './ui/tray.ts';

const app = document.getElementById('app');
if (!app) throw new Error('Vivi Fashion Dresses: #app element missing from index.html');

// Sound wakes on the player's first tap, even one made while the plates are still loading.
const settings = new Settings();
const sound = new SoundEngine({ muted: !settings.value.sound, soundsDir: `${import.meta.env.BASE_URL}sounds/` });
sound.listen();
// The sketchbook opens alongside the plates; without storage it's null and the game carries on.
const book = Sketchbook.open();

// The tray paints straight away; the plates fill the wells once they load.
const tray = buildTray();
app.replaceChildren(tray.element, announcer());

const game = new Game(await loadPlates().catch((err: unknown) => {
  console.error('Vivi Fashion Dresses: could not load the plates', err);
  return [];
}));
connectPlates(game, tray);
const paper = connectPaper(game, tray, sound);
connectPatterns(game, paper);
connectColouring(game, tray, paper);
connectSound(game, tray, sound, settings);
const celebrate = connectCompletion(game, tray, paper, sound);
// The browser's own Print command prints the sheet in the frame.
const printer = connectPrint(() => (game.phase === 'noPaper' ? null : exportSheet(paper.sheet)));
// IndexedDB can hang rather than fail in some private modes: give it 3 seconds, then carry on without.
// Nothing waits for it: the sketchbook and settings adapt once it's known.
const sketchbook = Promise.race([book, new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3000))]);
connectSketchbook(game, tray, paper, printer, sketchbook);
connectSettings(game, tray, settings, { sound, paper }, sketchbook);

if (import.meta.env.DEV) Object.assign(window, { vivi: { game, tray, paper, sound, celebrate } });
// Effect and sound counters for tests and tuning: open the game with ?fxstats. The synth
// voices are published too, so tests can render them offline and measure them.
if (new URLSearchParams(location.search).has('fxstats')) {
  Object.assign(window, {
    __viviFx: {
      stats: paper.fx.stats,
      crumbs: paper.fx.crumbs,
      glints: paper.fx.glints,
      cursor: paper.cursor,
      sound,
      celebrate,
      synth,
      game,
      stayInside: paper.stayInside,
      history: paper.history,
      revealedLines: () => paper.rub.revealedLines(),
      exportSheet: () => exportSheet(paper.sheet).toDataURL('image/png'),
      /** Whether this device keeps a sketchbook: null until known. */
      sketchbook: null as boolean | null,
    },
  });
  void sketchbook.then((b) => {
    (window as unknown as { __viviFx: { sketchbook: boolean | null } }).__viviFx.sketchbook = b !== null;
  });
}

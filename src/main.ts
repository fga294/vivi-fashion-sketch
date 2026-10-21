import './styles/tokens.css';
import './styles/tray.css';
import './styles/frame.css';
import { loadPlates } from './art/loader.ts';
import { Game } from './state.ts';
import { announcer } from './ui/announce.ts';
import { connectPlates } from './ui/controller.ts';
import { connectPaper } from './ui/paper.ts';
import { buildTray } from './ui/tray.ts';

const app = document.getElementById('app');
if (!app) throw new Error('Vivi Fashion Dresses: #app element missing from index.html');

// The tray paints straight away; the plates fill the wells once they load.
const tray = buildTray();
app.replaceChildren(tray.element, announcer());

const game = new Game(await loadPlates().catch((err: unknown) => {
  console.error('Vivi Fashion Dresses: could not load the plates', err);
  return [];
}));
connectPlates(game, tray);
const paper = connectPaper(game, tray);

if (import.meta.env.DEV) Object.assign(window, { vivi: { game, tray, paper } });
// Effect counters for tests and tuning: open the game with ?fxstats.
if (new URLSearchParams(location.search).has('fxstats')) {
  Object.assign(window, { __viviFx: { stats: paper.fx.stats, crumbs: paper.fx.crumbs, glints: paper.fx.glints, cursor: paper.cursor } });
}

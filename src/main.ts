import './styles/tokens.css';
import './styles/tray.css';
import './styles/frame.css';
import { buildTray } from './ui/tray';

const app = document.getElementById('app');
if (!app) throw new Error('Vivi Fashion Dresses: #app element missing from index.html');
app.replaceChildren(buildTray());

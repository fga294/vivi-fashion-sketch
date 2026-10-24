// The sketchbook: finished sheets saved on this device, shown as a grid of
// thumbnails, plus what can be done with the sheet in the frame (save, share,
// print, or print a blank colouring page of the plates). A new sheet saves the
// old one, which flutters into the Sketchbook button. Without storage there are
// no saved sheets, but sharing and printing still work.

import { blankPage, exportSheet, pngOf, thumbnail } from '../engine/export.ts';
import type { Game } from '../state.ts';
import type { Sketchbook, SheetSummary } from '../storage/db.ts';
import { announce } from './announce.ts';
import { h } from './dom.ts';
import { icon, type IconName } from './icons.ts';
import { prefersReducedMotion, wiggle } from './motion.ts';
import type { PaperView } from './paper.ts';
import type { Printer } from './print.ts';
import { shareImage, sheetFileName } from './share.ts';
import type { TrayView } from './tray.ts';

function action(cls: string, name: IconName, word: string, label: string): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', class: `bump ${cls}`, 'aria-label': label },
    h('span', { class: 'bump__dome' }, icon(name)),
    h('span', { class: 'bump__label', 'aria-hidden': 'true' }, word),
  );
}

const dateLabel = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });

/** `opening` resolves to the sketchbook, or null when this device won't keep one. */
export function connectSketchbook(game: Game, tray: TrayView, paper: PaperView, printer: Printer, opening: Promise<Sketchbook | null>): void {
  const { sheet } = paper;
  let book: Sketchbook | null = null;
  const opener = tray.bump('sketchbook');

  // ---------- The dialog ----------

  const close = action('book__close', 'cross', 'Close', 'Close the sketchbook');
  const nowThumb = h('canvas', { class: 'book__thumb', width: 160, height: 400, 'aria-hidden': 'true' });
  const save = action('book-save', 'save', 'Save', 'Save this sheet in the sketchbook');
  const share = action('book-share', 'share', 'Share', 'Share this sheet');
  const print = action('book-print', 'print', 'Print', 'Print this sheet');
  const blank = action('book-blank', 'blank', 'Blank', 'Print a blank colouring page of these plates');
  const now = h(
    'section',
    { class: 'book__now', 'aria-label': 'This sheet' },
    nowThumb,
    h('div', { class: 'book__actions' }, save, share, print, blank),
  );
  const grid = h('ul', { class: 'book__grid', 'aria-label': 'Saved sheets' });
  const empty = h('p', { class: 'book__empty' }, 'Sheets you save appear here.');
  const saved = h('section', { class: 'book__saved' }, grid, empty);

  const big = h('img', { class: 'book__big', alt: '' });
  const back = action('book-back', 'back', 'Back', 'Back to the sketchbook');
  const shareOne = action('book-share-one', 'share', 'Share', 'Share this saved sheet');
  const printOne = action('book-print-one', 'print', 'Print', 'Print this saved sheet');
  const del = action('book-delete', 'trash', 'Delete', 'Delete this saved sheet');
  const yes = action('book-yes', 'tick', 'Yes', 'Yes, delete it');
  const no = action('book-no', 'cross', 'No', 'No, keep it');
  const confirm = h('div', { class: 'book__confirm', role: 'group', 'aria-label': 'Delete this sheet?', hidden: true }, yes, no);
  const actions = h('div', { class: 'book__actions' }, back, shareOne, printOne, del);
  const viewer = h('section', { class: 'book__view', 'aria-label': 'Saved sheet', hidden: true }, big, actions, confirm);

  const dialog = h(
    'dialog',
    { class: 'book', 'aria-labelledby': 'book-title' },
    h('div', { class: 'book__head' }, h('h2', { class: 'book__title', id: 'book-title' }, icon('sketchbook'), 'Sketchbook'), close),
    now,
    saved,
    viewer,
  );
  document.body.append(dialog);
  saved.hidden = true;
  void opening.then((b) => {
    book = b;
    if (dialog.open && !viewing) toGrid();
    if (dialog.open) void showGrid();
  });

  let urls: string[] = [];
  let viewing: { id: number; blob: Blob } | null = null;
  const forget = (): void => {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
  };

  const hasSheet = (): boolean => game.phase !== 'noPaper';
  const hasPlates = (): boolean => Object.keys(game.slots).length > 0;

  const showGrid = async (): Promise<void> => {
    if (!book) return;
    const sheets: SheetSummary[] = await book.list();
    forget();
    grid.replaceChildren(
      ...sheets.map((s) => {
        const url = URL.createObjectURL(s.thumb);
        urls.push(url);
        const b = h('button', { type: 'button', class: 'book__item', 'data-id': String(s.id), 'aria-label': `Saved ${dateLabel(s.created)}` }, h('img', { src: url, alt: '' }));
        b.addEventListener('click', () => void view(s.id));
        return h('li', {}, b);
      }),
    );
    empty.hidden = sheets.length > 0;
  };

  const showNow = (): void => {
    now.hidden = !hasSheet() && !hasPlates();
    for (const b of [share, print]) b.hidden = !hasSheet();
    save.hidden = !book || !hasSheet();
    nowThumb.hidden = !hasSheet();
    blank.hidden = !hasPlates();
    if (hasSheet()) {
      const ctx = nowThumb.getContext('2d')!;
      ctx.clearRect(0, 0, nowThumb.width, nowThumb.height);
      ctx.drawImage(exportSheet(sheet), 0, 0, nowThumb.width, nowThumb.height);
    }
  };

  const toGrid = (): void => {
    viewing = null;
    viewer.hidden = true;
    confirm.hidden = true;
    actions.hidden = false;
    now.hidden = false;
    showNow();
    saved.hidden = !book;
    big.removeAttribute('src');
  };

  async function view(id: number): Promise<void> {
    const blob = await book?.image(id);
    if (!blob) return;
    viewing = { id, blob };
    const url = URL.createObjectURL(blob);
    urls.push(url);
    big.src = url;
    now.hidden = true;
    saved.hidden = true;
    viewer.hidden = false;
    confirm.hidden = true;
    actions.hidden = false;
    back.focus();
  }

  opener.addEventListener('click', () => {
    paper.endStroke();
    toGrid();
    void showGrid();
    dialog.showModal();
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close(); // a tap on the dimmed backdrop
  });
  dialog.addEventListener('close', () => {
    forget();
    viewing = null;
    opener.focus({ preventScroll: true });
  });

  // ---------- This sheet ----------

  const keep = async (canvas: HTMLCanvasElement): Promise<boolean> => {
    if (!book) return false;
    const [image, thumb] = await Promise.all([pngOf(canvas), pngOf(thumbnail(canvas))]);
    return (await book.add(image, thumb)) !== null;
  };

  let dirty = false;
  game.bus.on('sheet:changed', () => {
    dirty = true;
  });
  game.bus.on('paper:lay', ({ fresh }) => {
    if (fresh) dirty = false;
  });

  save.addEventListener('click', async () => {
    const ok = await keep(exportSheet(sheet));
    if (ok) {
      dirty = false;
      game.bus.emit('sheet:saved', { auto: false });
      announce('Saved in your sketchbook.');
      await showGrid();
    } else {
      wiggle(save);
      announce("Couldn't save. The sketchbook may be full.");
    }
  });
  share.addEventListener('click', async () => {
    const how = await shareImage(await pngOf(exportSheet(sheet)), sheetFileName());
    if (how === 'downloaded') announce('Downloaded.');
  });
  print.addEventListener('click', () => printer.print(exportSheet(sheet)));
  blank.addEventListener('click', () => printer.print(blankPage(game.slots)));

  // ---------- A saved sheet ----------

  back.addEventListener('click', toGrid);
  shareOne.addEventListener('click', () => {
    if (viewing) void shareImage(viewing.blob, sheetFileName());
  });
  printOne.addEventListener('click', async () => {
    if (!viewing) return;
    printer.print(await createImageBitmap(viewing.blob));
  });
  del.addEventListener('click', () => {
    actions.hidden = true;
    confirm.hidden = false;
    no.focus();
  });
  no.addEventListener('click', () => {
    confirm.hidden = true;
    actions.hidden = false;
    del.focus();
  });
  yes.addEventListener('click', async () => {
    if (!viewing || !book) return;
    await book.remove(viewing.id);
    announce('Deleted.');
    toGrid();
    await showGrid();
  });

  // ---------- A new sheet saves the old one ----------

  /** A copy of the sheet flutters from the frame into the Sketchbook button. */
  const flutter = (canvas: HTMLCanvasElement): void => {
    if (prefersReducedMotion() || opener.hidden) return;
    const from = sheet.element.getBoundingClientRect();
    const to = opener.getBoundingClientRect();
    if (from.width === 0 || to.width === 0) return;
    const ghost = thumbnail(canvas, Math.round(from.width));
    ghost.className = 'sheet-flutter';
    Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.append(ghost);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const k = Math.min(to.width / from.width, to.height / from.height);
    ghost
      .animate(
        [
          { transform: 'none', opacity: 1 },
          { transform: `translate(${dx * 0.3}px, ${dy * 0.25 - 30}px) rotate(-7deg) scale(0.7)`, opacity: 1, offset: 0.3 },
          { transform: `translate(${dx * 0.65}px, ${dy * 0.6}px) rotate(6deg) scale(0.4)`, opacity: 1, offset: 0.62 },
          { transform: `translate(${dx}px, ${dy}px) rotate(-2deg) scale(${k})`, opacity: 0.2 },
        ],
        { duration: 620, easing: 'ease-in-out' },
      )
      .finished.then(
        () => ghost.remove(),
        () => ghost.remove(),
      );
  };

  game.bus.on('sheet:finish', () => {
    if (!book || !dirty) return;
    dirty = false;
    const canvas = exportSheet(sheet); // before the sheet is cleared
    paper.leavingToBook = true;
    flutter(canvas);
    void keep(canvas).then((ok) => {
      if (ok) {
        game.bus.emit('sheet:saved', { auto: true });
        announce('Saved in your sketchbook.');
        if (dialog.open) void showGrid();
      } else announce("Couldn't save the sheet.");
    });
  });
}

import { expect, test, type Page } from '@playwright/test';

// Phase 8 "Done when": the exported PNG matches the screen, print preview shows
// exactly one sheet, and the game runs with storage blocked (private browsing).
// Plus the sketchbook, sharing, and the settings behind their parent gate.

type Point = readonly [number, number];

async function open(page: Page, { prefs }: { prefs?: object } = {}): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.addInitScript((p) => {
    // Printing is recorded, not shown: a print dialog would block the test.
    window.print = () => {
      (window as unknown as { __printed: number }).__printed = ((window as unknown as { __printed?: number }).__printed ?? 0) + 1;
    };
    if (p) {
      try {
        localStorage.setItem('vivi-fashion-dresses:prefs', JSON.stringify(p));
      } catch {
        // storage blocked in this test
      }
    }
  }, prefs ?? null);
  await page.goto('/?fxstats');
  await expect(page.locator('.well--head .plate')).toBeVisible();
  return errors;
}

async function layPaper(page: Page): Promise<void> {
  for (const kind of ['head', 'torso', 'legs']) {
    await page.locator(`.well--${kind} .stack`).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`.placed[data-band="${kind}"]`)).toBeVisible();
  }
  await page.locator('.paper-btn').click();
  await expect(page.locator('.frame')).toHaveAttribute('data-paper', 'down');
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
}

async function stroke(page: Page, points: readonly Point[], steps = 1): Promise<void> {
  const box = (await page.locator('.sheet').boundingBox())!;
  const at = ([x, y]: Point): [number, number] => [box.x + (x / 600) * box.width, box.y + (y / 1500) * box.height];
  await page.mouse.move(...at(points[0]!));
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(...at(p), { steps });
  await page.mouse.up();
}

const zigzag = (x0: number, y0: number, x1: number, y1: number, gap = 26): Point[] => {
  const pts: Point[] = [];
  for (let y = y0, i = 0; y <= y1; y += gap, i++) pts.push(i % 2 ? [x1, y] : [x0, y], i % 2 ? [x0, y] : [x1, y]);
  return pts;
};

/** Rub the head and torso, then colour the blouse with Magic fill and scribble with a pencil. */
async function makeSomething(page: Page): Promise<void> {
  await stroke(page, zigzag(150, 10, 450, 600));
  await expect(page.locator('.bead-group[data-band="torso"][data-complete]')).toBeVisible();
  await page.waitForTimeout(700);
  await page.locator('.pencil-box').click();
  await page.locator('.magic-toggle').click();
  await page.locator('.pencil[data-pencil="sky"]').click();
  const box = (await page.locator('.sheet').boundingBox())!;
  await page.mouse.click(box.x + (280 / 600) * box.width, box.y + (420 / 1500) * box.height);
  await page.locator('.pencil-box').click();
  await page.locator('.magic-toggle').click();
  await page.locator('.pencil[data-pencil="cherry"]').click();
  await stroke(page, zigzag(200, 900, 400, 1000, 12), 2);
}

const sketchbookCount = (page: Page): Promise<number> => page.locator('.book__item').count();

async function openBook(page: Page): Promise<void> {
  await page.locator('.bump[data-tool="sketchbook"]').click();
  await expect(page.locator('dialog.book')).toBeVisible();
}

async function holdGear(page: Page, ms: number): Promise<void> {
  const g = (await page.locator('.gear').boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test('the exported PNG matches the screen', async ({ page }) => {
  test.slow();
  const errors = await open(page, { prefs: { peek: false } }); // the export is the paper at full strength, as on screen without Peek
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }));
  await page.reload();
  await expect(page.locator('.well--head .plate')).toBeVisible();
  await layPaper(page);
  await makeSomething(page);
  await page.mouse.move(2, 2); // the tool cursor leaves the paper
  await expect(page.locator('.tool-cursor')).toBeHidden();

  const screen = (await page.locator('.sheet').screenshot()).toString('base64');
  await openBook(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.book-share').click()]);
  expect(download.suggestedFilename()).toMatch(/^vivi-fashion-\d{4}-\d{2}-\d{2}-\d{4}\.png$/);
  const stream = await download.createReadStream();
  let binary = '';
  for await (const chunk of stream) {
    const bytes = chunk as Uint8Array;
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const png = btoa(binary);

  const result = await page.evaluate(
    async ([shot, file]) => {
      const load = async (b64: string): Promise<ImageBitmap> => createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const [a, b] = await Promise.all([load(shot!), load(file!)]);
      // Compare both at 120 × 300, leaving out the window lip's shading at the edges.
      const W = 120;
      const H = 300;
      const px = (img: ImageBitmap): Uint8ClampedArray => {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, W, H);
        return ctx.getImageData(0, 0, W, H).data;
      };
      const pa = px(a);
      const pb = px(b);
      const diffs: number[] = [];
      for (let y = 6; y < H - 6; y++) {
        for (let x = 4; x < W - 4; x++) {
          const i = (y * W + x) * 4;
          for (let k = 0; k < 3; k++) diffs.push(Math.abs(pa[i + k]! - pb[i + k]!));
        }
      }
      diffs.sort((p, q) => p - q);
      const mean = diffs.reduce((t, d) => t + d, 0) / diffs.length;
      const at = (q: number): number => diffs[Math.floor(diffs.length * q)]!;
      return { width: b.width, height: b.height, mean, p95: at(0.95), p99: at(0.99), worst: diffs[diffs.length - 1]! };
    },
    [screen, png] as const,
  );
  expect([result.width, result.height]).toEqual([1200, 3000]);
  // Grainy line edges shrink a little differently on screen than in a canvas; everything else matches.
  console.log(`[export] mean ${result.mean.toFixed(2)}, p95 ${result.p95}, p99 ${result.p99}, worst ${result.worst}`);
  expect(result.mean).toBeLessThan(4);
  expect(result.p95).toBeLessThan(16);
  expect(errors).toEqual([]);
});

test('print shows exactly one sheet, on A4 and on Letter', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1366x1024', 'page.pdf() is Chromium-only');
  test.slow();
  await open(page);
  await layPaper(page);
  await makeSomething(page);
  await openBook(page);
  await page.locator('.book-print').click();
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  await page.locator('.book__close').click();

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.print-sheet__art')).toBeVisible();
  await expect(page.locator('.print-sheet__footer')).toHaveText('Vivi Fashion Dresses');
  await expect(page.locator('.tray')).toBeHidden();
  for (const format of ['A4', 'Letter'] as const) {
    const pdf = (await page.pdf({ format })).toString('latin1');
    expect((pdf.match(/\/Type\s*\/Page(?!s)/g) ?? []).length, format).toBe(1);
  }

  // The blank colouring page: the plates' lines, no colour.
  await page.emulateMedia({ media: 'screen' });
  await openBook(page);
  await page.locator('.book-blank').click();
  const blank = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('.print-sheet__art')!;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    let coloured = 0;
    for (let i = 0; i < d.length; i += 16) {
      const [r, g, b] = [d[i]!, d[i + 1]!, d[i + 2]!];
      if (Math.max(r, g, b) - Math.min(r, g, b) > 40) coloured++;
      if (r + g + b < 300) dark++;
    }
    return { dark, coloured };
  });
  expect(blank.dark).toBeGreaterThan(500);
  expect(blank.coloured).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(2);

  // The browser's own Print command prints the sheet in the frame, on one page.
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.locator('.book__close').click();
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  const own = (await page.pdf({ format: 'A4' })).toString('latin1');
  expect((own.match(/\/Type\s*\/Page(?!s)/g) ?? []).length).toBe(1);
});

test('the game runs with storage blocked', async ({ page }) => {
  test.slow();
  await page.addInitScript(() => {
    const deny = (): never => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    Object.defineProperty(window, 'localStorage', { get: deny, configurable: true });
    Object.defineProperty(window, 'indexedDB', { get: deny, configurable: true });
  });
  const errors = await open(page);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __viviFx: { sketchbook: boolean | null } }).__viviFx.sketchbook))
    .toBe(false);
  await layPaper(page);
  await makeSomething(page);
  // The sound switch still works for the session.
  const soundBump = page.locator('.bump[data-tool="sound"]');
  await soundBump.click();
  await expect(soundBump).toHaveAttribute('aria-pressed', 'false');
  // No saved sheets, but sharing and printing still work.
  await openBook(page);
  await expect(page.locator('.book__saved')).toBeHidden();
  await expect(page.locator('.book-save')).toBeHidden();
  await expect(page.locator('.book-share')).toBeVisible();
  await page.locator('.book-print').click();
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  await page.locator('.book__close').click();
  // A new sheet just slides away.
  await page.locator('.bump[data-tool="new"]').click();
  await expect(page.locator('.frame')).toHaveAttribute('data-paper', 'none');
  // Settings open and apply, though they won't be remembered.
  await holdGear(page, 3500);
  await expect(page.locator('dialog.settings')).toBeVisible();
  await page.locator('[aria-labelledby="set-peek-label"]').click();
  await expect(page.locator('.sheet')).not.toHaveClass(/is-peek/);
  expect(errors).toEqual([]);
});

test('the sketchbook keeps saved sheets after a reload, and deleting asks first', async ({ page }) => {
  test.slow();
  await open(page);
  await layPaper(page);
  await makeSomething(page);
  await openBook(page);
  await expect(page.locator('.book__empty')).toBeVisible();
  await page.locator('.book-save').click();
  await expect(page.locator('.book__item')).toHaveCount(1);
  await page.locator('.book__close').click();

  await page.reload();
  await expect(page.locator('.well--head .plate')).toBeVisible();
  await openBook(page);
  await expect(page.locator('.book__item')).toHaveCount(1);
  await expect(page.locator('.book__item')).toHaveAccessibleName(/^Saved /);
  await page.locator('.book__item').click();
  await expect(page.locator('.book__big')).toBeVisible();
  await page.locator('.book-delete').click();
  await expect(page.locator('.book__confirm')).toBeVisible();
  await page.locator('.book-no').click();
  await expect(page.locator('.book__confirm')).toBeHidden();
  await page.locator('.book-delete').click();
  await page.locator('.book-yes').click();
  await expect(page.locator('.book__item')).toHaveCount(0);
  await expect(page.locator('.book__empty')).toBeVisible();
});

test('a new sheet goes into the sketchbook; an untouched one does not', async ({ page }) => {
  test.slow();
  await open(page);
  await layPaper(page);
  await stroke(page, zigzag(150, 20, 450, 240));
  await page.locator('.bump[data-tool="new"]').click();
  await expect(page.locator('.frame')).toHaveAttribute('data-paper', 'none');
  await openBook(page);
  await expect.poll(() => sketchbookCount(page)).toBe(1);
  await page.locator('.book__close').click();
  // Lay a fresh sheet and take it away untouched: nothing new is saved.
  await page.locator('.paper-btn').click();
  await expect(page.locator('.frame')).toHaveAttribute('data-paper', 'down');
  await page.locator('.bump[data-tool="new"]').click();
  await openBook(page);
  await page.waitForTimeout(500);
  expect(await sketchbookCount(page)).toBe(1);
});

test('settings sit behind a 3-second press and hold, and are remembered', async ({ page }) => {
  test.slow();
  await open(page);
  const dialog = page.locator('dialog.settings');
  await page.locator('.gear').click(); // a tap only shows how
  await expect(page.locator('.gear__hint')).toBeVisible();
  await expect(dialog).toBeHidden();
  await holdGear(page, 1500); // not long enough
  await expect(dialog).toBeHidden();
  await holdGear(page, 3500);
  await expect(dialog).toBeVisible();

  const sw = (id: string) => page.locator(`[aria-labelledby="${id}-label"]`);
  await expect(sw('set-peek')).toHaveAttribute('aria-checked', 'true');
  await sw('set-peek').click();
  await sw('set-stay').click();
  await sw('set-sound').click();
  await page.locator('#set-volume').evaluate((el: HTMLInputElement) => {
    el.value = '40';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#set-motion').selectOption('reduce');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  await expect(page.locator('.bump[data-tool="sound"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('.settings__done').click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.locator('.well--head .plate')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  await expect(page.locator('.sheet')).not.toHaveClass(/is-peek/);
  // The keyboard can hold the gate too.
  await page.locator('.gear').focus();
  await page.keyboard.down('Enter');
  await page.waitForTimeout(3500);
  await page.keyboard.up('Enter');
  await expect(dialog).toBeVisible();
  await expect(sw('set-peek')).toHaveAttribute('aria-checked', 'false');
  await expect(sw('set-stay')).toHaveAttribute('aria-checked', 'false');
  await expect(sw('set-sound')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#set-volume')).toHaveValue('40');
  await expect(page.locator('#set-motion')).toHaveValue('reduce');
});

test('delete all, behind the gate, asks first', async ({ page }) => {
  test.slow();
  await open(page);
  await layPaper(page);
  await stroke(page, zigzag(150, 20, 450, 240));
  await openBook(page);
  await page.locator('.book-save').click();
  await expect(page.locator('.book__item')).toHaveCount(1);
  await page.locator('.book__close').click();
  await holdGear(page, 3500);
  await page.locator('.settings__danger').click();
  await page.locator('.settings__confirm-no').click();
  await page.locator('.settings__danger').click();
  await page.locator('.settings__confirm-yes').click();
  await page.locator('.settings__done').click();
  await openBook(page);
  await page.waitForTimeout(300);
  expect(await sketchbookCount(page)).toBe(0);
});

test('share hands the device one PNG where it can share files', async ({ page }) => {
  await page.addInitScript(() => {
    const shared: { name: string; type: string; size: number }[] = [];
    Object.assign(window, { __shared: shared });
    Object.defineProperty(navigator, 'canShare', { value: (d: ShareData) => Boolean(d.files?.length), configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: async (d: ShareData) => {
        for (const f of d.files ?? []) shared.push({ name: f.name, type: f.type, size: f.size });
      },
      configurable: true,
    });
  });
  await open(page);
  await layPaper(page);
  await stroke(page, zigzag(150, 20, 450, 240));
  await openBook(page);
  await page.locator('.book-share').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared.length)).toBe(1);
  const file = await page.evaluate(() => (window as unknown as { __shared: { name: string; type: string; size: number }[] }).__shared[0]!);
  expect(file.type).toBe('image/png');
  expect(file.name).toMatch(/\.png$/);
  expect(file.size).toBeGreaterThan(10_000);
});

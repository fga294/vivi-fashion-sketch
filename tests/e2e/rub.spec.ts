import { expect, test, type Page } from '@playwright/test';

// Phase 3 "Done when": lines appear only where rubbed; fast scrubs leave no gaps;
// a full scrub reaches 100% progress; frame rate while scrubbing.

type Rect = readonly [x0: number, y0: number, x1: number, y1: number];

async function setUp(page: Page, kinds = ['head', 'torso', 'legs']): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await expect(page.locator('.well--head .plate')).toBeVisible();
  for (const kind of kinds) {
    await page.locator(`.well--${kind} .stack`).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`.placed[data-band="${kind}"]`)).toBeVisible();
  }
  return errors;
}

async function layPaper(page: Page): Promise<void> {
  await page.locator('.paper-btn').click();
  await expect(page.locator('.frame')).toHaveAttribute('data-paper', 'down');
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
}

/** Pointer path in sheet units (600 × 1500). */
async function scrub(page: Page, points: readonly (readonly [number, number])[], steps = 4): Promise<void> {
  const box = (await page.locator('.sheet').boundingBox())!;
  const at = ([x, y]: readonly [number, number]): [number, number] => [box.x + (x / 600) * box.width, box.y + (y / 1500) * box.height];
  await page.mouse.move(...at(points[0]!));
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(...at(p), { steps });
  await page.mouse.up();
  await page.waitForTimeout(100);
}

/** Back-and-forth rows covering a rectangle, `gap` units apart. */
function zigzag([x0, y0, x1, y1]: Rect, gap = 28): [number, number][] {
  const pts: [number, number][] = [];
  for (let y = y0, i = 0; y <= y1; y += gap, i++) pts.push(i % 2 ? [x1, y] : [x0, y], i % 2 ? [x0, y] : [x1, y]);
  return pts;
}

/** Inked pixels on a sheet layer inside a rectangle of sheet units. */
function ink(page: Page, layer: 'lines' | 'tone', rect: Rect): Promise<number> {
  return page.evaluate(
    ([name, [x0, y0, x1, y1]]) => {
      const c = document.querySelector<HTMLCanvasElement>(`.layer--${name}`)!;
      if (c.hidden) return 0;
      const s = c.width / 600;
      // Read from a throwaway copy, so the game's own canvases are never read back.
      const copy = document.createElement('canvas');
      copy.width = (x1 - x0) * s;
      copy.height = (y1 - y0) * s;
      const ctx = copy.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(c, x0 * s, y0 * s, copy.width, copy.height, 0, 0, copy.width, copy.height);
      const d = ctx.getImageData(0, 0, copy.width, copy.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
      return n;
    },
    [layer, rect] as const,
  );
}

const beads = (page: Page, band: string) => page.locator(`.bead-group[data-band="${band}"]`);

/**
 * Wait until a layer has ink and stops changing (queued stamps drawn, finishing
 * sweeps done), then return its ink. A busy test machine can delay frames, so
 * zero ink never counts as settled.
 */
async function settledInk(page: Page, layer: 'lines' | 'tone', rect: Rect): Promise<number> {
  let last = -1;
  for (let i = 0; i < 60; i++) {
    const now = await ink(page, layer, rect);
    if (now > 0 && now === last) return now;
    last = now;
    await page.waitForTimeout(150);
  }
  return last;
}

test('laying paper slides a sheet in, picks up the crayon and locks the plates', async ({ page }) => {
  const errors = await setUp(page);
  await layPaper(page);
  await expect(page.locator('.sheet')).toBeVisible();
  await expect(page.locator('.crayon')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.paper-btn')).toHaveAttribute('aria-label', 'Lift paper');
  const torso = await page.locator('.placed[data-band="torso"]').getAttribute('data-plate');
  await page.locator('.well--torso .stack').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await expect(page.locator('.placed[data-band="torso"]')).toHaveAttribute('data-plate', torso!);
  expect(errors).toEqual([]);
});

test('lines appear only where rubbed', async ({ page }) => {
  const errors = await setUp(page);
  await layPaper(page);
  expect(await ink(page, 'lines', [0, 0, 600, 1500])).toBe(0);
  await scrub(page, zigzag([200, 40, 400, 200]));
  expect(await settledInk(page, 'lines', [0, 0, 600, 1500])).toBeGreaterThan(200);
  expect(await ink(page, 'lines', [200, 30, 400, 250])).toBeGreaterThan(200);
  expect(await ink(page, 'lines', [0, 300, 600, 1500])).toBe(0);
  expect(await ink(page, 'tone', [0, 300, 600, 1500])).toBe(0);
  expect(errors).toEqual([]);
});

test('a fast scrub leaves no gaps', async ({ page }) => {
  await setUp(page);
  await layPaper(page);
  // One pointer event for a 400-unit jump across the sheet.
  await scrub(page, [[100, 820], [500, 820]], 1);
  const holes = (): Promise<number[]> =>
    page.evaluate(() => {
    const src = document.querySelector<HTMLCanvasElement>('.layer--tone')!;
    const s = src.width / 600;
    const c = Object.assign(document.createElement('canvas'), { width: src.width, height: 16 * s });
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(src, 0, (820 - 8) * s, src.width, 16 * s, 0, 0, src.width, 16 * s);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const missing: number[] = [];
    for (let x = 105; x <= 495; x += 5) {
      let any = false;
      for (let row = 0; row < 16 * s && !any; row++) for (let dx = -2; dx <= 2 && !any; dx++) any = d[(row * c.width + Math.round((x + dx) * s)) * 4 + 3]! > 0;
      if (!any) missing.push(x);
    }
    return missing;
  });
  await expect.poll(holes, { timeout: 10_000 }).toEqual([]);
});

test('a full scrub reaches 100% progress on every band', async ({ page }) => {
  // 342 pointer events: about 15 s in software-rendered Chromium alone, longer with every browser running.
  test.slow();
  const errors = await setUp(page);
  await layPaper(page);
  await scrub(page, zigzag([150, 10, 450, 1490], 26), 3);
  await settledInk(page, 'lines', [0, 0, 600, 1500]); // completion sweeps take 400 ms
  for (const band of ['head', 'torso', 'legs']) {
    await expect(beads(page, band)).toHaveAttribute('data-progress', '1.000');
    await expect(beads(page, band)).toHaveAttribute('data-complete', '');
    await expect(beads(page, band).locator('.bead.is-filled')).toHaveCount(3);
  }
  expect(errors).toEqual([]);
});

test('lifting keeps the drawing; laying it back lines up and re-arms the bands', async ({ page }) => {
  await setUp(page);
  await layPaper(page);
  await scrub(page, zigzag([200, 40, 400, 230]));
  const before = await settledInk(page, 'lines', [0, 0, 600, 250]);
  expect(before).toBeGreaterThan(0);

  await page.locator('.paper-btn').click();
  await expect(page.locator('.frame')).toHaveAttribute('data-paper', 'lifted');
  const old = await page.locator('.placed[data-band="head"]').getAttribute('data-plate');
  await page.locator('.well--head .stack').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.placed[data-band="head"]')).not.toHaveAttribute('data-plate', old!);

  await page.locator('.paper-btn').click();
  await expect(page.locator('.frame')).toHaveAttribute('data-paper', 'down');
  await page.waitForTimeout(500);
  expect(await ink(page, 'lines', [0, 0, 600, 250])).toBe(before); // nothing lost, nothing moved
  await expect(beads(page, 'head')).toHaveAttribute('data-progress', '0.000'); // re-armed
  await scrub(page, zigzag([200, 40, 400, 230]));
  expect(await settledInk(page, 'lines', [0, 0, 600, 250])).toBeGreaterThan(before); // the new plate layers on top
});

test('a new sheet clears the paper', async ({ page }) => {
  await setUp(page);
  await layPaper(page);
  await scrub(page, zigzag([200, 600, 400, 900]));
  await page.locator('.bump[data-tool="new"]').click();
  await expect(page.locator('.frame')).toHaveAttribute('data-paper', 'none');
  await expect(page.locator('.sheet')).toBeHidden();
  await layPaper(page);
  expect(await ink(page, 'lines', [0, 0, 600, 1500])).toBe(0);
  expect(await ink(page, 'tone', [0, 0, 600, 1500])).toBe(0);
});

test('with the crayon put away, rubbing does nothing', async ({ page }) => {
  await setUp(page);
  await layPaper(page);
  await page.locator('.crayon').click();
  await expect(page.locator('.crayon')).toHaveAttribute('aria-pressed', 'false');
  await scrub(page, zigzag([200, 40, 400, 300]));
  expect(await ink(page, 'tone', [0, 0, 600, 1500])).toBe(0);
});

import { expect, test, type Page } from '@playwright/test';

// Phase 7 "Done when": fills never cover lines, the eraser never removes lines, and
// 30 undo steps work. Plus the pencil box, Magic fill's check before a big fill, and
// the two-finger tap that undoes on iPad.

type Rect = readonly [x0: number, y0: number, x1: number, y1: number];
type Point = readonly [number, number];
type Layer = 'lines' | 'colour' | 'pattern' | 'tone';

interface Published {
  __viviFx: { history: { canUndo: boolean; canRedo: boolean; steps: number } };
}

async function setUp(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/?fxstats');
  await expect(page.locator('.well--head .plate')).toBeVisible();
  // Bob with beret, puff-sleeve blouse, pleated midi skirt.
  for (const kind of ['head', 'torso', 'legs']) {
    await page.locator(`.well--${kind} .stack`).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`.placed[data-band="${kind}"]`)).toBeVisible();
  }
  await page.locator('.paper-btn').click();
  await expect(page.locator('.frame')).toHaveAttribute('data-paper', 'down');
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  return errors;
}

const at = async (page: Page, [x, y]: Point): Promise<[number, number]> => {
  const box = (await page.locator('.sheet').boundingBox())!;
  return [box.x + (x / 600) * box.width, box.y + (y / 1500) * box.height];
};

/** One stroke through points in sheet units (600 × 1500). */
async function stroke(page: Page, points: readonly Point[], steps = 3): Promise<void> {
  await page.mouse.move(...(await at(page, points[0]!)));
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(...(await at(page, p)), { steps });
  await page.mouse.up();
}

async function tap(page: Page, p: Point): Promise<void> {
  await page.mouse.click(...(await at(page, p)));
}

function zigzag([x0, y0, x1, y1]: Rect, gap = 26): Point[] {
  const pts: Point[] = [];
  for (let y = y0, i = 0; y <= y1; y += gap, i++) pts.push(i % 2 ? [x1, y] : [x0, y], i % 2 ? [x0, y] : [x1, y]);
  return pts;
}

/**
 * Rub the whole figure so every band completes and every line is revealed. One
 * pointer event per row is enough: the crayon fills in between events itself.
 */
async function rubAll(page: Page): Promise<void> {
  await stroke(page, zigzag([150, 10, 450, 1490]), 1);
  await expect(page.locator('.bead-group[data-complete]')).toHaveCount(3);
  // Wait for the finishing sweeps to finish drawing: the lines stop changing.
  let last = '';
  await expect
    .poll(async () => {
      const now = await hash(page, 'lines');
      const still = now === last;
      last = now;
      return still;
    }, { intervals: [300] })
    .toBe(true);
}

/** Inked pixels (alpha > 0) of a layer inside a rectangle of sheet units, read from a copy. */
function ink(page: Page, layer: Layer, [x0, y0, x1, y1]: Rect = [0, 0, 600, 1500]): Promise<number> {
  return page.evaluate(
    ([name, r]) => {
      const c = document.querySelector<HTMLCanvasElement>(`.layer--${name}`)!;
      if (c.hidden) return 0;
      const s = c.width / 600;
      const copy = document.createElement('canvas');
      copy.width = Math.round((r[2] - r[0]) * s);
      copy.height = Math.round((r[3] - r[1]) * s);
      const ctx = copy.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(c, r[0] * s, r[1] * s, copy.width, copy.height, 0, 0, copy.width, copy.height);
      const d = ctx.getImageData(0, 0, copy.width, copy.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
      return n;
    },
    [layer, [x0, y0, x1, y1]] as const,
  );
}

/** A fingerprint of a layer's pixels, to compare states exactly. */
function hash(page: Page, layer: Layer): Promise<string> {
  return page.evaluate((name) => {
    const c = document.querySelector<HTMLCanvasElement>(`.layer--${name}`)!;
    const copy = document.createElement('canvas');
    copy.width = c.width;
    copy.height = c.height;
    const ctx = copy.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(c, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let h1 = 0x811c9dc5;
    let h2 = 0;
    for (let i = 0; i < d.length; i++) {
      h1 = Math.imul(h1 ^ d[i]!, 16777619);
      h2 = (h2 + d[i]! * (i % 251)) % 2147483647;
    }
    return `${h1 >>> 0}:${h2}`;
  }, layer);
}

const history = (page: Page): Promise<{ canUndo: boolean; canRedo: boolean; steps: number }> =>
  page.evaluate(() => {
    const h = (window as unknown as Published).__viviFx.history;
    return { canUndo: h.canUndo, canRedo: h.canRedo, steps: h.steps };
  });

async function pickPencil(page: Page, id: string, { magic }: { magic?: boolean } = {}): Promise<void> {
  await page.locator('.pencil-box').click();
  await expect(page.locator('.pencil-fan')).toBeVisible();
  const toggle = page.locator('.magic-toggle');
  if (magic !== undefined && (await toggle.getAttribute('aria-pressed')) !== String(magic)) await toggle.click();
  await page.locator(`.pencil[data-pencil="${id}"]`).click();
  await expect(page.locator('.pencil-fan')).toBeHidden();
}

// Tests that rub the whole figure first are slow in WebKit with every browser running at once.

test('fills never cover lines', async ({ page }) => {
  test.slow();
  const errors = await setUp(page);
  await rubAll(page);
  const lines = await hash(page, 'lines');
  await pickPencil(page, 'bubblegum', { magic: true });
  // A pleat panel, a puff sleeve, the face, the blouse and a leg.
  for (const p of [[300, 800], [222, 318], [300, 160], [280, 420], [272, 1250]] as const) await tap(page, p);
  await expect.poll(() => ink(page, 'colour')).toBeGreaterThan(5000);
  // And the open paper around the figure, after saying yes.
  await tap(page, [60, 700]);
  await expect(page.locator('.fill-ask')).toBeVisible();
  await page.locator('.fill-yes').click();
  await expect(page.locator('.fill-ask')).toBeHidden();

  expect(await hash(page, 'lines')).toBe(lines); // the lines layer is never drawn on
  // Under the middle of every revealed line, the colour layer stays empty: fills stop at the lines.
  const underLines = await page.evaluate(() => {
    const fx = (window as unknown as { __viviFx: { revealedLines(): { x: number; y: number }[][] } }).__viviFx;
    const pts = fx.revealedLines().flat();
    const c = document.querySelector<HTMLCanvasElement>('.layer--colour')!;
    const s = c.width / 600;
    const copy = document.createElement('canvas');
    copy.width = c.width;
    copy.height = c.height;
    const ctx = copy.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(c, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let covered = 0;
    for (const p of pts) {
      const i = (Math.round(p.y * s) * c.width + Math.round(p.x * s)) * 4 + 3;
      if (d[i]! > 8) covered++;
    }
    return { points: pts.length, covered };
  });
  expect(underLines.points).toBeGreaterThan(1000);
  expect(underLines.covered).toBe(0);
  expect(errors).toEqual([]);
});

test('the eraser takes colour and pattern, never lines', async ({ page }) => {
  test.slow();
  const errors = await setUp(page);
  await rubAll(page);
  const lines = await hash(page, 'lines');
  const AREA: Rect = [200, 640, 400, 760];
  // A pencil scribble and a pattern over the skirt and its lines.
  await pickPencil(page, 'cobalt');
  await stroke(page, zigzag(AREA, 8), 2);
  await page.locator('.well--pattern .stack').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tucked')).toBeVisible();
  await page.locator('.crayon[data-crayon="rose"]').click();
  await stroke(page, [[300, 700], ...zigzag(AREA, 12)]);
  expect(await ink(page, 'colour', AREA)).toBeGreaterThan(1000);
  expect(await ink(page, 'pattern', AREA)).toBeGreaterThan(100);

  const eraser = page.locator('.bump[data-tool="eraser"]');
  await eraser.click();
  await expect(eraser).toHaveAttribute('aria-pressed', 'true');
  await stroke(page, zigzag([180, 620, 420, 780], 10), 3);
  const inner: Rect = [215, 655, 385, 745];
  expect(await ink(page, 'colour', inner)).toBe(0);
  expect(await ink(page, 'pattern', inner)).toBe(0);
  expect(await hash(page, 'lines')).toBe(lines);
  expect(errors).toEqual([]);
});

test('30 undo steps work, and redo brings them all back', async ({ page }) => {
  test.slow(); // 31 strokes, 30 undos and 30 redos
  const errors = await setUp(page);
  await pickPencil(page, 'leaf');
  const dot = (i: number): Point[] => {
    const x = 60 + (i % 8) * 64;
    const y = 80 + Math.floor(i / 8) * 90;
    return [
      [x, y],
      [x + 30, y + 20],
    ];
  };
  const blank = await hash(page, 'colour');
  await stroke(page, dot(0));
  const first = await hash(page, 'colour');
  expect(first).not.toBe(blank);
  for (let i = 1; i <= 30; i++) await stroke(page, dot(i));
  const last = await hash(page, 'colour');
  expect(await history(page)).toEqual({ canUndo: true, canRedo: false, steps: 30 });

  const undo = page.locator('.bump[data-tool="undo"]');
  for (let i = 0; i < 30; i++) await undo.click();
  expect(await hash(page, 'colour')).toBe(first); // the first stroke is older than 30 steps, so it stays
  expect(await history(page)).toEqual({ canUndo: false, canRedo: true, steps: 0 });
  await expect(undo).toHaveAttribute('aria-disabled', 'true');

  const redo = page.locator('.redo-btn');
  await expect(redo).toBeVisible();
  for (let i = 0; i < 30; i++) await redo.click();
  expect(await hash(page, 'colour')).toBe(last);
  await expect(redo).toBeHidden();
  expect(errors).toEqual([]);
});

test('undo takes back a fill, an eraser stroke and a pattern stroke, but never rubbed lines', async ({ page }) => {
  test.slow();
  await setUp(page);
  await rubAll(page);
  const lines = await hash(page, 'lines');
  await pickPencil(page, 'sunflower', { magic: true });
  const before = { colour: await hash(page, 'colour'), tone: await hash(page, 'tone') };
  await tap(page, [222, 318]);
  await expect.poll(() => ink(page, 'colour', [190, 270, 260, 360])).toBeGreaterThan(100);
  const filled = await hash(page, 'colour');
  await page.locator('.bump[data-tool="eraser"]').click();
  await stroke(page, [[200, 300], [250, 340]]);
  await page.locator('.well--pattern .stack').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tucked')).toBeVisible();
  await page.locator('.crayon[data-crayon="wax"]').click();
  await stroke(page, [[300, 800], ...zigzag([220, 700, 380, 900], 20)]);
  expect(await history(page)).toMatchObject({ steps: 3 });

  expect(await ink(page, 'pattern')).toBeGreaterThan(0);
  await page.keyboard.press('ControlOrMeta+z'); // the pattern stroke
  expect(await ink(page, 'pattern')).toBe(0);
  expect(await hash(page, 'tone')).toBe(before.tone);
  await page.locator('.bump[data-tool="undo"]').click(); // the eraser stroke
  expect(await hash(page, 'colour')).toBe(filled);
  await page.locator('.bump[data-tool="undo"]').click(); // the fill
  expect(await hash(page, 'colour')).toBe(before.colour);
  expect(await hash(page, 'lines')).toBe(lines);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await hash(page, 'colour')).toBe(filled);
});

test('a fill that would cover most of the sheet asks first', async ({ page }) => {
  test.slow();
  await setUp(page);
  await rubAll(page);
  await pickPencil(page, 'mint', { magic: true });
  await tap(page, [60, 700]);
  const ask = page.locator('.fill-ask');
  await expect(ask).toBeVisible();
  await expect(page.locator('.fill-preview')).toBeVisible();
  await expect(page.locator('.fill-yes')).toHaveAccessibleName('Fill it');
  await page.locator('.fill-no').click();
  await expect(ask).toBeHidden();
  await expect(page.locator('.fill-preview')).toBeHidden();
  expect(await ink(page, 'colour')).toBe(0);
  expect((await history(page)).steps).toBe(0);

  await tap(page, [60, 700]);
  await page.locator('.fill-yes').click();
  const sheet = 1200 * 3000 * ((await page.evaluate(() => document.querySelector<HTMLCanvasElement>('.layer--colour')!.width)) / 1200) ** 2;
  expect(await ink(page, 'colour')).toBeGreaterThan(sheet * 0.4);
  // A small area fills straight away.
  await tap(page, [300, 160]);
  await expect(ask).toBeHidden();
  expect((await history(page)).steps).toBe(2);
});

test('the pencil box fans out its 16 pencils and Magic fill', async ({ page }) => {
  await setUp(page);
  const box = page.locator('.pencil-box');
  const fan = page.locator('.pencil-fan');
  await expect(fan).toBeHidden();
  await box.click();
  await expect(box).toHaveAttribute('aria-expanded', 'true');
  await expect(fan.locator('.pencil')).toHaveCount(16);
  for (const b of await fan.locator('button').all()) {
    const r = (await b.boundingBox())!;
    expect(Math.min(r.width, r.height), (await b.getAttribute('aria-label')) ?? '').toBeGreaterThanOrEqual(48);
  }
  // The fan stays on screen.
  const f = (await fan.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(f.x).toBeGreaterThanOrEqual(0);
  expect(f.y).toBeGreaterThanOrEqual(0);
  expect(f.x + f.width).toBeLessThanOrEqual(vp.width);
  await page.keyboard.press('Escape');
  await expect(fan).toBeHidden();
  await expect(box).toHaveAttribute('aria-expanded', 'false');

  await box.click();
  await page.locator('.pencil[data-pencil="violet"]').click();
  await expect(fan).toBeHidden();
  await box.click();
  await expect(page.locator('.pencil[data-pencil="violet"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.crayon[aria-pressed="true"]')).toHaveCount(0); // the crayon went back
  // Tapping the pencil in hand puts it back.
  await page.locator('.pencil[data-pencil="violet"]').click();
  await box.click();
  await expect(page.locator('.pencil[aria-pressed="true"]')).toHaveCount(0);
});

test('two fingers tapping the paper together undo', async ({ page, browserName }, info) => {
  test.skip(!info.project.use.hasTouch, 'touch devices only');
  void browserName;
  await setUp(page);
  await pickPencil(page, 'cherry');
  await stroke(page, [[200, 300], [400, 360]]);
  const drawn = await ink(page, 'colour');
  expect(drawn).toBeGreaterThan(0);
  // Two touches land together and lift together.
  await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>('.sheet')!;
    const r = sheet.getBoundingClientRect();
    const send = (type: string, id: number, primary: boolean, x: number): void => {
      sheet.dispatchEvent(
        new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: primary, bubbles: true, buttons: type === 'pointerup' ? 0 : 1, clientX: r.left + x, clientY: r.top + r.height * 0.7 }),
      );
    };
    send('pointerdown', 11, true, r.width * 0.3);
    send('pointerdown', 12, false, r.width * 0.6);
    send('pointerup', 11, true, r.width * 0.3);
    send('pointerup', 12, false, r.width * 0.6);
  });
  await expect.poll(() => ink(page, 'colour')).toBe(0);
  expect((await history(page)).canRedo).toBe(true);
});

import { expect, test, type Page } from '@playwright/test';

// Phase 6 "Done when": with Stay inside on, a pattern stays inside the garment it
// started in; with it off, it goes wherever the crayon goes. Plus the pattern well,
// the tucked pattern plate and the four rubbing crayons.

type Rect = readonly [x0: number, y0: number, x1: number, y1: number];
type Point = readonly [number, number];

interface Vivi {
  game: { pattern: { id: string } | null; crayon: string; tool: string };
}

async function setUp(page: Page, { stayInside = true } = {}): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  if (!stayInside) {
    await page.addInitScript(() => localStorage.setItem('vivi-fashion-dresses:prefs', JSON.stringify({ stayInside: false })));
  }
  await page.goto('/?fxstats');
  await expect(page.locator('.well--head .plate')).toBeVisible();
  // Bob with beret, puff-sleeve blouse, pleated midi skirt: the first plate of each stack.
  for (const kind of ['head', 'torso', 'legs']) {
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

/** Tuck the pattern well's top plate under the frame (Enter on the well). */
async function usePattern(page: Page): Promise<void> {
  await page.locator('.well--pattern .stack').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tucked')).toBeVisible();
}

const vivi = (page: Page): Promise<Vivi['game']> =>
  page.evaluate(() => {
    const { game } = (window as unknown as { __viviFx: Vivi }).__viviFx;
    return { pattern: game.pattern ? { id: game.pattern.id } : null, crayon: game.crayon, tool: game.tool };
  });

/** One stroke through points in sheet units (600 × 1500). */
async function stroke(page: Page, points: readonly Point[], steps = 3): Promise<void> {
  const box = (await page.locator('.sheet').boundingBox())!;
  const at = ([x, y]: Point): [number, number] => [box.x + (x / 600) * box.width, box.y + (y / 1500) * box.height];
  await page.mouse.move(...at(points[0]!));
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(...at(p), { steps });
  await page.mouse.up();
}

/** Back-and-forth rows covering a rectangle. */
function zigzag([x0, y0, x1, y1]: Rect, gap = 24): Point[] {
  const pts: Point[] = [];
  for (let y = y0, i = 0; y <= y1; y += gap, i++) pts.push(i % 2 ? [x1, y] : [x0, y], i % 2 ? [x0, y] : [x1, y]);
  return pts;
}

/** Inked pixels on a sheet layer inside a rectangle of sheet units (read from a copy). */
function ink(page: Page, layer: 'lines' | 'tone' | 'pattern', rect: Rect): Promise<number> {
  return page.evaluate(
    ([name, [x0, y0, x1, y1]]) => {
      const c = document.querySelector<HTMLCanvasElement>(`.layer--${name}`)!;
      if (c.hidden) return 0;
      const s = c.width / 600;
      const copy = document.createElement('canvas');
      copy.width = Math.round((x1 - x0) * s);
      copy.height = Math.round((y1 - y0) * s);
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

/** Wait until a layer has ink in a rectangle and stops changing (queued stamps drawn). */
async function settled(page: Page, layer: 'lines' | 'tone' | 'pattern', rect: Rect): Promise<number> {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const now = await ink(page, layer, rect);
    if (now > 0 && now === last) return now;
    last = now;
    await page.waitForTimeout(100);
  }
  return last;
}

// The pleated skirt spans y 592–1164; at y 760–1000 its sides are within x 214–386.
const SKIRT: Rect = [250, 780, 350, 980];
const LEFT_OF_SKIRT: Rect = [110, 760, 200, 1000];
const RIGHT_OF_SKIRT: Rect = [400, 760, 490, 1000];
const BLOUSE: Rect = [262, 420, 338, 500];
const LEGS: Rect = [256, 1230, 344, 1290];

/** Starts inside the skirt, scrubs well past both sides, then over the blouse and the legs. */
const WIDE_STROKE: Point[] = [[300, 800], ...zigzag([110, 760, 490, 1000]), [300, 470], [250, 460], [350, 460], [300, 1260], [262, 1250], [338, 1250]];

test('Stay inside on: the pattern stays inside the garment it started in', async ({ page }) => {
  const errors = await setUp(page);
  await layPaper(page);
  await usePattern(page);
  await stroke(page, WIDE_STROKE);

  expect(await settled(page, 'pattern', SKIRT)).toBeGreaterThan(200);
  for (const outside of [LEFT_OF_SKIRT, RIGHT_OF_SKIRT, BLOUSE, LEGS]) {
    expect(await ink(page, 'pattern', outside), `pattern in ${outside.join(',')}`).toBe(0);
    expect(await ink(page, 'tone', outside), `haze in ${outside.join(',')}`).toBe(0); // the wax haze is clipped too
  }
  // Rubbing a pattern reveals no figure lines and fills no beads.
  expect(await ink(page, 'lines', [0, 0, 600, 1500])).toBe(0);
  await expect(page.locator('.bead.is-filled')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Stay inside off: the pattern goes wherever the crayon goes', async ({ page }) => {
  await setUp(page, { stayInside: false });
  await layPaper(page);
  await usePattern(page);
  await stroke(page, WIDE_STROKE);

  expect(await settled(page, 'pattern', SKIRT)).toBeGreaterThan(200);
  for (const outside of [LEFT_OF_SKIRT, RIGHT_OF_SKIRT, BLOUSE]) {
    expect(await ink(page, 'pattern', outside), `pattern in ${outside.join(',')}`).toBeGreaterThan(0);
  }
});

test('Stay inside on: a stroke started outside the outfit is not clipped', async ({ page }) => {
  await setUp(page);
  await layPaper(page);
  await usePattern(page);
  await stroke(page, [[120, 780], ...zigzag([110, 760, 490, 1000])]);
  expect(await settled(page, 'pattern', SKIRT)).toBeGreaterThan(0);
  expect(await ink(page, 'pattern', LEFT_OF_SKIRT)).toBeGreaterThan(0);
  expect(await ink(page, 'pattern', RIGHT_OF_SKIRT)).toBeGreaterThan(0);
});

test('a pattern plate tucks under the frame, swaps, and goes back to its well', async ({ page }) => {
  const errors = await setUp(page);
  await layPaper(page); // patterns work with the paper down; figure plates are locked
  const well = page.locator('.well--pattern .stack');
  const tucked = page.locator('.tucked');
  await expect(tucked).toBeHidden();

  await well.dblclick();
  await expect(tucked).toBeVisible();
  await expect(tucked).toHaveAttribute('aria-label', /^Polka dots pattern, under the frame\. Put away$/);
  expect((await vivi(page)).pattern?.id).toBe('pattern-polka-dots');

  // Flip to the next pattern and use it: it swaps with the one under the frame.
  await well.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(tucked.locator('.tucked__plate')).toHaveAttribute('data-plate', 'pattern-gingham');
  expect((await vivi(page)).pattern?.id).toBe('pattern-gingham');

  // Using the same pattern again puts it away; so does tapping the tucked plate.
  await page.keyboard.press('Enter');
  await expect(tucked).toBeHidden();
  expect((await vivi(page)).pattern).toBeNull();
  await page.keyboard.press('Enter');
  await expect(tucked).toBeVisible();
  await tucked.click({ position: { x: 16, y: 16 } }); // the tab showing beside the window; the rest is under it
  await expect(tucked).toBeHidden();
  expect((await vivi(page)).pattern).toBeNull();

  // A new sheet starts with the figure's lines again.
  await usePattern(page);
  await page.locator('.bump[data-tool="new"]').click();
  await expect(tucked).toBeHidden();
  expect((await vivi(page)).pattern).toBeNull();
  expect(errors).toEqual([]);
});

test('the crayon tray: lines rub in the chosen colour, and tapping the crayon in hand puts it back', async ({ page }) => {
  await setUp(page);
  await layPaper(page);
  const rose = page.locator('.crayon[data-crayon="rose"]');
  const black = page.locator('.crayon[data-crayon="wax"]');
  await expect(black).toHaveAttribute('aria-pressed', 'true'); // laying the paper picks up black
  await rose.click();
  await expect(rose).toHaveAttribute('aria-pressed', 'true');
  await expect(black).toHaveAttribute('aria-pressed', 'false');
  expect(await vivi(page)).toMatchObject({ crayon: 'rose', tool: 'crayon' });

  await stroke(page, zigzag([200, 40, 400, 230]));
  expect(await settled(page, 'lines', [180, 20, 420, 250])).toBeGreaterThan(100);
  // Average colour of the revealed line pixels: the rose crayon, #C2496B.
  const rgb = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('.layer--lines')!;
    const copy = document.createElement('canvas');
    copy.width = c.width;
    copy.height = Math.round(c.height / 5);
    const ctx = copy.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(c, 0, 0);
    const d = ctx.getImageData(0, 0, copy.width, copy.height).data;
    let [r, g, b, n] = [0, 0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3]! < 128) continue;
      r += d[i]!;
      g += d[i + 1]!;
      b += d[i + 2]!;
      n++;
    }
    return [r, g, b].map((v) => Math.round(v / n));
  });
  expect(Math.abs(rgb[0]! - 0xc2)).toBeLessThan(14);
  expect(Math.abs(rgb[1]! - 0x49)).toBeLessThan(14);
  expect(Math.abs(rgb[2]! - 0x6b)).toBeLessThan(14);

  await rose.click();
  await expect(page.locator('.crayon[aria-pressed="true"]')).toHaveCount(0);
  expect((await vivi(page)).tool).toBe('none');
});

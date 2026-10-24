import { expect, test, type Locator, type Page } from '@playwright/test';

// Phase 2: flipping stacks, placing plates (double-tap, drag, Enter), top plates,
// taking plates out, and unbroken seams at 400% zoom.

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await expect(page.locator('.well--head .plate')).toBeVisible();
  return errors;
}

const stack = (page: Page, kind: string): Locator => page.locator(`.well--${kind} .stack`);
const placed = (page: Page, band: string): Locator => page.locator(`.placed[data-band="${band}"]`);

async function centre(l: Locator): Promise<{ x: number; y: number }> {
  await l.scrollIntoViewIfNeeded();
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('tapping a well flips to the next plate, wrapping round the stack', async ({ page }) => {
  const errors = await open(page);
  const top = stack(page, 'top');
  await expect(top).toHaveAttribute('aria-label', /1 of 3/);
  for (const n of [2, 3, 1]) {
    await top.click();
    await expect(top).toHaveAttribute('aria-label', new RegExp(`${n} of 3`));
  }
  expect(errors).toEqual([]);
});

test('double-tapping a plate slides it into its band', async ({ page }) => {
  const errors = await open(page);
  const label = (await stack(page, 'torso').getAttribute('aria-label'))!;
  await stack(page, 'torso').dblclick();
  await expect(placed(page, 'torso')).toBeVisible();
  // It placed the plate that was showing, not the next one.
  await expect(placed(page, 'torso')).toHaveAttribute('aria-label', new RegExp(label.split(': ')[1]!.split(',')[0]!));
  expect(errors).toEqual([]);
});

test('dragging a plate onto the frame places it; dropping elsewhere sends it back', async ({ page }) => {
  await open(page);
  const from = await centre(stack(page, 'legs'));
  const win = await centre(page.locator('.frame__window'));

  // Let go over the bumps row: not the frame.
  const bumps = await centre(page.locator('.bumps'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 30, { steps: 4 });
  await page.mouse.move(bumps.x, bumps.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(placed(page, 'legs')).toHaveCount(0);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 30, { steps: 4 });
  await page.mouse.move(win.x, win.y, { steps: 8 });
  await expect(page.locator('.frame__target')).toBeVisible();
  await page.mouse.up();
  await expect(placed(page, 'legs')).toBeVisible();
  await expect(page.locator('.frame__target')).toBeHidden();
});

test('a top plate replaces head and torso, and a head replaces the top', async ({ page }) => {
  await open(page);
  for (const kind of ['head', 'torso', 'legs']) {
    await stack(page, kind).focus();
    await page.keyboard.press('Enter');
    await expect(placed(page, kind)).toBeVisible();
  }
  await stack(page, 'top').focus();
  await page.keyboard.press('Enter');
  await expect(placed(page, 'top')).toBeVisible();
  await expect(placed(page, 'head')).toHaveCount(0);
  await expect(placed(page, 'torso')).toHaveCount(0);
  await expect(placed(page, 'legs')).toBeVisible();

  await stack(page, 'head').focus();
  await page.keyboard.press('Enter');
  await expect(placed(page, 'head')).toBeVisible();
  await expect(placed(page, 'top')).toHaveCount(0);
});

test('tapping a placed plate takes it out, leaving the band empty', async ({ page }) => {
  await open(page);
  await stack(page, 'head').focus();
  await page.keyboard.press('Enter');
  await expect(placed(page, 'head')).toBeVisible();
  await placed(page, 'head').click();
  await expect(placed(page, 'head')).toHaveCount(0);
});

test('keyboard: arrows flip, Enter places the plate on top', async ({ page }) => {
  await open(page);
  const head = stack(page, 'head');
  await head.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await expect(head).toHaveAttribute('aria-label', /2 of 6/);
  await page.keyboard.press('Enter');
  await expect(placed(page, 'head')).toHaveAttribute('aria-label', /waves/i);
  await expect(head).toBeFocused();
});

test('pattern plates flip, and a double-tap tucks one under the frame instead of placing it', async ({ page }) => {
  await open(page);
  await stack(page, 'pattern').click();
  await page.waitForTimeout(500); // the single tap lands once the double-tap window has passed
  await expect(stack(page, 'pattern')).toHaveAttribute('aria-label', /2 of 6/);
  await stack(page, 'pattern').dblclick();
  await expect(page.locator('.tucked')).toBeVisible();
  await expect(page.locator('.placed')).toHaveCount(0);
  await expect(stack(page, 'pattern')).toHaveAttribute('aria-label', /2 of 6/);
});

test('every head/torso and torso/legs pairing joins without a gap at 400% zoom', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1366x1024', 'pixel check runs once, in Chromium');
  await open(page);
  const gaps = await page.evaluate(async () => {
    const { plates } = (await (await fetch('./plates/plates.json')).json()) as {
      plates: { id: string; band: string; file: string }[];
    };
    const load = (file: string): Promise<HTMLImageElement> =>
      new Promise((ok, fail) => {
        const img = new Image();
        img.onload = () => ok(img);
        img.onerror = fail;
        img.src = `./plates/${file}`;
      });
    const imgs = new Map(await Promise.all(plates.map(async (p) => [p.id, await load(p.file)] as const)));
    const range: Record<string, [number, number]> = { head: [0, 250], torso: [250, 570], legs: [570, 1500], top: [0, 570] };
    const Z = 4; // 400%
    const problems: string[] = [];

    const check = (above: (typeof plates)[number], below: (typeof plates)[number], seam: number, xs: number[]): void => {
      // 400% zoom on the 20 units around the seam, where the plates meet.
      const [x0, y0, w, h] = [230, seam - 10, 140, 20];
      const c = document.createElement('canvas');
      c.width = w * Z;
      c.height = h * Z;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      for (const p of [above, below]) {
        const [a, b] = range[p.band]!;
        ctx.drawImage(imgs.get(p.id)!, -x0 * Z, (a - y0) * Z, 600 * Z, (b - a) * Z);
      }
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      for (const x of xs) {
        const cx = Math.round((x - x0) * Z);
        for (let row = 0; row < c.height; row++) {
          let ink = false;
          for (let px = cx - 3 * Z; px <= cx + 3 * Z && !ink; px++) ink = data[(row * c.width + px) * 4 + 3]! > 128;
          if (!ink) {
            problems.push(`${above.id} + ${below.id}: gap at x=${x}, y=${(y0 + row / Z).toFixed(2)}`);
            break;
          }
        }
      }
    };
    const of = (band: string) => plates.filter((p) => p.band === band);
    for (const a of of('head')) for (const b of of('torso')) check(a, b, 250, [282, 318]);
    for (const a of [...of('torso'), ...of('top')]) for (const b of of('legs')) check(a, b, 570, [258, 342]);
    return problems;
  });
  expect(gaps).toEqual([]);
});

test.describe('seams in the frame at 400% zoom', () => {
  test.use({ deviceScaleFactor: 4 });

  test('neck and waist lines run straight through', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-1366x1024', 'screenshots once, in Chromium');
    await open(page);
    for (const kind of ['head', 'torso', 'legs']) {
      await stack(page, kind).focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      await expect(placed(page, kind)).toBeVisible();
    }
    await page.waitForTimeout(400);
    const win = (await page.locator('.frame__window').boundingBox())!;
    for (const [name, y] of [['neck', 250], ['waist', 570]] as const) {
      const sy = win.y + (win.height * y) / 1500;
      await page.screenshot({
        path: `test-results/screens/seam-${name}-400.png`,
        clip: { x: win.x + win.width * 0.35, y: sy - 18, width: win.width * 0.3, height: 36 },
      });
    }
  });
});

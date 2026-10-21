import { expect, test, type Page } from '@playwright/test';

// Phase 4 "Done when": every effect shows while scrubbing and particles stay under
// their caps. The game publishes its effect counters on window.__viviFx with ?fxstats.

interface Stats {
  crumbsSpawned: number;
  glintsSpawned: number;
  maxCrumbsAlive: number;
  maxGlintsAlive: number;
  maxCrumbsPerFrame: number;
  maxGlintsPerFrame: number;
  nudgeFrames: number;
  rattleFrames: number;
}

async function setUp(page: Page): Promise<void> {
  await page.goto('/?fxstats');
  await expect(page.locator('.well--head .plate')).toBeVisible();
  for (const kind of ['head', 'torso', 'legs']) {
    await page.locator(`.well--${kind} .stack`).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`.placed[data-band="${kind}"]`)).toBeVisible();
  }
  await page.locator('.paper-btn').click();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
}

const stats = (page: Page): Promise<Stats> => page.evaluate(() => ({ ...(window as unknown as { __viviFx: { stats: Stats } }).__viviFx.stats }));

async function sheetPoint(page: Page, x: number, y: number): Promise<[number, number]> {
  const b = (await page.locator('.sheet').boundingBox())!;
  return [b.x + (x / 600) * b.width, b.y + (y / 1500) * b.height];
}

/** Count beads that bounced as they filled. */
async function watchBeads(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { bounced: number };
    w.bounced = 0;
    new MutationObserver((records) => {
      for (const r of records) {
        const bead = r.target as HTMLElement;
        // Only the scripted bounce counts, not the bead's CSS colour transition.
        const bounce = bead.getAnimations().some((a) => !(a instanceof CSSTransition));
        if (bead.classList.contains('is-filled') && bounce) w.bounced++;
      }
    }).observe(document.querySelector('.frame__beads')!, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
}

/** Inked pixels left on the fx layer. */
const fxInk = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const src = document.querySelector<HTMLCanvasElement>('.layer--fx')!;
    if (src.hidden) return 0;
    const c = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height });
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(src, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
    return n;
  });

test('scrubbing shows every effect, within its caps, and leaves the fx layer clean', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setUp(page);
  await watchBeads(page);

  // An ordinary back-and-forth scrub over the torso.
  await page.mouse.move(...(await sheetPoint(page, 180, 280)));
  await page.mouse.down();
  await expect(page.locator('.tool-cursor')).toBeVisible();
  const cursorBefore = await page.locator('.tool-cursor').getAttribute('style');
  for (let i = 0; i < 24; i++) await page.mouse.move(...(await sheetPoint(page, i % 2 ? 180 : 420, 280 + i * 12)), { steps: 3 });
  expect(await fxInk(page)).toBeGreaterThan(0); // crumbs and twinkles on the fx canvas
  expect(await page.locator('.tool-cursor').getAttribute('style')).not.toBe(cursorBefore);
  // One very fast scrub: big jumps between pointer events.
  for (let i = 0; i < 8; i++) await page.mouse.move(...(await sheetPoint(page, i % 2 ? 60 : 540, 300 + i * 20)), { steps: 1 });
  await page.mouse.up();

  const s = await stats(page);
  expect(s.crumbsSpawned).toBeGreaterThan(0);
  expect(s.glintsSpawned).toBeGreaterThan(0);
  expect(s.nudgeFrames).toBeGreaterThan(0);
  expect(s.rattleFrames).toBeGreaterThan(0);
  expect(s.maxCrumbsAlive).toBeLessThanOrEqual(120);
  expect(s.maxGlintsAlive).toBeLessThanOrEqual(60);
  expect(s.maxCrumbsPerFrame).toBeLessThanOrEqual(4);
  expect(s.maxGlintsPerFrame).toBeLessThanOrEqual(6);
  expect(await page.evaluate(() => (window as unknown as { bounced: number }).bounced)).toBeGreaterThan(0);

  // Once the last crumb and twinkle die, nothing is left behind and the paper is back at rest.
  await expect.poll(() => fxInk(page), { timeout: 3000 }).toBe(0);
  await expect(page.locator('.sheet')).toHaveAttribute('style', /^(?!.*transform:\s*translate).*$/);
  await expect(page.locator('.frame__window')).not.toHaveAttribute('style', /transform:\s*translate/);
  expect(errors).toEqual([]);
});

test('the crayon cursor hides when the pointer leaves the paper', async ({ page }) => {
  await setUp(page);
  await page.mouse.move(...(await sheetPoint(page, 300, 700)));
  await page.mouse.move(...(await sheetPoint(page, 310, 720)));
  await expect(page.locator('.tool-cursor')).toBeVisible();
  const bumps = (await page.locator('.bumps').boundingBox())!;
  await page.mouse.move(bumps.x + 10, bumps.y + 10);
  await expect(page.locator('.tool-cursor')).toBeHidden();
});

test('on touch, the crayon sits above and right of the finger', async ({ page }) => {
  await setUp(page);
  const [x, y] = await sheetPoint(page, 300, 700);
  const tip = await page.evaluate(
    ([cx, cy]) =>
      new Promise<{ x: number; y: number }>((resolve) => {
        const sheet = document.querySelector('.sheet')!;
        const init = { pointerId: 3, pointerType: 'touch', isPrimary: true, bubbles: true, buttons: 1, clientX: cx, clientY: cy };
        sheet.dispatchEvent(new PointerEvent('pointerdown', init));
        setTimeout(() => {
          const spring = (window as unknown as { __viviFx: { cursor: { spring: { x: number; y: number } } } }).__viviFx.cursor.spring;
          resolve({ x: spring.x - cx, y: spring.y - cy });
          sheet.dispatchEvent(new PointerEvent('pointerup', init));
        }, 400);
      }),
    [x, y] as const,
  );
  expect(tip.x).toBeCloseTo(18, 0);
  expect(tip.y).toBeCloseTo(-26, 0);
});

test('reduced motion: no crumbs or wobble, twinkles fade instead of growing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setUp(page);
  await watchBeads(page);
  await page.mouse.move(...(await sheetPoint(page, 180, 280)));
  await page.mouse.down();
  for (let i = 0; i < 24; i++) await page.mouse.move(...(await sheetPoint(page, i % 2 ? 60 : 540, 280 + i * 12)), { steps: 2 });
  await page.mouse.up();
  const s = await stats(page);
  expect(s.crumbsSpawned).toBe(0);
  expect(s.nudgeFrames).toBe(0);
  expect(s.rattleFrames).toBe(0);
  expect(s.glintsSpawned).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as unknown as { bounced: number }).bounced)).toBe(0);
});

import { expect, test, type Locator, type Page } from '@playwright/test';

// Phase 1 "Done when": the layout matches the wireframe at 1366 × 1024, 1024 × 768
// and 390 × 844, with no console errors.

type Box = { x: number; y: number; width: number; height: number };

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  expect(b, 'element should be rendered').not.toBeNull();
  return b!;
}

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

const isLandscape = (page: Page): boolean => {
  const v = page.viewportSize()!;
  return v.width > v.height;
};

test('tray renders cleanly with the self-hosted font', async ({ page }, info) => {
  const errors = await open(page);

  expect(await page.evaluate(() => document.fonts.check('300 16px Quicksand'))).toBe(true);

  // The page itself never scrolls.
  const doc = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
    vw: window.innerWidth,
    vh: window.innerHeight,
  }));
  expect(doc.w).toBeLessThanOrEqual(doc.vw);
  expect(doc.h).toBeLessThanOrEqual(doc.vh);

  // The frame window is exactly 1 : 2.5.
  const win = await box(page.locator('.frame__window'));
  expect(win.width / win.height).toBeCloseTo(0.4, 2);

  // Bands sit at the anatomy grid's seams (250 and 570 of 1500 units).
  const torso = await box(page.locator('.slot--torso'));
  const legs = await box(page.locator('.slot--legs'));
  expect((torso.y - win.y) / win.height).toBeCloseTo(250 / 1500, 2);
  expect((legs.y - win.y) / win.height).toBeCloseTo(570 / 1500, 2);

  await page.screenshot({ path: `test-results/screens/${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('every control is a labelled button of at least 48 px', async ({ page }) => {
  await open(page);
  const buttons = page.locator('button:visible');
  // 5 wells + 4 crayons + pencil box + paper + 5 bumps + the settings gear (the tucked pattern
  // plate, Redo and the dialogs' buttons show only when needed)
  await expect(buttons).toHaveCount(17);
  for (const b of await buttons.all()) {
    await expect(b).toHaveAttribute('aria-label', /\w/);
    await b.scrollIntoViewIfNeeded();
    const r = await box(b);
    expect(Math.min(r.width, r.height), await b.getAttribute('aria-label') ?? '').toBeGreaterThanOrEqual(48);
  }
  for (const label of ['Undo', 'Eraser', 'New', 'Sketchbook', 'Sound']) {
    await expect(page.locator('.bump__label', { hasText: label })).toBeVisible();
  }
});

test('landscape: frame on the left, wells on the right, all in view', async ({ page }) => {
  test.skip(!isLandscape(page), 'landscape layout only');
  await open(page);
  const vp = page.viewportSize()!;

  const frame = await box(page.locator('.frame'));
  const drawer = await box(page.locator('.drawer'));
  const bumps = await box(page.locator('.bumps'));
  expect(frame.width / vp.width).toBeGreaterThan(0.33);
  expect(frame.width / vp.width).toBeLessThan(0.42);
  expect(drawer.x).toBeGreaterThan(frame.x + frame.width - 1);
  expect(bumps.y).toBeGreaterThan(frame.y + frame.height - 1);

  // Column A: head over torso over legs, legs the tallest.
  const head = await box(page.locator('.well--head'));
  const torsoWell = await box(page.locator('.well--torso'));
  const legsWell = await box(page.locator('.well--legs'));
  expect(head.y).toBeLessThan(torsoWell.y);
  expect(torsoWell.y).toBeLessThan(legsWell.y);
  expect(legsWell.height).toBeGreaterThan(torsoWell.height + head.height);

  // Column B: top, pattern, then crayon and pencils, to the right of column A.
  const top = await box(page.locator('.well--top'));
  const pattern = await box(page.locator('.well--pattern'));
  const crayon = await box(page.locator('.crayon-tray'));
  const pencils = await box(page.locator('.pencil-box'));
  expect(top.x).toBeGreaterThan(head.x + head.width);
  expect(top.y).toBeLessThan(pattern.y);
  expect(pattern.y).toBeLessThan(crayon.y);
  expect(crayon.y).toBeLessThan(pencils.y);

  for (const b of [head, torsoWell, legsWell, top, pattern, crayon, pencils]) {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
    expect(b.y + b.height).toBeLessThanOrEqual(bumps.y);
  }
});

test('portrait: frame on top, wells in a snapping drawer', async ({ page }) => {
  test.skip(isLandscape(page), 'portrait layout only');
  await open(page);
  const vp = page.viewportSize()!;

  const frame = await box(page.locator('.frame'));
  const drawer = await box(page.locator('.drawer'));
  const bumps = await box(page.locator('.bumps'));
  expect(frame.height / vp.height).toBeGreaterThan(0.5);
  expect(frame.height / vp.height).toBeLessThan(0.65);
  expect(drawer.y).toBeGreaterThan(frame.y + frame.height - 1);
  expect(bumps.y).toBeGreaterThan(drawer.y + drawer.height - 1);

  const scroll = await page.locator('.drawer').evaluate((el) => ({
    sw: el.scrollWidth,
    cw: el.clientWidth,
    snap: getComputedStyle(el).scrollSnapType,
  }));
  expect(scroll.sw).toBeGreaterThan(scroll.cw);
  expect(scroll.snap).toContain('x');

  // Scrolled to the end, the pencil box is reachable.
  await page.locator('.drawer').evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-drawer-end.png` });
  await expect(page.locator('.pencil-box')).toBeInViewport();
});

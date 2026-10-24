import { expect, test, type Page } from '@playwright/test';

// PLAN.md, phase 9: place three plates, lay paper, synthetic scrub, expect three
// band:complete events. Plus Auto-rub, which must get there without scrubbing,
// and offline play from the service worker.

interface Published {
  __viviFx: { game: { bus: { on(type: string, fn: (p: { band: string }) => void): void } } };
  __bands: string[];
}

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/?fxstats');
  await expect(page.locator('.well--head .plate')).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as Published;
    w.__bands = [];
    w.__viviFx.game.bus.on('band:complete', ({ band }) => w.__bands.push(band));
  });
  return errors;
}

const bands = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as Published).__bands);

async function placeAndLay(page: Page): Promise<void> {
  // Double-tap each stack, as a child would.
  for (const kind of ['head', 'torso', 'legs']) {
    await page.locator(`.well--${kind} .stack`).dblclick();
    await expect(page.locator(`.placed[data-band="${kind}"]`)).toBeVisible();
  }
  await page.locator('.paper-btn').click();
  await expect(page.locator('.frame')).toHaveAttribute('data-paper', 'down');
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
}

test('smoke: place three plates, lay paper, scrub, three bands complete', async ({ page }) => {
  const errors = await open(page);
  await placeAndLay(page);
  // A synthetic scrub: pointer events straight to the paper, row by row down the sheet.
  await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>('.sheet')!;
    const r = sheet.getBoundingClientRect();
    const send = (type: string, x: number, y: number): void => {
      sheet.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          bubbles: true,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: r.left + (x / 600) * r.width,
          clientY: r.top + (y / 1500) * r.height,
        }),
      );
    };
    send('pointerdown', 150, 10);
    for (let y = 10, i = 0; y <= 1490; y += 26, i++) send('pointermove', i % 2 ? 150 : 450, y);
    send('pointerup', 150, 1490);
  });
  await expect.poll(() => bands(page)).toHaveLength(3);
  expect([...(await bands(page))].sort()).toEqual(['head', 'legs', 'torso']);
  await expect(page.locator('.bead-group[data-complete]')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('Auto-rub finishes each band in turn without scrubbing, and the keyboard can use it', async ({ page }) => {
  test.slow();
  const errors = await open(page);
  const auto = page.locator('.autorub-btn');
  await expect(auto).toBeHidden(); // no paper yet
  await placeAndLay(page);
  await expect(auto).toBeVisible();
  await expect(auto).toHaveAccessibleName(/Auto-rub/);
  await auto.click();
  await expect.poll(() => bands(page), { timeout: 15_000 }).toEqual(['head']);
  await expect(auto).toHaveAttribute('aria-disabled', 'false');
  await auto.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => bands(page), { timeout: 15_000 }).toEqual(['head', 'torso']);
  await expect(auto).toHaveAttribute('aria-disabled', 'false');
  await auto.click();
  await expect.poll(() => bands(page), { timeout: 20_000 }).toEqual(['head', 'torso', 'legs']);
  await expect(auto).toBeHidden(); // nothing left to rub
  // Each band giggled once, as if rubbed by hand.
  const giggles = await page.evaluate(
    () => (window as unknown as { __viviFx: { sound: { log: { name: string }[] } } }).__viviFx.sound.log.filter((e) => e.name === 'giggle').length,
  );
  expect(giggles).toBe(3);
  expect(errors).toEqual([]);
});

test('Auto-rub reveals the lines even with a pattern plate tucked in', async ({ page }) => {
  await open(page);
  await placeAndLay(page);
  await page.locator('.well--pattern .stack').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tucked')).toBeVisible();
  await page.locator('.autorub-btn').click();
  await expect.poll(() => bands(page), { timeout: 15_000 }).toEqual(['head']);
  await expect(page.locator('.tucked')).toBeVisible(); // the pattern is still there for hand rubbing
});

test('the built game plays offline once its service worker has it', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop-1366x1024', 'service workers are checked once, in Chromium');
  const errors = await open(page);
  // The worker installs, keeping every file, and takes over the page.
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((ok) => navigator.serviceWorker.addEventListener('controllerchange', ok, { once: true }));
    return reg.active?.state;
  });
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((n) => n.startsWith('vivi-'))!);
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  expect(cached.some((p) => p.endsWith('/plates/plates.json'))).toBe(true);
  expect(cached.filter((p) => p.endsWith('.svg') && p.includes('/plates/'))).toHaveLength(27);
  expect(cached.some((p) => /\/assets\/index-.*\.js$/.test(p))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.well--head .plate')).toBeVisible();
  await expect(page.locator('.well--pattern .plate')).toBeVisible();
  // Still playable: place, lay, rub.
  await page.locator('.well--head .stack').dblclick();
  await expect(page.locator('.placed[data-band="head"]')).toBeVisible();
  await page.locator('.paper-btn').click();
  await expect(page.locator('.frame')).toHaveAttribute('data-paper', 'down');
  await context.setOffline(false);
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});

test('the app manifest and icons are in place', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop-1366x1024', 'checked once');
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = (await (await request.get(new URL(href!, page.url()).href)).json()) as {
    name: string;
    short_name: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };
  expect(manifest).toMatchObject({ name: 'Vivi Fashion Dresses', short_name: 'Vivi', start_url: './', display: 'standalone' });
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const res = await request.get(new URL(icon.src, new URL(href!, page.url())).href);
    expect(res.ok(), icon.src).toBe(true);
  }
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect((await request.get(new URL(touch!, page.url()).href)).ok()).toBe(true);
});

test('nothing but the game’s own files is ever requested: no third parties, no analytics', async ({ page, baseURL }) => {
  const elsewhere: string[] = [];
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith(baseURL!) && !url.startsWith('data:') && !url.startsWith('blob:')) elsewhere.push(url);
  });
  await open(page);
  await placeAndLay(page);
  await page.locator('.autorub-btn').click();
  await expect.poll(() => bands(page), { timeout: 15_000 }).toEqual(['head']);
  await page.locator('.bump[data-tool="sketchbook"]').click();
  await page.locator('.book__close').click();
  expect(elsewhere).toEqual([]);
  // And no links out of the play area.
  expect(await page.locator('a[href]').count()).toBe(0);
});

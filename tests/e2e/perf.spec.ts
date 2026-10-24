import { expect, test, type Page } from '@playwright/test';

// Frame rate while scrubbing, with every scrub effect running (phase 3: 60 fps;
// phase 4: above 55 fps with effects), and while rubbing a pattern clipped by Stay
// inside (phase 6). Runs as its own Playwright project after every other project,
// one test at a time, so nothing else competes for the CPU.

test.describe.configure({ mode: 'serial' });

interface FrameStats {
  frames: number;
  median: number;
  p95: number;
  worst: number;
  slowestSecondFps: number;
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

/**
 * A fast, kid-like scrub at 4× CPU throttle (roughly an iPad 9th gen against a
 * laptop): ~90 units a frame back and forth, drifting down the sheet, for 300 frames.
 * The stroke starts at `start` (sheet units).
 */
async function measureScrub(page: Page, start: readonly [number, number]): Promise<FrameStats> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const stats = await page.evaluate(
    ([sx, sy]) =>
      new Promise<FrameStats>((resolve) => {
        const sheet = document.querySelector<HTMLElement>('.sheet')!;
        const r = sheet.getBoundingClientRect();
        const send = (type: string, x: number, y: number): void => {
          sheet.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 7,
              pointerType: 'touch',
              isPrimary: true,
              bubbles: true,
              buttons: 1,
              clientX: r.left + (x / 600) * r.width,
              clientY: r.top + (y / 1500) * r.height,
            }),
          );
        };
        const gaps: number[] = [];
        const stamps: number[] = [];
        let last = 0;
        let i = 0;
        send('pointerdown', sx, sy);
        const step = (now: number): void => {
          if (last) gaps.push(now - last);
          last = now;
          stamps.push(now);
          const x = 150 + Math.abs(((i * 90) % 600) - 300);
          const y = 60 + ((i * 7) % 1380);
          send('pointermove', x, y);
          if (++i < 300) requestAnimationFrame(step);
          else {
            send('pointerup', x, y);
            const sorted = [...gaps].sort((a, b) => a - b);
            // Frames in each whole second of the scrub.
            let slowest = Infinity;
            for (let t0 = stamps[0]!; t0 + 1000 <= stamps[stamps.length - 1]!; t0 += 1000) {
              slowest = Math.min(slowest, stamps.filter((t) => t >= t0 && t < t0 + 1000).length);
            }
            resolve({
              frames: gaps.length,
              median: sorted[Math.floor(sorted.length / 2)]!,
              p95: sorted[Math.floor(sorted.length * 0.95)]!,
              worst: sorted[sorted.length - 1]!,
              slowestSecondFps: slowest,
            });
          }
        };
        requestAnimationFrame(step);
      }),
    start,
  );
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return stats;
}

function report(info: { project: { name: string }; title: string; annotations: { type: string; description?: string }[] }, stats: FrameStats): void {
  info.annotations.push({ type: 'frame-times', description: `${info.title}: ${JSON.stringify(stats)}` });
  console.log(
    `[perf] ${info.title}: median ${stats.median.toFixed(1)} ms, p95 ${stats.p95.toFixed(1)} ms, ` +
      `worst ${stats.worst.toFixed(1)} ms, slowest second ${stats.slowestSecondFps} fps, over ${stats.frames} frames`,
  );
}

test('frame rate while scrubbing', async ({ page }, info) => {
  await setUp(page);
  const stats = await measureScrub(page, [150, 60]);
  report(info, stats);
  // The effects really ran during the measurement: scrub effects, every band's completion
  // (shimmer, burst) and the outfit's confetti, with the scratch sound playing throughout.
  type Published = {
    __viviFx: {
      stats: { crumbsSpawned: number; glintsSpawned: number; nudgeFrames: number };
      celebrate: { stats: { bursts: number; outfits: number; shimmerFrames: number } };
      sound: { state: string; log: { name: string; audible: boolean }[] };
    };
  };
  const fx = await page.evaluate(() => {
    const w = (window as unknown as Published).__viviFx;
    return { ...w.stats, ...w.celebrate.stats, audio: w.sound.state, scratches: w.sound.log.filter((e) => e.name === 'scratch' && e.audible).length };
  });
  console.log(`[perf] ${info.title}: ${fx.bursts} bands completed, ${fx.outfits} outfit, audio ${fx.audio}`);
  expect(fx.crumbsSpawned).toBeGreaterThan(0);
  expect(fx.glintsSpawned).toBeGreaterThan(0);
  expect(fx.nudgeFrames).toBeGreaterThan(0);
  expect(fx.bursts).toBe(3);
  expect(fx.outfits).toBe(1);
  expect(fx.shimmerFrames).toBeGreaterThan(0);
  expect(fx.audio).toBe('running');
  expect(fx.scratches).toBe(1);
  // Typically 60 fps (a frame every 16.7 ms), and every second of the scrub stays above 55 fps.
  expect(stats.median).toBeLessThan(17.5);
  expect(stats.slowestSecondFps).toBeGreaterThanOrEqual(55);
});

test('frame rate while rubbing a pattern kept inside the skirt', async ({ page }, info) => {
  await setUp(page);
  await page.locator('.well--pattern .stack').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tucked')).toBeVisible();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  // Starting inside the skirt, so Stay inside clips every batch of the whole-sheet scrub.
  const stats = await measureScrub(page, [300, 800]);
  report(info, stats);
  const clip = await page.evaluate(() => {
    const w = window as unknown as { __viviFx: { stayInside: { clipAt(x: number, y: number): { area: number } | null } } };
    return w.__viviFx.stayInside.clipAt(300, 800)?.area ?? 0;
  });
  expect(clip).toBeGreaterThan(20000); // the whole skirt, not one pleat
  expect(stats.median).toBeLessThan(17.5);
  expect(stats.slowestSecondFps).toBeGreaterThanOrEqual(55);
});

test('frame rate while colouring with a pencil', async ({ page }, info) => {
  await setUp(page);
  await page.locator('.pencil-box').click();
  await page.locator('.pencil[data-pencil="cobalt"]').click();
  await expect(page.locator('.pencil-fan')).toBeHidden();
  // Every batch of the stroke saves the tiles it is about to colour, for undo.
  const stats = await measureScrub(page, [150, 60]);
  report(info, stats);
  const steps = await page.evaluate(() => (window as unknown as { __viviFx: { history: { steps: number } } }).__viviFx.history.steps);
  expect(steps).toBe(1);
  expect(stats.median).toBeLessThan(17.5);
  expect(stats.slowestSecondFps).toBeGreaterThanOrEqual(55);
});

test('first load: under 2 MB, and playable within 2 s on 4G', async ({ page }, info) => {
  // 4G as WebPageTest defines it (9 Mbps, 170 ms round trip), a phone-ish CPU (4× slower), and a
  // cold start: no cache and no service worker yet.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 170,
    downloadThroughput: (9 * 1024 * 1024) / 8,
    uploadThroughput: (9 * 1024 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let bytes = 0;
  cdp.on('Network.loadingFinished', (e: { encodedDataLength: number }) => {
    bytes += e.encodedDataLength;
  });
  const start = Date.now();
  await page.goto('/');
  await expect(page.locator('.well--legs .plate')).toBeVisible();
  await expect(page.locator('.well--pattern .plate')).toBeVisible();
  const playable = Date.now() - start;
  await page.waitForLoadState('networkidle');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(`[perf] ${info.title}: playable in ${playable} ms, ${(bytes / 1024).toFixed(0)} KB transferred`);
  info.annotations.push({ type: 'first-load', description: JSON.stringify({ playable, bytes }) });
  expect(bytes).toBeLessThan(2 * 1024 * 1024);
  expect(playable).toBeLessThan(2000);
});

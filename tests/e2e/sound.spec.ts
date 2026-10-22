import { expect, test, type Page } from '@playwright/test';

// Phase 5 "Done when": each band giggles exactly once per paper placement, no giggle
// repeats back to back, sound works after the first tap, and mute persists. Plus the
// completion sequence: shimmer, burst, hop and heart badge per band; glow, confetti,
// Ta-da and a pencil-box wiggle for the whole outfit. The game publishes its sound
// log and effect counters on window.__viviFx with ?fxstats.

interface LogEntry {
  name: string;
  detail: string;
  variant: number;
  rate: number;
  audible: boolean;
  source: string;
}

type Fx = {
  __viviFx: {
    sound: { state: string; isMuted: boolean; log: LogEntry[] };
    celebrate: { stats: Record<string, number> };
  };
  animated: { where: string; frames: string }[];
};

const soundLog = (page: Page): Promise<LogEntry[]> => page.evaluate(() => [...(window as unknown as Fx).__viviFx.sound.log]);
const soundState = (page: Page): Promise<string> => page.evaluate(() => (window as unknown as Fx).__viviFx.sound.state);
const celebrateStats = (page: Page): Promise<Record<string, number>> => page.evaluate(() => ({ ...(window as unknown as Fx).__viviFx.celebrate.stats }));
const count = (log: LogEntry[], name: string): number => log.filter((e) => e.name === name).length;

/** Record every Web Animation started, by where it ran, before the page's scripts load. */
async function recordAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Fx;
    w.animated = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, keyframes, options) {
      const well = this.closest<HTMLElement>('[data-well]')?.dataset['well'];
      const where = [this.getAttribute('class') ?? this.tagName, well ? `in:${well}` : ''].join(' ').trim();
      w.animated.push({ where, frames: JSON.stringify(keyframes) });
      return original.call(this, keyframes, options);
    };
  });
}

const animated = (page: Page): Promise<Fx['animated']> => page.evaluate(() => [...(window as unknown as Fx).animated]);

async function setUp(page: Page): Promise<void> {
  await page.goto('/?fxstats');
  await expect(page.locator('.well--head .plate')).toBeVisible();
  for (const kind of ['head', 'torso', 'legs']) {
    await page.locator(`.well--${kind} .stack`).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`.placed[data-band="${kind}"]`)).toBeVisible();
  }
}

async function layPaper(page: Page): Promise<void> {
  await page.locator('.paper-btn').click();
  await expect(page.locator('.frame')).toHaveAttribute('data-paper', 'down');
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
}

/**
 * Rub back and forth over the whole figure, one pointer event per row: the engine
 * fills the gaps between events (rub.spec checks that), and fewer events keep these
 * long tests light when every browser runs at once.
 */
async function scrubAll(page: Page): Promise<void> {
  const box = (await page.locator('.sheet').boundingBox())!;
  const at = (x: number, y: number): [number, number] => [box.x + (x / 600) * box.width, box.y + (y / 1500) * box.height];
  await page.mouse.move(...at(150, 10));
  await page.mouse.down();
  for (let y = 10, i = 0; y <= 1490; y += 26, i++) {
    await page.mouse.move(...at(i % 2 ? 450 : 150, y));
    await page.mouse.move(...at(i % 2 ? 150 : 450, y));
  }
  await page.mouse.up();
}

const giggleBands = (log: LogEntry[]): Record<string, number> => {
  const bands: Record<string, number> = {};
  for (const e of log) if (e.name === 'giggle') bands[e.detail] = (bands[e.detail] ?? 0) + 1;
  return bands;
};

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

test('sound wakes on the first tap', async ({ page, hasTouch }) => {
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') warnings.push(m.text());
  });
  await page.goto('/?fxstats');
  await expect(page.locator('.well--head .plate')).toBeVisible();
  expect(await soundState(page)).toBe('none'); // no AudioContext before a gesture
  const well = page.locator('.well--head .stack');
  if (hasTouch) await well.tap();
  else await well.click();
  await expect.poll(() => soundState(page)).toBe('running');
  await expect.poll(async () => (await soundLog(page)).find((e) => e.name === 'tick')?.audible).toBe(true);
  expect(warnings).toEqual([]);
});

test('each band giggles exactly once per paper placement, never the same giggle twice in a row', async ({ page }) => {
  test.slow();
  await recordAnimations(page);
  await setUp(page);
  await layPaper(page);
  await scrubAll(page);
  await expect.poll(async () => count(await soundLog(page), 'tada'), { timeout: 15_000 }).toBe(1);
  let log = await soundLog(page);
  expect(giggleBands(log)).toEqual({ head: 1, torso: 1, legs: 1 });
  expect(log.filter((e) => e.name === 'giggle').every((e) => e.audible)).toBe(true);

  // Per band: shimmer, 12–18 hearts and stars, a hop and a heart badge in the tray.
  const stats = await celebrateStats(page);
  expect(stats['bursts']).toBe(3);
  expect(stats['minBurst']).toBeGreaterThanOrEqual(12);
  expect(stats['maxBurst']).toBeLessThanOrEqual(18);
  expect(stats['shimmerFrames']).toBeGreaterThan(0);
  await expect(page.locator('.well .plate__badge')).toHaveCount(3);
  for (const kind of ['head', 'torso', 'legs']) {
    await expect(page.locator(`.well--${kind} .stack`)).toHaveAttribute('aria-label', /with a heart$/);
  }
  const hops = (await animated(page)).filter((a) => a.where.startsWith('plate ') && a.frames.includes('translateY(-8px)'));
  expect(hops.map((h) => h.where.split('in:')[1]).sort()).toEqual(['head', 'legs', 'torso']);

  // The whole outfit: glow, confetti, Ta-da, then the pencil box invites colouring.
  expect(stats['outfits']).toBe(1);
  expect(stats['confettiSpawned']).toBeGreaterThan(40);
  expect(stats['maxConfettiAlive']).toBeLessThanOrEqual(90);
  await expect(page.locator('.tada')).toBeHidden({ timeout: 5000 }); // shown for 1.5 s
  await expect.poll(async () => (await animated(page)).some((a) => a.where.startsWith('pencil-box'))).toBe(true);
  expect((await animated(page)).some((a) => a.where.includes('layer--glow'))).toBe(true);
  expect((await animated(page)).some((a) => a.where === 'tada')).toBe(true);
  await expect.poll(() => fxInk(page), { timeout: 6000 }).toBe(0); // every effect cleans up after itself

  // Rubbing a finished outfit again doesn't giggle again.
  await scrubAll(page);
  await page.waitForTimeout(800);
  log = await soundLog(page);
  expect(giggleBands(log)).toEqual({ head: 1, torso: 1, legs: 1 });
  expect(count(log, 'tada')).toBe(1);

  // Laying the paper again re-arms every band.
  await page.locator('.paper-btn').click();
  await expect(page.locator('.frame')).toHaveAttribute('data-paper', 'lifted');
  await layPaper(page);
  await scrubAll(page);
  await expect.poll(async () => count(await soundLog(page), 'tada'), { timeout: 15_000 }).toBe(2);
  log = await soundLog(page);
  expect(giggleBands(log)).toEqual({ head: 2, torso: 2, legs: 2 });

  const variants = log.filter((e) => e.name === 'giggle').map((e) => e.variant);
  for (let i = 1; i < variants.length; i++) expect(variants[i]).not.toBe(variants[i - 1]);
  for (const e of log.filter((g) => g.name === 'giggle')) expect(Math.abs(e.rate - 1)).toBeLessThanOrEqual(0.08);
});

test('reduced motion: no confetti, hops or flying hearts, but the badges and Ta-da still come', async ({ page }) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await recordAnimations(page);
  await setUp(page);
  await layPaper(page);
  await scrubAll(page);
  await expect.poll(async () => count(await soundLog(page), 'tada'), { timeout: 15_000 }).toBe(1);
  const stats = await celebrateStats(page);
  expect(stats['bursts']).toBe(3);
  expect(stats['confettiSpawned']).toBe(0);
  await expect(page.locator('.well .plate__badge')).toHaveCount(3);
  const anims = await animated(page);
  expect(anims.some((a) => a.frames.includes('translateY(-8px)'))).toBe(false);
  const tada = anims.find((a) => a.where === 'tada');
  expect(tada?.frames).not.toContain('scale');
  // Hearts and stars don't fly: every live spark is still where it appeared.
  const moved = await page.evaluate(() => {
    const sparks = (window as unknown as { __viviFx: { celebrate: { sparks: { count: number; vx: Float32Array; vy: Float32Array } } } }).__viviFx.celebrate.sparks;
    let n = 0;
    for (let i = 0; i < sparks.count; i++) if (sparks.vx[i] !== 0 || sparks.vy[i] !== 0) n++;
    return n;
  });
  expect(moved).toBe(0);
});

test('mute persists across a reload', async ({ page }) => {
  await page.goto('/?fxstats');
  const button = page.locator('.bump[data-tool="sound"]');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(button).toHaveAttribute('aria-label', 'Sound');

  await page.reload();
  await expect(page.locator('.well--head .plate')).toBeVisible();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => (window as unknown as Fx).__viviFx.sound.isMuted)).toBe(true);
  // Muted sounds are still asked for, but not heard.
  await page.locator('.well--head .stack').click();
  await expect.poll(async () => (await soundLog(page)).find((e) => e.name === 'tick')?.audible).toBe(false);

  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
});

test('the synthesized giggles match PLAN.md: 5–7 blips, 70 ms on, 40 ms off, 520 → 420 Hz, no clipping', async ({ page }) => {
  await page.goto('/?fxstats');
  await expect(page.locator('.well--head .plate')).toBeVisible(); // the game (and __viviFx) is up
  const voices = await page.evaluate(async () => {
    type Synth = {
      GIGGLE_VOICES: unknown[];
      pinkNoise(ctx: BaseAudioContext): AudioBuffer;
      giggleScore(v: number, rate: number): unknown;
      giggle(p: { ctx: BaseAudioContext; out: AudioNode; noise: AudioBuffer }, t: number, score: unknown, level: number): number;
    };
    const synth = (window as unknown as { __viviFx: { synth: Synth } }).__viviFx.synth;
    const sr = 48000;
    const out = [];
    for (let v = 0; v < synth.GIGGLE_VOICES.length; v++) {
      const ctx = new OfflineAudioContext(1, Math.round(sr * 1.1), sr);
      synth.giggle({ ctx, out: ctx.destination, noise: synth.pinkNoise(ctx) }, 0.05, synth.giggleScore(v, 1), 0.8);
      const d = (await ctx.startRendering()).getChannelData(0);
      let peak = 0;
      for (const x of d) peak = Math.max(peak, Math.abs(x));
      // Loudness in 2 ms windows; a blip is a run of windows above a fifth of the loudest.
      const win = sr * 0.002;
      const rms: number[] = [];
      for (let i = 0; i + win <= d.length; i += win) {
        let s = 0;
        for (let k = i; k < i + win; k++) s += d[k]! * d[k]!;
        rms.push(Math.sqrt(s / win));
      }
      // Find the blips, then measure each against a tenth of its own peak (later blips are quieter).
      const quiet = Math.max(...rms) / 12;
      const found: [number, number][] = [];
      rms.forEach((r, i) => {
        if (r < quiet) return;
        const last = found[found.length - 1];
        if (last && i - last[1] <= 5) last[1] = i;
        else found.push([i, i]);
      });
      const runs = found.map(([a, b]): [number, number] => {
        const own = Math.max(...rms.slice(a, b + 1)) / 10;
        let s = a;
        let e = b;
        while (rms[s]! < own) s++;
        while (rms[e]! < own) e--;
        return [s, e];
      });
      // Pitch of each blip by autocorrelation over its middle 40 ms, searched between 350 and 650 Hz.
      const pitch = ([a, b]: [number, number]): number => {
        const mid = Math.round(((a + b + 1) / 2) * win);
        const n = Math.round(sr * 0.04);
        const s = mid - n / 2;
        let best = 0;
        let bestLag = 0;
        for (let lag = Math.floor(sr / 650); lag <= Math.ceil(sr / 350); lag++) {
          let c = 0;
          let e = 0;
          for (let k = s; k < s + n; k++) {
            c += d[k]! * d[k + lag]!;
            e += d[k + lag]! * d[k + lag]!;
          }
          const r = c / Math.sqrt(e || 1);
          if (r > best) {
            best = r;
            bestLag = lag;
          }
        }
        return sr / bestLag;
      };
      out.push({
        peak,
        blips: runs.length,
        lengths: runs.map(([a, b]) => (b - a + 1) * 2),
        periods: runs.slice(1).map(([a], i) => (a - runs[i]![0]) * 2),
        pitches: runs.map(pitch),
      });
    }
    return out;
  });
  expect(voices.length).toBeGreaterThanOrEqual(4);
  for (const v of voices) {
    expect(v.peak).toBeGreaterThan(0.1);
    expect(v.peak).toBeLessThan(1);
    expect(v.blips).toBeGreaterThanOrEqual(5);
    expect(v.blips).toBeLessThanOrEqual(7);
    for (const ms of v.lengths) expect(Math.abs(ms - 70)).toBeLessThanOrEqual(12);
    for (const ms of v.periods) expect(Math.abs(ms - 110)).toBeLessThanOrEqual(6); // 70 ms on + 40 ms off
    expect(Math.abs(v.pitches[0]! - 520)).toBeLessThan(40);
    expect(Math.abs(v.pitches[v.pitches.length - 1]! - 420)).toBeLessThan(25);
    expect(v.pitches[v.pitches.length - 1]!).toBeLessThan(v.pitches[0]!);
  }
});

test('every listed sound clip is an mp3 under 60 KB', async ({ request }) => {
  const manifest = (await (await request.get('/sounds/sounds.json')).json()) as { giggles: string[]; tada: string[] };
  for (const file of [...manifest.giggles, ...manifest.tada]) {
    expect(file).toMatch(/\.mp3$/);
    const res = await request.get(`/sounds/${file}`);
    expect(res.ok()).toBe(true);
    expect((await res.body()).byteLength).toBeLessThan(60 * 1024);
  }
});

import { expect, test } from '@playwright/test';

// Phase 3 "Done when": 60 fps while scrubbing. Runs as its own Playwright project
// after every other project, so no other test competes for the CPU.

test('frame rate while scrubbing', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.locator('.well--head .plate')).toBeVisible();
  for (const kind of ['head', 'torso', 'legs']) {
    await page.locator(`.well--${kind} .stack`).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`.placed[data-band="${kind}"]`)).toBeVisible();
  }
  await page.locator('.paper-btn').click();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  // Slow the CPU 4×, roughly an iPad 9th gen against a laptop.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const stats = await page.evaluate(
    () =>
      new Promise<{ frames: number; median: number; p95: number; worst: number }>((resolve) => {
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
        let last = 0;
        let i = 0;
        send('pointerdown', 150, 60);
        const step = (now: number): void => {
          if (last) gaps.push(now - last);
          last = now;
          // A fast, kid-like scrub: ~90 units a frame back and forth, drifting down the sheet.
          const x = 150 + Math.abs(((i * 90) % 600) - 300);
          const y = 60 + ((i * 7) % 1380);
          send('pointermove', x, y);
          if (++i < 240) requestAnimationFrame(step);
          else {
            send('pointerup', x, y);
            const sorted = [...gaps].sort((a, b) => a - b);
            resolve({
              frames: gaps.length,
              median: sorted[Math.floor(sorted.length / 2)]!,
              p95: sorted[Math.floor(sorted.length * 0.95)]!,
              worst: sorted[sorted.length - 1]!,
            });
          }
        };
        requestAnimationFrame(step);
      }),
  );
  info.annotations.push({ type: 'frame-times', description: `${info.project.name}: ${JSON.stringify(stats)}` });
  console.log(`[perf] ${info.project.name}: median ${stats.median.toFixed(1)} ms, p95 ${stats.p95.toFixed(1)} ms, worst ${stats.worst.toFixed(1)} ms over ${stats.frames} frames`);
  // 60 fps: frames every 16.7 ms, allowing the odd late one.
  expect(stats.median).toBeLessThan(17.5);
  expect(stats.p95).toBeLessThan(20);
});

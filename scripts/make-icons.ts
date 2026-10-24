// Renders the app icon (public/icons/icon.svg) to the PNGs a PWA and iOS need.
// Run with `npm run icons` after changing the icon; the PNGs are committed.
// Uses Playwright's Chromium, already a dev dependency.

import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');

/** name, size in px, and the share of the canvas the artwork fills (maskable icons need a safe zone). */
const OUTPUTS: readonly [string, number, number][] = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.8],
  ['apple-touch-icon.png', 180, 1],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, art] of OUTPUTS) {
  const inner = Math.round(size * art);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:#F1E6C8;display:grid;place-items:center;width:${size}px;height:${size}px">` +
      `<div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  );
  writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } }));
  console.log(`public/icons/${name}`);
}
await browser.close();

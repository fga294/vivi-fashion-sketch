import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/** GPU canvases, as on real devices; headless Chromium otherwise rasterises canvases in software. */
const GPU_ARGS = ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-accelerated-2d-canvas', '--use-angle=metal'];

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  reporter: [['list']],
  // Six browsers start at once (WebKit and GPU Chromium); cold starts can be slow.
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  // perf.spec.ts runs alone, after everything else (see the perf project below).
  testIgnore: /perf\.spec\.ts/,
  // The three viewports named in PLAN.md, in Chromium and WebKit (Safari is the main target).
  projects: [
    {
      name: 'desktop-1366x1024',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 1024 },
        launchOptions: { args: GPU_ARGS },
      },
    },
    { name: 'ipad-1024x768', use: { ...devices['iPad (gen 7) landscape'], viewport: { width: 1024, height: 768 } } },
    { name: 'phone-390x844', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } },
    { name: 'ipad-1024x768-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 }, hasTouch: true } },
    { name: 'phone-390x844-chromium', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    {
      // Frame-rate checks: iPad layout in GPU-accelerated Chromium, alone, after the rest.
      name: 'perf',
      testIgnore: [],
      testMatch: /perf\.spec\.ts/,
      dependencies: ['desktop-1366x1024', 'ipad-1024x768', 'phone-390x844', 'ipad-1024x768-chromium', 'phone-390x844-chromium'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, launchOptions: { args: GPU_ARGS } },
    },
  ],
});

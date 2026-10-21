import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  // The three viewports named in PLAN.md, in Chromium and WebKit (Safari is the main target).
  projects: [
    { name: 'desktop-1366x1024', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 1024 } } },
    { name: 'ipad-1024x768', use: { ...devices['iPad (gen 7) landscape'], viewport: { width: 1024, height: 768 } } },
    { name: 'phone-390x844', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } },
    { name: 'ipad-1024x768-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 }, hasTouch: true } },
    { name: 'phone-390x844-chromium', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
});

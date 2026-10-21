import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so dist/ works from a domain root or a GitHub Pages subpath.
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Process CSS instead of stubbing it, so tests can read stylesheets with ?raw.
    css: { include: [/\.css(\?|$)/] },
  },
});

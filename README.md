# Vivi Fashion Dresses

A browser game in the spirit of the classic rub-and-colour fashion design kits: slot head, torso and legs plates into a tracing frame, rub a crayon over the paper to reveal the outfit, then colour it in. See `PLAN.md` for the full design and `DECISIONS.md` for choices made along the way.

Status: **phase 1 of 9** (scaffold and static tray).

## Develop

```sh
npm install
npm run dev          # http://localhost:5173
```

## Test

```sh
npm test             # Vitest unit tests
npx playwright install chromium webkit   # once
npm run test:e2e     # Playwright layout checks at 1366×1024, 1024×768 and 390×844
```

The e2e run builds the app and saves a screenshot per viewport to `test-results/screens/`.

## Build

```sh
npm run build        # type-checks, then writes a static site to dist/
npm run preview      # serve dist/ locally
```

`dist/` uses relative paths, so it deploys as-is to Netlify, Vercel, Cloudflare Pages or a GitHub Pages subpath. Full deploy steps arrive in phase 9.

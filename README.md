# Vivi Fashion Dresses

A browser game in the spirit of the classic rub-and-colour fashion design kits: slot head, torso and legs plates into a tracing frame, rub a crayon over the paper to reveal the outfit, then colour it in. See `PLAN.md` for the full design and `DECISIONS.md` for choices made along the way.

Status: **phase 4 of 9** (scrub animations: crayon cursor, wax crumbs, line twinkles, paper nudge, bead bounce).

## Develop

```sh
npm install
npm run dev          # http://localhost:5173
```

## Test

```sh
npm test             # Vitest unit tests (includes every plate check)
npm run check:plates # validate the plate art on its own, with a readable report
npx playwright install chromium webkit   # once
npm run test:e2e     # Playwright: layout at 1366×1024, 1024×768 and 390×844, plate play, seams at 400%, rubbing, frame rate
```

Open the game with `?fxstats` to publish the scrub-effect counters (crumbs and twinkles spawned and alive, nudge and rattle frames) on `window.__viviFx`; the effect tests read them.

The frame-rate check (`tests/e2e/perf.spec.ts`) runs last and alone, in Chromium with GPU canvases and the CPU slowed 4×. Headless browsers draw canvases without a GPU, so their frame times say little about a device. Check a real iPad too: open the game in Safari, connect Safari's Web Inspector (Develop menu), record a Timeline while scrubbing, and look for 60 fps.

The e2e run builds the app and saves screenshots to `test-results/screens/`.

## Adding plates

Every plate is an SVG in `public/plates/` listed in `public/plates/plates.json`. New art appears in its well without code changes:

1. Draw the plate on the shared 600 × 1500 anatomy grid (`src/art/anatomy.json`). Use the band's absolute `viewBox`:

   | Band | `viewBox` | Folder |
   | --- | --- | --- |
   | head | `0 0 600 250` | `heads/` |
   | torso | `0 250 600 320` | `torsos/` |
   | legs | `0 570 600 930` | `legs/` |
   | top (head and torso in one pose) | `0 0 600 570` | `tops/` |
   | pattern (one tileable 120-unit tile) | `0 0 120 120` | `patterns/` |

2. Follow the authoring rules. Use strokes only: `fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"` on the root `<svg>`, and no fills, transforms, styles, text or images. The root also carries `data-band`, `data-name` and a `<title>`. Only `path`, `circle`, `ellipse`, `line`, `polyline`, `polygon` and `rect` are drawn.
3. Meet the seams exactly. The neck lines cross y = 250 at x = 282 and 318, and the waist lines cross y = 570 at x = 258 and 342. A centre-front line may also cross the waist at x = 300. Nothing else may cross a seam or come within 3 units of one, so arms bend to keep hands in the torso band. Feet finish by y = 1470, and below y = 1400 everything stays within x = 210–390. Pattern lines that touch a tile edge must continue from the opposite edge.
4. Add a row to `plates.json`:

   ```json
   { "id": "head-my-new-plate", "band": "head", "name": "My new plate", "file": "heads/my-new-plate.svg" }
   ```

5. Run `npm run check:plates`. It names any rule a plate breaks and checks every pairing that can meet in the frame.

## Build

```sh
npm run build        # type-checks, then writes a static site to dist/
npm run preview      # serve dist/ locally
```

`dist/` uses relative paths, so it deploys as-is to Netlify, Vercel, Cloudflare Pages or a GitHub Pages subpath. Full deploy steps arrive in phase 9.

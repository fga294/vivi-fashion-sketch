# Vivi Fashion Dresses

A browser game in the spirit of the classic rub-and-colour fashion design kits: slot head, torso and legs plates into a tracing frame, rub a crayon over the paper to reveal the outfit, then colour it in. See `PLAN.md` for the full design and `DECISIONS.md` for choices made along the way.

Status: **phase 6 of 9** (pattern plates: tuck a texture under the frame and rub it on, four rubbing crayons, and Stay inside, which keeps a pattern within the garment it starts in).

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
npm run test:e2e     # Playwright: layout at 1366×1024, 1024×768 and 390×844, plate play, seams at 400%, rubbing, effects, sound, patterns, frame rate
```

Open the game with `?fxstats` to publish its counters on `window.__viviFx`; the effect and sound tests read them:

- the scrub effects (crumbs and twinkles spawned and alive, nudge and rattle frames)
- the celebrations (bursts, shimmer frames, confetti)
- the sound engine (its state and a log of every sound requested)
- the synth voices
- the game state and the Stay inside helper (`stayInside.clipAt(x, y)` gives the area a stroke starting there would stay in)

**Stay inside** is on by default; its switch arrives with the settings panel in phase 8. To try it off now, run this in the browser console and reload:

```js
localStorage.setItem('vivi-fashion-dresses:prefs', JSON.stringify({ stayInside: false }))
```

The frame-rate check (`tests/e2e/perf.spec.ts`) runs last and alone, in Chromium with GPU canvases and the CPU slowed 4×. Headless browsers draw canvases without a GPU, so their frame times say little about a device. Check a real iPad too: open the game in Safari, connect Safari's Web Inspector (Develop menu), record a Timeline while scrubbing, and look for 60 fps.

Check sound on a real iPhone or iPad too:

1. Load the game with the ring/silent switch off silent.
2. Tap a plate stack. You should hear a tick straight away.
3. Rub until a band completes. It should giggle once.
4. Switch to another app and back, then tap again. Sound should come back.

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
4. Mark detail lines with `data-detail=""`: lines that sit inside one garment or body part rather than bounding it, such as pleats, stripes, tiers, pockets, buttons, cuffs, hair strands and the eyes, nose and mouth. Stay inside keeps a pattern within the remaining outline lines, so a pattern started on a pleated skirt covers the whole skirt and stops at its hem. Every garment's outline must be closed (gaps under 2 units are fine), or Stay inside treats the garment as open space and lets the pattern go anywhere.
5. Add a row to `plates.json`:

   ```json
   { "id": "head-my-new-plate", "band": "head", "name": "My new plate", "file": "heads/my-new-plate.svg" }
   ```

6. Run `npm run check:plates`. It names any rule a plate breaks and checks every pairing that can meet in the frame. Then run `npm test`: in every combination of plates, the face, the top garment and the bottom garment must each be one closed area of a sensible size. A leak or an unmarked pleat fails here, naming the plates.

## Adding recorded giggles

Every sound is synthesized, so the game works with no audio files. Real giggles sound far better, and any you add replace the synthesized ones:

1. Record four or more short giggles, plus one longer giggle-and-cheer for the finished outfit. A phone recording at home works well: a quiet room, one giggle per clip, with the silence trimmed. You can also use clips whose licence allows it.
2. Save them as mono `.mp3`, each under 60 KB. At 64 kbps that is about 7 seconds. For example: `ffmpeg -i giggle.wav -ac 1 -b:a 64k giggle-1.mp3`.
3. Put the giggles in `public/sounds/giggles/` and the cheer in `public/sounds/tada/`, then list them in `public/sounds/sounds.json`:

   ```json
   { "giggles": ["giggles/giggle-1.mp3", "giggles/giggle-2.mp3", "giggles/giggle-3.mp3", "giggles/giggle-4.mp3"], "tada": ["tada/cheer.mp3"] }
   ```

4. Add each clip, its source and its licence to `CREDITS.md`.

Clips load after the player's first tap. The game uses the recorded giggles once at least two of them load, picks a different one each time, and varies the pitch by up to ±8%. The e2e tests check that every listed clip exists, is an `.mp3` and is under 60 KB.

## Build

```sh
npm run build        # type-checks, then writes a static site to dist/
npm run preview      # serve dist/ locally
```

`dist/` uses relative paths, so it deploys as-is to Netlify, Vercel, Cloudflare Pages or a GitHub Pages subpath. Full deploy steps arrive in phase 9.

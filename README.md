# Vivi Fashion Dresses

A browser game in the spirit of the classic rub-and-colour fashion design kits: slot head, torso and legs plates into a tracing frame, rub a crayon over the paper to reveal the outfit, then colour it in. See `PLAN.md` for the full design and `DECISIONS.md` for choices made along the way.

Status: **v1, phase 9 of 9 done.** It installs as an app, plays offline, and has an Auto-rub button for players who can't scrub.

## Develop

```sh
npm install
npm run dev          # http://localhost:5173
```

## Test

```sh
npm test             # Vitest unit tests (includes every plate check)
npm run check:plates # validate the plate art on its own, with a readable report
npm run check:budget # after a build: first load under 2 MB, and every offline file present
npx playwright install chromium webkit   # once
npm run test:e2e     # Playwright: layout at 1366×1024, 1024×768 and 390×844, plate play, seams at 400%, rubbing, effects, sound, patterns, colouring, saving and printing, the smoke test, offline play, frame rate and first load
```

Open the game with `?fxstats` to publish its counters on `window.__viviFx`; the effect and sound tests read them:

- the scrub effects (crumbs and twinkles spawned and alive, nudge and rattle frames)
- the celebrations (bursts, shimmer frames, confetti)
- the sound engine (its state and a log of every sound requested)
- the synth voices
- the game state and the Stay inside helper (`stayInside.clipAt(x, y)` gives the area a stroke starting there would stay in)
- the undo history (`history.steps`, `canUndo`, `canRedo`) and the revealed lines Magic fill stops at (`revealedLines()`)

**Settings** (sound, volume, Peek, Stay inside, motion, and deleting every saved sheet) sit behind the gear at the frame's top right: press and hold it for 3 seconds. They are kept in `localStorage`. Saved sheets live in IndexedDB on this device only. With site data blocked (some private browsing modes), the game still runs: settings apply until the page closes, and the sketchbook offers only share and print.

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
npm run check:budget # first load under 2 MB (it's about 290 KB), offline files all present
npm run preview      # serve dist/ locally
```

`dist/` is plain static files with relative paths, so it works from a domain root or a subfolder. The build also writes `dist/sw.js`, the service worker that keeps every file for offline play. After changing `public/icons/icon.svg`, run `npm run icons` to redraw the PNG icons.

## Deploy

Any static host works. The game needs HTTPS for its service worker and Web Share, and every host below provides it.

- **Netlify:** New site → import the repository. Build command `npm run build`, publish directory `dist`. Or drag the `dist/` folder onto Netlify's deploy page.
- **Vercel:** New project → import the repository. Framework preset Vite (or Other), build command `npm run build`, output directory `dist`.
- **Cloudflare Pages:** Create a project from the repository. Build command `npm run build`, build output directory `dist`, and set the `NODE_VERSION` environment variable to `22`.
- **GitHub Pages:** the repository includes `.github/workflows/pages.yml`, which builds, checks the budget and deploys on every push to `main`. For a fork, turn it on in Settings → Pages by choosing "GitHub Actions" as the source.

  The site appears at `https://<user>.github.io/<repository>/`; this one is at https://fga294.github.io/vivi-fashion-sketch/. The relative paths mean no base-path setting is needed.

**Updates.** After a new deploy, a player who already has the game sees the new version the next time they open it: the service worker fetches the new files in the background and takes over. It checks for a new version on every visit.

### Checking a deployed preview on iPhone and iPad

1. Open the site in Safari. It should be playable within a couple of seconds.
2. Share → Add to Home Screen. The Vivi icon appears, and the game opens full screen without Safari's bars.
3. Play a round: place plates, lay paper, rub until the giggles and the Ta-da, colour with a pencil and Magic fill, then save to the sketchbook.
4. With an Apple Pencil, rubbing and colouring press harder as you press harder. Two fingers tapping the paper undo.
5. Turn on Airplane Mode and open the game from the home screen: it still loads and plays.
6. In Safari's Web Inspector (Develop menu on a Mac), record a Timeline while scrubbing, and look for 60 fps.

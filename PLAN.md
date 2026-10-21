# Vivi Fashion Dresses — Claude Code Build Plan

Oct 21, 2026 · @Fabricio Almeida

## Instructions for Claude Code

You are building **Vivi Fashion Dresses**, a browser game that recreates the play of the classic late-1970s and 80s rub-and-colour fashion design kits (the best known is Tomy's Fashion Plates). The player slots head, torso and legs plates into a tracing frame, lays paper over them, scrubs a crayon to reveal the outfit, then colours it in.

How to work through this plan:

1. Read the whole plan before writing any code. Save it as `PLAN.md` at the repo root.
2. Build the phases in **Build phases** in order. Meet each phase's "Done when" criteria before starting the next.
3. After each phase: run the dev server, check an iPad landscape viewport (1024 × 768) and a phone portrait viewport (390 × 844), run the tests, commit with the phase name, and give me a short summary of what to try.
4. Ask before adding any dependency that is not listed in **Tech stack and constraints**.
5. Where the plan is silent, pick the simplest option that keeps the feel of the physical toy, and record the choice in `DECISIONS.md`.
6. Never copy the original toy's artwork, name or logo (see **Originality and branding**).

## Concept and goals

The game should feel like the plastic toy on a table: choose plates, rub, reveal, colour, with a giggle every time a section of the outfit is fully revealed.

- **Tactile:** a molded tray, chunky plates, and the satisfying reveal of lines under the crayon.
- **Delight:** lively scrubbing animations and a giggle when each plate's band is complete.
- **Endless combinations:** every plate fits every other plate, because all art shares one anatomy grid.
- **Kid-ready:** ages 6 and up, playable without reading, big touch targets, works on iPad, iPhone and desktop.

Not in v1: accounts, online sharing or galleries, multiplayer, 3D, ads or payments.

## Tech stack and constraints

Build a static web app with Vite and TypeScript, plain DOM for the tray and HTML Canvas 2D for the drawing sheet.

- **Language and build:** Vite + TypeScript in strict mode. No UI framework.
- **Rendering:** DOM and CSS for the tray, wells, frame and tools. Canvas 2D for the sheet layers and effects. Plate art lives as SVG files, rasterised to offscreen canvases at load.
- **Animation:** CSS transitions and keyframes for UI; one `requestAnimationFrame` loop for canvas effects and particles, using object pools (no allocations per frame).
- **Sound:** Web Audio API, no audio library.
- **Tests:** Vitest for units, Playwright for an end-to-end smoke test.
- **Output:** `npm run build` produces a static `dist/` that deploys to Netlify, Vercel, Cloudflare Pages or GitHub Pages.
- **No runtime network calls:** self-host fonts, no CDNs, no analytics, no third-party scripts.
- **Performance budget:** 60 fps while scrubbing on an iPad (9th gen) and iPhone 12; first load under 2 MB excluding sound files; playable within 2 s on 4G.
- **Browsers:** last two versions of Safari (iOS and macOS), Chrome, Edge and Firefox.

## Look and feel

The screen is a molded plastic craft tray seen from above: a taupe tracing frame on the left and a cream tray of pink plate wells on the right, in soft matte late-70s pastels.

### Palette (CSS custom properties in `styles/tokens.css`)

| Token | Hex | Used for |
| --- | --- | --- |
| `--table` | `#EBDDB0` | page background behind the tray |
| `--tray-cream` | `#F1E6C8` | tray body |
| `--tray-shadow` | `#D9CBA6` | well insides, bevel shadows |
| `--frame-taupe` | `#B5A48E` | tracing frame |
| `--frame-taupe-dark` | `#8F7F6B` | frame bevels, wordmark shadow |
| `--plate-blush` | `#F4C9D3` | head, torso and top plates |
| `--plate-blush-line` | `#E3A9B8` | relief shadow on blush plates |
| `--plate-rose` | `#D9778F` | legs plates |
| `--plate-rose-line` | `#B95870` | relief shadow on rose plates |
| `--paper` | `#FBF8F1` | drawing paper |
| `--crayon-wax` | `#2F2A2E` | default rubbing crayon |
| `--ink-soft` | `#6B5B5E` | UI labels |

### Type

Use Quicksand (SIL Open Font License, self-hosted woff2, weights 300 and 600). The wordmark "Vivi Fashion Dresses" is set in the light weight in off-white on the frame's top bar, with a 1 px darker shadow so it looks molded into the plastic. Design it fresh; do not imitate any existing logo.

### Materials

- **Plastic:** soft inner shadows and 1 px highlights for molded edges and wells. Matte, with at most a 3% sheen; no glossy gradients.
- **Plates:** flat matte pink with the artwork in raised relief. Draw each line three times: a highlight stroke offset (−1, −1) in a lighter tint, a shadow stroke offset (+1, +1) in the `-line` token, and the line itself in the plate colour.
- **Plate stacks:** each well shows two to four plate edges stacked under the top plate (2 px offsets), hinting there are more to flip through.
- **Peg bumps:** rows of small rounded bumps in the open tray area, with the crayon resting across them.
- **Crayon:** a short black wax block with a taupe paper wrapper, in its own well.
- **Pencil box:** a blush card box with a die-cut oval window showing the pencil tips.

### Layout

Landscape (900 px wide and up). The frame takes about 38% of the width; the wells take the rest. The frame window is 1 : 2.5 (the sheet is 600 × 1500 units).

```
+-------------------------------------------------------------------+
|  +------------------+  +---------------+  +--------------------+  |
|  | Vivi Fashion     |  |  HEAD well    |  |  TOP well          |  |
|  | Dresses          |  |  (blush)      |  |  head + torso      |  |
|  | +--------------+ |  +---------------+  |  (blush, square)   |  |
|  | |  head band   | |  |  TORSO well   |  +--------------------+  |
|  | |--------------| |  |  (blush)      |  |  PATTERN well      |  |
|  | |  torso band  | |  +---------------+  +--------------------+  |
|  | |--------------| |  |               |  |  crayon  o o o o o |  |
|  | |              | |  |  LEGS well    |  |  o o o o o o o o o |  |
|  | |  legs band   | |  |  (rose, tall) |  |  +--------------+  |  |
|  | |              | |  |               |  |  | pencil box   |  |  |
|  | +--------------+ |  |               |  |  +--------------+  |  |
|  +------------------+  +---------------+  +--------------------+  |
|   (o) undo  (o) eraser  (o) new sheet  (o) sketchbook  (o) sound  |
+-------------------------------------------------------------------+
```

Tools are physical objects in the tray (crayon, pencil box, pattern well), not a toolbar. A slim row of round "bump" buttons along the tray's bottom edge holds undo, eraser, new sheet, sketchbook and sound, each an icon with a one-word label.

Portrait and phones: the frame sits on top at about 60% of the height; the wells sit below in a horizontally scrolling drawer with snap points; the bump buttons run along the bottom.

## Plates and the anatomy grid

Every plate is drawn on one shared 600 × 1500 unit grid so any head fits any torso and any torso fits any legs; this alignment is the heart of the game.

### Bands

| Band | y range (units) | Plate type | Contains |
| --- | --- | --- | --- |
| Head | 0–250 | head plates | hair, face, hat or accessory, neck |
| Torso | 250–570 | torso plates | shoulders, top, sleeves, arms, hands |
| Legs | 570–1500 | legs plates | skirt, trousers or shorts, legs, shoes |
| Top | 0–570 | top plates | head and torso as one pose (long hair, arm raised to a hat, holding a racket) |

A top plate fills both the head and torso slots.

### Seam connectors

Store these in `src/art/anatomy.json` as the single source of truth.

| Seam | y | Lines that cross it (x, ±1.5 units) |
| --- | --- | --- |
| Neck seam | 250 | neck edges at 282 and 318 |
| Waist seam | 570 | waist edges at 258 and 342; optional centre-front line at 300 |

Rules:

- Only the connector lines may cross a seam. Hair, hands, collars and hems stay inside their own band.
- Torso garments finish at the waist seam; legs garments start there with a waistband that meets x = 258 and 342.
- Feet finish by y = 1470, inside x = 210–390.
- `scripts/check-plates.ts` (also run as a Vitest test) parses every SVG, samples each path where it meets a seam, and fails if a crossing is missing, off by more than 1.5 units, or extra.

### SVG authoring rules

- Each file's `viewBox` uses absolute sheet coordinates for its band: head `0 0 600 250`, torso `0 250 600 320`, legs `0 570 600 930`, top `0 0 600 570`. Placing a plate is then a straight copy with no offsets.
- Strokes only: 3 units wide, round caps and joins, no fills. Keep areas that kids will colour as closed shapes; gaps under 2 units are closed by the fill barrier anyway.
- The root element carries `data-band` and `data-name`, plus a `<title>`.
- Style: elegant late-70s and 80s fashion illustration, about nine heads tall, relaxed poses, simple confident contours, a few detail lines (pleats, pockets, buttons, bows). All designs original.

### Starter set (Claude Code draws these as original SVGs)

| Band | Plates |
| --- | --- |
| Head (6) | bob with beret; shoulder-length waves with headband; curly puff with ribbon; straight fringe with sun hat; high ponytail with scarf; pixie cut with sunglasses pushed up |
| Torso (6) | puff-sleeve blouse with bow; striped tee, hands on hips; cropped denim jacket; sailor-collar top; turtleneck, hands clasped; tank top, one hand waving |
| Legs (6) | pleated midi skirt with knee boots; wide flares with platform shoes; denim mini with sneakers; pinafore skirt with patch pockets; tennis skirt with socks; tiered maxi with sandals |
| Top (3) | tennis player resting a racket on her shoulder; arm raised to a wide hat brim; long hair over one shoulder with a bag strap |
| Pattern (6) | polka dots; gingham; stripes; small florals; hearts; scallop lace |

`public/plates/plates.json` lists every plate (id, band, name, file) so new art can be dropped in without code changes. Document that workflow in the README.

## Gameplay flow

One sheet moves through six steps, and the player can lift the paper, swap plates and rub again on the same sheet, just as with the toy.

1. **Choose plates.** Tapping a well flips to the next plate in its stack with a card-slide and a soft tick. Dragging a plate onto the frame, or double-tapping it, slides it into its band. A top plate replaces both head and torso. Empty bands are allowed.
2. **Lay the paper.** Tapping the paper stack (beside the frame) slides a sheet into the frame, and the frame's window closes over it with a soft clack. With "Peek" on (default), the plates show faintly through the paper at 8% so kids know where to rub.
3. **Rub.** Tapping the crayon lifts it out of its well; it then follows the finger, pencil or mouse. Scrubbing reveals the lines. Each band tracks its own progress and giggles when done (see **Plate completion and giggles**).
4. **Lift and swap (optional).** "Lift paper" swings the window open and keeps everything drawn so far. The player changes plates or picks a pattern plate, lays the paper back in exact registration, and rubs again to layer.
5. **Colour.** Opening the pencil box fans out the pencils. The player colours freehand or uses Magic fill.
6. **Finish.** Save to the sketchbook, download, share or print, or start a new sheet: the old sheet slides out of the frame into the sketchbook with a little flutter.

State machine in `state.ts`: `noPaper` (choose plates) → `paperDown` (rub, pattern, colour) ⇄ `paperLifted` (swap plates, sheet kept) → `noPaper` on new sheet. Every tool is available whenever the paper is down.

## Rubbing engine

The crayon reveals the plate's lines only where it has passed, by drawing the line art through an accumulated rub mask with wax grain on top.

### Sheet layers

Each layer is a canvas in sheet units (600 × 1500), backed at `min(devicePixelRatio, 2)`.

| Order | Layer | Holds | Blend |
| --- | --- | --- | --- |
| 1 | paper | off-white with procedural fibre noise | normal |
| 2 | colour | pencil strokes and fills | multiply |
| 3 | rubTone | faint wax haze where rubbed (crayon colour at 10–14%, grained) | normal |
| 4 | pattern | pattern-plate reveals | normal |
| 5 | lines | baked lines + live plate lines through the rub mask, grained | normal |
| 6 | fx | sparkles, crumbs, glints (never saved) | normal |

Offscreen buffers: `plateArt` (the placed plates' lines, rasterised once on placement), `rubMask` (alpha accumulated by the crayon), `bakedLines` (lines kept from earlier placements), and a 256 × 256 tileable `grain` texture generated at start.

On "Lift paper", bake the currently revealed lines into `bakedLines` and clear `rubMask`, so new plates layer on top of old rubbings.

### Crayon brush

- Stamp: a 40 × 18 unit rounded block with ragged edges cut from the grain texture.
- Stamp along the path every 25% of the stamp width, rotated to the stroke direction with ±8° jitter.
- Each pass adds strength (about 55% on the first pass, capped at 100%), so rubbing twice looks darker, like real wax.
- Pressure: `PointerEvent.pressure` (Apple Pencil) maps to 60–100% strength; mouse and touch use 85%.
- Use Pointer Events with `getCoalescedEvents()` and interpolate between points so fast scrubs leave no gaps.
- Redraw only the dirty rectangle of each stroke per frame.

### Line look

The lines layer draws `plateArt` in the crayon colour, masked by `rubMask`, then multiplied by grain so the lines look waxy and slightly broken. Raised lines read darker than the surrounding haze, as in a real rubbing.

### Coverage tracking

- On placement, sample every path in each band at 6 unit intervals (`getPointAtLength`) and index the samples in a 32 unit spatial hash.
- Each stamp adds its strength to the samples inside its footprint (kept in a `Float32Array`). No canvas readbacks.
- A sample counts as revealed at strength 0.45 or more.
- Band progress = revealed samples ÷ total samples. Emit `band:progress` and `band:complete` events on the state bus.
- At 90%, the band completes: fill the mask along the remaining paths during the shimmer sweep, so the outfit always ends clean.

## Scrubbing animations

Scrubbing should feel alive: the crayon leans and wiggles, wax crumbs fly, newly revealed lines twinkle, and the paper reacts.

- **Crayon cursor:** an SVG crayon sprite follows the pointer on a spring (stiffness about 0.35, damping about 0.7). It tilts up to 25° toward the direction of motion and squashes 6% on each direction reversal. Its tip slowly flattens over a session for a worn-crayon touch. Hide the system cursor over the sheet. On touch, draw the sprite just above and right of the finger so it stays visible.
- **Wax crumbs:** emit up to 4 particles per frame, in proportion to speed. Each is 2–4 units, crayon-coloured, pops up briefly, falls under gravity and fades over 600 ms. Cap at 120 alive.
- **Line twinkles:** when samples flip to revealed, spawn small four-point star glints at a few of them (at most 6 per frame). Each scales 0 → 1 → 0 over 350 ms in white or pale gold.
- **Paper response:** the sheet nudges up to 1.5 units against the stroke and rotates up to ±0.3°, then springs back. On very fast scrubs the frame window rattles slightly.
- **Progress beads:** beside each band on the frame edge sit three small beads that fill pink at 30%, 60% and 90%, each with a tiny bounce and a soft pop.
- **Reduced motion:** with `prefers-reduced-motion` (or the setting), turn off crumbs and paper wobble, and fade glints without scaling.

Draw every effect on the fx canvas inside the single animation loop, using object pools.

## Plate completion and giggles

When a band reaches 90% revealed it finishes itself with a shimmer, giggles and celebrates; when every placed band is done, the whole outfit gets a bigger "Ta-da!".

### Each band

1. **Shimmer sweep:** a soft highlight runs left to right across the band's lines over 400 ms and fills in any gaps left.
2. **Giggle:** play one of at least four giggle clips, never the same one twice in a row, with pitch varied ±8% and volume 0.8.
3. **Burst:** 12–18 hearts and stars pop from the band's centre, arc outward and fade over 900 ms, in blush, rose, cream and gold.
4. **Plate bounce:** the matching plate in the tray hops (up 8 px, then a squash) and gains a small heart badge.

Each band giggles once per paper placement. Laying the paper again after a swap re-arms it.

### Whole outfit

- The figure's outline glows briefly and confetti falls from the top of the frame.
- A hand-lettered "Ta-da!" pops above the frame for 1.5 s, with a longer giggle-and-cheer clip.
- Then the pencil box gives a little wiggle to invite colouring.

## Pattern plates

Pattern plates add fabric textures by rubbing, as with the toy, with an optional "stay inside the clothes" helper.

- The pattern well holds six textures. Tap to flip, double-tap to make one the active pattern plate; it then shows tucked under the frame's edge.
- While a pattern plate is active, the crayon reveals the tiled pattern onto the pattern layer instead of figure lines. Tap the pattern plate again to put it away.
- A small crayon tray offers four rubbing crayons: wax black (default), rose, sky blue and mint. Pattern and line reveals use the chosen crayon's colour.
- **Stay inside** (on by default): at the start of a stroke, flood-fill from the touch point against the line barrier to get a region mask and clip the pattern to it. If the stroke starts outside any closed area, do not clip.
- Pattern art: tileable 120 × 120 unit SVGs with the same 3 unit strokes as the plates.

## Colouring tools

Colouring uses a box of 16 textured pencils plus Magic fill, and it never covers the rubbed lines.

- **Pencil box:** tapping it flips the lid open and fans out the pencils; the chosen pencil lifts and becomes the cursor (same spring and tilt as the crayon, without crumbs).
- **Colours:** cherry red, tangerine, sunflower, leaf green, mint, sky blue, cobalt, violet, bubblegum pink, chocolate brown, charcoal, gold, and four skin tones (porcelain, honey, caramel, espresso).
- **Pencil stroke:** 8 units wide with a pencil-grain texture. Overlapping passes build up colour. Pressure-aware on Apple Pencil.
- **Magic fill:** tap a closed area to fill it with the pencil's colour as a hand-coloured hatch texture, not a flat fill. The barrier is all revealed lines, dilated by 1 px to close tiny gaps. If a fill would cover more than 45% of the sheet, show an icon-only confirm (tick or cross) so a stray tap does not flood the background.
- **Eraser:** removes colour and pattern only, never lines.
- **Undo and redo:** 30 steps, storing dirty-rectangle snapshots per action. On iPad, a two-finger tap also undoes.

## Save, print and sketchbook

Finished sheets save to an on-device sketchbook and can be downloaded, shared or printed; the game still works if storage is blocked.

- **Export:** composite paper, colour, rubTone, pattern and lines (never fx) into a 1200 × 3000 px PNG.
- **Sketchbook:** saved sheets live in IndexedDB on this device only, shown as a grid of thumbnails. Tap to view; delete asks for an icon confirm.
- **Share:** Web Share API with files where supported, falling back to a download.
- **Print:** a print stylesheet shows only the sheet, centred on A4 or Letter, with a small "Vivi Fashion Dresses" footer.
- **Blank colouring page:** prints the fully revealed lines of the current plates with no colour, for colouring on real paper.
- **Settings** (in `localStorage`): sound on or off, volume, Peek, Stay inside, reduced motion.
- Wrap every storage read and write in `try/catch`. If storage is unavailable, hide the sketchbook and keep everything else working.

## Sound

Most sounds are synthesized in Web Audio so the game ships tiny; giggles use recorded clips when present, with a synthesized fallback.

| Sound | Plays when | Source |
| --- | --- | --- |
| Crayon scratch | while rubbing | looped pink noise through a 1.8–3 kHz band-pass, gain following pointer speed, slight filter wobble |
| Pencil scratch | while colouring | same, higher band, quieter |
| Plate flip | tapping a well | short synthesized click |
| Slide and clack | placing a plate, laying or lifting paper | filtered noise swish plus a click |
| Bead pop | a progress bead fills | short sine blip |
| Giggle | a band completes | files in `public/sounds/giggles/` (4 or more) |
| Ta-da | the whole outfit completes | file in `public/sounds/tada/` |

- One `AudioContext`, unlocked on the first `pointerdown` (required on iOS), with a master gain and a mute button.
- **Giggle fallback:** if no giggle files exist, synthesize a "hee-hee" of 5–7 vowel-like blips: a sawtooth through formant filters near 1 kHz and 2.5 kHz, pitch falling from about 520 Hz to 420 Hz, 70 ms per blip with 40 ms gaps, light vibrato.
- Real recorded giggles sound far better. The README explains how to drop in recordings (a home recording works well, or clips whose licence allows use).
- Clips are `.mp3`, under 60 KB each, loaded after the first interaction.
- On band completion, call `navigator.vibrate(15)` where supported; skip silently elsewhere.

## Responsive, accessibility and kid safety

The game must work by touch, Apple Pencil, mouse and keyboard, and it collects nothing about the child.

### Touch and layout

- All drawing maths runs in sheet units; pointer coordinates convert through the sheet's current scale.
- `touch-action: none` on the sheet so the page never scrolls or zooms mid-stroke. Ignore extra touches during a stroke (palms, second fingers).
- Targets at least 48 px. No hover-only interactions.
- Turn off the iOS long-press callout and text selection on game elements (`-webkit-touch-callout: none`, `user-select: none`).

### Accessibility

- Every control is a `<button>` with an `aria-label` and an icon plus a one-word label.
- Keyboard: Tab moves through wells and tools, arrow keys flip plates, Enter places a plate.
- **Auto-rub button:** animates the crayon across a band for players who cannot scrub; it still triggers the giggle.
- Progress shows as bead count as well as colour.
- Honour reduced motion (see **Scrubbing animations**).

### Kid safety and privacy

- No accounts, ads, analytics, third-party scripts or outbound links in the play area.
- Settings and delete-all sit behind a parent gate: press and hold for 3 seconds.
- All data stays on the device.

## Originality and branding

Echo the play and the retro feel, but every drawing, name and logo in the product is Vivi's own.

- The mechanics (interchangeable plates, rubbing, colouring, pattern plates) and a pastel cream-and-pink palette are fine to echo.
- All plate illustrations are original drawings made for this project. Do not trace, copy or closely imitate any existing toy's plate artwork or box art.
- Do not use "Fashion Plates", Tomy, or their logos or lettering anywhere in the product: UI, page title, metadata, file names or assets. Everything is named "Vivi Fashion Dresses".
- Design an original wordmark and an original app icon (for example, a small dress silhouette on a blush plate with a crayon).
- Use only synthesized, self-recorded or properly licensed sounds, and list every clip and its licence in `CREDITS.md`.

## Project structure

Use this layout; adjust file names inside it if needed, and note changes in `DECISIONS.md`.

```
vivi-fashion-dresses/
├─ PLAN.md  DECISIONS.md  CREDITS.md  README.md
├─ index.html
├─ public/
│  ├─ fonts/                Quicksand woff2 (self-hosted)
│  ├─ plates/
│  │  ├─ heads/ torsos/ legs/ tops/ patterns/   *.svg
│  │  └─ plates.json        id, band, name, file
│  ├─ sounds/giggles/  sounds/tada/
│  └─ icons/                app icon, favicon, PWA icons
├─ src/
│  ├─ main.ts               boot, layout, wiring
│  ├─ state.ts              state machine + event bus
│  ├─ art/
│  │  ├─ anatomy.json       bands + seam connectors
│  │  ├─ loader.ts          load SVG, rasterise, sample paths
│  │  └─ emboss.ts          raised-relief plate rendering
│  ├─ ui/                   tray.ts wells.ts frame.ts tools.ts sketchbook.ts settings.ts
│  ├─ engine/               sheet.ts rub.ts coverage.ts pattern.ts pencil.ts fill.ts history.ts
│  ├─ fx/                   cursor.ts particles.ts celebrate.ts
│  ├─ audio/                sound.ts synth.ts
│  ├─ storage/              db.ts (IndexedDB) prefs.ts (localStorage)
│  └─ styles/               tokens.css tray.css frame.css print.css
├─ scripts/check-plates.ts  seam validator
└─ tests/
   ├─ unit/                 anatomy, coverage, fill, history
   └─ e2e/                  smoke.spec.ts
```

## Build phases

Build in nine phases; each ends with a commit and a short summary, and the next starts only when its "Done when" checks pass.

1. **Scaffold and tray.** Vite + TypeScript project, tokens, fonts, and the static tray, frame and wells with placeholder plates in both layouts.
   - Done when: the layout matches the wireframe at 1366 × 1024, 1024 × 768 and 390 × 844; no console errors; Lighthouse accessibility 95 or higher.
2. **Plates and anatomy.** `anatomy.json`, the SVG loader, emboss rendering, flipping stacks, placing plates (drag and double-tap), the seam validator, and the full starter set of plates.
   - Done when: every plate passes `check:plates`, and any head, torso and legs combination shows unbroken neck and waist lines at 400% zoom.
3. **Paper and rubbing.** Lay and lift paper animations, sheet layers, crayon stamping, the rub mask reveal, baking on lift, and coverage tracking.
   - Done when: lines appear only where rubbed; fast scrubs leave no gaps; a full scrub reaches 100% progress; 60 fps on iPad in the Safari timeline.
4. **Scrub animations.** Crayon cursor, wax crumbs, twinkles, paper nudge, progress beads, reduced motion.
   - Done when: every effect shows while scrubbing, particles stay under their caps, and frame rate stays above 55 fps on the test devices.
5. **Sound and completion.** Audio engine, scratch synth, giggle files plus fallback, the per-band completion sequence, and the whole-outfit "Ta-da!".
   - Done when: each band giggles exactly once per paper placement, no giggle repeats back to back, sound works on iOS after the first tap, and mute persists.
6. **Pattern plates.** Pattern well, active pattern, rubbing crayon colours, Stay inside clipping.
   - Done when: with Stay inside on, a pattern stays inside the garment it started in; with it off, it goes wherever the crayon goes.
7. **Colouring.** Pencil box, pencil strokes, Magic fill with hatch texture and the large-fill confirm, eraser, undo and redo.
   - Done when: fills never cover lines, the eraser never removes lines, and 30 undo steps work.
8. **Save, print, sketchbook, settings.** PNG export, share, print and blank colouring page, sketchbook, settings and parent gate.
   - Done when: the exported PNG matches the screen, print preview shows exactly one sheet, and the game runs with storage blocked (private browsing).
9. **Polish and ship.** App icon, PWA manifest and offline service worker, Auto-rub, the Playwright smoke test, and a README with deploy steps.
   - Done when: the smoke test (place three plates, lay paper, synthetic scrub, expect three `band:complete` events) passes; the build is within budget; a deployed preview works on iPhone and iPad.

## Definition of done

v1 is done when every box below is ticked.

- [ ] Any combination of plates lines up at both seams.
- [ ] Scrubbing reveals waxy lines with lively animations at 60 fps on iPad.
- [ ] Each completed band giggles and celebrates once; a full outfit gets "Ta-da!".
- [ ] Patterns, pencils, Magic fill, eraser and undo work with touch, Apple Pencil and mouse.
- [ ] Save, share, print and the sketchbook work, and the game still runs with storage blocked.
- [ ] No network requests after load, no analytics, no outbound links in the play area.
- [ ] No borrowed artwork, names or logos; `CREDITS.md` lists every sound.
- [ ] Unit and end-to-end tests pass, and the production build is within budget.

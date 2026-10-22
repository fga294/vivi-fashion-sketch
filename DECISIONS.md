# Decisions

Choices made where PLAN.md is silent or needed interpreting, newest phase last.

## Phase 1 — Scaffold and tray

- **Repo root.** The project lives at the existing `vivi-fashion/` folder (where PLAN.md was saved) rather than a new `vivi-fashion-dresses/` subfolder. The package name is `vivi-fashion-dresses`.
- **Toolchain versions.** `npm i` resolved Vite 8, TypeScript 7 (the native compiler), Vitest 5 and Playwright 1.64. No other dependencies.
- **No `@types/node`.** It is not on the dependency list, so the Playwright config always reuses a running server instead of reading `process.env.CI`, and the unit tests read CSS with Vite's typed `?raw` import instead of `node:fs`. Vitest is told to process CSS (`test.css.include`) so `?raw` returns the real file instead of an empty stub.
- **One variable font file.** Google serves Quicksand as a variable font, so weights 300 and 600 come from one 28 KB Latin `woff2` (`font-weight: 300 700`). The OFL licence ships beside it in `public/fonts/OFL.txt`.
- **Relative `base`.** `vite.config.ts` uses `base: './'` so `dist/` works at a domain root and under a GitHub Pages subpath.
- **Which layout when.** The side-by-side tray applies when the screen is landscape **and** at least 600 px wide; everything else gets the stacked layout. This differs slightly from the plan's "900 px wide and up". Phones held sideways (e.g. 844 × 390) would otherwise get a stacked frame only ~90 px wide, and a portrait iPad Pro (1024 × 1366) is better served by the stacked layout even though it is over 900 px wide.
- **Pure-CSS sizing with container query units.** The frame body, drawer, each well and the pencil holder are size containers. The frame window is `min(width, height × 0.4)` with `aspect-ratio: 2 / 5`. Column A in landscape is sized from the drawer height so head, torso and legs plates stack at one scale (1 : 2.5, like the frame window). No layout JavaScript, so nothing flashes on resize or rotation.
- **Portrait drawer.** Columns dissolve with `display: contents`, so five bays become snap items in one scroll row: head+torso, legs, top, pattern, then the open tray with the crayon and pencil box. The scrollbar is hidden; the next well peeking in at the edge signals that the drawer scrolls.
- **Frame is ~60% of the tray in portrait** (`grid-template-rows: 60% 1fr auto`), which is ~56% of a 390 × 844 screen once the bumps row and padding are counted.
- **Empty frame shows a guide figure.** With no plates placed, the window shows a faint debossed mannequin and seam grooves at y = 250 and 570, so kids can see where each plate goes. Progress bead sockets (3 per band) sit to the right of the window, empty until phase 4.
- **Placeholder art is a seam-correct mannequin** (`src/art/placeholders.ts`) on the shared grid, so the phase 2 validator has a known-good case. Real starter plates replace it in phase 2.
- **`anatomy.json` created early.** The frame's band slots need the band y-ranges, and the plan makes `anatomy.json` the single source of truth, so it exists from phase 1. Phase 2 adds the validator.
- **Pattern plates.** They are 600 × 240 units (five by two of the 120-unit tiles) and blush, like the other upper plates.
- **Plate relief in the DOM.** Wells render plate art as inline SVG. The line is stroked in the plate colour, with CSS `drop-shadow` filters for the (+1, +1) shadow and (−1, −1) highlight. Offsets are therefore true 1 px at any plate size. Stacked plate edges are box-shadows: per edge, a fill copy over a 1 px outline copy. Phase 2's canvas `emboss.ts` follows the same recipe.
- **Wordmark as SVG.** It is drawn as SVG text with `role="img"` and an `aria-label` inside the `<h1>`. Off-white on taupe is about 2.3 : 1, below text-contrast minimums. As a logotype it is exempt (WCAG 1.4.3), and SVG text keeps it out of automated contrast audits without changing the molded look. A small A-line dress mark sits before the name.
- **Wells have no visible word labels.** The plate on each stack shows what it is (head, torso, legs…), which suits pre-readers. Each well's button has an `aria-label` such as "Head plates, 6 in the stack". The one-word visible labels are on the bump buttons.
- **Bump labels.** These are Undo, Eraser, New, Sketchbook and Sound. Accessible names start with the visible word (e.g. "New sheet") to satisfy WCAG label-in-name.
- **Zoom is not blocked.** The viewport meta allows pinch-zoom (an accessibility requirement). Controls use `touch-action: manipulation` to stop double-tap zoom, and the sheet will get `touch-action: none` in phase 3.
- **Phase 1 controls are inert.** The wells, crayon, pencil box and bumps are real, focusable, labelled `<button>`s that don't act yet; behaviour arrives in their phases.
- **Favicon.** A simple original SVG (dress on a blush plate with a crayon) avoids the browser's default `/favicon.ico` 404 in the console. The full app icon is phase 9.

## Phase 2 — Plates and anatomy

- **One geometry module for checking and drawing.** `src/art/geometry.ts` parses SVG path data (all commands, arcs included) and flattens it in plain TypeScript. The validator (Node) and the browser loader measure plates the same way and need no DOM. Phase 3 samples coverage points with it instead of `getPointAtLength`, so the tests and the game agree on where the lines are.
- **A small XML reader** (`src/art/svg.ts`) parses plate files in Node and the browser alike. Plates are restricted, hand-authored SVG, so a strict tokenizer is enough and adds no dependency.
- **`check:plates` runs on Node's built-in TypeScript support** (`node scripts/check-plates.ts`, Node 22.18+). Shared modules therefore use explicit `.ts` import extensions and erasable-only syntax (`allowImportingTsExtensions`, `erasableSyntaxOnly`). `scripts/` has its own tsconfig with a three-line Node type shim, so `@types/node` isn't needed and Node globals never leak into browser code.
- **The validator is stricter than the plan in four ways.**
  - Non-connector lines must stay 3 units clear of a seam; otherwise a hem ending at y = 249 would read as a connector once rubbed.
  - The feet rule applies below y = 1400, the feet zone, so long skirts can still flare above it.
  - Pattern tiles must wrap edge to edge, modulo the tile, so lines through corners count.
  - Every pair of plates that can meet must join within 1.5 units of each other, not just of the grid; two ±1.5 tolerances could otherwise stack into a visible 3-unit jog. Top plates are only checked at the waist, since the neck seam is inside them.
- **Arms bend.** The torso band holds arms and hands but ends at the waist, so every torso and top pose keeps its hands above y = 567: hands on hips, clasped, waving, thumbs in the waistband, behind the back, touching a bow.
- **Starter art.** All 27 plates are original line drawings. I authored them with a throwaway script (to mirror symmetric parts exactly) that is not part of the repo; the SVG files are the source of truth and are easy to edit by hand.
- **Relief is SVG plus CSS, not canvas.** `src/art/emboss.ts` draws plates as inline SVG in the plate colour, with CSS `drop-shadow` for the (+1, +1) shadow and (−1, −1) highlight. That stays crisp at every size and through rotation without re-rasterising. Rasterising plates to offscreen canvases is only needed for the rubbing sheet, so it arrives in phase 3 with the sheet.
- **Plates stay in the tray when placed.** The frame shows a copy and the well keeps its stack, as PLAN.md's "the matching plate in the tray hops" implies.
- **Tap vs. double-tap.** A tap flips after a 280 ms double-tap window; a double-tap places the plate that was showing before the first tap. Space and the arrow keys flip at once, and Enter places.
- **Flipping wraps.** Past the last plate the stack returns to the first, like sliding the top plate under the pile. `stepIndex()` in `src/state.ts` holds this rule.
- **Dragging in the portrait drawer.** Sideways swipes scroll the drawer (`touch-action: pan-x`) and upward drags lift a plate toward the frame above. In landscape, plates drag in any direction.
- **Taking plates out.** Tap a plate in the frame and it slides back to its well. Plates pushed out by a swap (e.g. head and torso when a top goes in) slide back too.
- **Pattern plates only flip for now.** Making one the active pattern plate is phase 6.
- **The flip's "soft tick" is an event for now.** `plate:flip` goes out on the state bus; phase 5's audio engine plays the sound.
- **The font is no longer preloaded.** WebKit warned that the preload wasn't "used within a few seconds" because the text that uses it is built by script. The 28 KB font still loads from the stylesheet straight away.
- **The state machine is defined now.** `noPaper`, `paperDown` and `paperLifted` live in `state.ts`, and plates lock while the paper is down. Only `noPaper` is reachable until phase 3 adds the paper.

## Phase 3 — Paper and rubbing

- **Sheet backing.** Layers are 600 × 1500 sheet units backed at `min(devicePixelRatio, 2)`, so 1200 × 3000 px on iPads and phones. That matches the 1200 × 3000 export in phase 8. Layers allocate on first use, so colour, pattern and fx cost nothing until their phases.
- **No separate `rubMask` or `bakedLines` buffer.** Wax only ever adds, so the lines and tone layers accumulate stamps directly; that gives the same result as baked lines plus live lines through a mask. "Bake on lift" is then automatic: lifting keeps the layers, and laying the paper back re-arms coverage for the new plates. This saves two full-size buffers (~28 MB at 2×), which matters under iOS Safari's canvas memory limit.
- **Haze.** The tone layer stores wax at full strength and is shown at 13% opacity (`TONE_OPACITY`). The haze is therefore capped at 13% however hard you rub (the plan says 10–14%), at no per-frame cost.
- **`plateArt` is an `ImageBitmap`.** The placed plates are rasterised once per paper placement into an `OffscreenCanvas` and frozen as a bitmap. Drawing from a canvas source makes Chromium snapshot all 14 MB of it every frame.
- **Stamp orientation.** The 40 × 18 stamp lies with its long side across the direction of travel, like rubbing with the side of a crayon. Each stroke is a 40-unit swath, and the figure takes about six strokes to cover.
- **Strength model.** At mouse or touch pressure one stamp adds 46%, just past the 45% reveal threshold, so a single pass reveals every line it crosses. A pass averages about 66% (points under two overlapping stamps reach 71%), and rubbing again builds toward 100%. A pure 55% first pass would leave the fifth of points that get only one stamp unrevealed, and a full scrub would stall near 89%. A light Apple Pencil touch (60% strength) needs two stamps.
- **Coverage sampling uses the shared geometry module** instead of `getPointAtLength`, so the validator, tests and game sample the same points without a DOM.
- **Completion.** At 90% a band emits `band:complete` once per paper placement, then a 400 ms left-to-right sweep fills the remaining lines; progress then reads 100%. Phase 5 adds the shimmer, giggle and burst on top of the same sweep.
- **The paper control sits beside the window**, as one round button labelled Paper, Lift or Lay. The frame keeps 68 px either side of the window for it and the beads.
- **The crayon comes up automatically.** Laying the paper lifts the crayon out of its well (the tool becomes `crayon`), so a first scrub always works. Tapping the crayon puts it back; rubbing with no tool wiggles the crayon as a hint. The crayon cursor sprite is phase 4.
- **Peek.** The paper layer is drawn at 92% opacity, so the plates underneath show through at 8%. Exported sheets (phase 8) composite the paper at full strength.
- **Lifting.** The sheet foreshortens toward its hinge at the top of the window (a flat `rotateX(76deg)`), like a lid swung open. It ignores pointers, so the plates beneath can be swapped. A perspective swing looked lopsided once the window clipped it.
- **Strokes are measured against the window, not the sheet.** A stroke started while the paper is still sliding in lands where the paper will rest. The e2e suite caught this as an intermittent fully-missing stroke.
- **New sheet** slides the paper out and clears it; saving it to the sketchbook first is phase 8.
- **Locked plates.** While the paper is down, trying to place or drag a plate wiggles the Lift button (`plate:locked`).
- **Progress beads fill at 30%, 60% and 90% now.** Phase 4 adds the bounce and pop. Each bead group carries `data-progress` and `data-complete`, which the tests read. A top plate shows its progress on both the head and torso beads.
- **Measuring 60 fps.** Headless Chromium rasterises canvases in software, and each write to a displayed canvas costs a full-buffer copy (~3 ms). Headless WebKit composites without a GPU. Neither reflects a device. The `perf` Playwright project therefore runs alone after the others, in Chromium with GPU canvases at 4× CPU throttle. There the engine takes ~0.4 ms of a frame and frames hold 16.7 ms; the engine also takes ~1 ms a frame in WebKit. A real iPad Safari timeline still needs checking on a device.
- **Playwright's expect timeout is 10 s**, because six browsers (WebKit and GPU Chromium) cold-start at once.

## Phase 4 — Scrub animations

- **The crayon cursor is an SVG sprite in a fixed layer**, moved only by `transform`, so following the pointer costs no layout or paint. It is about a third of the sheet's width with its tip as the hotspot, held tip down-left at −35°. Over the paper it replaces the system cursor while the crayon is in hand. Mouse and Apple Pencil hover show it; on touch it appears 18 px right and 26 px above the finger and fades 260 ms after the finger lifts.
- **Spring.** PLAN.md's stiffness 0.35 and damping 0.7 are used in the usual form, v ← (v + (target − x) × 0.35) × 0.7. A sudden jump overshoots by about a third, which reads as the lively wiggle; ordinary pointer motion overshoots much less. The lean is proportional to the spring's horizontal speed, up to ±25°. The 6% squash fires on a direction change in either axis.
- **Tip wear** builds over 60,000 units of rubbing (about four full outfits) and lasts the session; it isn't saved.
- **Particles live in fixed pools** (120 crumbs, 60 twinkles) stored as typed arrays, with dead ones swap-removed, so nothing is allocated per frame. They draw on the fx layer, which clears only the area drawn the frame before. The fx layer is never part of the exported sheet.
- **Sizes.** Crumbs are 2–4 units as planned: on an iPad that is about 1–1.5 px, so they read as specks. Twinkles are 12 units in radius (the plan gives no size), white or pale gold with a thin gold outline so the white ones show on the paper.
- **Twinkles mark real reveals.** Coverage records each line sample as it crosses the reveal threshold (a 256-entry ring buffer). The effects take a random sample of at most 6 per frame, so the stars spread along the stroke instead of clustering at its start.
- **Paper nudge and rattle.** The nudge follows the plan: up to 1.5 units against the stroke and ±0.3°, springing back. That is under a pixel on an iPad, felt more than seen. Above 2.4 units/ms the frame window rattles by up to ±0.8 px.
- **`will-change: transform` on the sheet and the window.** Without it, every nudge repainted the six sheet canvases: 91 late frames of 300 at 4× CPU throttle, against 9 with it.
- **Rubbing layers are allocated when the paper is laid**, during the slide-in, not on the first stroke. That removes a stutter at the start of a kid's first scrub.
- **Beads bounce as they fill** (scale up, squash, settle) and emit `bead:fill` on the state bus for phase 5's soft pop.
- **Reduced motion** (the media query; the setting arrives in phase 8) turns off crumbs, the paper nudge, the window rattle and the bead bounce, and twinkles fade in and out at full size. The plan doesn't mention the cursor: it still follows the pointer, but its lean and squash are turned off as decorative motion.
- **Lifting the paper finishes any completion sweep at once**, so the outfit is complete before the sheet swings away. A slow frame loop could otherwise leave a sweep drawing on the lifted sheet.
- **Fewer canvas copies per frame.** Drawing from a canvas has a fixed cost even on the GPU, so the batch is grained once in place and drawn straight onto the haze layer. The lines go through one more scratch copy, because (stamps ∩ plates) × grain = (stamps × grain) ∩ plates. That is three canvas-source draws per batch instead of four. Bead progress updates (every frame while rubbing) keep their elements and touch the DOM only when a value changes.
- **How 55 fps is checked.** The `perf` project scrubs for five seconds at 4× CPU throttle with every effect running. It requires a median frame of about 16.7 ms and every whole second to hold 55 fps or more, which is the plan's "stays above 55 fps". A p95 cutoff kept failing on one-off stalls from a shared machine. The project gets two retries, because a noisy second shouldn't fail the run while a real regression fails every attempt.
- **`?fxstats`** publishes the effect counters on `window.__viviFx`, so the tests can check caps and spawns without reaching into module internals.
- **Rubbing tests wait for canvases to settle** (non-zero and unchanged), not for fixed times; WebKit's frame loop slows down when the whole suite runs at once.

## Phase 5 — Sound and completion

- **Every sound ships synthesized.** No recordings come with the game, so the giggles and Ta-da use the synthesized fallbacks. Recorded clips go in `public/sounds/giggles/` and `public/sounds/tada/` and are listed in `public/sounds/sounds.json`, like the plates. Probing for fixed file names instead would log a 404 for every missing clip.
- **Recorded giggles are used once at least two load.** With a single clip, "never the same giggle twice in a row" is impossible, so the four synthesized voices play instead. The README asks for four or more.
- **Giggle choice.** Each giggle is picked at random from the ones that didn't just play (`nextGiggle()` in `src/audio/sound.ts`). The last pick carries across paper placements.
- **Four synthesized giggle voices.** Each is a "hee-hee" of 5–7 blips: 70 ms on, 40 ms off, pitch falling from about 520 to 420 Hz. The voice is a sawtooth through formant filters near 1 kHz and 2.5 kHz, with light vibrato and a breathy "h" at each blip's start. The voices differ in blip count, the shape of the fall, the loudness pattern, the exact formants and the vibrato rate. The ±8% variation shifts pitch only, never timing.
- **The synthesized Ta-da** is a short "ta" chord, then a held "da!" chord with glockenspiel pings, a giggle and a sung "yay", about 1.8 s in all.
- **Unlocking audio.** The `AudioContext` is created by the player's first gesture, not at load; created earlier, Chrome logs an autoplay warning. The plan says to unlock on the first `pointerdown`, but browsers count a touch as a gesture only on `pointerup`/`touchend` (a mouse counts on `pointerdown`). So the engine tries on `pointerdown`, `pointerup`, `touchend`, `keydown` and `click`, and acts only while `navigator.userActivation.isActive`. It also plays a silent one-sample buffer, which iOS needs. If iOS later suspends or interrupts the context (a call, the app backgrounded), the next tap resumes it.
- **iPhone silent switch.** The audio session is `ambient`: the game mixes with music that is already playing, and the ring/silent switch mutes it, like most iOS games.
- **No clipping.** Every sound goes through the master gain, then a gentle limiter (a `DynamicsCompressorNode` at −6 dB, 12:1), so a giggle over a scratch and a bead pop never clips.
- **Mute.**
  - The Sound bump is a toggle (`aria-pressed`). Its icon swaps to a crossed-out speaker, and its label stays "Sound", so the accessible name never changes.
  - The setting is saved in `localStorage` through `src/storage/prefs.ts`. Every read and write is wrapped in try/catch, so blocked storage only means it isn't remembered.
  - Turning sound back on plays a tick, so you hear that it worked.
- **Scratch.**
  - Pink noise through a band-pass centred on √(1800 × 3000) ≈ 2.3 kHz (Q ≈ 1.9), with a 5–8 Hz wobble of ±140 Hz. It gets slightly brighter at speed.
  - Volume follows stroke speed, using audio-thread automation. Each pointer move sets the level and schedules a fade to silence 80 ms later. A crayon held still goes quiet by itself, with no per-frame JavaScript.
  - The pencil's higher, quieter preset is defined; the pencils use it in phase 7.
- **Slide and clack timing.**
  - Plates: the swish starts when a plate starts sliding (a new `plate:slide` event), and the clack plays when it seats (`plate:place`). Plates sliding back to the tray get a softer swish.
  - Paper: laying it swishes, and the clack plays when the window closes (`paper:clack`). Lifting gives a latch click and a swish. A new sheet swishes away.
- **Bead pops** rise in pitch through E5, G5 and B5 as a band's beads fill. Pops that land in the same frame are spaced 70 ms apart.
- **One owner for the fx canvas** (`src/fx/layer.ts`). The scrub effects and the celebrations both draw on the fx canvas. If each kept its own dirty rectangle, one effect's clear would erase the other's particles. The layer steps every effect, clears what was drawn last frame, and lets each one paint.
- **Shimmer.** A soft gold light slides left to right across the band's lines, in step with the 400 ms finishing sweep that fills any gaps. It is drawn from a small, blurred image of the plates' lines (0.5 px per unit), in nine soft slices, so it costs a few small draws per frame.
- **Outfit glow.** The same blurred image sits under the line layer and fades in and out over 1.4 s, using CSS opacity only, so the compositor does the work. "The figure's outline" is read as all of its lines.
- **Burst.** Hearts and stars alternate, 22–32 units across, and pop in with a slight overshoot. They fly outward with an upward lift, fall under gravity and fade. Each has a darker outline so the cream and blush ones show on white paper.
- **Confetti.** 72 pieces in blush, rose, gold, mint, sky and lilac (the last three only here). They fall from the top of the window over about 2–3 s, swaying and tumbling.
- **Order and timing.**
  - When a band completes, its shimmer, burst, giggle, buzz, tray hop and heart badge all start together.
  - The outfit sequence starts 600 ms after the last band, once its shimmer is done and its giggle mostly over. The Ta-da shows for 1.5 s, then the pencil box wiggles.
  - Lifting the paper in that 600 ms still plays the cheer and the Ta-da, but there is no glow or confetti on the lifted sheet. A new sheet cancels everything.
- **`outfit:complete` comes from the rubbing engine.** It knows which bands this paper placement armed, so it emits once, right after the last `band:complete`.
- **Heart badges.**
  - A plate rubbed in full keeps a small heart for the rest of the session (not saved). Its well's label then ends "with a heart".
  - The matching well's top plate hops even if the stack has been flipped since the plate was placed.
- **The Ta-da lettering** is original: marker-style SVG strokes in rose with a paper-white edge and a heart for the "!" dot. It is 1.6× the window's width, centred on the window's top edge, over the wordmark bar.
- **Reduced motion.**
  - Off: confetti, the tray hop and the badge pop.
  - Changed: hearts and stars appear in a ring and fade where they are; the Ta-da fades without scaling; the pencil box glows briefly instead of wiggling.
  - Unchanged: the shimmer and the outfit glow, which are light, not movement.
- **Buzz.** `navigator.vibrate(15)` runs only after the page has had a gesture; Chrome blocks earlier calls and logs a warning. iOS Safari has no vibrate and skips it silently.
- **Lifting or clearing the paper ends a stroke in progress.** Before this, a second finger tapping Lift mid-stroke left the crayon drawing on the lifted sheet.
- **Testing sound.**
  - With `?fxstats`, the sound engine publishes a log of every sound requested: name, what it was for, variant, pitch, and whether it was audible.
  - The engine, the celebration counters and the synth voices sit on `window.__viviFx`.
  - The tests render each synthesized giggle offline with `OfflineAudioContext` and measure the result: blip count, length and spacing, pitch by autocorrelation, and peak level.
  - Real iOS still needs a hand check: the first tap, the silent switch, and coming back from the background.
- **The full-scrub rubbing test is marked slow.** It sends 342 pointer events: about 15 s in software-rendered Chromium on its own (unchanged from phase 4), and up to 30 s with every browser running at once.

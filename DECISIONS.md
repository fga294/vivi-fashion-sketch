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

## Phase 6 — Pattern plates

- **Using a pattern plate.** Tap the pattern well to flip. Double-tap, drag it onto the frame, or press Enter to tuck the top plate under the frame. Using the same plate again, or tapping the tucked plate, puts it away. Using another plate swaps them, and the old one flies back to its well.
- **Patterns work with the paper down.** Figure plates are locked while the paper is down, but a pattern plate slides in under the frame's edge, as the plan's state machine lists patterns under `paperDown`. It also works with the paper off or lifted.
- **A new sheet puts the pattern away**, so a fresh sheet rubs the figure's lines again. Lifting and re-laying the paper keeps it.
- **The tucked plate** sits under the window's left edge, below the paper button. 54 px of it shows (a 48 px target or more), with 2½ tiles of its texture. It lands beside the window, then slides in under the edge. Going home, it lifts out and fades into its well. With reduced motion it simply appears and disappears.
- **While a pattern is in use, the crayon reveals only the pattern.** No figure lines appear, the bands don't progress and nothing twinkles. The wax haze, crumbs, scratch sound and paper nudge carry on.
- **The pattern is anchored to the sheet**, so every stroke lands in registration, as with a plate fixed under the paper. Each plate's tile is drawn once at the sheet's pixel scale, rounded to whole pixels so tiles abut. It includes its neighbours' copies, so strokes that cross a tile edge carry on.
- **Patterns, like lines, build up with each pass**, but they get no finishing sweep. A pattern stays as light or as dark as the child rubs it.
- **The crayon tray** holds four crayons, two by two, in one molded recess:

  | Crayon | Hex | Contrast on paper |
  | --- | --- | --- |
  | Black | `#2F2A2E` | 13.3 : 1 |
  | Rose | `#C2496B` | 4.4 : 1 |
  | Sky blue | `#3C80C2` | 3.9 : 1 |
  | Mint | `#2F937A` | 3.6 : 1 |

  They are deeper than their pencil namesakes, so a grainy 3-unit line still reads.
- **Choosing a crayon.** Tapping a crayon picks it up, putting down the one in hand; tapping the crayon in hand puts it back. Laying the paper picks up the last crayon used, black at first. The cursor sprite and the crumbs take its colour, and choosing one plays a tick.
- **Lines in colour.** The stamps carry the crayon's colour and the plates only cut them out, so lines and patterns are revealed in the chosen colour. A band's finishing sweep now fills only the gaps (it draws behind what is there) in the current colour. Lines rubbed in another crayon keep their colour.
- **What counts as "the garment".** The plan's rule, a flood fill against the lines, would stop at every pleat, stripe and pocket: a pattern started on the pleated skirt patterned one 16–42-unit pleat. So plates now mark detail lines with `data-detail`: pleats, stripes, tiers, pockets, buttons, cuffs, hair strands and facial features. Stay inside fills against the remaining outline lines, so a pattern covers the whole skirt and stops at its hem. A plate without marks behaves as the plan says, with every line a wall.
- **The starter art changed in three ways for this.**
  - Every figure plate's details are marked.
  - Five plates had gaps that let a garment leak into the open sheet. The puff blouse's right side and the curly puff's face were open, and the tennis skirt's legs and the sailor top's arms stopped short of the lines they meet. Each now joins.
  - The tiered maxi's tier seams also closed its stepped sides. They became details, with two short outline pieces added where the sides step out.
  - A unit test checks all 234 combinations (216 three-plate outfits and 18 top-plate outfits). In each, the face, the top garment and the bottom garment must each be one closed area of a sensible size. The seams are unchanged and still pass `check:plates`.
- **The walls are the lines on this sheet.** They are the plates under the paper now, plus plates rubbed under earlier placements of the same sheet (lift, swap, lay back). A plate never rubbed doesn't count. The current plates count even before they are rubbed, because Peek shows them through the paper.
- **Walls are one cell per sheet unit**, with each 3-unit line widened to 2.5 units either side, so gaps under 2 units close. They are rasterised with plain arithmetic (each cell's distance to the line), not by drawing on a canvas and reading pixels back. That means the game and the Node unit tests see exactly the same walls.
- **Where a stroke starts.**
  - On a line: Stay inside uses the nearest open cell within 4 units.
  - Outside every closed area (open space reaching the sheet's edge): the stroke isn't clipped, as the plan says.
- **The clip is a stencil.** It cuts the wax haze as well as the pattern, so nothing the crayon lays down leaves the garment. It reaches one unit under the lines, so the pattern meets them without a paper-coloured gap.
- **Speed.**
  - Areas are flood-filled on first use and cached until the paper is laid again.
  - A fill stops as soon as it reaches open space: a stroke started off the outfit costs under 1 ms.
  - A garment's first stroke costs 2–4 ms on a laptop: the fill, then a mask at one pixel per unit.
  - The walls (about 10 ms on a laptop) are built at a quiet moment: after the window closes over the paper, or just after a pattern is tucked.
  - Rubbing a clipped pattern costs no more per frame than rubbing lines (median 0.3 ms of main-thread work either way).
- **The Stay inside setting** is saved with the other preferences (on by default). Its switch arrives with the settings panel in phase 8.
- **Testing.**
  - `tests/e2e/patterns.spec.ts` covers the Done-when checks: a stroke that starts in the skirt and scrubs past both sides, over the blouse and over the legs leaves pattern and haze only in the skirt; with Stay inside off, the pattern goes everywhere.
  - It also covers a stroke started off the outfit, tucking, swapping and putting away, and the crayon colours.
  - The `perf` project gains a frame-rate test for a clipped pattern.
  - Playwright now runs 4 workers. With the default 6 and the larger suite, WebKit page loads timed out while the machine was busy.

## Phase 7 — Colouring

- **The pencil box.** Tapping it flips the lid up and fans the 16 pencils out above it, rising in a quick stagger.
  - The fan is two rows of eight on a tablet and wraps to more rows on a phone. Every pencil is a 48 × 96 px target.
  - Choosing a pencil puts the tool in hand down, puts that pencil in hand and closes the fan. The pencil is the cursor, with the same spring and lean as the crayon and no crumbs. A coloured dot on the box shows which pencil is in hand.
  - Tapping the pencil in hand puts it back. Tapping the box again, pressing Escape or tapping anywhere else closes the fan.
- **Magic fill is a switch in the fan** (a wand, "Magic"). With it on, a tap with the pencil fills the area under it and a drag does nothing. With it off, the pencil colours freehand. The cursor pencil wears a little star while it's on. A tap travels under 14 units.
- **Pencil strokes** lay 8-unit round dabs every 1.5 units, faint enough that one pass shows the paper's tooth and a second builds the colour (about 55%, then 80%). The tooth is its own grain, so a heavier pencil fills more of the paper's peaks. Apple Pencil pressure scales each dab, as with the crayon. Colour multiplies over the paper, so overlapping colours mix like real pencils.
- **Magic fill's walls are the revealed lines,** but taken from the rubbing engine's line samples, not the lines layer.
  - The waxy grain leaves tiny holes in every rubbed line, so a fill read from the pixels leaked through: 92% of the sheet came out as one area.
  - Instead, each stretch of line between two revealed samples (6 units apart) becomes a wall, 3 units wide plus a unit either side. That is the plan's "dilated by 1 px", and it closes gaps under 2 units. A finished band counts in full.
  - Lines revealed under earlier placements of the same sheet count too. Unrubbed lines don't, as the plan says.
  - It is the same flood fill as Stay inside, but every line is a wall here, details included: colouring a pleated skirt fills one panel at a time, as in a colouring book.
- **The hatch** is diagonal pencil strokes about 3 units apart, each a little uneven in position and pressure. It repeats seamlessly every 48 units, is anchored to the sheet so neighbouring fills line up, and gets the pencils' paper tooth.
- **Fills never cover lines, in three ways:**
  - the colour layer sits under the lines layer;
  - the fill's area stops at the walls and reaches just one unit under each line's edge;
  - a test checks that the colour layer stays empty at the centre of every revealed line.
- **Big fills ask first.** A fill over 45% of the sheet (in practice the open paper around the figure) shows faintly, with a tick and a cross beside the tap. Any other tap on the paper, an undo, or lifting the paper cancels it. The preview is drawn at a steady 50%: animating its opacity made Chromium's software compositing drop the colour layer beneath it.
- **The eraser** is a chunky 24-unit round, so one pass clears. It removes colour and pattern, never the lines and never the wax haze, as the plan says. Its cursor is a pink eraser in a paper sleeve, and it has its own low, rubbery scratch.
- **Undo and redo.**
  - Undoable: pencil strokes, Magic fills, eraser strokes and pattern strokes.
  - Not undoable: rubbing the figure's lines. Wax lines stay, as on the toy, and a band that has giggled and earned its heart can't un-giggle.
  - The history keeps 30 steps. A new action clears redo, and a new sheet clears both.
- **How undo stores steps.** Each layer is cut into 128 px tiles. The first time an action is about to draw on a tile, the tile is copied (a GPU copy into a small canvas, never a pixel readback). Undo swaps the saved tiles with what is there now, so the same tiles serve redo. Memory grows only with the area an action touched. A full-sheet fill is about 250 tiles; past 1,500 saved tiles the oldest steps are forgotten.
- **Every stroke finishes drawing when the finger lifts** (it used to finish on the next frame), so the history sees all of it before it commits.
- **Redo floats just above Undo** while there is something to redo. A sixth button wouldn't fit the phone's bump row. With nothing to undo, Undo dims (`aria-disabled`) and wiggles when tapped. Ctrl/⌘+Z undoes; Shift+Ctrl/⌘+Z or Ctrl+Y redoes.
- **Two-finger tap.** Two fingers landing within 250 ms and lifting within 450 ms, without sliding, undo. The first finger's mark is taken back first, since it was the start of the tap, not a stroke.
- **Sounds.** The pencil scratch is the higher, quieter preset from phase 5, and the eraser has a low, soft one. A Magic fill plays a soft shimmer and a quick glockenspiel run. Choosing a pencil, switching Magic fill, and undo or redo each tick.
- **`hidden` always wins** (a global `[hidden] { display: none !important }`). The fan, the fill check and Redo set their own `display`, which had overridden `hidden` and left an invisible fan blocking the paper.
- **The sheet isolates its blending** (`isolation: isolate`), so the colour layer multiplies over the paper whatever animates above it.
- **Testing.**
  - `tests/e2e/colouring.spec.ts` covers the Done-when checks: fills never cover lines, the eraser never removes lines, and 30 undo steps work and redo back. It also covers undoing a fill, an eraser stroke and a pattern stroke, the big-fill check, the pencil box, and the two-finger tap (on touch devices).
  - The `perf` project gains a frame-rate test for pencil colouring.
  - The tests that rub the whole figure first are marked slow, and they wait for the finishing sweeps to stop drawing before fingerprinting the lines.

## Phase 8 — Save, print, sketchbook, settings

- **Export.** The sheet as it looks in the frame, at 1200 × 3000:
  - the paper at full strength (Peek thins it only on screen);
  - colour multiplied over it, as on screen;
  - the wax haze at its on-screen 13%;
  - then the pattern and the lines.
  The effects layer and the celebration glow are never included. Sheets drawn at one pixel per unit (screens without high density) are scaled up.
- **"The exported PNG matches the screen"** is checked by comparing the downloaded PNG with a screenshot of the sheet, both shrunk to 120 × 300, with Peek off and the window lip's shading at the edges left out. The mean difference is 0.3–2.2 (out of 255) in all five browser setups. The 95th percentile stays under 16; a few grainy line edges shrink differently on screen than in a canvas.
- **The sketchbook.** The Sketchbook bump opens a dialog:
  - **This sheet:** a thumbnail with Save, Share, Print and Blank. Blank is the blank colouring page: every line of the plates in the frame, clean and uncoloured on white.
  - **Saved sheets:** a grid of thumbnails, newest first. Tapping one shows it large, with Back, Share, Print and Delete. Delete asks with a tick or a cross.
  - Every control is an icon with a one-word label.
- **A new sheet saves the old one** if anything was drawn on it since it was laid or last saved. A copy flutters from the frame into the Sketchbook button, and the sheet doesn't slide away as well. An untouched sheet isn't saved. A new `sheet:finish` event comes before `paper:new`, so the sheet can be exported before it is cleared.
- **Storage.**
  - Saved sheets live in IndexedDB (`vivi-fashion-dresses`), on this device only. The PNGs are stored as plain bytes: WebKit's private and ephemeral sessions refuse Blobs in IndexedDB but accept ArrayBuffers.
  - Opening the sketchbook test-writes a tiny record first, because some private modes open the database but refuse writes. The game waits at most 3 seconds for it, since IndexedDB can hang rather than fail.
  - Without storage, "hide the sketchbook" means no saved sheets and no Save. The Sketchbook bump stays, because it's also where Share, Print and Blank live, and those still work.
- **Share** uses the Web Share API with the PNG file where it can share files, otherwise it downloads the file (`vivi-fashion-YYYY-MM-DD-HHMM.png`). Sharing isn't behind the parent gate: the plan gates only settings and delete-all, and both paths hand the file to the device.
- **Print.** A print-only container holds a 1200 × 3000 canvas, drawn just before printing. A canvas prints straight away, where a freshly set image might still be decoding.
  - The print stylesheet hides everything else and shows the sheet 240 mm tall, with 12 mm margins and a small "Vivi Fashion Dresses" footer. That fits one page on both A4 and US Letter.
  - The browser's own Print command (⌘P) prints the sheet in the frame the same way.
  - The test prints to PDF in both sizes and counts exactly one page.
- **Settings and the parent gate.**
  - The gear sits at the frame's top right. Pressing and holding it for 3 seconds fills a ring and opens the settings. A quick tap shows "Grown-ups: press and hold" instead. Holding Enter or Space works from the keyboard.
  - The gate is time-based: letting go after 3 seconds opens the settings even if a busy frame hasn't let the ring finish drawing yet.
  - The dialog has Sound (in step with the Sound bump), Volume, Peek, Stay inside, Motion, and "Delete all saved sheets" (tick or cross). Motion offers "Follow this device", "Less motion" or "Full motion".
  - The settings text is written for grown-ups. The dialogs are native `<dialog>`s, so focus stays inside and Escape closes them.
- **One settings object** holds the settings in memory and writes them through to `localStorage` when it can. With storage blocked they still apply until the page closes. The Sound bump and the settings both go through it, so they always agree.
- **Motion override.** The setting stamps `data-motion` on the page root. The CSS's reduced-motion rules follow it, and so does every script that checks for reduced motion. "Full motion" overrides even a device that asks for less.
- **`panels.css`** holds the dialogs' styles, alongside the plan's `tray.css`, `frame.css` and `print.css`.
- **Testing.** `tests/e2e/finish.spec.ts` covers:
  - the Done-when checks: the export matches the screen, exactly one printed page on A4 and Letter (plus the blank page and the browser's own Print command), and the game running with `localStorage` and `indexedDB` throwing;
  - the sketchbook surviving a reload, delete with confirm, saving on New sheet, the gate (a tap, a short hold, a full hold, the keyboard), settings remembered across a reload, delete-all, and the share sheet getting one PNG.

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

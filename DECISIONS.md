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

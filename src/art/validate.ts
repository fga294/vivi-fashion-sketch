// The seam validator behind `npm run check:plates` and tests/unit/plates.test.ts.
// It checks each plate against the SVG authoring rules and the anatomy grid, then
// checks that every pair of plates that can meet in the frame joins cleanly.

import { BANDS, CLEARANCE, FEET, PATTERN_TILE, seamsOf, TOLERANCE, type Seam } from './bands.ts';
import { polylines, type Point } from './geometry.ts';
import { artFromXml, expectedViewBox, type PlateEntry } from './plates.ts';
import { parseXml, walk } from './svg.ts';

export interface PlateReport {
  readonly id: string;
  readonly band: PlateEntry['band'];
  readonly errors: string[];
  /** Measured crossing x positions, keyed by seam y. */
  readonly crossings: Map<number, number[]>;
}

const ALLOWED_TAGS = new Set(['svg', 'title', 'desc', 'g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect']);
const FORBIDDEN_ATTRS = ['transform', 'style', 'class', 'id', 'href', 'xlink:href', 'clip-path', 'mask', 'filter'];
const ROOT_PRESENTATION: Record<string, string> = {
  fill: 'none',
  'stroke-width': '3',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
};
/** Sampling step for validation, in units: fine enough to measure ±0.25. */
const STEP = 0.5;
const fmt = (n: number): string => String(Math.round(n * 10) / 10);

/**
 * x positions where polylines meet the horizontal line y = Y (crossing it or
 * ending on it), clustered so one stroke counts once. Returns null if a segment
 * runs along the seam itself.
 */
export function crossingsAt(lines: readonly Point[][], Y: number): number[] | null {
  const xs: number[] = [];
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const p = line[i - 1]!;
      const q = line[i]!;
      if (p.y === Y && q.y === Y) {
        if (p.x !== q.x) return null;
        continue;
      }
      if ((p.y - Y) * (q.y - Y) <= 0) xs.push(p.x + ((Y - p.y) * (q.x - p.x)) / (q.y - p.y));
    }
  }
  xs.sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const x of xs) {
    const last = clusters[clusters.length - 1];
    if (last && x - last[last.length - 1]! <= CLEARANCE) last.push(x);
    else clusters.push([x]);
  }
  return clusters.map((c) => c.reduce((a, b) => a + b, 0) / c.length);
}

function checkSeam(lines: readonly Point[][], seam: Seam, errors: string[]): number[] {
  const found = crossingsAt(lines, seam.y);
  if (found === null) {
    errors.push(`a line runs along the ${seam.name} seam (y=${seam.y})`);
    return [];
  }
  const allowed = [...seam.crossings, ...seam.optional];
  const nearest = (from: readonly number[], x: number): number =>
    from.reduce((best, v) => (Math.abs(v - x) < Math.abs(best - x) ? v : best), Infinity);
  const near = TOLERANCE * 4;
  for (const x of seam.crossings) {
    if (Math.abs(nearest(found, x) - x) > near) errors.push(`${seam.name} seam: missing the connector at x=${x}`);
  }
  for (const f of found) {
    const x = nearest(allowed, f);
    const off = Math.abs(f - x);
    if (off > near) errors.push(`${seam.name} seam: extra line crosses at x=${fmt(f)}; only connectors may cross`);
    else if (off > TOLERANCE) errors.push(`${seam.name} seam: connector at x=${fmt(f)} is ${fmt(off)} off x=${x}`);
  }
  // Lines that stop just short of the seam would look like connectors once rubbed.
  const reach = TOLERANCE + CLEARANCE;
  let reported = 0;
  for (const line of lines) {
    for (const p of line) {
      if (Math.abs(p.y - seam.y) < CLEARANCE && !allowed.some((x) => Math.abs(p.x - x) <= reach)) {
        if (reported++ < 3) {
          errors.push(`line at (${fmt(p.x)}, ${fmt(p.y)}) is within ${CLEARANCE} units of the ${seam.name} seam`);
        }
      }
    }
  }
  return found;
}

/** Pattern tiles must wrap: whatever touches one edge continues from the opposite edge. */
function checkTileEdges(lines: readonly Point[][], errors: string[]): void {
  const swap = lines.map((l) => l.map((p) => ({ x: p.y, y: p.x })));
  for (const [axis, set] of [['y', lines], ['x', swap]] as const) {
    const a = crossingsAt(set, 0);
    const b = crossingsAt(set, PATTERN_TILE);
    if (a === null || b === null) {
      errors.push(`a line runs along a tile edge (${axis} = 0 or ${PATTERN_TILE})`);
      continue;
    }
    const other = axis === 'y' ? 'x' : 'y';
    // Positions wrap too: a line through a corner continues in the diagonal neighbour.
    const apart = (v: number, w: number): number => {
      const d = Math.abs(v - w) % PATTERN_TILE;
      return Math.min(d, PATTERN_TILE - d);
    };
    for (const v of a) if (!b.some((w) => apart(w, v) <= TOLERANCE)) {
      errors.push(`tile does not wrap: line meets ${axis}=0 at ${other}=${fmt(v)} but nothing meets ${axis}=${PATTERN_TILE} there`);
    }
    for (const v of b) if (!a.some((w) => apart(w, v) <= TOLERANCE)) {
      errors.push(`tile does not wrap: line meets ${axis}=${PATTERN_TILE} at ${other}=${fmt(v)} but nothing meets ${axis}=0 there`);
    }
  }
}

/** Check one plate's SVG against the authoring rules and the anatomy grid. */
export function validatePlate(entry: PlateEntry, svgText: string): PlateReport {
  const errors: string[] = [];
  const crossings = new Map<number, number[]>();
  const report = { id: entry.id, band: entry.band, errors, crossings };

  let root;
  try {
    root = parseXml(svgText);
  } catch (e) {
    errors.push(`not valid XML: ${(e as Error).message}`);
    return report;
  }

  // Root element and metadata.
  if (root.name !== 'svg') errors.push(`root element is <${root.name}>, expected <svg>`);
  if (root.attrs['xmlns'] !== 'http://www.w3.org/2000/svg') errors.push('root <svg> needs xmlns="http://www.w3.org/2000/svg"');
  const vb = (root.attrs['viewBox'] ?? '').trim().split(/[\s,]+/).map(Number).join(' ');
  if (vb !== expectedViewBox(entry.band)) errors.push(`viewBox is "${root.attrs['viewBox'] ?? ''}", expected "${expectedViewBox(entry.band)}"`);
  if (root.attrs['data-band'] !== entry.band) errors.push(`data-band is "${root.attrs['data-band'] ?? ''}", expected "${entry.band}"`);
  if (root.attrs['data-name'] !== entry.name) errors.push(`data-name is "${root.attrs['data-name'] ?? ''}", expected "${entry.name}"`);
  if (!root.children.some((c) => c.name === 'title' && c.text.trim() !== '')) errors.push('missing a <title>');
  for (const [key, value] of Object.entries(ROOT_PRESENTATION)) {
    if (root.attrs[key] !== value) errors.push(`root <svg> needs ${key}="${value}"`);
  }
  if (!root.attrs['stroke'] || root.attrs['stroke'] === 'none') errors.push('root <svg> needs a stroke colour');

  // Strokes only, no transforms or styling that could change geometry or weight.
  walk(root, (el) => {
    if (!ALLOWED_TAGS.has(el.name)) errors.push(`<${el.name}> is not allowed`);
    for (const attr of FORBIDDEN_ATTRS) if (attr in el.attrs) errors.push(`<${el.name}> uses "${attr}", which is not allowed`);
    if (el !== root) {
      if ('fill' in el.attrs && el.attrs['fill'] !== 'none') errors.push(`<${el.name}> has a fill; plates are strokes only`);
      if ('stroke-width' in el.attrs && el.attrs['stroke-width'] !== '3') errors.push(`<${el.name}> changes stroke-width`);
    }
  });

  // Geometry.
  let lines: Point[][] = [];
  try {
    lines = artFromXml(entry, root).paths.flatMap((d) => polylines(d, STEP));
  } catch (e) {
    errors.push(`bad shape data: ${(e as Error).message}`);
    return report;
  }
  if (lines.length === 0) {
    errors.push('has no shapes');
    return report;
  }

  const [x0, y0, w, h] = expectedViewBox(entry.band).split(' ').map(Number) as [number, number, number, number];
  const outside = lines.flat().find((p) => p.x < x0 - 0.01 || p.x > x0 + w + 0.01 || p.y < y0 - 0.01 || p.y > y0 + h + 0.01);
  if (outside) errors.push(`line leaves the plate at (${fmt(outside.x)}, ${fmt(outside.y)})`);

  if (entry.band === 'pattern') {
    checkTileEdges(lines, errors);
    return report;
  }

  for (const seam of seamsOf(entry.band)) crossings.set(seam.y, checkSeam(lines, seam, errors));

  if (entry.band === 'legs') {
    const pts = lines.flat();
    const lowest = Math.max(...pts.map((p) => p.y));
    if (lowest > FEET.maxY) errors.push(`feet reach y=${fmt(lowest)}; they must finish by y=${FEET.maxY}`);
    const wide = pts.find((p) => p.y >= FEET.zoneY && (p.x < FEET.minX || p.x > FEET.maxX));
    if (wide) errors.push(`below y=${FEET.zoneY} lines must stay within x=${FEET.minX}–${FEET.maxX}; found (${fmt(wide.x)}, ${fmt(wide.y)})`);
  }
  return report;
}

/**
 * Every pair of plates that can meet at a seam must join within tolerance of
 * each other, not just of the anatomy grid, so no combination shows a jog.
 */
export function checkJoins(reports: readonly PlateReport[]): string[] {
  const problems: string[] = [];
  const sides = (y: number, edge: 'y0' | 'y1'): PlateReport[] =>
    reports.filter((r) => r.band !== 'pattern' && BANDS[r.band][edge] === y && r.crossings.has(y));

  for (const y of [...new Set(reports.flatMap((r) => [...r.crossings.keys()]))]) {
    for (const above of sides(y, 'y1')) {
      for (const below of sides(y, 'y0')) {
        const a = above.crossings.get(y)!;
        const b = below.crossings.get(y)!;
        for (const x of a) {
          const match = b.reduce((best, v) => (Math.abs(v - x) < Math.abs(best - x) ? v : best), Infinity);
          // A lone optional line (e.g. a centre-front seam) may end at the seam.
          if (Math.abs(match - x) > TOLERANCE && Math.abs(match - x) <= TOLERANCE * 4) {
            problems.push(`${above.id} + ${below.id}: lines at y=${y} meet ${fmt(Math.abs(match - x))} units apart (x=${fmt(x)} vs ${fmt(match)})`);
          }
        }
      }
    }
  }
  return problems;
}

